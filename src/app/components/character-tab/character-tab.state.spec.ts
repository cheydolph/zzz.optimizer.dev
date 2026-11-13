import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { type AgentBuild, BuildService } from '../../services/build.service';
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
