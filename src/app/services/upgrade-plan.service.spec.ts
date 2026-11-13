import type { UpgradePlan } from '../models/upgrade-plan.model';
import type { DataFileService } from './data-file.service';
import type { NotificationService } from './notification.service';
import { UpgradePlanService } from './upgrade-plan.service';

// BUG-17 (slice 4.6b): every value the service emits is deep-frozen here, so any later in-place write to an
// emitted array or plan throws (ES modules run in strict mode) and the write path's test fails.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('UpgradePlanService immutable updates (BUG-17)', () => {
  let service: UpgradePlanService;

  beforeEach(() => {
    localStorage.clear();
    const dataFiles = {
      load: async () => ({ agents: { '1011': { breakpoints: { atk: { min: 1000, optimal: 2000 } } } } }),
    } as unknown as DataFileService;
    const notifications = { error: () => undefined } as unknown as NotificationService;
    service = new UpgradePlanService('browser', dataFiles, notifications);
    service.plans$.subscribe(deepFreeze);
    service.selectedPlan$.subscribe(deepFreeze);
  });

  const stored = (): UpgradePlan[] => JSON.parse(localStorage.getItem('zzz-optimizer-upgrade-plans') ?? '[]');

  it('creates, updates, duplicates, imports, and deletes without writing into emitted values', async () => {
    const plan = await service.createPlan('1011', 'First');
    service.selectPlan(plan);
    service.updatePlan(plan.id, {
      name: 'Renamed',
      substatPriorities: { ...plan.substatPriorities, Drive1: { 'ATK%': 'Essential' } },
    });
    const copy = service.duplicatePlan(plan.id);
    service.importPlans(JSON.stringify({ upgradePlans: [{ ...structuredClone(plan), name: 'Imported' }] }));
    service.importPlanList([{ ...structuredClone(plan), id: 'restored', name: 'Restored' }], false);
    service.deletePlan(copy?.id ?? '');

    expect(stored().map((p) => p.name)).toEqual(['Renamed', 'Imported', 'Restored']);
    expect(stored()[0].substatPriorities).toEqual(expect.objectContaining({ Drive1: { 'ATK%': 'Essential' } }));
    expect(stored()[0].customBreakpoints).toEqual({ atk: { min: 1000, optimal: 2000 } });
  });

  it('emits a new array and a new plan object on update, and keeps untouched plans', async () => {
    const emitted: UpgradePlan[][] = [];
    service.plans$.subscribe((p) => emitted.push(p));
    const a = await service.createPlan('1011', 'A');
    await service.createPlan('1011', 'B');
    service.updatePlan(a.id, { name: 'A2' });

    const [afterB, afterUpdate] = emitted.slice(-2);
    expect(afterUpdate).not.toBe(afterB);
    expect(afterUpdate[0]).not.toBe(afterB[0]);
    expect(afterUpdate[0].name).toBe('A2');
    expect(afterUpdate[1]).toBe(afterB[1]);
  });
});
