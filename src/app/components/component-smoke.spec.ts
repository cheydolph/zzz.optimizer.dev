import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';

import { CharacterTabComponent } from './character-tab/character-tab.component';
import { CreditsComponent } from './credits/credits.component';
import { DataManagerComponent } from './data-manager/data-manager.component';
import { FooterComponent } from './footer/footer.component';
import { LoadingOverlayComponent } from './loading-overlay/loading-overlay.component';
import { NavigationComponent } from './navigation/navigation.component';
import { NotificationComponent } from './notification/notification.component';
import { OptimizerComponent } from './optimizer/optimizer.component';
import { PrivacyPolicyComponent } from './privacy-policy/privacy-policy.component';
import { UpdateNotificationComponent } from './update-notification/update-notification.component';
import { UpgradePlansComponent } from './upgrade-plans/upgrade-plans.component';
import { WhatsNewComponent } from './whats-new/whats-new.component';
import { MediaQueryService } from '../services/media-query.service';

/**
 * Smoke tests: every component must construct and complete a first change
 * detection pass without throwing.
 *
 * These are deliberately shallow. Their job is to catch the failure mode the
 * performance work is most likely to introduce - a component that no longer
 * initialises because a dependency became lazy, a template binding was
 * converted to a signal incorrectly, or change detection was reconfigured.
 * They are a tripwire, not a behavioural specification.
 */

/** Components with no required @Input()s, safe to create bare. */
const COMPONENTS: Array<[string, Type<unknown>]> = [
  ['CreditsComponent', CreditsComponent],
  ['FooterComponent', FooterComponent],
  ['LoadingOverlayComponent', LoadingOverlayComponent],
  ['NavigationComponent', NavigationComponent],
  ['NotificationComponent', NotificationComponent],
  ['OptimizerComponent', OptimizerComponent],
  ['PrivacyPolicyComponent', PrivacyPolicyComponent],
  ['UpdateNotificationComponent', UpdateNotificationComponent],
  ['UpgradePlansComponent', UpgradePlansComponent],
  ['WhatsNewComponent', WhatsNewComponent],
  ['DataManagerComponent', DataManagerComponent],
  ['CharacterTabComponent', CharacterTabComponent],
];

describe('component smoke tests', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    // Components and their services log load failures; the deliberate 404s
    // below would otherwise bury real failures in console noise.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // jsdom has no matchMedia; LoadingOverlayComponent reads the reduced-motion query when it is created
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // The service worker is not registered under test; SwUpdateService
        // depends on SwUpdate, so supply an inert stand-in.
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
    httpMock = TestBed.inject(HttpTestingController);
  });

  /** Answer every outstanding data request with a 404 so nothing hangs. */
  function flushPendingRequests(): void {
    for (const r of httpMock.match(() => true)) {
      r.flush({}, { status: 404, statusText: 'Not Found' });
    }
  }

  afterEach(() => {
    flushPendingRequests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const [name, component] of COMPONENTS) {
    describe(name, () => {
      it('is created', () => {
        const fixture = TestBed.createComponent(component);
        flushPendingRequests();
        expect(fixture.componentInstance).toBeTruthy();
      });

      it('completes a first change detection pass', () => {
        const fixture = TestBed.createComponent(component);
        expect(() => {
          fixture.detectChanges();
          flushPendingRequests();
        }).not.toThrow();
      });

      it('renders without throwing on a second pass', () => {
        const fixture = TestBed.createComponent(component);
        fixture.detectChanges();
        flushPendingRequests();
        expect(() => fixture.detectChanges()).not.toThrow();
      });

      it('destroys cleanly', () => {
        const fixture = TestBed.createComponent(component);
        fixture.detectChanges();
        flushPendingRequests();
        expect(() => fixture.destroy()).not.toThrow();
      });
    });
  }

  // Slice 4.7a: under reduced motion the build view shows the static W-Engine icon instead of the looping video
  describe('CharacterTabComponent W-Engine icon', () => {
    const wEngine = { icon: 'assets/data/images/wengines/Weapon_S_1051.webp' };
    const cases = [
      [true, false, true],
      [true, true, false],
      [false, false, false],
      [false, true, false],
    ] as const;
    for (const [desktop, reduced, animated] of cases) {
      it(`is ${animated ? 'animated' : 'static'} on a ${desktop ? 'desktop' : 'phone'} with reduced motion ${reduced ? 'on' : 'off'}`, () => {
        // The root instance the component injects; afterEach restores the spies
        const media = TestBed.inject(MediaQueryService);
        vi.spyOn(media, 'isDesktopDevice').mockReturnValue(desktop);
        vi.spyOn(media, 'prefersReducedMotion').mockReturnValue(reduced);
        const component = TestBed.createComponent(CharacterTabComponent).componentInstance;
        flushPendingRequests();
        expect(component.isWEngineAnimated(wEngine)).toBe(animated);
      });
    }
  });
});
