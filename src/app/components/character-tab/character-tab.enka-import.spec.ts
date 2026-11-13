import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { OWNING_UID_STORAGE_KEY } from '../../constants/storage-keys';
import { Agent } from '../../models/agent.model';
import { AgentService } from '../../services/agent.service';
import { DbService } from '../../services/db.service';
import type { EnkaImportResult } from '../../services/enka-api.service';
import type { ImportComparison } from '../../services/enka-import.service';
import { CharacterTabComponent } from './character-tab.component';

type Confirmation = { title: string; message: string; confirmText: string };
/** The two private helpers under test, reached through a cast. */
type Internals = {
  buildImportConfirmation(uid: string, r: EnkaImportResult, summary: string, c: ImportComparison): Confirmation;
  buildNoChangesMessage(r: EnkaImportResult): string;
};

// The different-UID warning is folded into the import confirmation (user, 2026-11-12): it appears
// only when a previous import came from another UID and an existing build would be overwritten.
describe('CharacterTabComponent Enka import messages', () => {
  let internals: Internals;
  let http: HttpTestingController;

  const result = (builds: Array<{ agentId: string }> = [], extra: Partial<EnkaImportResult> = {}): EnkaImportResult =>
    ({
      uid: '200',
      playerName: 'Friend',
      builds,
      unknownAgentIds: [],
      showcaseCount: builds.length,
      ...extra,
    }) as unknown as EnkaImportResult; // only these fields are read

  const comparison = (updated: number, added: number): ImportComparison =>
    ({
      newBuilds: Array.from({ length: added }, () => ({})),
      updatedBuilds: Array.from({ length: updated }, () => ({ old: {}, new: {} })),
      unchangedBuilds: [],
      newDiscs: [],
    }) as unknown as ImportComparison; // only the array lengths are read

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    localStorage.removeItem(OWNING_UID_STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
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
    const component = TestBed.createComponent(CharacterTabComponent).componentInstance;
    component.ngOnInit();
    internals = component as unknown as Internals;
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    localStorage.removeItem(OWNING_UID_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('asks plainly when no import has completed on this device yet', () => {
    const c = internals.buildImportConfirmation('200', result(), 'Summary', comparison(2, 0));
    expect(c.title).toBe('Import from UID');
    expect(c.confirmText).toBe('Import');
  });

  it('asks plainly when re-importing the same UID', () => {
    localStorage.setItem(OWNING_UID_STORAGE_KEY, '200');
    const c = internals.buildImportConfirmation('200', result(), 'Summary', comparison(2, 0));
    expect(c.title).toBe('Import from UID');
  });

  it('warns when another UID would overwrite existing builds', () => {
    localStorage.setItem(OWNING_UID_STORAGE_KEY, '100');
    const c = internals.buildImportConfirmation('200', result(), 'Summary', comparison(1, 3));
    expect(c.title).toBe('Import from a different UID?');
    expect(c.confirmText).toBe('Overwrite my builds');
    expect(c.message).toContain('Your saved builds came from UID 100, but you are importing UID 200 (Friend).');
    expect(c.message).toContain('Summary');
    expect(c.message.endsWith('Continue?')).toBe(true);
  });

  it('does not warn when another UID only adds new builds', () => {
    localStorage.setItem(OWNING_UID_STORAGE_KEY, '100');
    const c = internals.buildImportConfirmation('200', result(), 'Summary', comparison(0, 3));
    expect(c.title).toBe('Import from UID');
  });

  it('names the showcased agents, sorted, when nothing changed', async () => {
    vi.spyOn(TestBed.inject(DbService), 'getAllAgents').mockResolvedValue([
      { id: '1631', name: 'Severian' } as Agent,
      { id: '1011', name: 'Anby' } as Agent, // only id and name are read
    ]);
    await TestBed.inject(AgentService).loadAgents();
    const message = internals.buildNoChangesMessage(result([{ agentId: '1631' }, { agentId: '1011' }]));
    expect(message).toBe(
      'Your showcased agents (Anby, Severian) are already up to date. Only agents in your in-game ' +
        "Character Showcase can be imported; other agents weren't changed.",
    );
  });
});
