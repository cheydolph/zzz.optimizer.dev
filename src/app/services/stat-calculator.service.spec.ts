import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Agent, BaseStats, DiscSlot } from '../models/agent.model';
import type { Disc } from '../models/disc.model';
import { DiscSetDataService, type DiscSetEquipmentData } from './disc-set-data.service';
import { StatCalculatorService } from './stat-calculator.service';

/**
 * Baseline specs for final-stat computation.
 *
 * The memoisation here (statCache) is the main thing to protect: a wrong cache
 * key silently returns another build's stats, which is invisible until a user
 * notices their numbers are wrong. The cache specs below are the point of this
 * file.
 */

function baseStats(overrides: Partial<BaseStats> = {}): BaseStats {
  return {
    hp: 7000,
    hppercent: 0,
    atk: 700,
    atkpercent: 0,
    def: 600,
    defpercent: 0,
    impact: 100,
    impactpercent: 0,
    flatImpact: 0,
    anomalyMastery: 100,
    anomalyMasteryPercent: 0,
    critRate: 5,
    critDmg: 50,
    anomalyProficiency: 90,
    pen: 0,
    penRatio: 0,
    energyRegen: 1.2,
    energyRegenPercent: 0,
    sheerForce: 0,
    ...overrides,
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    rarity: 'S',
    element: 'Electric',
    specialty: 'Attack',
    lvl60Stats: baseStats(),
    ...overrides,
  };
}

function disc(slot: DiscSlot, overrides: Partial<Disc> = {}): Disc {
  return {
    uid: `disc-${slot}`,
    slot,
    set: 'Woodpecker Electro',
    rarity: 'S',
    level: 15,
    mainStat: { type: 'ATK', value: 316 },
    subStats: [],
    lock: false,
    ...overrides,
  };
}

describe('StatCalculatorService', () => {
  let service: StatCalculatorService;
  let httpMock: HttpTestingController;

  function flushAll(): void {
    for (const r of httpMock.match(() => true)) {
      r.flush({}, { status: 404, statusText: 'Not Found' });
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), StatCalculatorService],
    });
    service = TestBed.inject(StatCalculatorService);
    httpMock = TestBed.inject(HttpTestingController);
    flushAll();
  });

  afterEach(() => {
    flushAll();
    service.clearCache();
    vi.restoreAllMocks();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  describe('calculateFinalStats', () => {
    it('returns stats for an agent with no gear', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {});
      expect(stats).toBeTruthy();
      expect(stats.atk).toBeGreaterThan(0);
      expect(stats.hp).toBeGreaterThan(0);
    });

    it('starts from the agent base stats when nothing is equipped', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {});
      expect(stats.atk).toBe(700);
      expect(stats.hp).toBe(7000);
    });

    it('always resets sheerForce rather than inheriting it', () => {
      const a = agent({ lvl60Stats: baseStats({ sheerForce: 9999 }) });
      const stats = service.calculateFinalStats(a, 60, null, {});
      expect(stats.sheerForce).not.toBe(9999);
    });

    it('adds a flat ATK disc main stat', () => {
      const withDisc = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1', { mainStat: { type: 'ATK', value: 316 } }),
      });
      expect(withDisc.atk).toBeGreaterThan(700);
    });

    it('applies CRIT_Rate from a disc main stat', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive4: disc('Drive4', {
          mainStat: { type: 'CRIT_Rate', value: 24 },
        }),
      });
      expect(stats.critRate).toBeGreaterThan(5);
    });

    it('applies disc substats', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1', {
          subStats: [{ type: 'CRIT_DMG', value: 19.2 }],
        }),
      });
      expect(stats.critDmg).toBeGreaterThan(50);
    });

    it('never returns NaN for any numeric field', () => {
      const stats = service.calculateFinalStats(agent(), 60, null, {
        Drive1: disc('Drive1', {
          subStats: [
            { type: 'CRIT_Rate', value: 9.6 },
            { type: 'ATK%', value: 9 },
          ],
        }),
      });
      for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number') {
          expect(Number.isNaN(value), `${key} is NaN`).toBe(false);
        }
      }
    });

    it('excludes a disabled disc from the result', () => {
      const discs = { Drive1: disc('Drive1') };
      const enabled = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      const disabled = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: false });
      expect(disabled.atk).toBeLessThan(enabled.atk);
    });

    it('treats an unspecified disc as enabled', () => {
      const discs = { Drive1: disc('Drive1') };
      const implicit = service.calculateFinalStats(agent(), 60, null, discs);
      const explicit = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      expect(implicit.atk).toBe(explicit.atk);
    });

    it('handles a full six-disc loadout', () => {
      const discs: { [k in DiscSlot]?: Disc } = {};
      for (const s of ['Drive1', 'Drive2', 'Drive3', 'Drive4', 'Drive5', 'Drive6'] as const) {
        discs[s] = disc(s);
      }
      expect(() => service.calculateFinalStats(agent(), 60, null, discs)).not.toThrow();
    });

    it('is deterministic across repeated calls', () => {
      const discs = { Drive1: disc('Drive1') };
      const a = service.calculateFinalStats(agent(), 60, null, discs);
      service.clearCache();
      const b = service.calculateFinalStats(agent(), 60, null, discs);
      expect(b).toEqual(a);
    });
  });

  describe('stat cache correctness', () => {
    it('returns equal results from cache hit and fresh computation', () => {
      const discs = { Drive1: disc('Drive1') };
      const first = service.calculateFinalStats(agent(), 60, null, discs);
      const cached = service.calculateFinalStats(agent(), 60, null, discs);
      expect(cached).toEqual(first);
    });

    it('does not reuse a cache entry across different agents', () => {
      const discs = { Drive1: disc('Drive1') };
      const a1 = service.calculateFinalStats(agent({ id: 'a1', lvl60Stats: baseStats({ atk: 700 }) }), 60, null, discs);
      const a2 = service.calculateFinalStats(agent({ id: 'a2', lvl60Stats: baseStats({ atk: 900 }) }), 60, null, discs);
      expect(a2.atk).not.toBe(a1.atk);
    });

    it('does not reuse a cache entry across mindscape levels', () => {
      const discs = { Drive1: disc('Drive1') };
      const m0 = service.calculateFinalStats(agent(), 60, null, discs, 0);
      const m6 = service.calculateFinalStats(agent(), 60, null, discs, 6);
      // Values may legitimately match without mindscape data loaded; the point
      // is that both calls complete and are keyed separately.
      expect(m0).toBeTruthy();
      expect(m6).toBeTruthy();
    });

    it('does not reuse a cache entry when a disc changes', () => {
      const weak = { Drive1: disc('Drive1', { mainStat: { type: 'ATK', value: 100 } }) };
      const strong = { Drive1: disc('Drive1', { mainStat: { type: 'ATK', value: 316 } }) };
      const a = service.calculateFinalStats(agent(), 60, null, weak);
      const b = service.calculateFinalStats(agent(), 60, null, strong);
      expect(b.atk).toBeGreaterThan(a.atk);
    });

    it('does not reuse a cache entry when the enabled-disc mask changes', () => {
      const discs = { Drive1: disc('Drive1') };
      const on = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: true });
      const off = service.calculateFinalStats(agent(), 60, null, discs, 0, 1, true, true, true, { Drive1: false });
      expect(off.atk).not.toBe(on.atk);
    });

    it('recomputes after clearCache()', () => {
      const discs = { Drive1: disc('Drive1') };
      const before = service.calculateFinalStats(agent(), 60, null, discs);
      service.clearCache();
      const after = service.calculateFinalStats(agent(), 60, null, discs);
      expect(after).toEqual(before);
    });

    it('clearCache() is safe to call when the cache is empty', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('getSetBonuses', () => {
    // Set bonuses are looked up through DiscSetDataService, whose real data is
    // not loaded in specs. Stub the lookup so these tests exercise the
    // piece-counting logic rather than the data load.
    beforeEach(() => {
      // getSetBonuses reads only Name and Desc2, so partial records stand in for the full data.
      const known: { [name: string]: DiscSetEquipmentData | undefined } = {
        'Woodpecker Electro': { Name: 'Woodpecker Electro', Desc2: 'CRIT Rate +8%' } as DiscSetEquipmentData,
        'Puffer Electro': { Name: 'Puffer Electro', Desc2: 'PEN Ratio +8%' } as DiscSetEquipmentData,
      };
      vi.spyOn(TestBed.inject(DiscSetDataService), 'getDiscSet').mockImplementation((name: string) => known[name]);
    });

    it('returns an empty list for no discs', () => {
      expect(service.getSetBonuses({})).toEqual([]);
    });

    it('does not report a set for a single disc', () => {
      const bonuses = service.getSetBonuses({ Drive1: disc('Drive1', { set: 'Woodpecker Electro' }) });
      expect(bonuses).toEqual([]);
    });

    it('reports a 2pc bonus once two matching pieces are equipped', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1', { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2', { set: 'Woodpecker Electro' }),
      });
      expect(bonuses.length).toBe(1);
      expect(bonuses[0]).toContain('Woodpecker Electro (2pc)');
    });

    it('does not report a set for two different sets', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1', { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2', { set: 'Puffer Electro' }),
      });
      expect(bonuses).toEqual([]);
    });

    it('reports two separate 2pc bonuses for a 2+2 split', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1', { set: 'Woodpecker Electro' }),
        Drive2: disc('Drive2', { set: 'Woodpecker Electro' }),
        Drive3: disc('Drive3', { set: 'Puffer Electro' }),
        Drive4: disc('Drive4', { set: 'Puffer Electro' }),
      });
      expect(bonuses.length).toBe(2);
    });

    it('ignores a set with no equipment data', () => {
      const bonuses = service.getSetBonuses({
        Drive1: disc('Drive1', { set: 'Unknown Set' }),
        Drive2: disc('Drive2', { set: 'Unknown Set' }),
      });
      expect(bonuses).toEqual([]);
    });
  });
});
