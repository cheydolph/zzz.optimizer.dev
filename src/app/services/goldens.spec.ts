import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { join } from 'node:path';
import {
  AssetHttp,
  compareTrees,
  computeLocalOutputs,
  computeSyntheticOutputs,
  diffSyntheticGoldens,
  findUnrepresentable,
  listJsonFiles,
  prepareContext,
  readJson,
  readLocalPlans,
  toGoldenForm,
} from '../../../test-harness/golden-core.mjs';
import { DataMappingService } from './data-mapping.service';
import { DataTransformerService } from './data-transformer.service';
import { DiscSetDataService } from './disc-set-data.service';
import { ScoringService } from './scoring.service';
import { SkillParserService } from './skill-parser.service';
import { StatCalculatorService } from './stat-calculator.service';

// Characterization tests: the same fixtures, goldens, case runner, and bit-exact comparator as
// test-harness/goldens.mjs, but with the services compiled by the Angular CLI and built through DI.
// The builder bundles this file, so import.meta.url cannot locate the repo; ng test runs from the
// workspace root.
const REPO_ROOT = process.cwd();
const SRC_DIR = join(REPO_ROOT, 'src');
const SYNTHETIC_DIR = join(REPO_ROOT, 'test-data', 'synthetic');
const LOCAL_EXPORTS_DIR = join(REPO_ROOT, 'test-data', 'local', 'exports');
const LOCAL_GOLDENS_DIR = join(REPO_ROOT, 'test-data', 'local', 'goldens');
const MAX_REPORTED_DIFFS = 200;
// 44 MB of fixtures and goldens on /mnt/c; the Node harness needs about 10 s.
const GOLDEN_TIMEOUT_MS = 120_000;

async function createContext() {
  TestBed.configureTestingModule({
    providers: [{ provide: HttpClient, useValue: new AssetHttp(SRC_DIR) }],
  });
  // Same construction order as the app's injector and test-harness/lib.mjs setup().
  TestBed.inject(DataMappingService);
  const transformer = TestBed.inject(DataTransformerService);
  const discSet = TestBed.inject(DiscSetDataService);
  TestBed.inject(SkillParserService);
  const statCalc = TestBed.inject(StatCalculatorService);
  const scoring = TestBed.inject(ScoringService);
  return prepareContext({ transformer, discSet, statCalc, scoring }, SRC_DIR);
}

describe('golden outputs', () => {
  it(
    'match every synthetic golden bit-exactly',
    async () => {
      const ctx = await createContext();
      const { computed, caseCount } = computeSyntheticOutputs(ctx, join(SYNTHETIC_DIR, 'fixtures'));
      const diffs = diffSyntheticGoldens(computed, join(SYNTHETIC_DIR, 'goldens'));
      expect(diffs.slice(0, MAX_REPORTED_DIFFS), `${diffs.length} differences in ${caseCount} cases`).toEqual([]);
    },
    GOLDEN_TIMEOUT_MS,
  );

  // Skipped at collection time: a dynamic skip() inside the zone-wrapped async test logs a stack to stderr.
  const localExportFiles = listJsonFiles(LOCAL_EXPORTS_DIR);
  const recordedLocalGoldens = new Set(listJsonFiles(LOCAL_GOLDENS_DIR));
  const files = localExportFiles.filter((f) => f.startsWith('builds-') && recordedLocalGoldens.has(f));
  it.skipIf(files.length === 0)(
    'match the recorded goldens for the exports in test-data/local (skipped when none is recorded)',
    async () => {
      const ctx = await createContext();
      const plansById = readLocalPlans(LOCAL_EXPORTS_DIR, localExportFiles);
      const diffs: string[] = [];
      for (const file of files) {
        const { outputs } = computeLocalOutputs(ctx, LOCAL_EXPORTS_DIR, file, plansById);
        for (const hit of findUnrepresentable(outputs)) diffs.push(`${file} ${hit}: not representable in a golden`);
        for (const d of compareTrees(readJson(join(LOCAL_GOLDENS_DIR, file)), toGoldenForm(outputs))) diffs.push(`${file} ${d}`);
      }
      expect(diffs.slice(0, MAX_REPORTED_DIFFS), `${diffs.length} differences`).toEqual([]);
    },
    GOLDEN_TIMEOUT_MS,
  );
});
