// Seeded generator for the synthetic characterization fixtures.
// Writes test-data/synthetic/fixtures/<agentId>.json (inputs only; goldens.mjs computes the outputs).
// Usage: node test-harness/generate-fixtures.mjs [--out <dir>]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_DIR, SYNTHETIC_DIR, readJson, runCase, setup, withQuietConsole } from './lib.mjs';

const outDir = argValue('--out') ?? join(SYNTHETIC_DIR, 'fixtures');
const SEED = 20261023;
const FIXED_DATE = '2026-01-01T00:00:00.000Z';
const SLOTS = ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'];
// Same list and order as UpgradePlansComponent.allSubstats.
const SUBSTATS = ['HP%', 'ATK%', 'DEF%', 'HP', 'ATK', 'DEF', 'CRIT_Rate', 'CRIT_DMG', 'Anomaly_Proficiency', 'PEN'];
// Fixed slot 1-3 values from CharacterTabComponent.getMainStatValueForSlot.
const FIXED_MAIN = { Drive1: ['HP', 2200], Drive2: ['ATK', 316], Drive3: ['DEF', 184] };
// Splits of the 9 rolls on an S-rank +15 disc (4 initial substats + 5 upgrades); together they cover counts 1 to 6.
const ROLL_SPLITS = [
  [6, 1, 1, 1],
  [5, 2, 1, 1],
  [4, 3, 1, 1],
  [4, 2, 2, 1],
  [3, 3, 2, 1],
  [3, 2, 2, 2],
];
const PRIORITIES = ['Essential', 'Important', 'Nice'];
const STALE_BUILD_TYPE = 'RemovedBuildType';

// Drive 4/5/6 main stats and preferred substats per profile.
const TEMPLATES = {
  crit: { mains: ['CRIT_Rate', 'Element_DMG', 'ATK%'], subs: ['CRIT_Rate', 'CRIT_DMG', 'ATK%', 'PEN'] },
  anomaly: { mains: ['Anomaly_Proficiency', 'Element_DMG', 'Anomaly_Mastery'], subs: ['Anomaly_Proficiency', 'ATK%', 'PEN', 'CRIT_Rate'] },
  stun: { mains: ['CRIT_Rate', 'Element_DMG', 'Impact'], subs: ['CRIT_Rate', 'CRIT_DMG', 'ATK%', 'ATK'] },
  support: { mains: ['ATK%', 'ATK%', 'Energy_Regen'], subs: ['ATK%', 'CRIT_Rate', 'HP%', 'ATK'] },
  defense: { mains: ['DEF%', 'DEF%', 'DEF%'], subs: ['DEF%', 'DEF', 'CRIT_Rate', 'HP%'] },
  rupture: { mains: ['CRIT_Rate', 'HP%', 'HP%'], subs: ['HP%', 'CRIT_Rate', 'CRIT_DMG', 'HP'] },
};
const TEMPLATE_BY_SPECIALTY = {
  Attack: 'crit',
  Anomaly: 'anomaly',
  Stun: 'stun',
  Support: 'support',
  Defense: 'defense',
  Rupture: 'rupture',
  Armorer: 'crit',
};

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

// mulberry32 (Tommy Ettinger's public-domain 32-bit PRNG)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const ctx = await setup();
const { B, discSet } = ctx;
const agents = ctx.agents.slice().sort(byId);
const wEngines = ctx.wEngines.slice().sort(byId);
const setNames = Object.keys(discSet.getDiscSetEquipmentData()).sort();
const statWeights = readJson(join(SRC_DIR, 'assets/data/agent-stat-weights.json')).agents;
const breakpoints = readJson(join(SRC_DIR, 'assets/data/agent-breakpoints.json')).agents;
const ROLL = B.SUBSTAT_ROLL_VALUES;

/** Per-agent random choices shared by every case of that agent, so cases differ only in what they test. */
function makeProfile(agent) {
  const template = TEMPLATES[TEMPLATE_BY_SPECIALTY[agent.specialty] ?? 'crit'];
  const set4 = pick(setNames);
  const set2 = pick(setNames.filter((s) => s !== set4));
  const discs = {};
  for (const slot of SLOTS) {
    const keep = 2 + Math.floor(rng() * 2);
    const preferred = shuffled(template.subs).slice(0, keep);
    const rest = shuffled(SUBSTATS.filter((s) => !preferred.includes(s)));
    discs[slot] = { subs: [...preferred, ...rest].slice(0, 6), rolls: shuffled(pick(ROLL_SPLITS)) };
  }
  const matching = wEngines.filter((w) => w.specialty === agent.specialty);
  const other = wEngines.filter((w) => w.specialty !== agent.specialty);
  return {
    template,
    set4,
    set2,
    mains: { Drive4: template.mains[0], Drive5: template.mains[1], Drive6: template.mains[2] },
    discs,
    wEngineId: matching.length > 0 ? pick(matching).id : null,
    mismatchedWEngineId: pick(other).id,
    buildTypes: Object.keys(statWeights[agent.id]?.builds ?? {}),
  };
}

/**
 * Materializes six discs. Substats equal to the main stat are skipped (a disc never rolls its main
 * stat), taking the next of the profile's six candidates.
 */
function makeDiscs(agent, profile, caseId, opts = {}) {
  const mains = { ...profile.mains, ...opts.mains };
  const sets = opts.sets ?? [profile.set4, profile.set2];
  const discs = {};
  for (const [i, slot] of SLOTS.entries()) {
    const [mainType, mainValue] = FIXED_MAIN[slot] ?? [mains[slot], B.DISC_MAIN_STAT_MAX[slot][mains[slot]]];
    const spec = profile.discs[slot];
    const subTypes = (opts.subs?.[slot] ?? spec.subs).filter((t) => t !== mainType).slice(0, 4);
    const rolls = opts.rolls?.[slot] ?? spec.rolls;
    discs[slot] = {
      uid: `syn-${agent.id}-${caseId}-${slot}`,
      slot,
      set: i < 4 ? sets[0] : sets[1],
      rarity: 'S',
      level: 15,
      mainStat: { type: mainType, value: mainValue },
      subStats: subTypes.map((type, j) => substat(type, rolls[j])),
      equippedBy: agent.id,
      lock: false,
    };
  }
  return discs;
}

// Same value and roll count the disc form saves for a typed value.
function substat(type, count) {
  const value = Math.round(ROLL[type] * count * 10) / 10;
  return { type, value, rolls: B.calculateRollCount(type, value) };
}

function makeBuild(agent, caseId, equippedDiscs, fields = {}) {
  return {
    id: `syn-${agent.id}-${caseId}`,
    agentId: agent.id,
    level: 60,
    mindscapeLevel: 0,
    equippedWEngineId: null,
    wEngineRefinement: 1,
    equippedDiscs,
    ...fields,
  };
}

function makePlan(agent, profile, caseId, impossibleCells) {
  const substatPriorities = {};
  for (const slot of SLOTS) {
    const cells = {};
    for (const stat of SUBSTATS) {
      if (profile.template.subs.includes(stat)) cells[stat] = pick(PRIORITIES);
      else if (rng() < 0.5) cells[stat] = 'Ignore';
    }
    substatPriorities[slot] = cells;
  }
  if (impossibleCells) {
    substatPriorities.Drive1.HP = 'Essential';
    substatPriorities.Drive2.ATK = 'Important';
    substatPriorities.Drive3.DEF = 'Essential';
  }
  const mainStatPreferences = {};
  for (const slot of ['Drive4', 'Drive5', 'Drive6']) {
    const prefs = {};
    for (const stat of B.MAIN_STAT_BY_SLOT[slot]) {
      prefs[stat] = stat === profile.mains[slot] || rng() < 0.3 ? 'Acceptable' : 'Not Acceptable';
    }
    mainStatPreferences[slot] = prefs;
  }
  // Starts from agent-breakpoints.json as UpgradePlanService.createPlan does, then raises two targets.
  const customBreakpoints = {};
  const source = breakpoints[agent.id]?.breakpoints ?? {};
  for (const [stat, bp] of Object.entries(source)) customBreakpoints[stat] = { min: bp.min, optimal: bp.optimal };
  for (const stat of shuffled(Object.keys(customBreakpoints)).slice(0, 2)) {
    customBreakpoints[stat].optimal = Math.round(customBreakpoints[stat].optimal * 1.2);
  }
  return {
    id: `plan-${agent.id}-${caseId}`,
    name: `Synthetic ${caseId}`,
    agentId: agent.id,
    description: '',
    setPreferences: { type: '4pc+2pc', preferredSets: [profile.set4, profile.set2] },
    mainStatPreferences,
    substatPriorities,
    customBreakpoints,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  };
}

const fixtures = new Map();
const profiles = new Map();
function addCase(agent, id, note, build, plan) {
  fixtures.get(agent.id).cases.push(plan ? { id, note, build, plan } : { id, note, build });
}

// Per-agent cases
for (const [index, agent] of agents.entries()) {
  const profile = makeProfile(agent);
  profiles.set(agent.id, profile);
  fixtures.set(agent.id, { agentId: agent.id, agentName: agent.name, cases: [] });
  const w = { equippedWEngineId: profile.wEngineId };
  const add = (id, note, fields = {}, discOpts = {}, plan) =>
    addCase(agent, id, note, makeBuild(agent, id, makeDiscs(agent, profile, id, discOpts), { ...w, ...fields }), plan);

  for (let m = 0; m <= 6; m++) add(`mindscape-${m}`, `Mindscape ${m}, defaults otherwise`, { mindscapeLevel: m });
  for (const type of profile.buildTypes) add(`pin-${type}`, `preferredBuildType ${type}`, { preferredBuildType: type });
  add('pin-stale', 'preferredBuildType no longer defined for the agent', { preferredBuildType: STALE_BUILD_TYPE });

  const full = { mindscapeLevel: 6, wEngineRefinement: 5 };
  add('all-on', 'M6, R5, every toggle on', full);
  add('off-wengine-bonuses', 'includeWEngineBonuses off', { ...full, includeWEngineBonuses: false });
  add('off-mindscape-bonuses', 'includeMindscapeBonuses off', { ...full, includeMindscapeBonuses: false });
  add('off-passive-bonuses', 'includePassiveBonuses off', { ...full, includePassiveBonuses: false });
  add('off-set-bonuses', 'includeSetBonuses off', { ...full, includeSetBonuses: false });
  add('off-4pc-bonuses', 'include4pcBonuses off', { ...full, include4pcBonuses: false });
  add('disabled-disc', 'Drive4 disabled through enabledDiscs', {
    ...full,
    enabledDiscs: { Drive1: true, Drive2: true, Drive3: true, Drive4: false, Drive5: true, Drive6: true },
  });

  add('no-wengine', 'No W-Engine', { equippedWEngineId: null });
  add('mismatched-wengine', 'W-Engine of another specialty, R5', {
    equippedWEngineId: profile.mismatchedWEngineId,
    wEngineRefinement: 5,
  });

  for (const offset of [0, 3]) {
    const k = index + offset;
    const mains = {
      Drive4: B.MAIN_STAT_BY_SLOT.Drive4[k % 6],
      Drive5: B.MAIN_STAT_BY_SLOT.Drive5[k % 5],
      Drive6: B.MAIN_STAT_BY_SLOT.Drive6[k % 6],
    };
    add(`main-stats-${offset}`, `Main stats ${mains.Drive4} / ${mains.Drive5} / ${mains.Drive6}`, {}, { mains });
  }

  {
    const id = 'five-discs';
    const discs = makeDiscs(agent, profile, id);
    delete discs.Drive6;
    addCase(agent, id, 'Drive6 empty (INCOMPLETE)', makeBuild(agent, id, discs, w));
  }
  {
    const id = 'duplicate-substats';
    const discs = makeDiscs(agent, profile, id);
    discs.Drive2.subStats[1] = { ...discs.Drive2.subStats[0] };
    addCase(agent, id, 'Drive2 repeats a substat (validation INCOMPLETE)', makeBuild(agent, id, discs, w));
  }
  {
    const id = 'blank-substats';
    const discs = makeDiscs(agent, profile, id);
    for (const j of [1, 2, 3]) discs.Drive3.subStats[j] = { type: '', value: 0, rolls: 0 };
    addCase(agent, id, "Drive3 has three substats saved as type '' value 0 (BUG-25)", makeBuild(agent, id, discs, w));
  }

  add('plan', 'Upgrade plan with custom priorities, main-stat preferences, breakpoints', {}, {}, makePlan(agent, profile, 'plan', false));
  if (index % 3 === 0) {
    add(
      'plan-impossible-cells',
      'Upgrade plan with Drive1 HP, Drive2 ATK, Drive3 DEF priorities set (BUG-26, LOGIC-27)',
      {},
      {},
      makePlan(agent, profile, 'plan-impossible-cells', true),
    );
  }
}

// Every W-Engine at refinements 1 to 5 on a matching-specialty agent
for (const wEngine of wEngines) {
  const candidates = agents.filter((a) => a.specialty === wEngine.specialty);
  const agent = pick(candidates.length > 0 ? candidates : agents);
  const profile = profiles.get(agent.id);
  for (let r = 1; r <= 5; r++) {
    const id = `wengine-${wEngine.id}-r${r}`;
    addCase(
      agent,
      id,
      `${wEngine.name} R${r}`,
      makeBuild(agent, id, makeDiscs(agent, profile, id), { equippedWEngineId: wEngine.id, wEngineRefinement: r }),
    );
  }
}

// Every set as the 4pc and as the 2pc
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
for (const set of setNames) {
  for (const role of ['4pc', '2pc']) {
    const agent = pick(agents);
    const profile = profiles.get(agent.id);
    const partner = pick(setNames.filter((s) => s !== set));
    const sets = role === '4pc' ? [set, partner] : [partner, set];
    const id = `set-${role}-${slug(set)}`;
    addCase(
      agent,
      id,
      `${set} as ${role}, ${partner} as the other set`,
      makeBuild(agent, id, makeDiscs(agent, profile, id, { sets }), { equippedWEngineId: profile.wEngineId }),
    );
  }
}

// Conditional 4pc sets on both sides of each condition. Each group's 4pc output must not be all alike.
const conditionGroups = [];
function conditional(group, set, agentFilter, label, discOpts = {}) {
  const agent = pick(agents.filter(agentFilter));
  const profile = profiles.get(agent.id);
  const id = `cond-${slug(set)}-${label}`;
  const build = makeBuild(agent, id, makeDiscs(agent, profile, id, { sets: [set, profile.set2 === set ? profile.set4 : profile.set2], ...discOpts }), {
    equippedWEngineId: profile.wEngineId,
  });
  addCase(agent, id, `${set} 4pc: ${label}`, build);
  conditionGroups.push({ group, agentId: agent.id, caseId: id });
}
const allSlots = (value) => Object.fromEntries(SLOTS.map((s) => [s, value]));
const isSpecialty = (s) => (a) => a.specialty === s;

conditional('bbs', 'Branch & Blade Song', isSpecialty('Anomaly'), 'anomaly-am-main', { mains: { Drive6: 'Anomaly_Mastery' } });
conditional('bbs', 'Branch & Blade Song', isSpecialty('Anomaly'), 'anomaly-atk-main', { mains: { Drive6: 'ATK%' } });
conditional('bbs', 'Branch & Blade Song', isSpecialty('Attack'), 'attack', { mains: { Drive6: 'ATK%' } });
const critSubs = allSlots(['CRIT_Rate', 'CRIT_DMG', 'ATK%', 'PEN', 'HP%', 'DEF']);
const noCritSubs = allSlots(['HP%', 'DEF%', 'HP', 'DEF', 'PEN', 'ATK']);
conditional('kots', 'King of the Summit', isSpecialty('Attack'), 'high-crit-rate', { mains: { Drive4: 'CRIT_Rate' }, subs: critSubs, rolls: allSlots([6, 1, 1, 1]) });
conditional('kots', 'King of the Summit', isSpecialty('Attack'), 'low-crit-rate', { mains: { Drive4: 'ATK%' }, subs: noCritSubs });
conditional('wwb', 'White Water Ballad', isSpecialty('Attack'), 'attack');
conditional('wwb', 'White Water Ballad', isSpecialty('Stun'), 'stun');
conditional('sky', 'The Sky Ablaze', (a) => a.element === 'Ether', 'ether');
conditional('sky', 'The Sky Ablaze', (a) => a.element === 'Fire', 'fire');
const defSubs = allSlots(['DEF%', 'DEF', 'HP%', 'CRIT_Rate', 'ATK%', 'HP']);
const defMains = { Drive4: 'DEF%', Drive5: 'DEF%', Drive6: 'DEF%' };
conditional('thorned', 'Thorned Rose', isSpecialty('Defense'), 'defense-max-def', { mains: defMains, subs: defSubs, rolls: allSlots([6, 1, 1, 1]) });
conditional('thorned', 'Thorned Rose', isSpecialty('Defense'), 'defense-two-def-mains', {
  mains: { Drive4: 'DEF%', Drive5: 'DEF%', Drive6: 'HP%' },
  subs: allSlots(['CRIT_Rate', 'CRIT_DMG', 'HP%', 'ATK%', 'HP', 'PEN']),
});
conditional('thorned', 'Thorned Rose', isSpecialty('Attack'), 'attack');

// Check: both sides of every condition were reached, and the stale pin fell back.
const caseById = (agentId, caseId) => fixtures.get(agentId).cases.find((c) => c.id === caseId);
const evaluate = (agentId, c) => {
  const wEngine = c.build.equippedWEngineId ? ctx.wEnginesById.get(c.build.equippedWEngineId) : undefined;
  const build = structuredClone({ ...c.build, equippedWEngine: wEngine });
  return withQuietConsole(() => runCase(ctx, structuredClone(ctx.agentsById.get(agentId)), build, c.plan)).result;
};
const failures = [];
const groups = Object.groupBy(conditionGroups, (g) => g.group);
for (const [group, members] of Object.entries(groups)) {
  const outputs = members.map((m) => ({ caseId: m.caseId, stats: evaluate(m.agentId, caseById(m.agentId, m.caseId)) }));
  const distinct = new Set(outputs.map((o) => JSON.stringify(o.stats.fourPcBonuses)));
  console.log(`condition ${group}:`);
  for (const o of outputs) {
    const s = o.stats.stats;
    console.log(`  ${o.caseId}: AM ${s.anomalyMastery}, CR ${s.critRate}, DEF ${s.def} -> ${JSON.stringify(o.stats.fourPcBonuses)}`);
  }
  if (distinct.size < 2) failures.push(`condition group ${group}: every case produced the same 4pc output`);
}
for (const agent of agents) {
  const c = caseById(agent.id, 'pin-stale');
  const resolved = evaluate(agent.id, c).resolvedBuildType;
  if (resolved === STALE_BUILD_TYPE) failures.push(`${agent.id}: stale pin was not ignored`);
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const fixture of fixtures.values()) {
  total += fixture.cases.length;
  writeFileSync(join(outDir, `${fixture.agentId}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
}
console.log(`fixtures: ${fixtures.size} agents, ${total} cases, ${wEngines.length} W-Engines, ${setNames.length} sets -> ${outDir}`);
