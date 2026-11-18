import type { UpgradePlan } from '../models/upgrade-plan.model';
import type { BuildService } from './build.service';
import type { DataFileService } from './data-file.service';
import type { NotificationService } from './notification.service';
import { UpgradePlanService } from './upgrade-plan.service';

// BUG-17 (slice 4.6b): every value the service emits is deep-frozen here, so any later in-place write to an
// emitted array or plan throws (ES modules run in strict mode) and the write path's test fails.
// The plan-link reset (BUG-30) is covered in its own block below; elsewhere it has no builds to change.
const noBuilds = { clearMissingPlanLinks: async () => undefined } as unknown as BuildService;

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
    service = new UpgradePlanService(dataFiles, notifications, noBuilds);
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

describe('UpgradePlanService plan-editor drafts (slice 4.6b)', () => {
  let service: UpgradePlanService;

  beforeEach(() => {
    localStorage.clear();
    const dataFiles = { load: async () => ({ agents: {} }) } as unknown as DataFileService;
    const notifications = { error: () => undefined } as unknown as NotificationService;
    service = new UpgradePlanService(dataFiles, notifications, noBuilds);
    service.plans$.subscribe(deepFreeze);
  });

  it('keeps one draft per plan that never reaches the store or an export', async () => {
    const plan = await service.createPlan('1011', 'Plan');
    const draft = service.getDraft(plan);
    expect(draft).not.toBe(plan);
    draft.substatPriorities = { ...draft.substatPriorities, Drive1: { 'ATK%': 'Essential' } };
    service.markDraftEdited(plan.id);

    expect(service.getDraft(plan)).toBe(draft);
    expect(service.getPlanById(plan.id)?.substatPriorities).toEqual(expect.objectContaining({ Drive1: {} }));
    expect(service.exportPlans()).not.toContain('Essential');
    expect(localStorage.getItem('zzz-optimizer-upgrade-plans')).not.toContain('Essential');
    expect(service.hasUnsavedEdits(plan.id)).toBe(true);
  });

  it('keeps the saved draft with no unsaved edits after a Save', async () => {
    const plan = await service.createPlan('1011', 'Plan');
    const draft = service.getDraft(plan);
    draft.name = 'Saved';
    service.markDraftEdited(plan.id);
    service.updatePlan(plan.id, structuredClone(draft));
    service.markDraftSaved(draft);

    expect(service.hasUnsavedEdits(plan.id)).toBe(false);
    expect(service.getDraft(plan)).toBe(draft);
    expect(service.getPlanById(plan.id)?.name).toBe('Saved');
  });

  it('drops a draft once the stored plan changes, or is deleted, restored over, or cleared', async () => {
    const a = await service.createPlan('1011', 'A');
    const b = await service.createPlan('1011', 'B');
    const c = await service.createPlan('1011', 'C');
    const draftA = service.getDraft(a);
    service.markDraftEdited(a.id);
    service.updatePlan(a.id, { name: 'A from elsewhere' });
    expect(service.hasUnsavedEdits(a.id)).toBe(false);
    expect(service.getDraft(a)).not.toBe(draftA);
    expect(service.getDraft(a).name).toBe('A from elsewhere');

    const draftB = service.getDraft(b);
    service.importPlanList([{ ...structuredClone(b), name: 'B restored' }], false);
    expect(service.getDraft(b)).not.toBe(draftB);
    expect(service.getDraft(b).name).toBe('B restored');

    service.getDraft(c);
    service.markDraftEdited(c.id);
    service.deletePlan(c.id);
    expect(service.hasUnsavedEdits(c.id)).toBe(false);

    service.getDraft(a);
    service.markDraftEdited(a.id);
    service.clearAllPlans();
    expect(service.hasUnsavedEdits(a.id)).toBe(false);
  });

  it('keeps the drafts of other plans through a merge import', async () => {
    const plan = await service.createPlan('1011', 'Plan');
    const draft = service.getDraft(plan);
    service.markDraftEdited(plan.id);
    service.importPlans(JSON.stringify({ upgradePlans: [{ ...structuredClone(plan), name: 'Imported' }] }));
    expect(service.getDraft(plan)).toBe(draft);
    expect(service.hasUnsavedEdits(plan.id)).toBe(true);
  });

  it('returns the last selected plan as stored now, or nothing once it is deleted', async () => {
    const plan = await service.createPlan('1011', 'Plan');
    service.selectPlan(plan);
    service.importPlanList([{ ...structuredClone(plan), name: 'Restored' }], false);
    expect(service.getSelectedStoredPlan()?.name).toBe('Restored');
    service.deletePlan(plan.id);
    expect(service.getSelectedStoredPlan()).toBeUndefined();
  });
});

describe('UpgradePlanService resets builds of removed plans (BUG-30)', () => {
  let service: UpgradePlanService;
  let calls: string[][];

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    const dataFiles = { load: async () => ({ agents: {} }) } as unknown as DataFileService;
    const notifications = { error: () => undefined } as unknown as NotificationService;
    const builds = {
      clearMissingPlanLinks: async (ids: ReadonlySet<string>) => {
        calls.push([...ids]);
      },
    } as unknown as BuildService; // only the reset is called
    service = new UpgradePlanService(dataFiles, notifications, builds);
  });

  it('passes the remaining plan IDs after a delete, a replace restore, and a clear', async () => {
    const a = await service.createPlan('1011', 'A');
    const b = await service.createPlan('1011', 'B');
    service.deletePlan(a.id);
    service.importPlanList([{ ...structuredClone(b), id: 'restored' }], true);
    service.clearAllPlans();
    expect(calls).toEqual([[b.id], ['restored'], []]);
  });

  it('leaves builds alone on a create, an update, a duplicate, and a merge import', async () => {
    const a = await service.createPlan('1011', 'A');
    service.updatePlan(a.id, { name: 'A2' });
    service.duplicatePlan(a.id);
    service.importPlans(JSON.stringify({ upgradePlans: [structuredClone(a)] }));
    service.importPlanList([{ ...structuredClone(a), id: 'merged' }], false);
    expect(calls).toEqual([]);
  });

  it('keeps every link while a backup of unreadable plans exists', async () => {
    const a = await service.createPlan('1011', 'A');
    localStorage.setItem('zzz-optimizer-upgrade-plans-backup', '[{"id":"lost"');
    service.deletePlan(a.id);
    service.clearAllPlans();
    expect(calls).toEqual([]);
  });
});
