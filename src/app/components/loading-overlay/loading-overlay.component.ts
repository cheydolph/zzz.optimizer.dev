import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  OnDestroy,
  type Signal,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-loading-overlay',
  imports: [],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingOverlayComponent implements OnDestroy {
  readonly logoVideo = viewChild<ElementRef<HTMLVideoElement>>('logoVideo');
  readonly bangbooVideo = viewChild<ElementRef<HTMLVideoElement>>('bangbooVideo');
  readonly message = input('Loading...');

  readonly show = input(false);

  private readonly reducedMotion = reducedMotionSignal(inject(DestroyRef));
  /** False under reduced motion: both videos then stay on their poster (the logo) or first frame (the Bangboo) */
  protected readonly motionAllowed = computed(() => !this.reducedMotion());

  private videoTimeout: any;

  constructor() {
    // Whenever the overlay becomes visible (including when it starts visible) or the reduced-motion setting changes
    // while it shows, start or stop both videos
    effect(() => {
      if (this.show()) {
        this.applyMotion(this.motionAllowed());
      }
    });
  }

  private applyMotion(play: boolean): void {
    // Clear any existing timeout
    if (this.videoTimeout) {
      clearTimeout(this.videoTimeout);
    }

    // Use setTimeout to ensure DOM is ready
    this.videoTimeout = setTimeout(() => {
      for (const ref of [this.logoVideo(), this.bangbooVideo()]) {
        const video = ref?.nativeElement;
        if (!video) continue;
        if (!play) {
          video.pause();
          continue;
        }

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
    if (this.videoTimeout) {
      clearTimeout(this.videoTimeout);
    }
  }
}

// Read here rather than through MediaQueryService: the overlay is in the initial bundle, and importing that service
// from it moves the service into a shared initial chunk, which takes one of the build's 10 modulepreload slots and
// pushes the Angular core chunk out of them (BUILD-23; seen in slice 4.8a)
function reducedMotionSignal(destroyRef: DestroyRef): Signal<boolean> {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = signal(query.matches);
  const onChange = () => reduced.set(query.matches);
  query.addEventListener('change', onChange);
  destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  return reduced.asReadonly();
}
