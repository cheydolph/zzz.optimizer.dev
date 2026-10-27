import { readStoredArray, storageReadNotice } from './stored-array';

describe('readStoredArray', () => {
  const key = 'test-store';

  beforeEach(() => localStorage.clear());

  it('reads a stored array and leaves no backup', () => {
    localStorage.setItem(key, '[{"id":1}]');
    const read = readStoredArray<{ id: number }>(key);
    expect(read).toEqual({ items: [{ id: 1 }], saveBlocked: false });
    expect(storageReadNotice('builds', read)).toBeNull();
  });

  it('returns an empty list for a missing key', () => {
    expect(readStoredArray(key)).toEqual({ items: [], saveBlocked: false });
  });

  it('copies unreadable text to a backup key before anything can overwrite it', () => {
    localStorage.setItem(key, '[{"id":1},');
    const read = readStoredArray(key);
    expect(read).toEqual({ items: [], backupKey: `${key}-backup`, saveBlocked: false });
    expect(localStorage.getItem(`${key}-backup`)).toBe('[{"id":1},');
    expect(storageReadNotice('builds', read)).toBe(
      `Your saved builds could not be read. A copy was kept in browser storage as ${key}-backup.`,
    );
  });

  it('treats valid JSON that is not an array as unreadable', () => {
    localStorage.setItem(key, '{"id":1}');
    expect(readStoredArray(key).backupKey).toBe(`${key}-backup`);
  });

  it('keeps an older, different backup and writes a timestamped one', () => {
    localStorage.setItem(`${key}-backup`, 'older');
    localStorage.setItem(key, 'newer');
    const read = readStoredArray(key);
    expect(read.backupKey).toMatch(new RegExp(`^${key}-backup-\\d+$`));
    expect(localStorage.getItem(`${key}-backup`)).toBe('older');
    expect(localStorage.getItem(read.backupKey ?? '')).toBe('newer');
  });
});
