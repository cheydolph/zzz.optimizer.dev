import { DiscSlot } from './agent.model';

// models/disc.model.ts
export type MainStatType =
  | 'HP'
  | 'HP%'
  | 'ATK'
  | 'ATK%'
  | 'DEF'
  | 'DEF%'
  | 'CRIT_Rate'
  | 'CRIT_DMG'
  | 'Anomaly_Proficiency'
  | 'Anomaly_Mastery'
  | 'PEN_Ratio'
  | 'Element_DMG'
  | 'Impact'
  | 'Energy_Regen';

export type SubStatType =
  | 'HP'
  | 'HP%'
  | 'ATK'
  | 'ATK%'
  | 'DEF'
  | 'DEF%'
  | 'CRIT_Rate'
  | 'CRIT_DMG'
  | 'Anomaly_Proficiency'
  | 'PEN';
// Note: Anomaly_Mastery, Impact, and Energy_Regen are main stats only (Drive 6), not substats

export interface SubStat {
  type: SubStatType;
  value: number;
  rolls?: number;
}

export interface Disc {
  uid: string;
  slot: DiscSlot;
  set: string;
  rarity: 'B' | 'A' | 'S';
  level: number;
  mainStat: {
    type: MainStatType;
    value: number;
  };
  subStats: SubStat[];
  equippedBy?: string; // agent id
  lock: boolean;
}

// The fields DataTransformerService reads from a disc set file, `assets/data/equipment/<id>.json`.
// The full file shape (with `4pcEffect`) is DiscSetEquipmentData in disc-set-data.service.ts.
export interface RawDiscSet {
  Name: string;
  Desc2: string;
  Desc4: string;
  Icon: string;
  Icon2: string;
}
