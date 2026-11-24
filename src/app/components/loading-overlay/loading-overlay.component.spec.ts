import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { LoadingOverlayComponent } from './loading-overlay.component';

// NG-10 (slice 4.7b): `show` became a signal input with an effect. The video must still start, muted,
// when the overlay starts visible and each time it becomes visible again, and not while it is hidden.
describe('LoadingOverlayComponent video', () => {
  let play: MockInstance<HTMLMediaElement['play']>;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement media playback
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(show: boolean) {
    const fixture = TestBed.createComponent(LoadingOverlayComponent);
    fixture.componentRef.setInput('show', show);
    fixture.detectChanges();
    return fixture;
  }

  it('plays the video, muted, when the overlay starts visible', async () => {
    const fixture = setup(true);
    await vi.runAllTimersAsync();

    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    expect(play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(true);
  });

  it('does not play while hidden, then plays each time it is shown', async () => {
    const fixture = setup(false);
    await vi.runAllTimersAsync();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();

    fixture.componentRef.setInput('show', true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('show', false);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.componentRef.setInput('show', true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(2);
  });
});
