import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EMPTY } from 'rxjs';
import {
  AssetHttp,
  compareTrees,
  findUnrepresentable,
  listJsonFiles,
  prepareContext,
  readJson,
  toGoldenForm,
} from '../../../../test-harness/golden-core.mjs';
import type { Agent } from '../../models/agent.model';
import type { WEngine } from '../../models/wengine.model';
import type { AgentBuild } from '../../services/build.service';
import { DataMappingService } from '../../services/data-mapping.service';
import { DataTransformerService } from '../../services/data-transformer.service';
import { DataFileService } from '../../services/data-file.service';
import { DiscSetDataService } from '../../services/disc-set-data.service';
import { ScoringService } from '../../services/scoring.service';
import { SkillParserService } from '../../services/skill-parser.service';
import { StatCalculatorService } from '../../services/stat-calculator.service';
import { CharacterTabComponent } from './character-tab.component';

// Slice 4.6b display checks: what the build view shows from computeSubstatBreakdown(), computePassiveBonuses(),
// and computeMindscapeBonuses(), for every synthetic fixture case (agent, W-Engine and refinement, mindscape
// level, equipped and disabled discs, pinned build type, include toggles), through the real component and
// services with the real reference data. The goldens do not cover these display functions.
// Expected values were recorded once (DISPLAY_CHECKS_RECORD=1 with no file present) and are compared exactly:
// Object.is per number, === for strings and flags. Never re-record without the user's approval.
const REPO_ROOT = process.cwd(); // ng test runs from the workspace root; import.meta.url points at the bundle
const SRC_DIR = join(REPO_ROOT, 'src');
const FIXTURES_DIR = join(REPO_ROOT, 'test-data', 'synthetic', 'fixtures');
const EXPECTED_FILE = join(REPO_ROOT, 'test-data', 'synthetic', 'display', 'character-tab-display.json');
const MAX_REPORTED_DIFFS = 200;
const TIMEOUT_MS = 180_000;

type Fixture = {
  agentId: string;
  cases: Array<{ id: string; build: Omit<AgentBuild, 'equippedWEngine'> & { equippedWEngineId?: string } }>;
};
/** The display functions under test and the cache reset the app runs when a build changes, reached through a cast. */
type Internals = {
  mindscapeData: unknown;
  clearScoreCaches(): void;
  computeSubstatBreakdown(): unknown;
  computePassiveBonuses(): unknown;
  computeMindscapeBonuses(): unknown;
};

/** What the build view shows for one build. The single place to adapt when the state work changes the API. */
function readDisplay(component: CharacterTabComponent, build: AgentBuild, agent: Agent): unknown {
  const internals = component as unknown as Internals;
  component.referenceAgents = [agent];
  component.selectedBuild = build;
  internals.clearScoreCaches();
  return {
    substats: internals.computeSubstatBreakdown(),
    passives: internals.computePassiveBonuses(),
    mindscapes: internals.computeMindscapeBonuses(),
  };
}

/** A fixture case's build as the app stores it: the W-Engine object in place of its id, as in the goldens. */
function toBuild(c: Fixture['cases'][number], wEngines: ReadonlyMap<string, WEngine>, file: string): AgentBuild {
  const { equippedWEngineId, ...rest } = structuredClone(c.build);
  const wEngine = equippedWEngineId ? wEngines.get(equippedWEngineId) : undefined;
  if (equippedWEngineId && !wEngine) throw new Error(`${file} ${c.id}: unknown W-Engine ${equippedWEngineId}`);
  return { ...rest, equippedWEngine: wEngine ? toGoldenForm(wEngine) : undefined } as AgentBuild;
}

/** Recording is explicit and one-time: only with DISPLAY_CHECKS_RECORD=1, and never over an existing file. */
function record(actual: unknown): void {
  if (process.env['DISPLAY_CHECKS_RECORD'] !== '1') throw new Error(`${EXPECTED_FILE} is missing`);
  mkdirSync(dirname(EXPECTED_FILE), { recursive: true });
  writeFileSync(EXPECTED_FILE, `${JSON.stringify(toGoldenForm(actual))}\n`);
}

describe('CharacterTabComponent display checks', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: new AssetHttp(SRC_DIR) },
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: EMPTY,
            unrecoverable: EMPTY,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate: () => Promise.resolve(false),
          },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it(
    'match the recorded values for every synthetic fixture case',
    async () => {
      // Same construction order as the app's injector and the goldens spec
      TestBed.inject(DataMappingService);
      const transformer = TestBed.inject(DataTransformerService);
      TestBed.inject(DataFileService);
      const discSet = TestBed.inject(DiscSetDataService);
      TestBed.inject(SkillParserService);
      const statCalc = TestBed.inject(StatCalculatorService);
      const scoring = TestBed.inject(ScoringService);
      const ctx = await prepareContext({ transformer, discSet, statCalc, scoring }, SRC_DIR);
      const agents = new Map((ctx.agents as Agent[]).map((a) => [a.id, a]));
      const wEngines = new Map((ctx.wEngines as WEngine[]).map((w) => [w.id, w]));

      const component = TestBed.createComponent(CharacterTabComponent).componentInstance;
      // The constructor loads mindscape-stats.json
      await vi.waitFor(() => expect((component as unknown as Internals).mindscapeData).toBeTruthy());

      const actual: Record<string, Record<string, unknown>> = {};
      for (const file of listJsonFiles(FIXTURES_DIR)) {
        const fixture = readJson(join(FIXTURES_DIR, file)) as Fixture;
        const agent = agents.get(fixture.agentId);
        if (!agent) throw new Error(`${file}: agent ${fixture.agentId} is not in agents.json`);
        const cases: Record<string, unknown> = {};
        for (const c of fixture.cases) {
          // Fresh copies per case, as in the goldens: the app reads agents from IndexedDB and builds from JSON
          cases[c.id] = readDisplay(component, toBuild(c, wEngines, file), structuredClone(agent));
        }
        actual[fixture.agentId] = cases;
      }

      expect(findUnrepresentable(actual), 'values JSON cannot hold').toEqual([]);
      if (!existsSync(EXPECTED_FILE)) {
        record(actual);
        return;
      }
      const diffs = compareTrees(readJson(EXPECTED_FILE), toGoldenForm(actual));
      expect(diffs.slice(0, MAX_REPORTED_DIFFS), `${diffs.length} differences`).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
