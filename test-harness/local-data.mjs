// Runs the user's own Data Manager exports through the services and compares them with local goldens.
// Reads <dir>/exports/builds-*.json and plans-*.json; goldens live in <dir>/goldens/ (both gitignored
// under test-data/local/). Skips cleanly when there is no export, and skips an export with no recorded
// golden. --write records the local goldens.
// Usage: node test-harness/local-data.mjs [--write] [--dir <dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_DIR, compareTrees, findUnrepresentable, listJsonFiles, readJson, runCase, setup, toGoldenForm, withQuietConsole } from './lib.mjs';

const write = process.argv.includes('--write');
const dirArg = process.argv.indexOf('--dir');
const localDir = dirArg === -1 ? LOCAL_DIR : process.argv[dirArg + 1];
const exportsDir = join(localDir, 'exports');
const goldensDir = join(localDir, 'goldens');

const exportFiles = listJsonFiles(exportsDir);
const buildFiles = exportFiles.filter((f) => f.startsWith('builds-'));
if (buildFiles.length === 0) {
  console.log(`SKIP: no builds-*.json in ${exportsDir}`);
  process.exit(0);
}

const ctx = await setup();
const plansById = new Map();
for (const file of exportFiles.filter((f) => f.startsWith('plans-'))) {
  for (const plan of readJson(join(exportsDir, file)).upgradePlans ?? []) plansById.set(plan.id, plan);
}

const diffs = [];
const notRecorded = [];
let buildCount = 0;
for (const file of buildFiles) {
  const outputs = {};
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
  for (const hit of findUnrepresentable(outputs)) diffs.push(`${file} ${hit}: not representable in a golden`);
  const goldenPath = join(goldensDir, file);
  if (write) {
    mkdirSync(goldensDir, { recursive: true });
    writeFileSync(goldenPath, `${JSON.stringify(outputs, null, 2)}\n`);
  } else if (!listJsonFiles(goldensDir).includes(file)) {
    notRecorded.push(file);
  } else {
    for (const d of compareTrees(readJson(goldenPath), toGoldenForm(outputs))) diffs.push(`${file} ${d}`);
  }
}

if (diffs.length > 0) {
  console.error(diffs.join('\n'));
  console.error(`FAIL: ${diffs.length} differences across ${buildCount} local builds`);
  process.exit(1);
}
if (notRecorded.length === buildFiles.length) {
  console.log(`SKIP: no local golden recorded for ${notRecorded.join(', ')} (record with --write)`);
  process.exit(0);
}
const skipped = notRecorded.length > 0 ? `; skipped, no golden recorded: ${notRecorded.join(', ')}` : '';
console.log(`${write ? 'WROTE' : 'PASS'}: ${buildCount} local builds in ${buildFiles.length - notRecorded.length} export files${skipped}`);
