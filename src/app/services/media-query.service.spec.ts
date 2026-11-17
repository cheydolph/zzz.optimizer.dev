import { MediaQueryService } from './media-query.service';

// PERF-16: the touch check, the user-agent test, the pointer query, and the 769 px width test run once; the pointer
// query again when it changes, the width test again on a window resize. jsdom has no matchMedia, so each test installs
// a fake query it can fire.
function fakeMatchMedia(coarse: boolean) {
  const listeners: Array<() => void> = [];
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query === '(pointer: coarse)' ? coarse : false;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
  }));
  const changePointer = (value: boolean) => {
    coarse = value;
    for (const listener of listeners) listener();
  };
  return { matchMedia, changePointer };
}

// Removes `ontouchstart` from wherever jsdom defines it on the window's prototype chain, for a device without touch
function removeTouchHandler(): () => void {
  let owner: object | null = window;
  while (owner && !Object.hasOwn(owner, 'ontouchstart')) owner = Object.getPrototypeOf(owner);
  if (!owner) return () => undefined;
  const target = owner;
  const descriptor = Object.getOwnPropertyDescriptor(target, 'ontouchstart');
  delete (target as { ontouchstart?: unknown }).ontouchstart;
  return () => {
    if (descriptor) Object.defineProperty(target, 'ontouchstart', descriptor);
  };
}

function resizeTo(width: number) {
  vi.stubGlobal('innerWidth', width);
  window.dispatchEvent(new Event('resize'));
}

function stubNavigator(name: 'maxTouchPoints' | 'userAgent', value: number | string) {
  Object.defineProperty(navigator, name, { configurable: true, get: () => value });
}

describe('MediaQueryService', () => {
  let restoreTouchHandler: () => void = () => undefined;

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreTouchHandler();
    restoreTouchHandler = () => undefined;
    delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    delete (navigator as { userAgent?: string }).userAgent;
  });

  it('on a touch device with a desktop user agent, reads the width once and again only on a resize', () => {
    stubNavigator('maxTouchPoints', 5);
    const media = fakeMatchMedia(true);
    vi.stubGlobal('matchMedia', media.matchMedia);
    vi.stubGlobal('innerWidth', 360);
    const service = new MediaQueryService();

    expect(service.isDesktopDevice()).toBe(false);
    vi.stubGlobal('innerWidth', 1366);
    expect(service.isDesktopDevice()).toBe(false);
    resizeTo(769);
    expect(service.isDesktopDevice()).toBe(true);
    resizeTo(768);
    expect(service.isDesktopDevice()).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledTimes(1);
  });

  it('treats a mouse without touch as a desktop at any width, until the pointer becomes coarse', () => {
    restoreTouchHandler = removeTouchHandler();
    stubNavigator('maxTouchPoints', 0);
    const media = fakeMatchMedia(false);
    vi.stubGlobal('matchMedia', media.matchMedia);
    vi.stubGlobal('innerWidth', 360);
    const service = new MediaQueryService();

    expect(service.isDesktopDevice()).toBe(true);
    media.changePointer(true);
    expect(service.isDesktopDevice()).toBe(false);
    resizeTo(1366);
    expect(service.isDesktopDevice()).toBe(true);
  });

  it('does not treat a mobile user agent as a desktop at desktop widths', () => {
    stubNavigator('maxTouchPoints', 5);
    stubNavigator('userAgent', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36');
    vi.stubGlobal('matchMedia', fakeMatchMedia(true).matchMedia);
    vi.stubGlobal('innerWidth', 1366);

    expect(new MediaQueryService().isDesktopDevice()).toBe(false);
  });
});
