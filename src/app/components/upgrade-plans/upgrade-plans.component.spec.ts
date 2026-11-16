import type { ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';
import type { Agent } from '../../models/agent.model';
import type { UpgradePlan } from '../../models/upgrade-plan.model';
import type { AgentService } from '../../services/agent.service';
import type { DataFileService } from '../../services/data-file.service';
import type { DiscSetService } from '../../services/disc-set.service';
import type { NotificationService } from '../../services/notification.service';
import { UpgradePlanService } from '../../services/upgrade-plan.service';
import { UpgradePlansComponent } from './upgrade-plans.component';

// BUG-14 (slice 4.6b): the plan editor edits a copy, so unsaved edits never reach the stored plan that scoring
// reads; Save writes the copy back, and later edits do not reach the saved plan either. Emitted plans are
// deep-frozen, so an in-place write to one throws.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('UpgradePlansComponent copy-on-edit (BUG-14)', () => {
  let plans: UpgradePlanService;
  let component: UpgradePlansComponent;
  const agents = [
    { id: '1091', name: 'Miyabi' },
    { id: '1011', name: 'Anby' },
  ] as Agent[]; // only id and name are read

  const notifications = { success: () => undefined, error: () => undefined, warning: () => undefined };
  const createComponent = () => {
    const created = new UpgradePlansComponent(
      plans,
      { agents$: of(agents) } as unknown as AgentService,
      { discSets$: of([]) } as unknown as DiscSetService,
      notifications as unknown as NotificationService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    );
    created.ngOnInit();
    return created;
  };

  beforeEach(() => {
    localStorage.clear();
    const dataFiles = { load: async () => ({ agents: {} }) } as unknown as DataFileService;
    plans = new UpgradePlanService('browser', dataFiles, notifications as unknown as NotificationService);
    plans.plans$.subscribe(deepFreeze);
    component = createComponent();
  });

  afterEach(() => component.ngOnDestroy());

  const edit = () => {
    component.setSubstatPriority('Drive1', 'ATK%', 'Essential');
    component.toggleMainStatPreference('Drive4', 'ATK%');
    component.setBreakpoint('atk', 'min', '1234');
    component.resetBreakpoint('hp');
    component.toggleDiscSetType('2pc+2pc+2pc');
    component.togglePreferredSet('Woodpecker Electro');
  };

  it('sorts a copy of the agents, not the array the agent service shares', () => {
    expect(agents.map((a) => a.id)).toEqual(['1091', '1011']);
    expect(component.referenceAgents.map((a) => a.id)).toEqual(['1011', '1091']);
  });

  it('keeps unsaved edits out of the stored plan, saves them on Save, and keeps later edits out again', async () => {
    const created = await plans.createPlan('1011', 'Plan');
    const untouched = structuredClone(plans.getPlanById(created.id));
    component.selectPlan(plans.getPlanById(created.id) as UpgradePlan);

    edit();
    expect(plans.getPlanById(created.id)).toEqual(untouched);

    component.savePlan();
    const saved = plans.getPlanById(created.id) as UpgradePlan;
    expect(saved.substatPriorities).toEqual(expect.objectContaining({ Drive1: { 'ATK%': 'Essential' } }));
    expect(saved.mainStatPreferences.Drive4).toEqual({ 'ATK%': 'Not Acceptable' });
    expect(saved.customBreakpoints).toEqual(expect.objectContaining({ atk: { min: 1234, optimal: 0 } }));
    expect(saved.setPreferences).toEqual({ type: '2pc+2pc+2pc', preferredSets: ['Woodpecker Electro'] });

    const savedCopy = structuredClone(saved);
    component.setSubstatPriority('Drive2', 'CRIT_Rate', 'Essential');
    component.togglePreferredSet('Woodpecker Electro');
    component.setBreakpoint('atk', 'optimal', '9999');
    expect(plans.getPlanById(created.id)).toEqual(savedCopy);
  });

  it('edits a copy of a newly created plan too', async () => {
    component.newPlanName = 'New';
    component.newPlanAgentId = '1011';
    await component.createNewPlan();
    const stored = plans.getPlans()[0];
    const untouched = structuredClone(stored);

    expect(component.selectedPlan).not.toBe(stored);
    edit();
    expect(plans.getPlans()[0]).toEqual(untouched);
  });

  // Slice 4.6b drafts: unsaved edits survive a plan switch and the editor's destroy and re-create (a tab switch),
  // the plan that was open re-opens, and the unsaved-changes cue follows the edits and Save
  it("keeps each plan's unsaved draft through a plan switch and a tab switch, and re-opens the last plan", async () => {
    const a = await plans.createPlan('1011', 'A');
    const b = await plans.createPlan('1011', 'B');
    const storedA = structuredClone(plans.getPlanById(a.id));
    component.selectPlan(plans.getPlanById(a.id) as UpgradePlan);
    edit();
    expect(component.hasUnsavedEdits(a.id)).toBe(true);
    component.selectPlan(plans.getPlanById(b.id) as UpgradePlan);
    expect(component.hasUnsavedEdits(b.id)).toBe(false);
    component.toggleMainStatPreference('Drive5', 'ATK%');

    component.ngOnDestroy();
    component = createComponent();
    expect(component.selectedPlan?.id).toBe(b.id);
    expect(component.getMainStatPreference('Drive5', 'ATK%')).toBe('Not Acceptable');
    component.selectPlan(plans.getPlanById(a.id) as UpgradePlan);
    expect(component.getSubstatPriority('Drive1', 'ATK%')).toBe('Essential');
    expect(component.hasUnsavedEdits(a.id)).toBe(true);
    expect(plans.getPlanById(a.id)).toEqual(storedA);
  });

  it('clears the cue on Save and keeps edits made after it as a new unsaved draft', async () => {
    const created = await plans.createPlan('1011', 'Plan');
    component.selectPlan(plans.getPlanById(created.id) as UpgradePlan);
    component.markEdited();
    expect(component.hasUnsavedEdits(created.id)).toBe(true);
    component.savePlan();
    expect(component.hasUnsavedEdits(created.id)).toBe(false);

    component.setBreakpoint('atk', 'min', '42');
    expect(component.hasUnsavedEdits(created.id)).toBe(true);
    component.ngOnDestroy();
    component = createComponent();
    expect(component.getBreakpoint('atk', 'min')).toBe(42);
    expect(plans.getPlanById(created.id)?.customBreakpoints).toEqual(
      expect.objectContaining({ atk: { min: 0, optimal: 0 } }),
    );
  });

  it('shows the empty editor on return when the open plan was deleted', async () => {
    const created = await plans.createPlan('1011', 'Plan');
    component.selectPlan(plans.getPlanById(created.id) as UpgradePlan);
    component.confirmDeletePlan(plans.getPlanById(created.id) as UpgradePlan);
    component.deletePlan();
    component.ngOnDestroy();
    component = createComponent();
    expect(component.selectedPlan).toBeNull();
  });
});
