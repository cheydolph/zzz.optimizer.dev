import type { HttpClient } from '@angular/common/http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { of } from 'rxjs';
import type { Disc } from '../models/disc.model';
import { BuildImportExportService } from './build-import-export.service';
import { BuildService } from './build.service';
import { DataFileService } from './data-file.service';
import type { DbService, ShareCustomization } from './db.service';
import { DiscLoadoutService } from './disc-loadout.service';
import { DiscService } from './disc.service';
import type { NotificationService } from './notification.service';
import type { ScoringService } from './scoring.service';
import type { StatCalculatorService } from './stat-calculator.service';
import { UpgradePlanService } from './upgrade-plan.service';

// Legacy import through the real Data Manager import path (BUG-08, slice 4.1). jsdom has no
// IndexedDB, so DbService is replaced by an in-memory stand-in for the calls the import makes.
// The builds' agent is not in the stand-in, so recalculation keeps their stored stats (as the
// app does for an unknown agent) and no stat or scoring service is needed.
const LEGACY_V1 = readFileSync(join(process.cwd(), 'test-data', 'synthetic', 'legacy', 'v1-pen-ratio.json'), 'utf8');

function fakeDb() {
  const discs = new Map<string, Disc>();
  const shareCustomizations = new Map<string, ShareCustomization>();
  const table = <T>(map: Map<string, T>, key: (item: T) => string) => ({
    clear: async () => map.clear(),
    bulkPut: async (items: T[]) => {
      for (const item of items) {
        map.set(key(item), item);
      }
    },
  });
  return {
    discs: table(discs, (d) => d.uid),
    shareCustomizations: table(shareCustomizations, (c) => c.agentId),
    transaction: (_mode: string, _tables: unknown[], scope: () => unknown) => Promise.resolve(scope()),
    getAllDiscs: async () => [...discs.values()],
    getAllShareCustomizations: async () => [...shareCustomizations.values()],
    getAgent: async () => undefined,
    stored: { discs, shareCustomizations },
  };
}

function createService() {
  const db = fakeDb();
  // The stand-in covers only what these import paths call; the casts tell the constructors so.
  const dbService = db as unknown as DbService;
  const notifications = { error: () => undefined, warning: () => undefined } as unknown as NotificationService;
  const http = { get: () => of({ agents: {} }) } as unknown as HttpClient;
  const buildService = new BuildService(
    dbService,
    {} as StatCalculatorService,
    {} as ScoringService,
    notifications,
    'browser',
  );
  const service = new BuildImportExportService(
    buildService,
    new DiscService(dbService, 'browser'),
    new DiscLoadoutService('browser', notifications),
    new UpgradePlanService('browser', new DataFileService(http), notifications),
    dbService,
  );
  return { db, service };
}

describe('BuildImportExportService legacy import', () => {
  beforeEach(() => localStorage.clear());

  it('imports a 1.0 export and stores the builds normalized (Pen_Ratio to PEN_Ratio)', async () => {
    const { db, service } = createService();

    const result = await service.importBuilds(LEGACY_V1, false);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Successfully imported 1 builds, 1 discs (migrated from version 1.0)');
    const [build] = JSON.parse(localStorage.getItem('zzz-optimizer-builds') ?? '[]');
    expect(build.id).toBe('build_legacy_v1');
    expect(build.equippedDiscs.Drive5.mainStat.type).toBe('PEN_Ratio');
    expect(build.wEngineRefinement).toBe(1);
    expect(build.includeWEngineBonuses).toBe(true);
    expect(build.includeMindscapeBonuses).toBe(true);
    expect(build.includePassiveBonuses).toBe(true);
    expect(build.enabledDiscs).toEqual({ Drive5: true });
    expect(db.stored.discs.has('legacy-v1-drive5')).toBe(true);
    expect(JSON.parse(localStorage.getItem('zzz-optimizer-disc-loadouts') ?? 'null')).toEqual([]);
  });

  it('keeps current plans and share customizations when Replace imports a file without them', async () => {
    const plan = { id: 'plan_keep', name: 'Keep', agentId: '1011' };
    localStorage.setItem('zzz-optimizer-upgrade-plans', JSON.stringify([plan]));
    const { db, service } = createService();
    db.stored.shareCustomizations.set('1011', { agentId: '1011', accentColor: '#123456' });

    const result = await service.importBuilds(LEGACY_V1, true);

    expect(result.success).toBe(true);
    expect(
      JSON.parse(localStorage.getItem('zzz-optimizer-upgrade-plans') ?? '[]').map((p: { id: string }) => p.id),
    ).toEqual(['plan_keep']);
    expect(db.stored.shareCustomizations.get('1011')?.accentColor).toBe('#123456');
  });
});
