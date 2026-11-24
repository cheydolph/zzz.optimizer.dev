import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { WhatsNewComponent } from './whats-new.component';

// NG-04 (slice 4.7b): the component is OnPush and its state is signals. The changelog must still replace
// the loading message once it arrives, and a failed load must still show the error.
describe('WhatsNewComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('last_viewed_version');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('last_viewed_version');
    vi.restoreAllMocks();
  });

  function setup() {
    const fixture = TestBed.createComponent(WhatsNewComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const req = httpMock.expectOne((r) => r.url.startsWith('assets/data/changelog.json'));
    return { fixture, el, req };
  }

  it('renders the changelog after it loads and records the viewed version', async () => {
    const { fixture, el, req } = setup();
    expect(el.querySelector('.loading-message')).not.toBeNull();

    req.flush({
      versions: [
        { version: '9.9.9', date: '2026-01-02', features: ['A'], fixes: [], improvements: ['B'] },
        { version: '9.9.8', date: '2026-01-01', features: [], fixes: [], improvements: [] },
      ],
    });
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();

    expect(el.querySelector('.loading-message')).toBeNull();
    expect(el.querySelectorAll('.version-card').length).toBe(2);
    expect(el.querySelectorAll('.changelog-category li').length).toBe(2);
    expect(el.querySelectorAll('.no-content').length).toBe(1);
    expect(localStorage.getItem('last_viewed_version')).toBe(environment.appVersion);
  });

  it('shows the error message when the changelog fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, el, req } = setup();

    req.flush(null, { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => expect(fixture.componentInstance.error()).toBe(true));
    fixture.detectChanges();

    expect(el.querySelector('.loading-message')).toBeNull();
    expect(el.querySelector('.error-message')).not.toBeNull();
    expect(el.querySelector('.version-card')).toBeNull();
    expect(localStorage.getItem('last_viewed_version')).toBeNull();
  });
});
