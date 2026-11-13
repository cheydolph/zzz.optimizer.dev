import type { Agent } from '../models/agent.model';
import type { Disc } from '../models/disc.model';
import type { WEngine } from '../models/wengine.model';
import { type AgentBuild, BuildService, normalizeStoredBuild } from './build.service';
import type { DbService } from './db.service';
import type { NotificationService } from './notification.service';
import type { ScoringService } from './scoring.service';
import type { StatCalculatorService } from './stat-calculator.service';

describe('normalizeStoredBuild', () => {
  // A build as an old (1.0) export or an old localStorage entry has it: no refinement, toggles,
  // or enabledDiscs, and the old "Pen_Ratio" main stat name.
  const oldBuild = (): AgentBuild =>
    ({
      id: 'b1',
      agentId: '1011',
      equippedDiscs: {
        Drive5: { uid: 'd5', slot: 'Drive5', mainStat: { type: 'Pen_Ratio', value: 24 }, subStats: [] },
      },
    }) as unknown as AgentBuild; // deliberately missing fields, as stored by older versions

  it('fills the fields older builds lack and renames Pen_Ratio', () => {
    const build = oldBuild();
    normalizeStoredBuild(build);
    expect(build.wEngineRefinement).toBe(1);
    expect(build.includeWEngineBonuses).toBe(true);
    expect(build.includeMindscapeBonuses).toBe(true);
    expect(build.includePassiveBonuses).toBe(true);
    expect(build.enabledDiscs).toEqual({ Drive5: true });
    expect(Object.values(build.equippedDiscs)[0].mainStat.type).toBe('PEN_Ratio');
  });

  it('leaves fields that are already set', () => {
    const build = { ...oldBuild(), wEngineRefinement: 3, includeWEngineBonuses: false, enabledDiscs: {} };
    normalizeStoredBuild(build);
    expect(build.wEngineRefinement).toBe(3);
    expect(build.includeWEngineBonuses).toBe(false);
    expect(build.enabledDiscs).toEqual({});
  });
});

// BUG-17 (slice 4.6b): every value the service emits is deep-frozen here, so any later in-place write to an
// emitted array or build throws (ES modules run in strict mode) and the write path's test fails.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('BuildService immutable updates (BUG-17)', () => {
  const agent = { id: '1011', name: 'Anby', element: 'Electric', specialty: 'Stun', lvl60Stats: { hp: 1, atk: 2 } };
  let service: BuildService;
  let calc: { calls: number };

  function create(): BuildService {
    calc = { calls: 0 };
    const db = { getAgent: async (id: string) => (id === agent.id ? agent : undefined) } as unknown as DbService;
    // Stand-ins: the arguments of the stat and score calls are covered by the goldens; here only the copies matter
    const stats = {
      ensureDataLoaded: async () => undefined,
      clearCache: () => undefined,
      calculateFinalStats: () => ({ hp: 10, atk: 20 + calc.calls++ }),
    } as unknown as StatCalculatorService;
    const scoring = {
      ensureDataLoaded: async () => undefined,
      calculateCompositeBuildScore: () => ({ score: 42 }),
    } as unknown as ScoringService;
    const notifications = { error: () => undefined } as unknown as NotificationService;
    const created = new BuildService(db, stats, scoring, notifications, 'browser');
    created.builds$.subscribe(deepFreeze);
    created.selectedBuild$.subscribe(deepFreeze);
    return created;
  }

  const disc = (slot: string, uid: string) =>
    ({ uid, slot, set: 'Woodpecker Electro', mainStat: { type: 'HP', value: 2200 }, subStats: [] }) as unknown as Disc;

  beforeEach(async () => {
    localStorage.clear();
    service = create();
    await service.loadBuilds();
  });

  it('creates, updates, equips, unequips, reorders, recalculates, imports, and deletes without writing into emitted values', async () => {
    const first = await service.createBuild(agent as unknown as Agent);
    const second = await service.createBuild(agent as unknown as Agent, 2);
    service.selectBuild(first);
    await service.updateBuild(first.id, { name: 'Renamed' });
    await service.updateBuild(first.id, { includeSetBonuses: false });
    await service.equipWEngine(first.id, { id: 'w1', name: 'W' } as unknown as WEngine);
    await service.equipDisc(first.id, disc('Drive1', 'd1'));
    await service.equipDisc(first.id, disc('Drive2', 'd2'));
    await service.unequipDisc(first.id, 'Drive1');
    await service.unequipWEngine(first.id);
    await service.reorderBuilds([...service.getBuilds()].reverse());
    await service.recalculateAllBuilds();
    await service.importBuildList([{ ...structuredClone(second), id: 'imported', equippedDiscs: {} }], false);
    await service.deleteBuild(second.id);

    const stored: AgentBuild[] = JSON.parse(localStorage.getItem('zzz-optimizer-builds') ?? '[]');
    expect(stored.map((b) => b.id)).toEqual([first.id, 'imported']);
    const updated = stored[0];
    expect(updated.name).toBe('Renamed');
    expect(updated.includeSetBonuses).toBe(false);
    expect(updated.equippedWEngine).toBeUndefined();
    expect(Object.keys(updated.equippedDiscs)).toEqual(['Drive2']);
    expect(updated.enabledDiscs).toEqual({ Drive2: true });
    expect(updated.score).toBe(42);
    expect(service.getBuilds()).toEqual(stored.map((b) => expect.objectContaining({ id: b.id })));
  });

  it('emits a new array and a new build object on every change, and keeps untouched builds', async () => {
    const emitted: AgentBuild[][] = [];
    service.builds$.subscribe((b) => emitted.push(b));
    const a = await service.createBuild(agent as unknown as Agent);
    const b = await service.createBuild(agent as unknown as Agent);
    await service.updateBuild(a.id, { name: 'A2' });

    const [afterB, afterUpdate] = emitted.slice(-2);
    expect(afterUpdate).not.toBe(afterB);
    expect(afterUpdate[0]).not.toBe(afterB[0]);
    expect(afterUpdate[1]).toBe(afterB[1]);
    expect(afterUpdate[1].id).toBe(b.id);
  });

  it('keeps both changes when two updates of one build overlap', async () => {
    const build = await service.createBuild(agent as unknown as Agent);

    // Not awaited one by one, as the mindscape buttons and quick toggles call it
    await Promise.all([
      service.updateBuild(build.id, { includeSetBonuses: false }),
      service.updateBuild(build.id, { include4pcBonuses: false }),
    ]);

    const stored: AgentBuild[] = JSON.parse(localStorage.getItem('zzz-optimizer-builds') ?? '[]');
    expect(stored[0].includeSetBonuses).toBe(false);
    expect(stored[0].include4pcBonuses).toBe(false);
    expect(service.getBuildById(build.id)).toEqual(
      expect.objectContaining({ includeSetBonuses: false, include4pcBonuses: false }),
    );
  });
});
