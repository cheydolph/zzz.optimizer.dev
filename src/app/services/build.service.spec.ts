import { AgentBuild, normalizeStoredBuild } from './build.service';

describe('normalizeStoredBuild', () => {
  // A build as an old (1.0) export or an old localStorage entry has it: no refinement, toggles,
  // or enabledDiscs, and the old "Pen_Ratio" main stat name.
  const oldBuild = (): AgentBuild =>
    ({
      id: 'b1',
      agentId: '1011',
      equippedDiscs: {
        Drive5: { uid: 'd5', slot: 'Drive5', mainStat: { type: 'Pen_Ratio', value: 24 }, subStats: [] },
      },
    }) as unknown as AgentBuild; // deliberately missing fields, as stored by older versions

  it('fills the fields older builds lack and renames Pen_Ratio', () => {
    const build = oldBuild();
    normalizeStoredBuild(build);
    expect(build.wEngineRefinement).toBe(1);
    expect(build.includeWEngineBonuses).toBe(true);
    expect(build.includeMindscapeBonuses).toBe(true);
    expect(build.includePassiveBonuses).toBe(true);
    expect(build.enabledDiscs).toEqual({ Drive5: true });
    expect(Object.values(build.equippedDiscs)[0].mainStat.type).toBe('PEN_Ratio');
  });

  it('leaves fields that are already set', () => {
    const build = { ...oldBuild(), wEngineRefinement: 3, includeWEngineBonuses: false, enabledDiscs: {} };
    normalizeStoredBuild(build);
    expect(build.wEngineRefinement).toBe(3);
    expect(build.includeWEngineBonuses).toBe(false);
    expect(build.enabledDiscs).toEqual({});
  });
});
