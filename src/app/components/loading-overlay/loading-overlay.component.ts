import { Component, ChangeDetectionStrategy, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';

@Component({
  selector: 'app-loading-overlay',
  imports: [],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingOverlayComponent implements OnDestroy {
  readonly bangbooVideo = viewChild<ElementRef<HTMLVideoElement>>('bangbooVideo');
  readonly message = input('Loading...');

  readonly show = input(false);

  private playVideoTimeout: any;

  constructor() {
    // Try to play the video whenever the overlay becomes visible, including when it starts visible
    // (the old input setter and ngAfterViewInit did this between them)
    effect(() => {
      if (this.show()) {
        this.playVideo();
      }
    });
  }

  private playVideo(): void {
    // Clear any existing timeout
    if (this.playVideoTimeout) {
      clearTimeout(this.playVideoTimeout);
    }

    // Use setTimeout to ensure DOM is ready
    this.playVideoTimeout = setTimeout(() => {
      const bangbooVideo = this.bangbooVideo();
      if (bangbooVideo?.nativeElement) {
        const video = bangbooVideo.nativeElement;

        // Explicitly set muted to true BEFORE calling play
        // This is critical for browser autoplay policies
        video.muted = true;
        video.setAttribute('muted', 'true');

        video.play().catch((err) => {
          // Autoplay failed - this is expected in some browsers/contexts
          console.warn('[Loading Overlay] Video autoplay blocked:', err);
        });
      }
    }, 0);
  }

  ngOnDestroy(): void {
    // Clean up timeout on component destruction
    if (this.playVideoTimeout) {
      clearTimeout(this.playVideoTimeout);
    }
  }
}
