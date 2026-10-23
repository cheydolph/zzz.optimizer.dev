// Runs every synthetic fixture through the real services and compares the outputs bit-exactly
// with the committed goldens. With --write, writes the goldens instead (only with the user's approval).
// Usage: node test-harness/goldens.mjs [--write] [--fixtures <dir>] [--goldens <dir>]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  SYNTHETIC_DIR,
  compareTrees,
  findUnrepresentable,
  listJsonFiles,
  readJson,
  runCase,
  setup,
  toGoldenForm,
  withQuietConsole,
} from './lib.mjs';

const WENGINES_FILE = 'wengines.json';
const MAX_PRINTED_DIFFS = 200;
const write = process.argv.includes('--write');
const fixturesDir = argValue('--fixtures') ?? join(SYNTHETIC_DIR, 'fixtures');
const goldensDir = argValue('--goldens') ?? join(SYNTHETIC_DIR, 'goldens');

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const started = performance.now();
const ctx = await setup();
const setupMs = performance.now() - started;

const fixtureFiles = listJsonFiles(fixturesDir);
if (fixtureFiles.length === 0) {
  console.error(`No fixtures in ${fixturesDir}`);
  process.exit(1);
}

// Computed output files keyed by file name. Each value is the raw object (before JSON) so that
// -0, NaN, and Infinity can still be detected.
const computed = new Map();
computed.set(WENGINES_FILE, { wEngines: ctx.wEngines });
let caseCount = 0;
const consoleCounts = {};
const runStarted = performance.now();
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
const runMs = performance.now() - runStarted;

const unrepresentable = [];
for (const [file, value] of computed) {
  for (const hit of findUnrepresentable(value)) unrepresentable.push(`${file} ${hit}`);
}

const timing = `setup ${Math.round(setupMs)} ms, ${caseCount} cases in ${Math.round(runMs)} ms`;
const quiet = Object.entries(consoleCounts)
  .filter(([, n]) => n > 0)
  .map(([level, n]) => `${level} ${n}`)
  .join(', ');

if (write) {
  if (unrepresentable.length > 0) {
    console.error(`Outputs contain values JSON cannot store exactly:\n${unrepresentable.join('\n')}`);
    process.exit(1);
  }
  rmSync(goldensDir, { recursive: true, force: true });
  mkdirSync(goldensDir, { recursive: true });
  for (const [file, value] of computed) writeFileSync(join(goldensDir, file), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${computed.size} golden files to ${goldensDir} (${timing}; service console messages suppressed: ${quiet || 'none'})`);
  process.exit(0);
}

const diffs = unrepresentable.map((hit) => `${hit}: not representable in a golden`);
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

if (diffs.length > 0) {
  console.error(diffs.slice(0, MAX_PRINTED_DIFFS).join('\n'));
  if (diffs.length > MAX_PRINTED_DIFFS) {
    const fullPath = join(REPO_ROOT, 'test-harness', '.build', 'last-diff.txt');
    writeFileSync(fullPath, `${diffs.join('\n')}\n`);
    console.error(`... ${diffs.length - MAX_PRINTED_DIFFS} more; full list in ${fullPath}`);
  }
  console.error(`FAIL: ${diffs.length} differences (${timing})`);
  process.exit(1);
}
console.log(`PASS: ${computed.size} golden files, ${caseCount} cases bit-exact (${timing}; service console messages suppressed: ${quiet || 'none'})`);
