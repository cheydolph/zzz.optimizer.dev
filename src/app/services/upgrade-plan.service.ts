import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { UpgradePlan } from '../models/upgrade-plan.model';
import { hasStoredBackup, readStoredArray, storageReadNotice } from '../utils/stored-array';
import { UPGRADE_PLANS_STORAGE_KEY as PLANS_STORAGE_KEY } from '../constants/storage-keys';
import { NotificationService } from './notification.service';
import { DataFileService } from './data-file.service';
import { BuildService } from './build.service';

@Injectable({
  providedIn: 'root',
})
export class UpgradePlanService {
  private plansSubject = new BehaviorSubject<UpgradePlan[]>([]);
  public plans$: Observable<UpgradePlan[]> = this.plansSubject.asObservable();

  private selectedPlanSubject = new BehaviorSubject<UpgradePlan | null>(null);
  public selectedPlan$: Observable<UpgradePlan | null> = this.selectedPlanSubject.asObservable();

  private agentBreakpoints: any = {};
  // createPlan copies default breakpoints from this load, so it waits for it (BUG-13)
  private breakpointsReady: Promise<void>;

  // Set when stored plans could not be read or backed up; saving would destroy them (BUG-15).
  private saveBlocked = false;

  // Plan-editor drafts (slice 4.6b): the editor's unsaved copy of each plan, kept in memory only, so it survives a
  // tab switch, a route change, and a switch to another plan, and never reaches the store, scoring, or an export.
  // `base` is the stored plan object the draft was copied from: once the store holds another object for that id
  // (a save, a restore, a clear), the draft is stale and the next getDraft() starts again from the stored plan.
  private drafts = new Map<string, { base: UpgradePlan; draft: UpgradePlan; edited: boolean }>();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private dataFiles: DataFileService,
    private notificationService: NotificationService,
    private buildService: BuildService,
  ) {
    this.loadPlans();
    this.breakpointsReady = this.loadAgentBreakpoints();
  }

  /**
   * Load agent breakpoints to use as defaults when creating new plans
   */
  private async loadAgentBreakpoints() {
    try {
      const data = await this.dataFiles.load<any>('assets/data/agent-breakpoints.json');
      this.agentBreakpoints = data.agents || {};
    } catch (error) {
      console.error('Failed to load agent breakpoints:', error);
    }
  }

  /**
   * Load all upgrade plans from localStorage
   */
  private loadPlans() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.plansSubject.next([]);
      return;
    }

    const read = readStoredArray<UpgradePlan>(PLANS_STORAGE_KEY);
    this.saveBlocked = read.saveBlocked;
    const notice = storageReadNotice('upgrade plans', read);
    if (notice) {
      this.notificationService.error(notice, 10000);
    }
    this.plansSubject.next(read.items);
  }

  /**
   * Save plans to localStorage
   */
  private savePlans(plans: UpgradePlan[]) {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.saveBlocked) {
      console.error('Upgrade plans were not saved: the stored plans could not be read or backed up');
      this.plansSubject.next(plans);
      return;
    }

    try {
      localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
      this.plansSubject.next(plans);
    } catch (error) {
      console.error('Error saving upgrade plans:', error);
      throw error;
    }
  }

  /**
   * Get all plans
   */
  getPlans(): UpgradePlan[] {
    return this.plansSubject.value;
  }

  /**
   * Get plan by ID
   */
  getPlanById(id: string): UpgradePlan | undefined {
    return this.plansSubject.value.find((p) => p.id === id);
  }

  /**
   * Get all plans for a specific agent
   */
  getPlansByAgentId(agentId: string): UpgradePlan[] {
    return this.plansSubject.value.filter((p) => p.agentId === agentId);
  }

  /**
   * Create a new upgrade plan
   * Only copies default breakpoints from agent-breakpoints.json
   * NO other pre-filling - user has complete freedom
   */
  async createPlan(agentId: string, name: string, description?: string): Promise<UpgradePlan> {
    await this.breakpointsReady;

    // Copy default breakpoints from agent-breakpoints.json if available
    const agentBreakpoints = this.agentBreakpoints[agentId];
    const customBreakpoints: { [stat: string]: { min: number; optimal: number } } = {};

    if (agentBreakpoints && agentBreakpoints.breakpoints) {
      // Copy all breakpoints from agent-breakpoints.json
      Object.keys(agentBreakpoints.breakpoints).forEach((statKey) => {
        customBreakpoints[statKey] = {
          min: agentBreakpoints.breakpoints[statKey].min,
          optimal: agentBreakpoints.breakpoints[statKey].optimal,
        };
      });
    } else {
      // No agent breakpoints available, initialize with zeros
      const defaultStats = [
        'hp',
        'atk',
        'def',
        'impact',
        'anomalyMastery',
        'critRate',
        'critDmg',
        'anomalyProficiency',
        'pen',
        'penRatio',
        'energyRegen',
      ];
      defaultStats.forEach((stat) => {
        customBreakpoints[stat] = { min: 0, optimal: 0 };
      });
    }

    const newPlan: UpgradePlan = {
      id: this.generateId(),
      name,
      agentId,
      description: description || '',
      setPreferences: {
        type: '4pc+2pc',
        preferredSets: [],
      },
      mainStatPreferences: {
        Drive4: {},
        Drive5: {},
        Drive6: {},
      },
      substatPriorities: {
        Drive1: {},
        Drive2: {},
        Drive3: {},
        Drive4: {},
        Drive5: {},
        Drive6: {},
      },
      customBreakpoints,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // BUG-17: a new array; the emitted one is never written to
    this.savePlans([...this.plansSubject.value, newPlan]);

    return newPlan;
  }

  /**
   * Update an upgrade plan
   */
  updatePlan(id: string, updates: Partial<UpgradePlan>): void {
    const plans = this.plansSubject.value;
    const index = plans.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Upgrade plan ${id} not found`);
    }

    const updated: UpgradePlan = {
      ...plans[index],
      ...updates,
      updatedAt: new Date(),
    };

    this.savePlans(plans.map((p, i) => (i === index ? updated : p)));

    // Update selected plan if it's the one being updated
    if (this.selectedPlanSubject.value?.id === id) {
      this.selectedPlanSubject.next(updated);
    }
  }

  /**
   * Delete an upgrade plan
   */
  deletePlan(id: string): void {
    const plans = this.plansSubject.value.filter((p) => p.id !== id);
    this.savePlans(plans);
    this.drafts.delete(id);
    this.clearRemovedPlanLinks();

    // Clear selection if deleted plan was selected
    if (this.selectedPlanSubject.value?.id === id) {
      this.selectedPlanSubject.next(null);
    }
  }

  /**
   * Duplicate an existing plan
   */
  duplicatePlan(id: string): UpgradePlan | null {
    const originalPlan = this.getPlanById(id);
    if (!originalPlan) {
      console.error(`Plan ${id} not found`);
      return null;
    }

    const duplicatedPlan: UpgradePlan = {
      ...JSON.parse(JSON.stringify(originalPlan)), // Deep clone
      id: this.generateId(),
      name: `${originalPlan.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.savePlans([...this.plansSubject.value, duplicatedPlan]);

    return duplicatedPlan;
  }

  /**
   * Select a plan
   */
  selectPlan(plan: UpgradePlan | null): void {
    this.selectedPlanSubject.next(plan);
  }

  /** The stored plan selected last, if it still exists (the plan editor re-opens it when it is shown again). */
  getSelectedStoredPlan(): UpgradePlan | undefined {
    const selected = this.selectedPlanSubject.value;
    return selected ? this.getPlanById(selected.id) : undefined;
  }

  /**
   * The editor's draft of a stored plan: the kept draft while it was copied from the plan now stored under that id,
   * otherwise a new copy of the stored plan. Edits go into the draft; only Save (`updatePlan`) writes the store.
   */
  getDraft(plan: UpgradePlan): UpgradePlan {
    const stored = this.getPlanById(plan.id) ?? plan;
    const kept = this.drafts.get(plan.id);
    if (kept && kept.base === stored) return kept.draft;
    const draft = structuredClone(stored);
    this.drafts.set(plan.id, { base: stored, draft, edited: false });
    return draft;
  }

  /** Records that the user changed a plan's draft (the unsaved-changes cue). */
  markDraftEdited(id: string): void {
    const kept = this.drafts.get(id);
    if (kept) kept.edited = true;
  }

  /** After a Save of `draft`: the same draft now matches the stored plan, so it is kept with no unsaved edits. */
  markDraftSaved(draft: UpgradePlan): void {
    const stored = this.getPlanById(draft.id);
    if (stored) this.drafts.set(draft.id, { base: stored, draft, edited: false });
  }

  /** Whether a plan has a draft with edits that are not saved (and not overtaken by a newer stored plan). */
  hasUnsavedEdits(id: string): boolean {
    const kept = this.drafts.get(id);
    return !!kept && kept.edited && kept.base === this.getPlanById(id);
  }

  /**
   * Export all plans as JSON
   */
  exportPlans(): string {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      upgradePlans: this.plansSubject.value,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import plans from JSON
   * Merges with existing plans (doesn't replace)
   * Generates new IDs to avoid conflicts
   */
  importPlans(jsonString: string): number {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData.upgradePlans || !Array.isArray(importData.upgradePlans)) {
        throw new Error('Invalid upgrade plans format');
      }

      const existingPlans = this.plansSubject.value;
      const importedPlans: UpgradePlan[] = importData.upgradePlans.map((plan: UpgradePlan) => ({
        ...plan,
        id: this.generateId(), // Generate new ID to avoid conflicts
        createdAt: new Date(plan.createdAt),
        updatedAt: new Date(plan.updatedAt),
      }));

      const mergedPlans = [...existingPlans, ...importedPlans];
      this.savePlans(mergedPlans);

      return importedPlans.length;
    } catch (error) {
      console.error('Error importing upgrade plans:', error);
      throw error;
    }
  }

  /**
   * Import plans from a Data Manager backup with one save, keeping their IDs so builds'
   * activeUpgradePlanId links survive a restore. A plan whose ID already exists replaces it;
   * with `replaceExisting` the current plans are dropped first.
   */
  importPlanList(imported: UpgradePlan[], replaceExisting: boolean): void {
    if (this.saveBlocked) {
      throw new Error('Upgrade plans cannot be saved: the stored plans could not be read or backed up');
    }
    const plans = replaceExisting ? [] : [...this.plansSubject.value];
    for (const plan of imported) {
      const restored: UpgradePlan = {
        ...plan,
        createdAt: new Date(plan.createdAt),
        updatedAt: new Date(plan.updatedAt),
      };
      const existingIndex = plans.findIndex((p) => p.id === plan.id);
      if (existingIndex >= 0) {
        plans[existingIndex] = restored;
      } else {
        plans.push(restored);
      }
    }

    this.savePlans(plans);
    if (replaceExisting) {
      this.selectedPlanSubject.next(null);
      this.drafts.clear();
      this.clearRemovedPlanLinks();
    }
  }

  /**
   * Clear all plans
   */
  clearAllPlans(): void {
    this.savePlans([]);
    this.selectedPlanSubject.next(null);
    this.drafts.clear();
    this.clearRemovedPlanLinks();
  }

  /**
   * BUG-30: after a delete, a clear, or a replace restore, builds whose active plan is gone go back to the default
   * plan. Skipped while some stored plans could not be read (a backup copy exists, or saving is blocked): a build's
   * link may name one of those plans, and keeping it lets a restored backup link up again.
   */
  private clearRemovedPlanLinks(): void {
    if (!isPlatformBrowser(this.platformId) || this.saveBlocked || hasStoredBackup(PLANS_STORAGE_KEY)) return;
    const planIds = new Set(this.plansSubject.value.map((p) => p.id));
    this.buildService.clearMissingPlanLinks(planIds).catch((error: unknown) => {
      console.error('Error resetting builds to the default plan:', error);
    });
  }

  /**
   * Generate unique ID for plans
   */
  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
