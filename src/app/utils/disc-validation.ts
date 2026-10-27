import { Disc, MainStatType, SubStatType } from '../models/disc.model';
import { calculateRollCount } from '../constants/substat-rolls';

/**
 * Utility functions for validating disc configurations
 * Used to check both new discs (during creation) and existing discs (already in inventory)
 */

/**
 * Get validation errors for a disc
 * Returns array of error messages (empty array = valid disc)
 */
export function getDiscValidationErrors(disc: Disc): string[] {
  const errors: string[] = [];

  // Check for duplicate substats
  const substatTypes = disc.subStats.map((s) => s.type);
  const seenTypes = new Set<SubStatType>();
  const duplicates = new Set<SubStatType>();

  for (const type of substatTypes) {
    if (seenTypes.has(type)) {
      duplicates.add(type);
    }
    seenTypes.add(type);
  }

  if (duplicates.size > 0) {
    const duplicateList = Array.from(duplicates).join(', ');
    errors.push(`Duplicate substat${duplicates.size > 1 ? 's' : ''}: ${duplicateList}`);
  }

  // Check for main stat = substat conflict
  const mainStatType = disc.mainStat.type;
  const conflictingSubstats = disc.subStats.filter((sub) => sub.type === mainStatType);

  if (conflictingSubstats.length > 0) {
    errors.push(`${formatStatType(mainStatType)} cannot be both main stat and substat`);
  }

  return errors;
}

/**
 * Check if a disc has any validation errors
 */
export function hasValidationErrors(disc: Disc): boolean {
  return getDiscValidationErrors(disc).length > 0;
}

/** One substat row of the disc form, before it is saved. */
export interface DiscFormSubStat {
  type: string;
  value: string | number;
}

/**
 * The message for the first problem that should block saving the disc form, or null.
 * Assumes an S-rank +15 disc (BUG-25, BUG-27): all 4 substats have a type and a value above 0,
 * each substat has 1 to 6 rolls, and the rolls total 8 (3 starting substats) or 9 (4 starting
 * substats). Rolls are derived the way the save does, with calculateRollCount.
 * Not used by scoring: discs already saved keep scoring as they are.
 */
export function getDiscFormSubstatError(subStats: readonly DiscFormSubStat[]): string | null {
  // Parsed the way the save parses them, so the check sees the value that will be stored
  const rows = subStats.map((s) => ({
    type: s.type,
    value: typeof s.value === 'string' ? parseFloat(s.value) || 0 : s.value,
  }));

  if (rows.length < 4 || rows.some((row) => !row.type || !(row.value > 0))) {
    return 'Choose a type and enter a value for all 4 substats.';
  }

  let total = 0;
  for (const row of rows) {
    const rolls = calculateRollCount(row.type, row.value);
    if (rolls < 1 || rolls > 6) {
      // formatStatType returns any name it does not know unchanged
      return `${formatStatType(row.type as SubStatType)} has ${rolls} rolls. Each substat has 1 to 6 rolls on an S-rank +15 disc.`;
    }
    total += rolls;
  }

  if (total !== 8 && total !== 9) {
    return `Substat rolls total ${total}. An S-rank +15 disc has 8 or 9 in total.`;
  }
  return null;
}

/**
 * Format a stat type for display (e.g., "CRIT_Rate" → "CRIT Rate")
 */
function formatStatType(statType: MainStatType | SubStatType): string {
  const typeMap: { [key: string]: string } = {
    HP: 'HP',
    'HP%': 'HP%',
    ATK: 'ATK',
    'ATK%': 'ATK%',
    DEF: 'DEF',
    'DEF%': 'DEF%',
    CRIT_Rate: 'CRIT Rate',
    CRIT_DMG: 'CRIT DMG',
    Anomaly_Proficiency: 'Anomaly Proficiency',
    Anomaly_Mastery: 'Anomaly Mastery',
    PEN: 'PEN',
    PEN_Ratio: 'PEN Ratio',
    Element_DMG: 'Element DMG',
    Impact: 'Impact',
    Energy_Regen: 'Energy Regen',
  };

  return typeMap[statType] || statType;
}
