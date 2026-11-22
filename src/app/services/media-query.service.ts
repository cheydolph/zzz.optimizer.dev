import { Injectable, type Signal, signal } from '@angular/core';

interface DesktopInputs {
  /** No touch support and a fine pointer (a mouse); follows the `(pointer: coarse)` query */
  readonly mouseWithoutTouch: Signal<boolean>;
  readonly mobileUserAgent: boolean;
  /** `innerWidth` at least 769 px; follows the window's resize events */
  readonly wideViewport: Signal<boolean>;
  /** Follows the `(prefers-reduced-motion: reduce)` query; not part of the device class */
  readonly reducedMotion: Signal<boolean>;
}

/**
 * Device facts that templates read on every change detection pass, worked out once and then again only when their
 * inputs change, instead of on every read (PERF-16).
 */
@Injectable({
  providedIn: 'root',
})
export class MediaQueryService {
  private desktopInputs?: DesktopInputs;

  /**
   * True on a desktop device rather than a phone or tablet: no touch support and a fine pointer, or a user agent
   * that is not a mobile one with a viewport at least 769 px wide.
   */
  isDesktopDevice(): boolean {
    // Set up on first read, so nothing runs (and no matchMedia is needed) until a view asks
    this.desktopInputs ??= watchDesktopInputs();
    const { mouseWithoutTouch, mobileUserAgent, wideViewport } = this.desktopInputs;
    return mouseWithoutTouch() || (!mobileUserAgent && wideViewport());
  }

  /** True while the device setting asks for reduced motion; follows changes to the setting. */
  prefersReducedMotion(): boolean {
    this.desktopInputs ??= watchDesktopInputs();
    return this.desktopInputs.reducedMotion();
  }
}

function watchDesktopInputs(): DesktopInputs {
  // Mobile and tablet devices have touch support
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const mouseWithoutTouch = signal(!hasTouch && !coarsePointer.matches);
  coarsePointer.addEventListener('change', () => mouseWithoutTouch.set(!hasTouch && !coarsePointer.matches));

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileUserAgent = /iphone|ipad|ipod|android|webos|blackberry|windows phone/i.test(userAgent);

  // Reading innerWidth on every pass was the cost (PERF-16 profile, 4.6c), so it is read only when the window
  // resizes. Not a (min-width) query: WebKit leaves a classic scrollbar out of it, so it is not the same test
  const wideViewport = signal(window.innerWidth >= 769);
  window.addEventListener('resize', () => wideViewport.set(window.innerWidth >= 769));

  // Set up here with the other inputs, so a variant of this function stays a local change (BL-19)
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = signal(reducedMotionQuery.matches);
  reducedMotionQuery.addEventListener('change', () => reducedMotion.set(reducedMotionQuery.matches));

  return {
    mouseWithoutTouch: mouseWithoutTouch.asReadonly(),
    mobileUserAgent,
    wideViewport: wideViewport.asReadonly(),
    reducedMotion: reducedMotion.asReadonly(),
  };
}
