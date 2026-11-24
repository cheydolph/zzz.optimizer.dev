import { AgentScoring, Specialty } from './agent.model';

// Refinement-based stat bonuses from Effect.Properties
export interface RefinementProperty {
  name: string; // e.g., "Energy Regen", "ATK", "HP"
  type:
    | 'ATK%'
    | 'HP%'
    | 'DEF%'
    | 'CRIT_Rate'
    | 'CRIT_DMG'
    | 'PEN_Ratio'
    | 'Energy_Regen'
    | 'Impact'
    | 'Anomaly_Proficiency'
    | 'Anomaly_Mastery'
    | 'Sheer_Force'
    | 'Sheer Force';
  values: {
    W1: number;
    W2: number;
    W3: number;
    W4: number;
    W5: number;
  };
}

// models/wengine.model.ts
export interface WEngine {
  id: string;
  name: string;
  rarity: 'S' | 'A' | 'B';
  specialty: Specialty;
  /**
   * Value of the W-Engine's BaseProperty. Named `baseAtk` for historical reasons -
   * for Armorer W-Engines this is Base DEF, not Base ATK. Check `baseStatType`
   * before adding it to a stat pool.
   */
  baseAtk: number;
  /**
   * Which stat the BaseProperty feeds. Armorer W-Engines (e.g. Crimson Thirst)
   * have Base DEF; everything else has Base ATK. Absent means ATK.
   */
  baseStatType?: 'ATK' | 'DEF';
  subStat: {
    type:
      | 'ATK%'
      | 'HP%'
      | 'DEF%'
      | 'CRIT_Rate'
      | 'CRIT_DMG'
      | 'PEN_Ratio'
      | 'Energy_Regen'
      | 'Impact'
      | 'Anomaly_Proficiency'
      | 'Anomaly_Mastery'
      | 'Sheer_Force'
      | 'Sheer Force';
    value: number;
  };
  effect: {
    name: string;
    description: string;
    properties?: RefinementProperty[]; // Stat bonuses that scale with refinement
  };
  signature?: string;
  icon?: string;
}

// Raw shapes from `assets/data/wengines.json` (an object keyed by W-Engine id), before
// DataTransformerService maps them to `WEngine`.

// `BaseProperty` / `RandProperty`: Value is in basis points when Format contains '%'.
export interface RawWEngineProperty {
  Name: string;
  Name2: string;
  Format: string;
  Value: number;
}

// One `Effect.Properties` entry: a stat bonus with one value per refinement, in basis points
// when Format contains '%'.
export interface RawWEngineEffectProperty {
  Name: string;
  Name2: string;
  Format: string;
  Overclock: { W1: number; W2: number; W3: number; W4: number; W5: number };
}

// One talent of the per-weapon file format; absent from wengines.json.
export interface RawWEngineTalent {
  Name?: string;
  Desc?: string;
}

export interface RawWEngine {
  Id: number;
  CodeName: string;
  Name: string;
  Desc: string;
  Desc2: string;
  Desc3: string;
  Rarity: number;
  Icon: string;
  WeaponType: { [typeId: string]: string }; // e.g. { "1": "Attack" }
  BaseProperty: RawWEngineProperty;
  RandProperty: RawWEngineProperty;
  Effect: { Properties: RawWEngineEffectProperty[]; Desc: string };
  scoring?: AgentScoring;
  // Per-weapon file format only (weapon/{id}.json); absent from wengines.json.
  Level?: { [level: string]: { Rate: number } };
  Talents?: { [talentId: string]: RawWEngineTalent };
  CharacterId?: number;
}
