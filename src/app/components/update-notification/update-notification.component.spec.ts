import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwUpdateService } from '../../services/sw-update.service';
import { UpdateNotificationComponent } from './update-notification.component';

// NG-04 (slice 4.7b): the component is OnPush and `updateAvailable` is a signal. The banner must still
// appear when the service reports an update, and the dev test button must still toggle it.
describe('UpdateNotificationComponent', () => {
  let available: BehaviorSubject<boolean>;
  let applyUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    available = new BehaviorSubject(false);
    applyUpdate = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdateService, useValue: { updateAvailable: available.asObservable(), applyUpdate } }],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const fixture = TestBed.createComponent(UpdateNotificationComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el };
  }

  it('shows the banner when the service reports an update, and applies it on click', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('.update-notification')).toBeNull();

    available.next(true);
    fixture.detectChanges();
    expect(el.querySelector('.update-notification')).not.toBeNull();
    expect(el.querySelector('.dev-test-button')).toBeNull();

    (el.querySelector('.update-button') as HTMLButtonElement).click();
    expect(applyUpdate).toHaveBeenCalledTimes(1);

    available.next(false);
    fixture.detectChanges();
    expect(el.querySelector('.update-notification')).toBeNull();
  });

  it('shows the banner from the dev test button', () => {
    const { fixture, el } = setup();
    const testButton = el.querySelector('.dev-test-button') as HTMLButtonElement;
    expect(testButton).not.toBeNull();

    testButton.click();
    fixture.detectChanges();
    expect(el.querySelector('.update-notification')).not.toBeNull();
    expect(el.querySelector('.dev-test-button')).toBeNull();
  });
});
