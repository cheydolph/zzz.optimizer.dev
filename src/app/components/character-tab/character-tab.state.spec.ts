import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { DISC_MAIN_STAT_MAX } from '../../constants/main-stat-possibilities';
import type { DiscSlot } from '../../models/agent.model';
import type { Disc } from '../../models/disc.model';
import { type AgentBuild, BuildService } from '../../services/build.service';
import { DiscService } from '../../services/disc.service';
import type { DiscSet } from '../../services/disc-set.service';
import { CharacterTabComponent } from './character-tab.component';

// BUG-17 (slice 4.6b): the build view's write paths hand the service new objects and never write into the
// builds the service emitted (deep-frozen here, so an in-place write throws).
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('CharacterTabComponent build writes (BUG-17)', () => {
  let component: CharacterTabComponent;
  let buildService: BuildService;
  let http: HttpTestingController;
  const build = (id: string, extra: Partial<AgentBuild> = {}) =>
    ({ id, agentId: '1011', name: id, equippedDiscs: {}, ...extra }) as unknown as AgentBuild; // only these fields are read

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: EMPTY,
            unrecoverable: EMPTY,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate: () => Promise.resolve(false),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    buildService = TestBed.inject(BuildService);
    component = TestBed.createComponent(CharacterTabComponent).componentInstance;
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    vi.restoreAllMocks();
  });

  it('toggles a disc of a build without enabledDiscs by passing a new object', async () => {
    const update = vi.spyOn(buildService, 'updateBuild').mockResolvedValue();
    component.selectedBuild = deepFreeze(build('b1'));

    await component.onDiscToggle('Drive1');

    expect(update).toHaveBeenCalledExactlyOnceWith('b1', { enabledDiscs: { Drive1: false } });
    expect(component.selectedBuild.enabledDiscs).toBeUndefined();
  });

  it('passes the chosen plan to the service instead of writing it into the build', async () => {
    const update = vi.spyOn(buildService, 'updateBuild').mockResolvedValue();
    component.selectedBuild = deepFreeze(build('b1', { activeUpgradePlanId: 'old' }));

    await component.onUpgradePlanChange('new');
    await component.onUpgradePlanChange(undefined);

    expect(update.mock.calls).toEqual([
      ['b1', { activeUpgradePlanId: 'new' }],
      ['b1', { activeUpgradePlanId: undefined }],
    ]);
    expect(component.selectedBuild.activeUpgradePlanId).toBe('old');
  });

  it('reorders a copy of the emitted builds on drop', async () => {
    const reorder = vi.spyOn(buildService, 'reorderBuilds').mockResolvedValue();
    const [a, b, c] = [build('a'), build('b'), build('c')];
    component.builds = deepFreeze([a, b, c]);

    await component.onBuildDrop({ previousIndex: 0, currentIndex: 2 } as CdkDragDrop<AgentBuild[]>);

    expect(reorder).toHaveBeenCalledExactlyOnceWith([b, c, a]);
    expect(component.builds).toEqual([a, b, c]);
  });
});

// NG-07b (slice 4.6b): the disc form, the compare form, and the new loadout's discs are signals whose computed()
// option lists and scores follow them only if every change replaces the state. Each state is deep-frozen before
// the next handler runs, so an in-place write throws.
type OptionRows = () => Array<Array<{ value: string }>>;
// The computed() option lists are protected (template-only); read them as the display checks read theirs
const optionRows = (c: CharacterTabComponent) =>
  c as unknown as { discFormSubstatOptions: OptionRows; compareSubstatOptions: OptionRows };
const drive4Max = new Map(Object.entries(DISC_MAIN_STAT_MAX.Drive4));

describe('CharacterTabComponent form state (NG-07b)', () => {
  let component: CharacterTabComponent;
  let http: HttpTestingController;
  const emptyRows = () => [0, 1, 2, 3].map(() => ({ type: '', value: '' as string | number }));
  const disc = (uid: string, slot: DiscSlot) =>
    ({
      uid,
      slot,
      set: 'Woodpecker Electro',
      rarity: 'S',
      level: 15,
      mainStat: { type: 'HP', value: 2200 },
      subStats: [],
      lock: false,
    }) as Disc;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: false,
            versionUpdates: EMPTY,
            unrecoverable: EMPTY,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate: () => Promise.resolve(false),
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(CharacterTabComponent).componentInstance;
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    vi.restoreAllMocks();
  });

  it('replaces the disc form on every change, and its substat options follow', () => {
    component.selectedDiscSlot = 'Drive4';
    component.discFormData = deepFreeze({ mainStatType: '', mainStatValue: '', subStats: emptyRows() });

    component.onMainStatTypeChange('CRIT_Rate');
    expect(component.discFormData.mainStatType).toBe('CRIT_Rate');
    expect(component.discFormData.mainStatValue).toBe(drive4Max.get('CRIT_Rate'));
    expect(
      optionRows(component)
        .discFormSubstatOptions()[0]
        .map((o) => o.value),
    ).not.toContain('CRIT_Rate');

    deepFreeze(component.discFormData);
    component.setDiscFormSubStat(0, { type: 'ATK' });
    deepFreeze(component.discFormData);
    component.setDiscFormSubStat(0, { value: '4.83' });
    deepFreeze(component.discFormData);
    component.validateAndFormatSubStat(0);

    expect(component.discFormData.subStats[0]).toEqual({ type: 'ATK', value: 4.8 });
    const options = optionRows(component).discFormSubstatOptions();
    expect(options[0].map((o) => o.value)).toContain('ATK');
    expect(options[1].map((o) => o.value)).not.toContain('ATK');

    deepFreeze(component.discFormData);
    component.onMainStatTypeChange('');
    expect(component.discFormData.mainStatValue).toBe(0);
  });

  it('replaces the compare disc on every change, and its substat options follow', () => {
    component.compareDiscSlot = 'Drive4';
    component.compareCustomDisc = deepFreeze({
      slot: 'Drive4',
      set: 'Woodpecker Electro',
      rarity: 'S',
      level: 15,
      mainStat: { type: 'ATK%', value: 0 },
      subStats: [],
      lock: false,
    });

    component.onCompareMainStatTypeChange('CRIT_DMG');
    expect(component.compareCustomDisc?.mainStat).toEqual({ type: 'CRIT_DMG', value: drive4Max.get('CRIT_DMG') });

    deepFreeze(component.compareCustomDisc);
    component.updateCompareCustomDisc('subStat-2-type', 'PEN');
    deepFreeze(component.compareCustomDisc);
    component.updateCompareCustomDisc('subStat-2-value', '18');
    deepFreeze(component.compareCustomDisc);
    component.updateCompareCustomDisc('mainStatValue', '40');

    expect(component.compareCustomDisc?.subStats).toEqual([
      { type: '', value: 0 },
      { type: '', value: 0 },
      { type: 'PEN', value: 18 },
    ]);
    expect(component.compareCustomDisc?.mainStat).toEqual({ type: 'CRIT_DMG', value: 40 });
    expect(
      optionRows(component)
        .compareSubstatOptions()[0]
        .map((o) => o.value),
    ).not.toContain('PEN');

    deepFreeze(component.compareCustomDisc);
    component.selectDiscSet({ name: 'Swing Jazz' } as DiscSet);
    expect(component.compareCustomDisc?.set).toBe('Swing Jazz');
  });

  it('replaces the new loadout discs when one is added or removed', async () => {
    const discService = TestBed.inject(DiscService);
    vi.spyOn(discService, 'addDisc').mockResolvedValue();
    const first = disc('d1', 'Drive1');
    component.selectedBuild = { id: 'b1', agentId: '1011', equippedDiscs: {} } as unknown as AgentBuild; // only these fields are read
    component.newLoadoutDiscs = deepFreeze({ Drive1: first });
    component.showCreateEmptyForm = true;
    component.loadoutCreationSlot = 'Drive2';
    component.selectedDiscSlot = 'Drive2';
    component.selectedDiscSetForCreation = { name: 'Swing Jazz' } as DiscSet;
    component.discFormData = {
      mainStatType: '',
      mainStatValue: '',
      subStats: [
        { type: 'CRIT_Rate', value: '4.8' },
        { type: 'CRIT_DMG', value: '9.6' },
        { type: 'PEN', value: '18' },
        { type: 'HP%', value: '6' },
      ],
    };

    await component.createAndEquipDisc();

    expect(Object.keys(component.newLoadoutDiscs)).toEqual(['Drive1', 'Drive2']);
    expect(Object.values(component.newLoadoutDiscs)[0]).toBe(first);
    expect(component.newLoadoutDiscs).toEqual({
      Drive1: first,
      Drive2: expect.objectContaining({ set: 'Swing Jazz' }),
    });

    deepFreeze(component.newLoadoutDiscs);
    component.removeDiscFromNewLoadout('Drive1', new Event('click'));
    expect(Object.keys(component.newLoadoutDiscs)).toEqual(['Drive2']);
  });
});
