import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { CharacterTabComponent } from './character-tab.component';

// NG-09 (slice 4.7b): the window keydown and resize listeners moved from @HostListener to `host`; the scroll
// listener is registered outside the Angular zone (passive) and removed when the component is destroyed (PERF-17).
describe('CharacterTabComponent window listeners', () => {
  let fixture: ComponentFixture<CharacterTabComponent>;
  let component: CharacterTabComponent;
  let http: HttpTestingController;
  const saved = { pageYOffset: window.pageYOffset, innerWidth: window.innerWidth };

  const setWindow = (name: 'pageYOffset' | 'innerWidth', value: number) =>
    Object.defineProperty(window, name, { value, configurable: true, writable: true });
  const scrollTo = (y: number) => {
    setWindow('pageYOffset', y);
    window.dispatchEvent(new Event('scroll'));
  };

  beforeEach(() => {
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
    // Not rendered: the listeners are registered when the component is created
    fixture = TestBed.createComponent(CharacterTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    setWindow('pageYOffset', saved.pageYOffset);
    setWindow('innerWidth', saved.innerWidth);
    vi.restoreAllMocks();
  });

  it('shows the scroll-to-top button past 300 px on mobile, marking the view only when it toggles', () => {
    // the component's own ChangeDetectorRef (private), reached through a cast
    const markForCheck = vi.spyOn((component as unknown as { cdr: ChangeDetectorRef }).cdr, 'markForCheck');
    component.isMobile = true;

    scrollTo(301);
    expect(component.showScrollTopButton).toBe(true);
    scrollTo(600);
    expect(component.showScrollTopButton).toBe(true);
    scrollTo(299);
    expect(component.showScrollTopButton).toBe(false);
    expect(markForCheck).toHaveBeenCalledTimes(2);

    component.isMobile = false;
    scrollTo(900);
    expect(component.showScrollTopButton).toBe(false);
  });

  it('registers the scroll listener passive and outside the Angular zone, and removes it on destroy', () => {
    fixture.destroy();
    // Record how a fresh instance registers its scroll listener (the zone is read at registration time: jsdom's
    // dispatchEvent runs listeners in the caller's zone, so a dispatched event cannot show it)
    const added: { listener: EventListenerOrEventListenerObject; inZone: boolean; options: unknown }[] = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'scroll') added.push({ listener, inZone: NgZone.isInAngularZone(), options });
      add(type, listener, options);
    });
    const remove = vi.spyOn(window, 'removeEventListener');
    const zone = TestBed.inject(NgZone);
    expect(zone.run(() => NgZone.isInAngularZone())).toBe(true); // a real zone, so inZone below means something

    fixture = zone.run(() => TestBed.createComponent(CharacterTabComponent));
    const handler = vi.spyOn(fixture.componentInstance, 'onWindowScroll');
    expect(added).toEqual([{ listener: expect.any(Function), inZone: false, options: { passive: true } }]);

    scrollTo(400);
    expect(handler).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(remove).toHaveBeenCalledWith('scroll', added[0].listener);
    scrollTo(500);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still updates isMobile on resize and closes a dialog on Escape', () => {
    setWindow('innerWidth', 800);
    window.dispatchEvent(new Event('resize'));
    expect(component.isMobile).toBe(true);
    setWindow('innerWidth', 1366);
    window.dispatchEvent(new Event('resize'));
    expect(component.isMobile).toBe(false);

    component.showConfirmDialog = true;
    const escapeKey = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escapeKey);
    expect(component.showConfirmDialog).toBe(false);
    expect(escapeKey.defaultPrevented).toBe(true);
  });
});
