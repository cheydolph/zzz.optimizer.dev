import { TestBed } from '@angular/core/testing';
import { InfoDialogComponent } from './info-dialog.component';

// jsdom has no HTMLDialogElement.showModal()/close(), so these tests exercise the attribute
// fallback; the native behaviour (top layer, inert page, Esc, focus return) is checked end to end
// in a real browser (trunk-review/info-dialog-e2e.mjs).
describe('InfoDialogComponent', () => {
  function setup(open: boolean) {
    const fixture = TestBed.createComponent(InfoDialogComponent);
    fixture.componentRef.setInput('open', open);
    fixture.componentRef.setInput('heading', 'Import failed');
    fixture.componentRef.setInput('message', 'Line one\nLine two');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    return { fixture, dialog, closed };
  }

  it('stays closed until opened, then shows the heading and message', () => {
    const { fixture, dialog } = setup(false);
    expect(dialog.hasAttribute('open')).toBe(false);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.querySelector('h2')?.textContent).toBe('Import failed');
    expect(dialog.querySelector('.info-dialog-message')?.textContent).toBe('Line one\nLine two');
  });

  it('emits closed once and hides when the button is pressed', () => {
    const { dialog, closed } = setup(true);
    (dialog.querySelector('button') as HTMLButtonElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('treats a click on the dialog element itself as a backdrop click', () => {
    const { dialog, closed } = setup(true);
    dialog.querySelector('.info-dialog-box')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed).not.toHaveBeenCalled();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes when the parent sets open to false', () => {
    const { fixture, dialog } = setup(true);
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
