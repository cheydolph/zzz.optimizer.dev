import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { NEVER, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwUpdateService } from './sw-update.service';

const THIRTY_MINUTES = 30 * 60 * 1000;

/** The private steps `init()` runs before the interval starts; stubbed so only the interval is exercised. */
type InitSteps = Record<
  | 'checkVersionAndClearCaches'
  | 'checkForBrokenServiceWorker'
  | 'clearExpectingUpdateIfCurrent'
  | 'bustCacheAndCheckForUpdate',
  () => Promise<unknown>
>;

describe('SwUpdateService update check interval (NG-06)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops the 30-minute check when its injector is destroyed', async () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: { isEnabled: true, versionUpdates: NEVER, unrecoverable: NEVER } }],
    });
    // The interval starts once the app is stable; make it stable at once.
    Object.defineProperty(TestBed.inject(ApplicationRef), 'isStable', { value: of(true) });
    const service = TestBed.inject(SwUpdateService);
    const steps = service as unknown as InitSteps;
    vi.spyOn(steps, 'checkVersionAndClearCaches').mockResolvedValue(undefined);
    vi.spyOn(steps, 'checkForBrokenServiceWorker').mockResolvedValue(undefined);
    vi.spyOn(steps, 'clearExpectingUpdateIfCurrent').mockResolvedValue(undefined);
    const check = vi.spyOn(steps, 'bustCacheAndCheckForUpdate').mockResolvedValue(false);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await service.init();
    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    expect(check).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
