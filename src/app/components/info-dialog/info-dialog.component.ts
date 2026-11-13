import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

/**
 * An acknowledgement-only message in the browser's native modal `<dialog>`, the in-app replacement
 * for `alert()` (COPY-Q17). `showModal()` puts it in the top layer and makes the page behind inert,
 * Esc closes it, and the browser returns focus to whatever opened it. Chosen over a hand-built
 * overlay and over CDK Dialog on 2026-11-12 (no added bundle, works on desktop and mobile).
 *
 * Decorator inputs and outputs, not `input()`/`output()` (user decision 2026-11-12): as the app's
 * first signal-API component it added 3.08 kB to the initial bundle for no measurable gain. The
 * planned signal migrations convert it together with the other components.
 */
@Component({
  selector: 'app-info-dialog',
  templateUrl: './info-dialog.component.html',
  styleUrl: './info-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoDialogComponent implements AfterViewInit {
  @Input() set open(value: boolean) {
    this.isOpen = value;
    this.syncOpenState();
  }
  @Input() heading = '';
  @Input() message = '';
  @Input() dismissText = 'OK';
  /** Emitted once per close, whether by the button, Esc, or a click on the backdrop. */
  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('dialog', { static: true }) private readonly dialogRef?: ElementRef<HTMLDialogElement>;
  private isOpen = false;

  ngAfterViewInit(): void {
    this.syncOpenState();
  }

  protected dismiss(): void {
    const el = this.dialogRef?.nativeElement;
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
    if (event.target === this.dialogRef?.nativeElement) {
      this.dismiss();
    }
  }

  /** The dialog API is imperative; keep the element in step with the `open` input. */
  private syncOpenState(): void {
    const el = this.dialogRef?.nativeElement;
    if (!el) return; // before the view exists; ngAfterViewInit syncs again
    if (this.isOpen && !el.open) {
      // The attribute fallback covers environments without the API (jsdom in tests).
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!this.isOpen && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }
}
