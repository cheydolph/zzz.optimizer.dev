// Checks that the build-time slimming of agents.json (build-scripts/slim-agent-data.js) cannot change
// what the app stores: both DataTransformerService paths must give identical output for every agent
// from the full and the slimmed file. Run after editing DROP_FIELDS or the transformer.
// Usage: node test-harness/slim-check.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUNDLE_PATH, buildBundle } from './build.mjs';
import { REPO_ROOT, SRC_DIR } from './lib.mjs';

const { DROP_FIELDS, slimAgents } = createRequire(import.meta.url)(
  join(REPO_ROOT, 'build-scripts', 'slim-agent-data.js'),
);

await buildBundle();
const B = await import(pathToFileURL(BUNDLE_PATH).href);
const transformer = new B.DataTransformerService(new B.DataMappingService());

const full = JSON.parse(readFileSync(join(SRC_DIR, 'assets', 'data', 'agents.json'), 'utf8'));
const slim = slimAgents(full);
const viaList = (raw) => JSON.stringify(transformer.transformAgents(raw));
const viaEach = (raw) => JSON.stringify(raw.map((a) => transformer.transformAgentWithDetailedStats(String(a.id), a)));

const problems = [];
if (viaList(full) !== viaList(slim)) problems.push('transformAgents output differs');
if (viaEach(full) !== viaEach(slim)) problems.push('transformAgentWithDetailedStats output differs');
const before = Buffer.byteLength(JSON.stringify(full));
const after = Buffer.byteLength(JSON.stringify(slim));
if (problems.length > 0) {
  console.error(`FAIL: ${problems.join('; ')} (dropped: ${DROP_FIELDS.join(', ')})`);
  process.exit(1);
}
console.log(
  `PASS: ${full.length} agents transform identically without ${DROP_FIELDS.join(', ')} (${before} -> ${after} bytes minified)`,
);
