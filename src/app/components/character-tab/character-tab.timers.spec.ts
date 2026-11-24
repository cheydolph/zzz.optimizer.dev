import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { CharacterTabComponent } from './character-tab.component';

/** Private state read by the tests, reached through a cast. */
type Internals = { isShareOptionUpdating: boolean; isColorUpdating: boolean; saveCustomizations: () => void };

// NG-18 (slice 4.7b): character-tab's timeouts run through deferDom(), so they keep their delays and are cancelled
// when the component is destroyed.
describe('CharacterTabComponent deferred timeouts', () => {
  let fixture: ComponentFixture<CharacterTabComponent>;
  let component: CharacterTabComponent;
  let internals: Internals;
  let http: HttpTestingController;
  let generate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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
    fixture = TestBed.createComponent(CharacterTabComponent);
    component = fixture.componentInstance;
    internals = component as unknown as Internals;
    // The renderer and the storage write are not under test
    generate = vi.spyOn(component, 'generateShareImage').mockResolvedValue(undefined);
    vi.spyOn(internals, 'saveCustomizations').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('regenerates the share image after 50 ms and releases the option guard 100 ms later', () => {
    component.onShareOptionChange();
    expect(internals.isShareOptionUpdating).toBe(true);
    vi.advanceTimersByTime(49);
    expect(generate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(generate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(99);
    expect(internals.isShareOptionUpdating).toBe(true);
    vi.advanceTimersByTime(1);
    expect(internals.isShareOptionUpdating).toBe(false);
  });

  it('releases the accent color guard after 100 ms', () => {
    component.selectAccentColor('#FF0000');
    expect(internals.isColorUpdating).toBe(true);
    vi.advanceTimersByTime(99);
    expect(internals.isColorUpdating).toBe(true);
    vi.advanceTimersByTime(1);
    expect(internals.isColorUpdating).toBe(false);
  });

  it('runs none of them after the component is destroyed', () => {
    component.selectAccentColor('#00FF00');
    fixture.destroy();
    vi.advanceTimersByTime(10_000);
    expect(generate).not.toHaveBeenCalled();
    expect(internals.isColorUpdating).toBe(true);
    expect(internals.isShareOptionUpdating).toBe(true);
  });
});
