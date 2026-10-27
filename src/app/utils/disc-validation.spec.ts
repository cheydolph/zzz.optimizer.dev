import { getDiscFormSubstatError } from './disc-validation';

describe('getDiscFormSubstatError', () => {
  const valid = [
    { type: 'CRIT_Rate', value: '7.2' }, // 3 rolls
    { type: 'CRIT_DMG', value: 14.4 }, // 3 rolls
    { type: 'ATK%', value: '3' }, // 1 roll
    { type: 'HP', value: 112 }, // 1 roll
  ];

  it('accepts four substats with 8 rolls in total', () => {
    expect(getDiscFormSubstatError(valid)).toBeNull();
  });

  it('accepts 9 rolls in total', () => {
    expect(getDiscFormSubstatError([...valid.slice(0, 3), { type: 'HP', value: '224' }])).toBeNull();
  });

  it('blocks a row without a type, as BUG-25 saved it', () => {
    expect(getDiscFormSubstatError([...valid.slice(0, 3), { type: '', value: '' }])).toBe(
      'Choose a type and enter a value for all 4 substats.',
    );
  });

  it('blocks a row with a value of 0 and fewer than 4 rows', () => {
    const message = 'Choose a type and enter a value for all 4 substats.';
    expect(getDiscFormSubstatError([...valid.slice(0, 3), { type: 'HP', value: 0 }])).toBe(message);
    expect(getDiscFormSubstatError(valid.slice(0, 3))).toBe(message);
  });

  it('blocks a substat outside 1 to 6 rolls', () => {
    expect(getDiscFormSubstatError([{ type: 'CRIT_Rate', value: 16.8 }, ...valid.slice(1)])).toBe(
      'CRIT Rate has 7 rolls. Each substat has 1 to 6 rolls on an S-rank +15 disc.',
    );
    expect(getDiscFormSubstatError([...valid.slice(0, 3), { type: 'HP', value: 4.8 }])).toBe(
      'HP has 0 rolls. Each substat has 1 to 6 rolls on an S-rank +15 disc.',
    );
  });

  it('blocks a 7-roll total (the Astra Yao Drive 5 case in the BUG-27 row)', () => {
    const astraDrive5 = [
      { type: 'HP', value: 224 },
      { type: 'CRIT_DMG', value: 9.6 },
      { type: 'ATK', value: 38 },
      { type: 'Anomaly_Proficiency', value: 9 },
    ];
    expect(getDiscFormSubstatError(astraDrive5)).toBe('Substat rolls total 7. An S-rank +15 disc has 8 or 9 in total.');
  });
});
