import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import type { Agent } from '../../models/agent.model';
import type { AgentBuild } from '../../services/build.service';
import { ScoringService } from '../../services/scoring.service';
import { CharacterTabComponent } from './character-tab.component';

/** The share renderer as the component sees it after the lazy import. */
type ShareService = { warmImageCache: () => void; generateShareImage: () => Promise<Blob> };
/** The private loader under test, reached through a cast. */
type Internals = { loadCanvasShareService: () => Promise<ShareService> };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Slice 4.6a: the share modal shows its spinner from the first frame (PERF-03), every early exit resets it
// (BUG-28), and closing the modal while an image is generating stops quietly (BUG-29).
describe('CharacterTabComponent share image', () => {
  let component: CharacterTabComponent;
  let internals: Internals;
  let http: HttpTestingController;
  let alertSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  const openModal = () => {
    component.showShareModal = true;
    component.isGeneratingShareImage = true;
    component.shareCanvasRef = new ElementRef(document.createElement('canvas'));
  };
  // What Angular does when the modal closes: the click handler, then the view query drops the canvas
  const closeModal = () => {
    component.closeShareModal();
    component.shareCanvasRef = undefined as unknown as ElementRef<HTMLCanvasElement>; // the @ViewChild after the modal leaves the view
  };

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
    internals = component as unknown as Internals;

    component.selectedBuild = { id: 'b1', agentId: '1091', name: 'Test', equippedDiscs: {} } as unknown as AgentBuild; // only these fields are read
    component.referenceAgents = [{ id: '1091', name: 'Miyabi' } as unknown as Agent]; // only id is read before the renderer
    // The share data inputs come from scoring code the goldens cover; stub them so the test drives only the flow
    vi.spyOn(component, 'getBuildScore').mockReturnValue(null);
    vi.spyOn(component, 'getMainStats').mockReturnValue([]);
    vi.spyOn(component, 'getWEngineStats').mockReturnValue([]);
    vi.spyOn(component, 'getSubstatBreakdown').mockReturnValue([]);
    vi.spyOn(component, 'getTotalEffectiveSubstats').mockReturnValue(0);
    vi.spyOn(TestBed.inject(ScoringService), 'getBuildStatWeights').mockReturnValue({});
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the spinner as soon as the modal opens, before generation starts', () => {
    vi.useFakeTimers();
    const generate = vi.spyOn(component, 'generateShareImage').mockResolvedValue();
    vi.spyOn(internals, 'loadCanvasShareService').mockResolvedValue({
      warmImageCache: vi.fn(),
      generateShareImage: vi.fn(),
    });

    component.shareAsImage();

    expect(component.showShareModal).toBe(true);
    expect(component.isGeneratingShareImage).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('resets the spinner when the agent is missing (BUG-28)', async () => {
    openModal();
    component.referenceAgents = [];

    await component.generateShareImage();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(component.isGeneratingShareImage).toBe(false);
  });

  it('resets the spinner when the canvas is gone before generation starts (BUG-28)', async () => {
    openModal();
    closeModal();
    component.isGeneratingShareImage = true;

    await component.generateShareImage();

    expect(component.isGeneratingShareImage).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('resets the spinner and alerts when the renderer fails to load with the modal open (BUG-28)', async () => {
    openModal();
    vi.spyOn(internals, 'loadCanvasShareService').mockRejectedValue(new Error('chunk failed'));

    await component.generateShareImage();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(component.isGeneratingShareImage).toBe(false);
  });

  it('stops quietly when the modal closes while the renderer loads (BUG-29)', async () => {
    openModal();
    const load = deferred<ShareService>();
    const service: ShareService = { warmImageCache: vi.fn(), generateShareImage: vi.fn() };
    vi.spyOn(internals, 'loadCanvasShareService').mockReturnValue(load.promise);

    const run = component.generateShareImage();
    closeModal();
    load.resolve(service);
    await run;

    expect(service.generateShareImage).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    // other services log IndexedDB errors in jsdom; the share flow must not log its own
    expect(errorSpy).not.toHaveBeenCalledWith('Error generating share image:', expect.anything());
    expect(component.isGeneratingShareImage).toBe(false);
  });

  it('stops quietly when the modal closes while the image is drawn (BUG-29)', async () => {
    openModal();
    const drawing = deferred<Blob>();
    const render = vi.fn(() => drawing.promise);
    vi.spyOn(internals, 'loadCanvasShareService').mockResolvedValue({
      warmImageCache: vi.fn(),
      generateShareImage: render,
    });
    const createUrl = vi.fn(() => 'blob:test');
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true });

    const run = component.generateShareImage();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    closeModal();
    drawing.resolve(new Blob(['png']));
    await run;

    expect(createUrl).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    // other services log IndexedDB errors in jsdom; the share flow must not log its own
    expect(errorSpy).not.toHaveBeenCalledWith('Error generating share image:', expect.anything());
    expect(component.isGeneratingShareImage).toBe(false);
  });

  it('stops quietly without an alert when the renderer fails after the modal closed (BUG-29)', async () => {
    openModal();
    const drawing = deferred<Blob>();
    const render = vi.fn(() => drawing.promise);
    vi.spyOn(internals, 'loadCanvasShareService').mockResolvedValue({
      warmImageCache: vi.fn(),
      generateShareImage: render,
    });

    const run = component.generateShareImage();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    closeModal();
    drawing.reject(new TypeError('canvas gone'));
    await run;

    expect(alertSpy).not.toHaveBeenCalled();
    // other services log IndexedDB errors in jsdom; the share flow must not log its own
    expect(errorSpy).not.toHaveBeenCalledWith('Error generating share image:', expect.anything());
    expect(component.isGeneratingShareImage).toBe(false);
  });

  it('leaves the spinner to the new run when the modal was closed and reopened (BUG-29)', async () => {
    openModal();
    const load = deferred<ShareService>();
    const service: ShareService = { warmImageCache: vi.fn(), generateShareImage: vi.fn() };
    vi.spyOn(internals, 'loadCanvasShareService').mockReturnValue(load.promise);

    const staleRun = component.generateShareImage();
    closeModal();
    openModal(); // reopened: a new canvas, and shareAsImage() set the flag for its own run
    load.resolve(service);
    await staleRun;

    expect(service.generateShareImage).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(component.isGeneratingShareImage).toBe(true);
  });
});
