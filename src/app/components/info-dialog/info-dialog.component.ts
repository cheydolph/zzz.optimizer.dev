import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * An acknowledgement-only message in the browser's native modal `<dialog>`, the in-app replacement
 * for `alert()` (COPY-Q17). `showModal()` puts it in the top layer and makes the page behind inert,
 * Esc closes it, and the browser returns focus to whatever opened it. Chosen over a hand-built
 * overlay and over CDK Dialog on 2026-11-12 (no added bundle, works on desktop and mobile).
 *
 * Signal inputs, output, and view query since slice 4.7b (NG-10). They were kept as decorators on
 * 2026-11-12 (user decision) until the planned migrations converted the components together.
 */
@Component({
  selector: 'app-info-dialog',
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoDialogComponent implements AfterViewInit {
  readonly open = input(false);
  readonly heading = input('');
  readonly message = input('');
  readonly dismissText = input('OK');
  /** Emitted once per close, whether by the button, Esc, or a click on the backdrop. */
  readonly closed = output<void>();

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Runs whenever `open` changes (as the old input setter did) and once the dialog element exists
    effect(() => this.syncOpenState());
  }

  ngAfterViewInit(): void {
    this.syncOpenState();
  }

  protected dismiss(): void {
    const el = this.dialogRef()?.nativeElement;
    if (!el) return;
    if (typeof el.close === 'function') {
      el.close(); // fires the native close event, which emits `closed`
    } else {
      el.removeAttribute('open');
      this.closed.emit();
    }
  }

  /** Native `close` event: the button, Esc, and backdrop clicks all end here. */
  protected onClose(): void {
    this.closed.emit();
  }

  /** A click on the dialog element itself (not its content box) is a click on the backdrop. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogRef()?.nativeElement) {
      this.dismiss();
    }
  }

  /** The dialog API is imperative; keep the element in step with the `open` input. */
  private syncOpenState(): void {
    const el = this.dialogRef()?.nativeElement;
    if (!el) return; // before the view exists; ngAfterViewInit syncs again
    if (this.open() && !el.open) {
      // The attribute fallback covers environments without the API (jsdom in tests).
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!this.open() && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }
}
