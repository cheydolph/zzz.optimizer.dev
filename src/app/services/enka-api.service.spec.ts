import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DbService } from './db.service';
import { ENKA_INVALID_UID_MESSAGE, ENKA_NOT_CONFIGURED_MESSAGE } from '../constants/enka-messages';
import { EnkaApiService } from './enka-api.service';

// BUILD-16: imports go only through our own Worker. Without one the import fails with a message
// instead of falling back to public CORS proxies, and a failed request never moves to another host.
describe('EnkaApiService request routing', () => {
  const WORKER = 'https://worker.example.test/';
  let service: EnkaApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DbService, useValue: { getAllAgents: async () => [], getAllWEngines: async () => [] } },
      ],
    });
    service = TestBed.inject(EnkaApiService);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
  });

  /** The test environment stub has no Worker URL; this sets one on the instance. */
  function configureWorker(url: string): void {
    // The field is private and readonly; tests set it the way environment.enkaProxyUrl would.
    (service as unknown as { CLOUDFLARE_WORKER: string }).CLOUDFLARE_WORKER = url;
  }

  it('fails with the not-configured message and sends nothing when no Worker is set', async () => {
    await expect(firstValueFrom(service.fetchPlayerData('12345678'))).rejects.toThrow(ENKA_NOT_CONFIGURED_MESSAGE);
  });

  it('rejects a UID that is not digits before sending anything', async () => {
    configureWorker(WORKER);
    await expect(firstValueFrom(service.fetchPlayerData('12ab'))).rejects.toThrow(ENKA_INVALID_UID_MESSAGE);
  });

  it('asks the Worker for a fresh profile, with the UID trimmed and encoded', async () => {
    configureWorker(WORKER);
    const result = firstValueFrom(service.fetchPlayerData(' 12345678 '));
    const req = http.expectOne(`${WORKER}?uid=12345678&fresh=1`);
    req.flush({ PlayerInfo: { SocialDetail: { ProfileDetail: { Nickname: 'Proxy', Level: 60 } } } });
    const data = await result;
    expect(data.playerName).toBe('Proxy');
    expect(data.builds).toEqual([]);
  });

  it('keeps using the Worker after a network failure (no rotation to another host)', async () => {
    configureWorker(WORKER);
    const first = firstValueFrom(service.fetchPlayerData('12345678'));
    http.expectOne(`${WORKER}?uid=12345678&fresh=1`).error(new ProgressEvent('error'), { status: 0 });
    await expect(first).rejects.toThrow('Could not reach the import service');

    const second = firstValueFrom(service.fetchPlayerData('12345678'));
    const req = http.expectOne((r) => r.url.startsWith(WORKER));
    req.flush({ PlayerInfo: { SocialDetail: { ProfileDetail: { Nickname: 'Proxy', Level: 60 } } } });
    await expect(second).resolves.toMatchObject({ playerName: 'Proxy' });
  });

  it('treats a 200 without PlayerInfo as an unreachable API, not as a profile', async () => {
    configureWorker(WORKER);
    const result = firstValueFrom(service.fetchPlayerData('12345678'));
    http.expectOne(`${WORKER}?uid=12345678&fresh=1`).flush('<html>captive portal</html>');
    await expect(result).rejects.toThrow('The API is not responding right now');
  });
});
