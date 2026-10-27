import { Injectable } from '@angular/core';
import { Disc } from '../models/disc.model';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { EnkaBuildData } from './enka-api.service';
import { DbService } from './db.service';
import { DiscLoadoutService } from './disc-loadout.service';
import { Agent } from '../models/agent.model';

export interface ImportComparison {
  newBuilds: EnkaBuildData[];
  updatedBuilds: { old: AgentBuild; new: EnkaBuildData }[];
  unchangedBuilds: AgentBuild[];
  newDiscs: Disc[];
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
  totalDiscs: number;
  /** Saved loadouts that pointed at a disc this import replaced */
  affectedLoadouts: number;
}

@Injectable({
  providedIn: 'root',
})
export class EnkaImportService {
  constructor(
    private buildService: BuildService,
    private discService: DiscService,
    private dbService: DbService,
    private discLoadoutService: DiscLoadoutService,
  ) {}

  /**
   * Compare Enka builds with existing builds and determine what to import
   */
  async compareBuilds(enkaBuilds: EnkaBuildData[]): Promise<ImportComparison> {
    const existingBuilds = this.buildService.getBuilds();
    const newBuilds: EnkaBuildData[] = [];
    const updatedBuilds: { old: AgentBuild; new: EnkaBuildData }[] = [];
    const unchangedBuilds: AgentBuild[] = [];
    const newDiscs: Disc[] = [];

    for (const enkaBuild of enkaBuilds) {
      // Find existing build for this agent
      const existingBuild = existingBuilds.find((b) => b.agentId === enkaBuild.agentId);

      if (!existingBuild) {
        // New agent build
        newBuilds.push(enkaBuild);
        newDiscs.push(...(Object.values(enkaBuild.discs).filter((d) => d !== undefined) as Disc[]));
      } else {
        // Check if build changed
        if (this.hasChanges(existingBuild, enkaBuild)) {
          updatedBuilds.push({ old: existingBuild, new: enkaBuild });
          newDiscs.push(...(Object.values(enkaBuild.discs).filter((d) => d !== undefined) as Disc[]));
        } else {
          unchangedBuilds.push(existingBuild);
        }
      }
    }

    return { newBuilds, updatedBuilds, unchangedBuilds, newDiscs };
  }

  /**
   * Import builds and discs into the database. All disc changes happen in one Dexie
   * transaction; if a build save fails afterwards, the builds and discs are put back as they
   * were before the import (BUG-10).
   */
  async importBuilds(comparison: ImportComparison): Promise<ImportResult> {
    const newBuilds = await this.resolveNewBuilds(comparison.newBuilds);
    const incomingBuilds = [
      ...newBuilds.map(({ enkaBuild }) => enkaBuild),
      ...comparison.updatedBuilds.map((u) => u.new),
    ];
    const incomingDiscs = incomingBuilds.flatMap((b) => this.discsOf(b.discs));
    const oldDiscUids = comparison.updatedBuilds.flatMap(({ old }) =>
      this.discsOf(old.equippedDiscs).map((d) => d.uid),
    );

    // Restore points: the inventory copies of the discs about to be replaced, and the builds
    const removedDiscs = (await this.dbService.discs.bulkGet(oldDiscUids)).filter((d): d is Disc => d !== undefined);
    const previousBuilds = [...this.buildService.getBuilds()];

    await this.replaceDiscs(oldDiscUids, incomingDiscs);
    try {
      for (const { agent, enkaBuild } of newBuilds) {
        await this.addNewBuild(agent, enkaBuild);
      }
      for (const { old, new: enkaBuild } of comparison.updatedBuilds) {
        await this.applyUpdatedBuild(old, enkaBuild);
      }
    } catch (error) {
      await this.buildService.importBuildList(previousBuilds, true);
      await this.replaceDiscs(
        incomingDiscs.map((d) => d.uid),
        removedDiscs,
      );
      throw error;
    } finally {
      await this.discService.loadDiscsFromDb();
    }

    return {
      added: newBuilds.length,
      updated: comparison.updatedBuilds.length,
      unchanged: comparison.unchangedBuilds.length,
      totalDiscs: incomingDiscs.length,
      affectedLoadouts: this.countLoadoutsUsing(oldDiscUids),
    };
  }

  private async resolveNewBuilds(enkaBuilds: EnkaBuildData[]): Promise<{ agent: Agent; enkaBuild: EnkaBuildData }[]> {
    const resolved: { agent: Agent; enkaBuild: EnkaBuildData }[] = [];
    for (const enkaBuild of enkaBuilds) {
      const agent = await this.dbService.getAgent(enkaBuild.agentId);
      if (agent) {
        resolved.push({ agent, enkaBuild });
      } else {
        console.warn(`Agent ${enkaBuild.agentId} not found, skipping`);
      }
    }
    return resolved;
  }

  private discsOf(discs: { [slot: string]: Disc | undefined }): Disc[] {
    return Object.values(discs).filter((d): d is Disc => d !== undefined);
  }

  private replaceDiscs(removeUids: string[], add: Disc[]): Promise<unknown> {
    const db = this.dbService;
    // Only Dexie promises are chained inside the transaction, so it cannot commit early
    return db.transaction('rw', db.discs, () => db.discs.bulkDelete(removeUids).then(() => db.discs.bulkPut(add)));
  }

  private filledSlots(discs: { [slot: string]: Disc | undefined }): { [slot: string]: Disc } {
    const bySlot: { [slot: string]: Disc } = {};
    for (const [slot, disc] of Object.entries(discs)) {
      if (disc) {
        bySlot[slot] = disc;
      }
    }
    return bySlot;
  }

  private enabledSlots(discsBySlot: { [slot: string]: Disc }): { [slot: string]: boolean } {
    return Object.fromEntries(Object.keys(discsBySlot).map((slot) => [slot, true]));
  }

  private async addNewBuild(agent: Agent, enkaBuild: EnkaBuildData): Promise<void> {
    const newBuild = await this.buildService.createBuild(agent, enkaBuild.mindscapeLevel);
    const discsBySlot = this.filledSlots(enkaBuild.discs);

    // Update build with equipment and default toggle flags
    await this.buildService.updateBuild(newBuild.id, {
      level: enkaBuild.level,
      equippedWEngine: enkaBuild.wEngine,
      wEngineRefinement: enkaBuild.wEngineRefinement || 1,
      equippedDiscs: discsBySlot,
      enabledDiscs: this.enabledSlots(discsBySlot),
      includeWEngineBonuses: true,
      includeMindscapeBonuses: true,
      includePassiveBonuses: true,
    });
  }

  private async applyUpdatedBuild(old: AgentBuild, enkaBuild: EnkaBuildData): Promise<void> {
    const discsBySlot = this.filledSlots(enkaBuild.discs);

    // Update build (preserve existing toggle flags)
    await this.buildService.updateBuild(old.id, {
      level: enkaBuild.level,
      mindscapeLevel: enkaBuild.mindscapeLevel,
      equippedWEngine: enkaBuild.wEngine,
      wEngineRefinement: enkaBuild.wEngineRefinement || 1,
      equippedDiscs: discsBySlot,
      enabledDiscs: this.enabledSlots(discsBySlot),
      includeWEngineBonuses: old.includeWEngineBonuses ?? true,
      includeMindscapeBonuses: old.includeMindscapeBonuses ?? true,
      includePassiveBonuses: old.includePassiveBonuses ?? true,
    });
  }

  private countLoadoutsUsing(discUids: string[]): number {
    const replaced = new Set(discUids);
    return this.discLoadoutService
      .getAllLoadouts()
      .filter((loadout) => Object.values(loadout.equippedDiscs).some((disc) => disc && replaced.has(disc.uid))).length;
  }

  /**
   * Check if a build has changed compared to existing build
   */
  private hasChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    // Check level changes
    if (existing.level !== incoming.level) {
      return true;
    }

    // Check mindscape changes
    if (existing.mindscapeLevel !== incoming.mindscapeLevel) {
      return true;
    }

    // Check W-Engine changes
    if (this.hasWEngineChanges(existing, incoming)) {
      return true;
    }

    // Check disc changes
    if (this.hasDiscChanges(existing, incoming)) {
      return true;
    }

    return false;
  }

  /**
   * Check if W-Engine has changed
   */
  private hasWEngineChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    // Both have no W-Engine
    if (!existing.equippedWEngine && !incoming.wEngine) {
      return false;
    }

    // One has W-Engine, other doesn't
    if (!existing.equippedWEngine || !incoming.wEngine) {
      return true;
    }

    // Different W-Engine
    if (existing.equippedWEngine.id !== incoming.wEngine.id) {
      return true;
    }

    // Different W-Engine refinement
    if (existing.wEngineRefinement !== (incoming.wEngineRefinement || 1)) {
      return true;
    }

    return false;
  }

  /**
   * Check if discs have changed
   */
  private hasDiscChanges(existing: AgentBuild, incoming: EnkaBuildData): boolean {
    const existingDiscSlots = Object.keys(existing.equippedDiscs);
    const incomingDiscSlots = Object.keys(incoming.discs);

    // Different number of equipped discs
    if (existingDiscSlots.length !== incomingDiscSlots.length) {
      return true;
    }

    // Check every slot present on either side. Iterating only the existing
    // slots would miss a disc equipped into a previously empty slot whenever
    // the slot counts happen to match.
    const allSlots = new Set([...existingDiscSlots, ...incomingDiscSlots]);

    for (const slot of allSlots) {
      const existingDisc = existing.equippedDiscs[slot];
      const incomingDisc = incoming.discs[slot as keyof typeof incoming.discs];

      // Slot filled on one side only
      if (!existingDisc || !incomingDisc) {
        return true;
      }

      // Compare disc properties
      if (this.hasDiscPropertyChanges(existingDisc, incomingDisc)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compare two discs to see if they're different
   */
  private hasDiscPropertyChanges(existing: Disc, incoming: Disc): boolean {
    // Different disc set
    if (existing.set !== incoming.set) {
      return true;
    }

    // Different level
    if (existing.level !== incoming.level) {
      return true;
    }

    // Different main stat
    if (existing.mainStat.type !== incoming.mainStat.type) {
      return true;
    }

    // Different main stat value (allow small tolerance for rounding)
    if (Math.abs(existing.mainStat.value - incoming.mainStat.value) > 0.1) {
      return true;
    }

    // Different number of substats
    if (existing.subStats.length !== incoming.subStats.length) {
      return true;
    }

    // Compare substats. Matching is by type rather than position because the
    // order Enka returns substats in is not guaranteed to be stable.
    for (const existingSub of existing.subStats) {
      const incomingSub = incoming.subStats.find((s) => s.type === existingSub.type);

      if (!incomingSub) {
        return true; // Substat type missing
      }

      // Rolls are the clearest signal that a disc was upgraded, so check them
      // before value. Value is derived from rolls, so a roll change usually
      // moves the value too - but not always (see convertSubstatValue
      // rounding), and relying on that coupling would silently miss upgrades.
      if (existingSub.rolls !== incomingSub.rolls) {
        return true;
      }

      // Check if value changed significantly (allow small tolerance)
      if (Math.abs(existingSub.value - incomingSub.value) > 0.1) {
        return true;
      }
    }

    // Check the reverse direction too. The length guard above does not catch a
    // substat being *replaced* by a different type (4 vs 4 still matches), and
    // the loop above only asks whether each existing type exists in incoming.
    // A newly rolled substat type is exactly the "they upgraded this" case we
    // want to detect, so look for incoming types absent from existing.
    for (const incomingSub of incoming.subStats) {
      if (!existing.subStats.some((s) => s.type === incomingSub.type)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate a summary of import changes
   */
  generateImportSummary(comparison: ImportComparison): string {
    const parts: string[] = [];

    if (comparison.newBuilds.length > 0) {
      parts.push(`${comparison.newBuilds.length} new agent(s)`);
    }

    if (comparison.updatedBuilds.length > 0) {
      parts.push(`${comparison.updatedBuilds.length} updated build(s)`);
    }

    if (comparison.unchangedBuilds.length > 0) {
      parts.push(`${comparison.unchangedBuilds.length} unchanged`);
    }

    parts.push(`${comparison.newDiscs.length} disc(s)`);

    return parts.join(', ');
  }
}
