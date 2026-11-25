import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { CharacterTabComponent } from './character-tab.component';

// CC-48 (slice 4.8a): Escape closes the first open entry of an ordered list and Enter confirms in its own method.
// The order and the Enter targets are the ones the former else-if chains had.
describe('CharacterTabComponent keyboard shortcuts', () => {
  let component: CharacterTabComponent;
  let http: HttpTestingController;

  const press = (key: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', { key, shiftKey, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
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
    // Not rendered: the host listeners are registered when the component is created
    component = TestBed.createComponent(CharacterTabComponent).componentInstance;
  });

  afterEach(() => {
    for (const req of http.match(() => true)) req.flush({}, { status: 404, statusText: 'Not Found' });
    vi.restoreAllMocks();
  });

  it('closes one open modal per Escape, in the fixed priority order', () => {
    const closed: string[] = [];
    // Each close method is replaced by one that records the call and clears its flag
    const closer =
      (flag: 'showConfirmDialog' | 'showAddAgentModal' | 'showCompareModal' | 'showDiscPicker' | 'showDiscForm') =>
      () => {
        closed.push(flag);
        component[flag] = false;
      };
    vi.spyOn(component, 'closeConfirmDialog').mockImplementation(closer('showConfirmDialog'));
    vi.spyOn(component, 'closeAddAgentModal').mockImplementation(closer('showAddAgentModal'));
    vi.spyOn(component, 'closeCompareModal').mockImplementation(closer('showCompareModal'));
    vi.spyOn(component, 'closeDiscPicker').mockImplementation(closer('showDiscPicker'));
    vi.spyOn(component, 'closeDiscForm').mockImplementation(closer('showDiscForm'));
    component.showConfirmDialog = true;
    component.showAddAgentModal = true;
    component.showCompareModal = true;
    component.showDiscPicker = true;
    component.showDiscForm = true;
    component.showWEnginePicker = true;

    for (let i = 0; i < 5; i++) expect(press('Escape')).toBe(true);
    expect(closed).toEqual([
      'showConfirmDialog',
      'showAddAgentModal',
      'showCompareModal',
      'showDiscPicker',
      'showDiscForm',
    ]);
    expect(component.showWEnginePicker).toBe(true);

    expect(press('Escape')).toBe(true);
    expect(component.showWEnginePicker).toBe(false);
    // nothing open: Escape is left alone
    expect(press('Escape')).toBe(false);
  });

  it('confirms with Enter in the confirm dialog first, then Add Agent with a choice, then the disc form', () => {
    const confirm = vi.spyOn(component, 'confirmAction').mockImplementation(() => undefined);
    const add = vi.spyOn(component, 'addAgentBuild').mockImplementation(() => Promise.resolve());
    const save = vi.spyOn(component, 'createAndEquipDisc').mockImplementation(() => Promise.resolve());

    expect(press('Enter')).toBe(false);

    component.showConfirmDialog = true;
    component.showAddAgentModal = true;
    component.showDiscForm = true;
    expect(press('Enter', true)).toBe(false);
    expect(press('Enter')).toBe(true);
    expect([confirm.mock.calls.length, add.mock.calls.length, save.mock.calls.length]).toEqual([1, 0, 0]);

    component.showConfirmDialog = false;
    // Add Agent without a chosen agent does not take Enter; the disc form does
    expect(press('Enter')).toBe(true);
    expect([confirm.mock.calls.length, add.mock.calls.length, save.mock.calls.length]).toEqual([1, 0, 1]);

    // the handler only checks that an agent is chosen; addAgentBuild is mocked, so an empty object is enough
    component.selectedAgentForAdd = {} as CharacterTabComponent['selectedAgentForAdd'];
    expect(press('Enter')).toBe(true);
    expect([confirm.mock.calls.length, add.mock.calls.length, save.mock.calls.length]).toEqual([1, 1, 1]);
  });
});
