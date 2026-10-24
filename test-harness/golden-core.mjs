// Runner-independent golden code, shared by the Node harness (lib.mjs) and the Vitest spec
// (src/app/services/goldens.spec.ts): context setup from constructed services, the per-case runner,
// the fixture and export loops, and the bit-exact comparator. Paths are always passed in, because
// import.meta.url points at the test bundle when this file runs under Vitest.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { of } from 'rxjs';

export const WENGINES_FILE = 'wengines.json';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Replaces HttpClient: serves `assets/data/...` URLs from `srcDir`, ignoring the `?v=` query. */
export class AssetHttp {
  constructor(srcDir) {
    this.srcDir = srcDir;
  }

  get(url) {
    return of(readJson(join(this.srcDir, url.split('?')[0])));
  }
}

/**
 * Waits for the services' constructor loads and transforms the reference data. ScoringService has
 * no "data ready" promise (TEST-02), so this awaits StatCalculatorService.ensureDataLoaded() plus
 * one macrotask, then checks the loaded state. The services must already be constructed, in the
 * order the app's injector creates them.
 */
export async function prepareContext({ transformer, discSet, statCalc, scoring }, srcDir) {
  await statCalc.ensureDataLoaded();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assertReady(scoring, discSet, srcDir);

  // Same transforms as DataImportService.importReferenceDataFromIndividualFiles.
  const rawAgents = readJson(join(srcDir, 'assets/data/agents.json'));
  const agents = rawAgents.map((a) => transformer.transformAgentWithDetailedStats(String(a.id), a));
  const rawWEngines = readJson(join(srcDir, 'assets/data/wengines.json'));
  const wEngines = Object.keys(rawWEngines).map((id) => transformer.transformWEngines({ [id]: rawWEngines[id] })[0]);

  return {
    statCalc,
    scoring,
    discSet,
    agents,
    wEngines,
    agentsById: new Map(agents.map((a) => [a.id, a])),
    wEnginesById: new Map(wEngines.map((w) => [w.id, w])),
  };
}

function assertReady(scoring, discSet, srcDir) {
  const weights = readJson(join(srcDir, 'assets/data/agent-stat-weights.json'));
  const someAgentId = Object.keys(weights.agents)[0];
  const problems = [];
  if (!scoring.areBreakpointsLoaded()) problems.push('agent-breakpoints.json not loaded');
  if (scoring.getAvailableBuildTypes(someAgentId).length === 0) problems.push('agent-stat-weights.json not loaded');
  if (!discSet.isDataLoaded()) problems.push('disc set equipment data not loaded');
  if (problems.length > 0) throw new Error(`Service data not ready: ${problems.join('; ')}`);
}

/**
 * Runs one build through the same calls the app makes, in a fixed order.
 * `build.equippedWEngine` is a W-Engine object (as stored on AgentBuild); `plan` is an UpgradePlan or undefined.
 * Inputs are not cloned here: callers pass fresh objects per case.
 */
export function runCase(ctx, agent, build, plan) {
  const { statCalc, scoring } = ctx;
  const out = {};
  const wEngine = build.equippedWEngine;
  const discs = build.equippedDiscs;
  const discList = Object.values(discs).filter((d) => d !== undefined);

  // BuildService.recalculateStats
  out.stats = capture(() => {
    statCalc.clearCache();
    return statCalc.calculateFinalStats(
      agent,
      build.level,
      wEngine || null,
      discs,
      build.mindscapeLevel,
      build.wEngineRefinement,
      build.includeWEngineBonuses ?? true,
      build.includeMindscapeBonuses ?? true,
      build.includePassiveBonuses ?? true,
      build.enabledDiscs ?? {},
      build.includeSetBonuses ?? true,
      build.include4pcBonuses ?? true,
    );
  });
  const stats = out.stats.error ? undefined : out.stats;

  // CharacterTabComponent.getSetBonuses / get4pcEffectBonuses
  out.setBonuses = capture(() => statCalc.getSetBonuses(discs));
  out.fourPcBonuses = capture(() => {
    statCalc.clearCache();
    return statCalc.get4pcEffectBonuses(discs, agent, wEngine || null, build.mindscapeLevel || 0, build.wEngineRefinement || 1);
  });

  out.detectedBuildType = capture(() => scoring.detectBuildType(discList, agent.id));
  // CharacterTabComponent.getDiscScore resolves the type only when discs are equipped.
  const resolved = capture(() =>
    discList.length > 0 ? scoring.resolveBuildType(discList, agent.id, build.preferredBuildType) : undefined,
  );
  out.resolvedBuildType = resolved ?? null;
  const resolvedType = typeof resolved === 'string' ? resolved : undefined;

  out.discScores = {};
  for (const [slot, disc] of Object.entries(discs)) {
    if (disc === undefined) continue;
    out.discScores[slot] = capture(() => scoring.calculateDiscScore(disc, agent.id, resolvedType, plan));
  }

  if (stats) {
    out.buildScore = capture(() => scoring.calculateBuildScore(agent.id, stats, resolvedType));
    // BuildService.recalculateStats passes no plan; CharacterTabComponent.getBuildScore passes the active plan.
    out.compositeScore = capture(() =>
      scoring.calculateCompositeBuildScore(
        agent.id,
        stats,
        discList,
        wEngine || undefined,
        build.wEngineRefinement || 1,
        build.mindscapeLevel || 0,
        agent.name,
        agent.specialty,
        agent.element,
        build.level,
        undefined,
        undefined,
        plan,
        build.preferredBuildType,
      ),
    );
    // CharacterTabComponent.getBuildFeedback
    out.feedback = capture(() =>
      scoring.generateBuildFeedback(
        agent.id,
        stats,
        discs,
        !!wEngine,
        !!wEngine && agent.specialty === wEngine.specialty,
        plan,
        build.preferredBuildType,
        agent.specialty,
      ),
    );
  }
  return out;
}

function capture(fn) {
  try {
    return fn();
  } catch (error) {
    return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

/**
 * Runs every synthetic fixture in `fixturesDir`. Returns the computed output files keyed by file name
 * (raw objects, before JSON, so -0, NaN, and Infinity can still be detected), the case count, and how
 * many service console messages were suppressed per level.
 */
export function computeSyntheticOutputs(ctx, fixturesDir) {
  const fixtureFiles = listJsonFiles(fixturesDir);
  if (fixtureFiles.length === 0) throw new Error(`No fixtures in ${fixturesDir}`);

  const computed = new Map();
  computed.set(WENGINES_FILE, { wEngines: ctx.wEngines });
  let caseCount = 0;
  const consoleCounts = {};
  for (const file of fixtureFiles) {
    const fixture = readJson(join(fixturesDir, file));
    const agent = ctx.agentsById.get(fixture.agentId);
    if (!agent) throw new Error(`${file}: agent ${fixture.agentId} is not in agents.json`);
    const cases = {};
    for (const c of fixture.cases) {
      // Fresh copies per case: the app reads the agent from IndexedDB and the build from localStorage JSON.
      const wEngine = c.build.equippedWEngineId ? ctx.wEnginesById.get(c.build.equippedWEngineId) : undefined;
      if (c.build.equippedWEngineId && !wEngine) throw new Error(`${file} ${c.id}: unknown W-Engine ${c.build.equippedWEngineId}`);
      const { equippedWEngineId, ...build } = c.build;
      build.equippedWEngine = wEngine ? toGoldenForm(wEngine) : undefined;
      const { result, counts } = withQuietConsole(() => runCase(ctx, structuredClone(agent), build, c.plan));
      for (const [level, n] of Object.entries(counts)) consoleCounts[level] = (consoleCounts[level] ?? 0) + n;
      cases[c.id] = result;
      caseCount++;
    }
    computed.set(file, { agentId: fixture.agentId, agent, cases });
  }
  return { computed, caseCount, consoleCounts };
}

/** Every difference between `computed` (from computeSyntheticOutputs) and the golden files in `goldensDir`. */
export function diffSyntheticGoldens(computed, goldensDir) {
  const diffs = [];
  for (const [file, value] of computed) {
    for (const hit of findUnrepresentable(value)) diffs.push(`${file} ${hit}: not representable in a golden`);
  }
  const goldenFiles = new Set(listJsonFiles(goldensDir));
  for (const [file, value] of computed) {
    if (!goldenFiles.has(file)) {
      diffs.push(`${file}: golden file missing`);
      continue;
    }
    for (const d of compareTrees(readJson(join(goldensDir, file)), toGoldenForm(value))) diffs.push(`${file} ${d}`);
    goldenFiles.delete(file);
  }
  for (const file of goldenFiles) diffs.push(`${file}: golden file has no fixture`);
  return diffs;
}

/**
 * Runs the builds in one Data Manager export (`exportsDir/file`) with their active plans from
 * `plansById`. Returns the outputs keyed by build id and the number of builds run.
 */
export function computeLocalOutputs(ctx, exportsDir, file, plansById) {
  const outputs = {};
  let buildCount = 0;
  for (const build of readJson(join(exportsDir, file)).builds ?? []) {
    const agent = ctx.agentsById.get(build.agentId);
    if (!agent) {
      outputs[build.id] = { error: `agent ${build.agentId} is not in agents.json` };
      continue;
    }
    const plan = build.activeUpgradePlanId ? plansById.get(build.activeUpgradePlanId) : undefined;
    outputs[build.id] = withQuietConsole(() => runCase(ctx, structuredClone(agent), build, plan)).result;
    buildCount++;
  }
  return { outputs, buildCount };
}

/** Upgrade plans from every plans-*.json among `exportFiles`, keyed by id. */
export function readLocalPlans(exportsDir, exportFiles) {
  const plansById = new Map();
  for (const file of exportFiles.filter((f) => f.startsWith('plans-'))) {
    for (const plan of readJson(join(exportsDir, file)).upgradePlans ?? []) plansById.set(plan.id, plan);
  }
  return plansById;
}

/** Lists numbers JSON cannot round-trip: -0 (written as 0) and NaN/Infinity (written as null). */
export function findUnrepresentable(value, path = '$', found = []) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) found.push(`${path} = ${Object.is(value, -0) ? '-0' : value}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findUnrepresentable(v, `${path}[${i}]`, found));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) findUnrepresentable(v, `${path}.${k}`, found);
  }
  return found;
}

/** What a golden file holds for `value`: drops undefined members exactly as JSON.stringify does. */
export function toGoldenForm(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Bit-exact comparison of two JSON-form trees: Object.is per number, === for everything else,
 * same key sets and array lengths. Returns every differing path.
 */
export function compareTrees(expected, actual, path = '$', diffs = []) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (!Object.is(expected, actual)) diffs.push(`${path}: expected ${numberText(expected)}, got ${numberText(actual)}`);
    return diffs;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      diffs.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
      return diffs;
    }
    if (expected.length !== actual.length) diffs.push(`${path}: expected length ${expected.length}, got ${actual.length}`);
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) compareTrees(expected[i], actual[i], `${path}[${i}]`, diffs);
    return diffs;
  }
  if (isObject(expected) && isObject(actual)) {
    for (const k of Object.keys(expected)) {
      if (!(k in actual)) diffs.push(`${path}.${k}: missing`);
      else compareTrees(expected[k], actual[k], `${path}.${k}`, diffs);
    }
    for (const k of Object.keys(actual)) {
      if (!(k in expected)) diffs.push(`${path}.${k}: unexpected (${describe(actual[k])})`);
    }
    return diffs;
  }
  if (expected !== actual) diffs.push(`${path}: expected ${describe(expected)}, got ${describe(actual)}`);
  return diffs;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function numberText(n) {
  return Object.is(n, -0) ? '-0' : String(n);
}

function describe(v) {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

/** JSON files in `dir`, sorted, or [] when the folder is missing. */
export function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/**
 * Silences console output from the services while `fn` runs (several warn per call for unknown
 * conditions), and returns how many messages were dropped per level.
 */
export function withQuietConsole(fn) {
  const levels = ['log', 'debug', 'info', 'warn', 'error'];
  const saved = levels.map((l) => console[l]);
  const counts = Object.fromEntries(levels.map((l) => [l, 0]));
  levels.forEach((l) => {
    console[l] = () => {
      counts[l]++;
    };
  });
  try {
    return { result: fn(), counts };
  } finally {
    levels.forEach((l, i) => {
      console[l] = saved[i];
    });
  }
}
