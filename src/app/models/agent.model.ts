// models/agent.model.ts
export type Element = 'Physical' | 'Fire' | 'Ice' | 'Electric' | 'Wind' | 'Ether' | 'Lumen';
export type Specialty = 'Attack' | 'Stun' | 'Support' | 'Defense' | 'Anomaly' | 'Rupture' | 'Armorer';
export type DiscSlot = 'Drive1' | 'Drive2' | 'Drive3' | 'Drive4' | 'Drive5' | 'Drive6';

export interface BaseStats {
  hp: number;
  hppercent: number;
  atk: number;
  atkpercent: number;
  def: number;
  defpercent: number;
  impact: number;
  impactpercent: number; // Percentage bonuses (disc 6 main stat, set bonuses)
  flatImpact: number; // Flat Impact bonuses from passives (Nangong Yu, Dialyn, Zhu Yuan)
  anomalyMastery: number;
  anomalyMasteryPercent: number; // Percentage bonuses (disc 6 main stat, set bonuses)
  critRate: number;
  critDmg: number;
  anomalyProficiency: number;
  pen: number; // Flat PEN (converted to penRatio for display)
  penRatio: number;
  energyRegen: number; // Base energy regen (SpBarPoint) - stored as energy/sec
  energyRegenPercent: number; // Percentage bonuses to energy regen
  sheerForce: number; // Sheer Force for Rupture agents: floor(ATK × 0.3) + floor(HP × 0.1)
  // Armorer-only display stats. In game these occupy the ATK and Energy Regen slots
  // on the stat screen, but they do not replace those stats - ATK and Energy Regen
  // still exist on Armorers, they are simply not useful to them.
  //
  // Both are static per agent: nothing (discs, W-Engine, substats, levels) changes
  // them. They are stored per agent rather than as shared constants because other
  // Armorers are expected to have different values than Claret's 150% / 1.5.
  lacerationDamage?: number; // Laceration DMG % (replaces CRIT DMG on a CRIT)
  sharpnessAutoAccumulation?: number; // Sharpness gained per second
}

export interface Agent {
  id: string;
  name: string;
  rarity: 'A' | 'S';
  element: Element;
  specialty: Specialty;
  lvl60Stats: BaseStats;
  icon?: string;
  iconThumb?: string; // 400px-wide thumbnail for list/grid views (see build-scripts/generate-agent-thumbnails.js)
  elementIcon?: string;
  specialElementIcon?: string; // For special element variants (Frost, AuricInk, HonedEdge)
  specialtyIcon?: string;
  mindscapeEffects?: MindscapeEffect[];
  coreSkill?: string;
  scoring?: AgentScoring;
  hasHPAscension?: boolean; // true for agents with HP% ascension bonus (Zhao, Manato)
  hpAscensionPercent?: number; // HP ascension percentage (e.g., 18 for 18%)
  extra_ascension?: any[]; // Core passive bonuses unlocked at levels 15, 25, 35, 45, 55
}

export interface AgentScoring {
  buffs?: AgentBuff[];
  debuffs?: any[];
  dazeBonus?: number;
}

export interface AgentBuff {
  type: string; // e.g., 'ATKBonus', 'CRITRateBonus', 'CRITDMGBonus', etc.
  value: string; // String number like '1000' or '40'
  format: '%' | 'flat';
  condition?: {
    sourceStat: string; // Source stat to read (e.g., 'anomalyMastery')
    threshold: number; // Minimum value before conversion starts
    ratio: number; // Conversion ratio (e.g., 1.0 for 1:1) - W5 / default
    cap?: number; // Maximum value the bonus can provide - W5 / default
    // Optional per-refinement values for W-Engine conditionals whose ratio and/or
    // cap scale with Overclock (e.g. Bloodmarrow Coffer). When present and the
    // equipped refinement is known, these override the flat ratio/cap above.
    // The top-level ratio/cap remain the W5 fallback for callers that do not
    // supply a refinement.
    Overclock?: {
      [rank: string]: { ratio?: number; cap?: number };
    };
  };
  note?: string; // Free-text remark on a few entries in the data files
}

// One enemy-side modifier in a `scoring.debuffs` list (agents.json, wengines.json).
export interface AgentDebuff {
  type: string; // e.g., 'DEFShred', 'RESShred', 'DamageTaken', 'StunDMGMult'
  value: string; // String number like '35'
  format: '%' | 'flat';
}

export interface MindscapeEffect {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
  statBonuses?: MindscapeStatBonus[];
}

export interface MindscapeStatBonus {
  type:
    | 'ATK%'
    | 'HP%'
    | 'DEF%'
    | 'CRIT_Rate'
    | 'CRIT_DMG'
    | 'PEN_Ratio'
    | 'Energy_Regen'
    | 'Anomaly_Proficiency'
    | 'Anomaly_Mastery'
    | 'Impact';
  value: number;
  conditional: boolean; // true if bonus requires conditions, false if always active
  format?: '%' | 'flat'; // New field to distinguish percentage vs flat stats
}

/**
 * One stat bonus of a mindscape level in `assets/data/mindscape-stats.json` (curated by hand). Not the same data as
 * `MindscapeStatBonus` above, which is parsed from the agents.json cinema descriptions.
 */
export interface MindscapeStatEntry {
  type: string;
  value: number;
  format: string;
  note: string;
  name?: string;
}

/** `assets/data/mindscape-stats.json`: stat bonuses per agent id and mindscape level (1 to 6). */
export interface MindscapeData {
  comment?: string;
  mindscapes: {
    [agentId: string]: {
      comment?: string;
      [level: number]: MindscapeStatEntry[];
    };
  };
}

// Raw shapes from `assets/data/agents.json` (an array of these), before DataTransformerService
// maps them to `Agent`. Only the fields that typed code reads are listed.

// An `{ id, name }` pair such as `element` or `specialty`.
export interface RawIdName {
  id: number;
  name: string;
}

// `lvl60_stats`: level 60 base stats in game units (Crit 500 = 5%, SpBarPoint 12 = 1.2/s).
export interface RawAgentLvl60Stats {
  HpMax: number;
  Defence: number;
  Attack: number;
  Crit: number;
  CritDamage: number;
  PenRate: number;
  BreakStun: number;
  ElementAbnormalPower: number;
  ElementMystery: number;
  SpBarPoint: number;
  LacerationDamage?: number; // Armorer only
  SharpnessAutoAccumulation?: number; // Armorer only
}

// One property bonus of an `extra_ascension` phase (id 11102 is HP%, value 1800 = 18%).
export interface RawAgentAscensionProp {
  id: number;
  name: string;
  format: string;
  value: number;
  formatted_value: string;
}

// One `extra_ascension` phase: the core passive bonuses unlocked up to `max_level`.
export interface RawAgentAscensionPhase {
  max_level: number;
  props: RawAgentAscensionProp[];
}

// One `mindscape_cinemas` entry.
export interface RawMindscapeCinema {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  description: string;
  description2: string;
}

// One agent in agents.json. Some agents have no extra_ascension or mindscape_cinemas.
export interface RawAgent {
  id: number;
  name: string;
  rarity: 'A' | 'S';
  element: RawIdName;
  specialty: RawIdName;
  Icon: string;
  scoring: AgentScoring;
  lvl60_stats: RawAgentLvl60Stats;
  extra_ascension?: RawAgentAscensionPhase[];
  mindscape_cinemas?: RawMindscapeCinema[];
  // Older data formats only, read by DataMappingService; absent from the current agents.json.
  code?: string;
  EN?: string;
  desc?: string;
}
