// Node harness setup: bundles the services with esbuild and constructs them with `new`. The case
// runner, the fixture loops, and the comparator live in golden-core.mjs, shared with the Vitest spec.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUNDLE_PATH, buildBundle } from './build.mjs';
import { AssetHttp, prepareContext } from './golden-core.mjs';

export * from './golden-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..');
export const SRC_DIR = join(REPO_ROOT, 'src');
export const SYNTHETIC_DIR = join(REPO_ROOT, 'test-data', 'synthetic');
export const LOCAL_DIR = join(REPO_ROOT, 'test-data', 'local');

/** Builds the bundle, constructs the services in the order the app's injector does, and prepares the context. */
export async function setup() {
  await buildBundle();
  const B = await import(pathToFileURL(BUNDLE_PATH).href);

  const http = new AssetHttp(SRC_DIR);
  const mapping = new B.DataMappingService();
  const transformer = new B.DataTransformerService(mapping);
  const discSet = new B.DiscSetDataService(http);
  const skillParser = new B.SkillParserService(http);
  const statCalc = new B.StatCalculatorService(discSet, http);
  const scoring = new B.ScoringService(http, skillParser, discSet);

  return { B, ...(await prepareContext({ transformer, discSet, statCalc, scoring }, SRC_DIR)) };
}
