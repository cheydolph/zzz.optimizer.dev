import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { LoadingOverlayComponent } from './loading-overlay.component';

// NG-10 (slice 4.7b): `show` became a signal input with an effect. The video must still start, muted,
// when the overlay starts visible and each time it becomes visible again, and not while it is hidden.
// PERF-12 (slice 4.8a): the logo is a video too, so each show plays both; under reduced motion neither plays.
describe('LoadingOverlayComponent video', () => {
  let play: MockInstance<HTMLMediaElement['play']>;
  let pause: MockInstance<HTMLMediaElement['pause']>;
  // jsdom has no matchMedia: a reduced-motion query whose value the tests set and whose change event they fire
  const motionQuery = {
    matches: false,
    listeners: new Set<() => void>(),
    addEventListener: (_: string, fn: () => void) => motionQuery.listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => motionQuery.listeners.delete(fn),
  };
  const setReducedMotion = (on: boolean) => {
    motionQuery.matches = on;
    for (const fn of motionQuery.listeners) fn();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement media playback
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    motionQuery.matches = false;
    motionQuery.listeners.clear();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => motionQuery),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(show: boolean) {
    const fixture = TestBed.createComponent(LoadingOverlayComponent);
    fixture.componentRef.setInput('show', show);
    fixture.detectChanges();
    return fixture;
  }

  it('plays both videos, muted, when the overlay starts visible', async () => {
    const fixture = setup(true);
    await vi.runAllTimersAsync();

    const videos = [...fixture.nativeElement.querySelectorAll('video')] as HTMLVideoElement[];
    expect(play).toHaveBeenCalledTimes(2);
    expect(new Set(play.mock.contexts)).toEqual(new Set(videos));
    expect(videos.map((v) => v.muted)).toEqual([true, true]);
    expect(videos.map((v) => v.autoplay)).toEqual([true, true]);
  });

  // PERF-12 (slice 4.8a): the logo is a muted looping video with a poster; autoplay needs the muted property,
  // which a static attribute would not set on an element created by script.
  it('shows the logo as a muted, looping, autoplaying video with its poster', async () => {
    const fixture = setup(true);
    await vi.runAllTimersAsync();

    const logo = fixture.nativeElement.querySelector('video.zzz-logo') as HTMLVideoElement;
    expect(logo.muted).toBe(true);
    expect(logo.autoplay).toBe(true);
    expect(logo.loop).toBe(true);
    expect(logo.hasAttribute('playsinline')).toBe(true);
    expect(logo.getAttribute('poster')).toContain('zzz-zenless-zone-zero-poster.webp');
    expect(logo.getAttribute('role')).toBe('img');
    expect(logo.getAttribute('aria-label')).toBe('Zenless Zone Zero');
  });

  it('does not play while hidden, then plays each time it is shown', async () => {
    const fixture = setup(false);
    await vi.runAllTimersAsync();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();

    fixture.componentRef.setInput('show', true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(2);

    fixture.componentRef.setInput('show', false);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    fixture.componentRef.setInput('show', true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('keeps both videos still under reduced motion: no autoplay, no play(), each with its poster', async () => {
    motionQuery.matches = true;
    const fixture = setup(true);
    await vi.runAllTimersAsync();

    const logo = fixture.nativeElement.querySelector('video.zzz-logo') as HTMLVideoElement;
    const bangboo = fixture.nativeElement.querySelector('video.bangboo-video') as HTMLVideoElement;
    expect(play).not.toHaveBeenCalled();
    expect([logo.autoplay, bangboo.autoplay]).toEqual([false, false]);
    expect(bangboo.getAttribute('poster')).toContain('bangbooloading-poster.webp');
    expect(logo.getAttribute('poster')).toContain('zzz-zenless-zone-zero-poster.webp');
  });

  it('stops both videos when reduced motion is switched on while the overlay shows, and restarts them when it is off', async () => {
    const fixture = setup(true);
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(2);

    setReducedMotion(true);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(pause).toHaveBeenCalledTimes(2);

    setReducedMotion(false);
    fixture.detectChanges();
    await vi.runAllTimersAsync();
    expect(play).toHaveBeenCalledTimes(4);

    // the listener goes with the component
    fixture.destroy();
    expect(motionQuery.listeners.size).toBe(0);
  });
});
