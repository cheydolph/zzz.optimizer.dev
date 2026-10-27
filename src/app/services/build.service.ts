import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { DbService } from './db.service';
import { StatCalculatorService } from './stat-calculator.service';
import { ScoringService } from './scoring.service';
import { NotificationService } from './notification.service';
import { Agent, BaseStats } from '../models/agent.model';
import { WEngine } from '../models/wengine.model';
import { Disc } from '../models/disc.model';
import { backUpStoredValue, readStoredArray, storageReadNotice } from '../utils/stored-array';

const BUILDS_STORAGE_KEY = 'zzz-optimizer-builds';

/**
 * Represents a user's built character (agent + equipped gear)
 */
export interface AgentBuild {
  id: string; // Unique build ID
  agentId: string; // Reference to agent from reference data
  name: string; // Agent name (for display)
  element: string; // Agent element (for display)
  specialty: string; // Agent specialty (for display)
  level: number; // Agent level (default 60)
  mindscapeLevel: number; // 0-6
  equippedWEngine?: WEngine;
  wEngineRefinement: number; // 1-5 (number of copies: 1 copy = refinement 1, 5 copies = refinement 5)
  equippedDiscs: { [slot: string]: Disc }; // Drive1-6
  enabledDiscs?: { [slot: string]: boolean }; // Track which discs are enabled (default true)
  calculatedStats: BaseStats; // Final calculated stats
  score: number; // Overall build rating
  createdAt: Date;
  updatedAt: Date;
  // Toggle flags for bonus calculations (default true)
  includeWEngineBonuses?: boolean;
  includeMindscapeBonuses?: boolean;
  includePassiveBonuses?: boolean;
  includeSetBonuses?: boolean;
  include4pcBonuses?: boolean;
  // Active upgrade plan (overrides default weight system)
  activeUpgradePlanId?: string; // Reference to UpgradePlan ID
  // User-pinned scoring profile for agents with more than one build type.
  // Undefined = auto-detect from equipped discs (the default).
  preferredBuildType?: string; // 'CRIT' | 'Anomaly'
}

/**
 * Fills fields that older builds lack and fixes the old "Pen_Ratio" main stat name, in place.
 * Shared by loading from localStorage and by Data Manager imports, so an imported build is
 * scored with the same fields a reloaded one has.
 */
export function normalizeStoredBuild(build: AgentBuild): void {
  if (build.wEngineRefinement === undefined) {
    build.wEngineRefinement = 1; // Default to 1 copy
  }
  // Add toggle flags with default true if not present
  if (build.includeWEngineBonuses === undefined) {
    build.includeWEngineBonuses = true;
  }
  if (build.includeMindscapeBonuses === undefined) {
    build.includeMindscapeBonuses = true;
  }
  if (build.includePassiveBonuses === undefined) {
    build.includePassiveBonuses = true;
  }
  // Default every equipped disc to enabled
  if (build.enabledDiscs === undefined) {
    build.enabledDiscs = {};
    for (const slot of Object.keys(build.equippedDiscs ?? {})) {
      build.enabledDiscs[slot] = true;
    }
  }
  // "Pen_Ratio" -> "PEN_Ratio": a casing mismatch introduced in earlier versions
  for (const disc of Object.values(build.equippedDiscs ?? {})) {
    // Widened to string because the old name is no longer part of MainStatType.
    if ((disc?.mainStat?.type as string) === 'Pen_Ratio') {
      disc.mainStat.type = 'PEN_Ratio';
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class BuildService {
  private buildsSubject = new BehaviorSubject<AgentBuild[]>([]);
  public builds$: Observable<AgentBuild[]> = this.buildsSubject.asObservable();

  private selectedBuildSubject = new BehaviorSubject<AgentBuild | null>(null);
  public selectedBuild$: Observable<AgentBuild | null> = this.selectedBuildSubject.asObservable();

  // Set when stored builds could not be read or backed up; saving would destroy them (BUG-15).
  private saveBlocked = false;

  constructor(
    private db: DbService,
    private statCalculator: StatCalculatorService,
    private scoringService: ScoringService,
    private notificationService: NotificationService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.loadBuilds();
  }

  /**
   * Load all user builds from localStorage
   */
  async loadBuilds() {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      this.buildsSubject.next([]);
      return;
    }

    const read = readStoredArray<AgentBuild>(BUILDS_STORAGE_KEY);
    let builds = read.items;
    try {
      const before = JSON.stringify(builds);
      for (const build of builds) {
        normalizeStoredBuild(build);
      }
      // Write back only when normalizing changed something
      const after = JSON.stringify(builds);
      if (after !== before && !read.saveBlocked) {
        localStorage.setItem(BUILDS_STORAGE_KEY, after);
      }
    } catch (error) {
      // An entry that is not a build object: keep the stored text out of reach of the next save.
      console.error('Error loading builds:', error);
      const raw = localStorage.getItem(BUILDS_STORAGE_KEY) ?? '';
      read.backupKey = backUpStoredValue(BUILDS_STORAGE_KEY, raw) ?? undefined;
      read.saveBlocked = !read.backupKey;
      builds = [];
    }

    this.saveBlocked = read.saveBlocked;
    const notice = storageReadNotice('builds', read);
    if (notice) {
      this.notificationService.error(notice, 10000);
    }

    this.buildsSubject.next(builds);

    // Re-sync selectedBuild if one is currently selected (e.g. after an Enka import reload)
    const selectedId = this.selectedBuildSubject.value?.id;
    const refreshed = selectedId ? builds.find((b) => b.id === selectedId) : undefined;
    if (refreshed) {
      this.selectedBuildSubject.next(refreshed);
    }
  }

  /**
   * Save builds to localStorage
   */
  private async saveBuilds(builds: AgentBuild[]) {
    // Only run in browser
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.saveBlocked) {
      console.error('Builds were not saved: the stored builds could not be read or backed up');
      this.buildsSubject.next(builds);
      return;
    }

    try {
      localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(builds));
      this.buildsSubject.next(builds);
    } catch (error) {
      console.error('Error saving builds:', error);
      throw error;
    }
  }

  /**
   * Get all builds
   */
  getBuilds(): AgentBuild[] {
    return this.buildsSubject.value;
  }

  /**
   * Get build by ID
   */
  getBuildById(id: string): AgentBuild | undefined {
    return this.buildsSubject.value.find((b) => b.id === id);
  }

  /**
   * Get all builds for a specific agent
   */
  getBuildsByAgentId(agentId: string): AgentBuild[] {
    return this.buildsSubject.value.filter((b) => b.agentId === agentId);
  }

  /**
   * Create a new build from a reference agent
   */
  async createBuild(agent: Agent, mindscapeLevel: number = 0): Promise<AgentBuild> {
    const builds = this.buildsSubject.value;

    const newBuild: AgentBuild = {
      id: this.generateId(),
      agentId: agent.id,
      name: agent.name,
      element: agent.element,
      specialty: agent.specialty,
      level: 60,
      mindscapeLevel: mindscapeLevel,
      wEngineRefinement: 1, // Default to 1 copy (refinement 1)
      equippedDiscs: {},
      enabledDiscs: {},
      calculatedStats: { ...agent.lvl60Stats }, // Start with base stats
      score: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      includeWEngineBonuses: true,
      includeMindscapeBonuses: true,
      includePassiveBonuses: true,
    };

    builds.push(newBuild);

    // Recalculate stats to apply passive bonuses, W-Engine bonuses, etc.
    await this.recalculateStats(newBuild);

    await this.saveBuilds(builds);

    return newBuild;
  }

  /**
   * Update a build
   */
  async updateBuild(id: string, updates: Partial<AgentBuild>): Promise<void> {
    const builds = this.buildsSubject.value;
    const index = builds.findIndex((b) => b.id === id);

    if (index === -1) {
      throw new Error(`Build ${id} not found`);
    }

    builds[index] = {
      ...builds[index],
      ...updates,
      updatedAt: new Date(),
    };

    // Handle explicit undefined for equippedWEngine (to properly remove it)
    if ('equippedWEngine' in updates && updates.equippedWEngine === undefined) {
      delete builds[index].equippedWEngine;
    }

    // Recalculate stats if equipment, refinement, mindscape, or toggle flags changed
    if (
      updates.equippedWEngine !== undefined ||
      updates.equippedDiscs !== undefined ||
      'equippedWEngine' in updates ||
      updates.wEngineRefinement !== undefined ||
      updates.mindscapeLevel !== undefined ||
      updates.includeWEngineBonuses !== undefined ||
      updates.includeMindscapeBonuses !== undefined ||
      updates.includePassiveBonuses !== undefined ||
      updates.includeSetBonuses !== undefined ||
      updates.include4pcBonuses !== undefined ||
      updates.preferredBuildType !== undefined ||
      'preferredBuildType' in updates ||
      updates.enabledDiscs !== undefined
    ) {
      this.statCalculator.clearCache();
      await this.recalculateStats(builds[index]);
    }

    await this.saveBuilds(builds);

    // Update selected build if it's the one being updated
    if (this.selectedBuildSubject.value?.id === id) {
      this.selectedBuildSubject.next(builds[index]);
    } else {
    }
  }

  /**
   * Recalculate stats for a build based on equipped gear
   */
  private async recalculateStats(build: AgentBuild): Promise<void> {
    // Get the agent reference data
    const agent = await this.db.getAgent(build.agentId);
    if (!agent) {
      console.warn(`Agent ${build.agentId} not found, using cached stats`);
      return;
    }

    // Ensure disc set equipment data is loaded for 4pc effects, and scoring data for the
    // score (a recalculation right after startup could otherwise store an INCOMPLETE rating)
    await this.statCalculator.ensureDataLoaded();
    await this.scoringService.ensureDataLoaded();

    // Calculate final stats using the stat calculator
    build.calculatedStats = this.statCalculator.calculateFinalStats(
      agent,
      build.level,
      build.equippedWEngine || null,
      build.equippedDiscs,
      build.mindscapeLevel,
      build.wEngineRefinement,
      build.includeWEngineBonuses ?? true,
      build.includeMindscapeBonuses ?? true,
      build.includePassiveBonuses ?? true,
      build.enabledDiscs ?? {},
      build.includeSetBonuses ?? true,
      build.include4pcBonuses ?? true,
    );

    // Calculate and save build score
    const equippedDiscsArray = Object.values(build.equippedDiscs).filter((d) => d !== undefined);
    const scoreResult = this.scoringService.calculateCompositeBuildScore(
      build.agentId,
      build.calculatedStats,
      equippedDiscsArray,
      build.equippedWEngine,
      build.wEngineRefinement || 1,
      build.mindscapeLevel || 0,
      agent.name,
      agent.specialty,
      agent.element,
      build.level,
      undefined, // agentScoring
      undefined, // wengineScoring
      undefined, // upgradePlan
      build.preferredBuildType,
    );
    build.score = scoreResult.score;
  }

  /**
   * Delete a build
   */
  async deleteBuild(id: string): Promise<void> {
    const builds = this.buildsSubject.value.filter((b) => b.id !== id);
    await this.saveBuilds(builds);

    // Clear selection if deleted build was selected
    if (this.selectedBuildSubject.value?.id === id) {
      this.selectedBuildSubject.next(null);
    }
  }

  /**
   * Reorder builds based on drag-and-drop
   */
  async reorderBuilds(builds: AgentBuild[]): Promise<void> {
    await this.saveBuilds(builds);
  }

  /**
   * Select a build
   */
  selectBuild(build: AgentBuild | null): void {
    this.selectedBuildSubject.next(build);
  }

  /**
   * Equip W-Engine to a build
   */
  async equipWEngine(buildId: string, wEngine: WEngine): Promise<void> {
    await this.updateBuild(buildId, {
      equippedWEngine: wEngine,
    });
  }

  /**
   * Unequip W-Engine from a build
   */
  async unequipWEngine(buildId: string): Promise<void> {
    await this.updateBuild(buildId, {
      equippedWEngine: undefined,
    });
  }

  /**
   * Equip disc to a build
   */
  async equipDisc(buildId: string, disc: Disc): Promise<void> {
    const build = this.getBuildById(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    const equippedDiscs = { ...build.equippedDiscs };
    equippedDiscs[disc.slot] = disc;

    // Initialize enabledDiscs if needed and set this disc to enabled
    const enabledDiscs = { ...(build.enabledDiscs || {}) };
    enabledDiscs[disc.slot] = true;

    await this.updateBuild(buildId, {
      equippedDiscs: equippedDiscs,
      enabledDiscs: enabledDiscs,
    });
  }

  /**
   * Unequip disc from a build
   */
  async unequipDisc(buildId: string, slot: string): Promise<void> {
    const build = this.getBuildById(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not found`);
    }

    const equippedDiscs = { ...build.equippedDiscs };
    delete equippedDiscs[slot];

    // Also remove from enabledDiscs
    const enabledDiscs = { ...(build.enabledDiscs || {}) };
    delete enabledDiscs[slot];

    await this.updateBuild(buildId, {
      equippedDiscs: equippedDiscs,
      enabledDiscs: enabledDiscs,
    });
  }

  /**
   * Export all user builds as JSON
   */
  exportBuilds(): string {
    return JSON.stringify(this.buildsSubject.value, null, 2);
  }

  /**
   * Import builds from JSON
   */
  async importBuilds(jsonString: string): Promise<number> {
    try {
      const builds: AgentBuild[] = JSON.parse(jsonString);

      if (!Array.isArray(builds)) {
        throw new Error('Invalid builds format');
      }

      await this.saveBuilds(builds);
      return builds.length;
    } catch (error) {
      console.error('Error importing builds:', error);
      throw error;
    }
  }

  /**
   * Clear all builds
   */
  async clearAllBuilds(): Promise<void> {
    await this.saveBuilds([]);
    this.selectedBuildSubject.next(null);
  }

  /**
   * Get all builds (for export)
   */
  async getAllBuilds(): Promise<AgentBuild[]> {
    return this.buildsSubject.value;
  }

  /**
   * Recalculate stats for all builds
   * Useful after reloading reference data to ensure all builds use updated agent base stats
   */
  async recalculateAllBuilds(): Promise<void> {
    const builds = this.buildsSubject.value;
    for (const build of builds) {
      await this.recalculateStats(build);
    }

    await this.saveBuilds(builds);

    // Update selected build if needed
    const selectedId = this.selectedBuildSubject.value?.id;
    if (selectedId) {
      const updatedBuild = builds.find((b) => b.id === selectedId);
      if (updatedBuild) {
        this.selectedBuildSubject.next(updatedBuild);
      }
    }
  }

  /**
   * Import builds with one save. A build whose ID already exists replaces it; with
   * `replaceExisting` the current builds are dropped first.
   */
  async importBuildList(imported: AgentBuild[], replaceExisting: boolean): Promise<void> {
    if (this.saveBlocked) {
      throw new Error('Builds cannot be saved: the stored builds could not be read or backed up');
    }
    const builds = replaceExisting ? [] : [...this.buildsSubject.value];
    for (const build of imported) {
      normalizeStoredBuild(build);
      const existingIndex = builds.findIndex((b) => b.id === build.id);
      if (existingIndex >= 0) {
        builds[existingIndex] = build;
      } else {
        builds.push(build);
      }
    }

    await this.saveBuilds(builds);
    if (replaceExisting) {
      this.selectedBuildSubject.next(null);
    }
  }

  /**
   * Generate unique ID for builds
   */
  private generateId(): string {
    return `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
