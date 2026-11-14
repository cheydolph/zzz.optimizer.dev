import type { Disc } from '../models/disc.model';
import type { DbService } from './db.service';
import { DiscService } from './disc.service';

// BUG-17 class (slice 4.6b, NG-05a): updateDisc() emits a new array and never writes into the one it emitted
// before (deep-frozen here, so an in-place write throws).
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('DiscService.updateDisc', () => {
  const disc = (uid: string) =>
    ({
      uid,
      slot: 'Drive1',
      set: 'Woodpecker Electro',
      level: 15,
      mainStat: { type: 'HP', value: 2200 },
      subStats: [],
    }) as unknown as Disc;

  it('emits a new array with a new disc object, keeps untouched discs, and leaves the emitted array alone', async () => {
    const stored = [disc('a'), disc('b')];
    const db = { getAllDiscs: async () => stored, updateDisc: async () => undefined } as unknown as DbService;
    const service = new DiscService(db, 'browser');
    await service.loadDiscsFromDb();
    const emitted: Disc[][] = [];
    service.discs$.subscribe((d) => emitted.push(deepFreeze(d)));

    await service.updateDisc('b', { level: 12 });

    const [before, after] = emitted;
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toEqual({ ...disc('b'), level: 12 });
    expect(before[1].level).toBe(15);
  });
});
