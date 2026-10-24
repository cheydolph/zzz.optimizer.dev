// Runs every synthetic fixture through the real services and compares the outputs bit-exactly
// with the committed goldens. With --write, writes the goldens instead (only with the user's approval).
// Usage: node test-harness/goldens.mjs [--write] [--fixtures <dir>] [--goldens <dir>]
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  SYNTHETIC_DIR,
  computeSyntheticOutputs,
  diffSyntheticGoldens,
  findUnrepresentable,
  setup,
} from './lib.mjs';

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

const runStarted = performance.now();
const { computed, caseCount, consoleCounts } = computeSyntheticOutputs(ctx, fixturesDir);
const runMs = performance.now() - runStarted;

const timing = `setup ${Math.round(setupMs)} ms, ${caseCount} cases in ${Math.round(runMs)} ms`;
const quiet = Object.entries(consoleCounts)
  .filter(([, n]) => n > 0)
  .map(([level, n]) => `${level} ${n}`)
  .join(', ');

if (write) {
  const unrepresentable = [];
  for (const [file, value] of computed) {
    for (const hit of findUnrepresentable(value)) unrepresentable.push(`${file} ${hit}`);
  }
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

const diffs = diffSyntheticGoldens(computed, goldensDir);
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
