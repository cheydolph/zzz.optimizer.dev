import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import { BuildService, AgentBuild } from './build.service';
import { DiscService } from './disc.service';
import { DiscLoadoutService } from './disc-loadout.service';
import { UpgradePlanService } from './upgrade-plan.service';
import { DbService, ShareCustomization } from './db.service';
import { Disc } from '../models/disc.model';
import { DiscLoadout } from '../models/disc-loadout.model';
import { UpgradePlan } from '../models/upgrade-plan.model';
import { UID_HISTORY_STORAGE_KEY } from '../constants/storage-keys';

export interface ExportData {
  version: string;
  exportDate: string;
  builds: AgentBuild[];
  discs: Disc[];
  loadouts?: DiscLoadout[]; // Optional for backwards compatibility
  upgradePlans?: UpgradePlan[]; // 3.1 and later; absent in older files
  shareCustomizations?: ShareCustomization[]; // 3.1 and later; absent in older files
}

export interface ImportResult {
  success: boolean;
  message: string;
  buildsImported: number;
  discsImported: number;
  loadoutsImported: number;
  plansImported: number;
  shareCustomizationsImported: number;
}

interface StoreSnapshot {
  discs: Disc[];
  shareCustomizations: ShareCustomization[];
  builds: AgentBuild[];
  loadouts: DiscLoadout[];
  plans: UpgradePlan[];
}

@Injectable({
  providedIn: 'root',
})
export class BuildImportExportService {
  private readonly EXPORT_VERSION = '3.1';

  // Version history:
  // 1.0 - Initial version (basic builds and discs)
  // 2.0 - Added W-Engine refinement properties, mindscape effects, icons
  // 3.0 - Added disc loadouts support
  // 3.1 - Added upgrade plans (with their IDs, so builds keep their active plan) and share customizations

  constructor(
    private buildService: BuildService,
    private discService: DiscService,
    private discLoadoutService: DiscLoadoutService,
    private upgradePlanService: UpgradePlanService,
    private db: DbService,
  ) {}

  /**
   * Export all builds, discs, loadouts, upgrade plans, and share customizations to JSON
   */
  async exportBuilds(): Promise<string> {
    const exportData: ExportData = {
      version: this.EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      builds: await this.buildService.getAllBuilds(),
      discs: await this.discService.getAllDiscs(),
      loadouts: this.discLoadoutService.getAllLoadouts(),
      upgradePlans: this.upgradePlanService.getPlans(),
      shareCustomizations: await this.db.getAllShareCustomizations(),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Download builds as a JSON file
   */
  async downloadBuilds(): Promise<void> {
    const json = await this.exportBuilds();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    link.download = `zzz-optimizer-builds-${timestamp}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Import builds from JSON data. The whole file is validated before anything is written, and
   * a failed write restores every store to its state before the import (BUG-07).
   */
  async importBuilds(jsonData: string, replaceExisting: boolean = false): Promise<ImportResult> {
    try {
      const data: ExportData = JSON.parse(jsonData);

      // Validate data structure
      const validation = this.validateImportData(data);
      if (!validation.valid) {
        return this.failure(`Invalid import file: ${validation.message}`);
      }

      // Check version compatibility
      const fileVersion = data.version || '1.0'; // Default to 1.0 for old files
      const compatibilityCheck = this.checkVersionCompatibility(fileVersion);
      if (!compatibilityCheck.compatible) {
        return this.failure(compatibilityCheck.message);
      }

      // Migrate data if from older version
      const migratedData = this.migrateData(data, fileVersion);
      await this.writeImport(migratedData, replaceExisting);

      // Recalculate every imported build against current reference data.
      // Imported builds carry the score they were exported with, which goes stale
      // if agent stats or stat weights changed since the export was taken.
      // Runs after discs are imported so disc lookups resolve.
      if (migratedData.builds.length > 0) {
        try {
          await this.buildService.recalculateAllBuilds();
        } catch (error) {
          // A failed recalculation should not fail the import - the builds are
          // already saved, they just keep their exported scores until next edit.
          console.warn('Failed to recalculate builds after import:', error);
        }
      }

      return this.success(migratedData, fileVersion);
    } catch (error) {
      return this.failure(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private success(data: ExportData, fileVersion: string): ImportResult {
    const counts = {
      buildsImported: data.builds.length,
      discsImported: data.discs.length,
      loadoutsImported: data.loadouts?.length ?? 0,
      plansImported: data.upgradePlans?.length ?? 0,
      shareCustomizationsImported: data.shareCustomizations?.length ?? 0,
    };
    const optional = [
      counts.loadoutsImported > 0 ? `, ${counts.loadoutsImported} loadouts` : '',
      counts.plansImported > 0 ? `, ${counts.plansImported} upgrade plans` : '',
      counts.shareCustomizationsImported > 0 ? `, ${counts.shareCustomizationsImported} share image settings` : '',
    ].join('');
    const versionWarning = fileVersion !== this.EXPORT_VERSION ? ` (migrated from version ${fileVersion})` : '';

    return {
      success: true,
      message: `Successfully imported ${counts.buildsImported} builds, ${counts.discsImported} discs${optional}${versionWarning}`,
      ...counts,
    };
  }

  private failure(message: string): ImportResult {
    return {
      success: false,
      message,
      buildsImported: 0,
      discsImported: 0,
      loadoutsImported: 0,
      plansImported: 0,
      shareCustomizationsImported: 0,
    };
  }

  /**
   * Write every store. Discs and share customizations go in one Dexie transaction; builds,
   * loadouts, and plans live in localStorage, which a transaction cannot cover, so each is
   * written with one save and the snapshot taken first restores all stores if any save fails.
   * Plans and share customizations are replaced only when the file carries them (3.1 and later).
   */
  private async writeImport(data: ExportData, replaceExisting: boolean): Promise<void> {
    const snapshot = await this.takeSnapshot();
    const replacePlans = replaceExisting && data.upgradePlans !== undefined;
    const replaceCustomizations = replaceExisting && data.shareCustomizations !== undefined;

    try {
      await this.writeDexieStores(data.discs, data.shareCustomizations ?? [], replaceExisting, replaceCustomizations);
      await this.buildService.importBuildList(data.builds, replaceExisting);
      this.discLoadoutService.importLoadoutList(data.loadouts ?? [], replaceExisting);
      this.upgradePlanService.importPlanList(data.upgradePlans ?? [], replacePlans);
    } catch (error) {
      await this.restoreSnapshot(snapshot);
      throw error;
    } finally {
      // Reload rather than append in memory: merge mode may have overwritten existing discs
      await this.discService.loadDiscsFromDb();
    }
  }

  private async takeSnapshot(): Promise<StoreSnapshot> {
    return {
      discs: await this.db.getAllDiscs(),
      shareCustomizations: await this.db.getAllShareCustomizations(),
      builds: this.buildService.getBuilds(),
      loadouts: this.discLoadoutService.getAllLoadouts(),
      plans: this.upgradePlanService.getPlans(),
    };
  }

  private async restoreSnapshot(snapshot: StoreSnapshot): Promise<void> {
    try {
      await this.writeDexieStores(snapshot.discs, snapshot.shareCustomizations, true, true);
      await this.buildService.importBuildList(snapshot.builds, true);
      this.discLoadoutService.importLoadoutList(snapshot.loadouts, true);
      this.upgradePlanService.importPlanList(snapshot.plans, true);
    } catch (error) {
      console.error('Failed to restore data after a failed import:', error);
    }
  }

  private writeDexieStores(
    discs: Disc[],
    customizations: ShareCustomization[],
    replaceDiscs: boolean,
    replaceCustomizations: boolean,
  ): Promise<unknown> {
    const db = this.db;
    // Only Dexie promises are chained inside the transaction; awaiting any other promise
    // there would let it commit early.
    return db.transaction('rw', [db.discs, db.shareCustomizations], () =>
      Dexie.Promise.resolve()
        .then(() => (replaceDiscs ? db.discs.clear() : undefined))
        .then(() => (replaceCustomizations ? db.shareCustomizations.clear() : undefined))
        .then(() => db.discs.bulkPut(discs))
        .then(() => db.shareCustomizations.bulkPut(customizations)),
    );
  }

  /**
   * Clear all user data, keeping reference data: builds, discs, loadouts, upgrade plans,
   * share customizations, and UID history, each through its owner so in-memory state resets
   * too (BUG-05). Lives here, not in DataImportService, so these services stay out of the
   * initial bundle; only the Data Manager uses it.
   */
  async clearUserData(): Promise<void> {
    await this.discService.clearAllDiscs();
    await this.db.shareCustomizations.clear();
    await this.buildService.clearAllBuilds();
    this.discLoadoutService.clearAllLoadouts();
    this.upgradePlanService.clearAllPlans();
    localStorage.removeItem(UID_HISTORY_STORAGE_KEY);
  }

  /**
   * Clear reference data and all user data
   */
  async clearAllData(): Promise<void> {
    await this.db.clearReferenceData();
    await this.clearUserData();
  }

  /**
   * Check if the import file version is compatible with the current app version
   */
  private checkVersionCompatibility(fileVersion: string): { compatible: boolean; message: string } {
    const supportedVersions = ['1.0', '2.0', '3.0', '3.1']; // List of versions we can import

    // Parse version numbers for comparison
    const parseVersion = (version: string): number => {
      const [major, minor] = version.split('.').map(Number);
      return major * 100 + (minor || 0);
    };

    const fileVersionNum = parseVersion(fileVersion);
    const currentVersionNum = parseVersion(this.EXPORT_VERSION);

    // Check if version is supported
    if (!supportedVersions.includes(fileVersion)) {
      // Check if file is from a future version
      if (fileVersionNum > currentVersionNum) {
        return {
          compatible: false,
          message: `Import file is from a newer version (${fileVersion}). Please update ZZZ Optimizer to import this file.`,
        };
      }

      // Unknown/unsupported version
      return {
        compatible: false,
        message: `Unsupported import file version (${fileVersion}). Supported versions: ${supportedVersions.join(', ')}`,
      };
    }

    // File version is supported
    if (fileVersionNum < currentVersionNum) {
      // Older version - will be migrated
      return {
        compatible: true,
        message: `Import file will be migrated from version ${fileVersion} to ${this.EXPORT_VERSION}`,
      };
    }

    // Same version
    return {
      compatible: true,
      message: 'Import file version matches current version',
    };
  }

  /**
   * Validate import data structure. Returns the first problem found.
   */
  private validateImportData(data: ExportData): { valid: boolean; message: string } {
    const message =
      this.validateArrayFields(data) ??
      this.findMissingField('Build', data.builds, ['id', 'agentId', 'equippedDiscs']) ??
      this.findMissingField('Disc', data.discs, ['uid', 'slot', 'set']) ??
      this.findMissingField('Loadout', data.loadouts ?? [], ['id', 'name', 'agentId', 'equippedDiscs']) ??
      this.findMissingField('Upgrade plan', data.upgradePlans ?? [], ['id', 'agentId']) ??
      this.findMissingField('Share customization', data.shareCustomizations ?? [], ['agentId']);

    return message ? { valid: false, message } : { valid: true, message: 'Import data is valid' };
  }

  private validateArrayFields(data: ExportData): string | null {
    // Check for required fields
    if (!data.builds) {
      return 'Missing builds data';
    }
    if (!data.discs) {
      return 'Missing discs data';
    }
    if (!Array.isArray(data.builds)) {
      return 'Builds data must be an array';
    }
    if (!Array.isArray(data.discs)) {
      return 'Discs data must be an array';
    }

    // Optional arrays (older files lack them)
    const optional: [string, unknown][] = [
      ['Loadouts', data.loadouts],
      ['Upgrade plans', data.upgradePlans],
      ['Share customizations', data.shareCustomizations],
    ];
    for (const [label, value] of optional) {
      if (value !== undefined && !Array.isArray(value)) {
        return `${label} data must be an array`;
      }
    }
    return null;
  }

  /**
   * The message for the first item missing one of `fields`, or null. `equippedDiscs` only has to
   * be present on builds (it may be empty), which `undefined` checks; other fields must be truthy.
   */
  private findMissingField<T extends object>(label: string, items: readonly T[], fields: string[]): string | null {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown>; // Read by field name only
      for (const field of fields) {
        const missing = label === 'Build' && field === 'equippedDiscs' ? item[field] === undefined : !item[field];
        if (missing) {
          return `${label} at index ${i} missing required field: ${field}`;
        }
      }
    }
    return null;
  }

  /**
   * Migrate data from older versions to current format
   */
  private migrateData(data: ExportData, fromVersion: string): ExportData {
    const migratedData = { ...data };

    // Version 3.0 added loadouts; earlier files have none. Build fields added since 1.0
    // (W-Engine refinement, toggle flags, enabledDiscs, the PEN_Ratio name) are filled by
    // normalizeStoredBuild when the builds are imported, the same as when they are loaded.
    if (fromVersion === '1.0' || fromVersion === '2.0') {
      migratedData.loadouts = migratedData.loadouts ?? [];
    }

    // Version 3.1 added upgradePlans and shareCustomizations. They stay undefined for older
    // files, so Replace mode keeps the current plans and share settings.

    // Update version to current
    migratedData.version = this.EXPORT_VERSION;

    return migratedData;
  }

  /**
   * Read file from input element
   */
  async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsText(file);
    });
  }
}
