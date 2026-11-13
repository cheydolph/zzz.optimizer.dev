import { trigger, transition, style, query, animate, group } from '@angular/animations';

/**
 * Fade in/out animation for elements (modal overlays).
 *
 * Shortened from 300/200 ms (trunk `f853ffa`, to make modals feel quicker). The 2026-11-12 A/B
 * measured no change in the modal-open Event Timing steps from this.
 * TODO(zzz): slice 4.7a compares these durations with the longer ones (user decision 2026-11-12).
 */
export const fadeIn = trigger('fadeIn', [
  transition(':enter', [style({ opacity: 0 }), animate('140ms ease-out', style({ opacity: 1 }))]),
  transition(':leave', [animate('100ms ease-in', style({ opacity: 0 }))]),
]);

/**
 * Fade in and up animation
 */
export const fadeInUp = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

/**
 * Fast fade in animation for list items (faster for better performance)
 */
export const fadeInFast = trigger('fadeInFast', [
  transition(':enter', [style({ opacity: 0 }), animate('150ms ease-out', style({ opacity: 1 }))]),
]);

/**
 * Scale in/out animation for cards and modals.
 *
 * Shortened from 300/200 ms at scale 0.95 (trunk `f853ffa`); the subtler 0.97 keeps the motion
 * readable at the shorter duration. Under `@fadeIn` this trigger never runs (GPU-04, slice 4.7a).
 * TODO(zzz): slice 4.7a compares these durations with the longer ones (user decision 2026-11-12).
 */
export const scaleIn = trigger('scaleIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.97)' }),
    animate('140ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
  ]),
  transition(':leave', [animate('100ms ease-in', style({ opacity: 0, transform: 'scale(0.97)' }))]),
]);

/**
 * Slide in from right (for notifications)
 */
export const slideInRight = trigger('slideInRight', [
  transition(':enter', [
    style({ transform: 'translateX(100%)', opacity: 0 }),
    animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
  ]),
  transition(':leave', [animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))]),
]);

/**
 * List stagger animation - animates list items one after another
 */
export const listStagger = trigger('listStagger', [
  transition('* => *', [
    query(
      ':enter',
      [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms {{delay}}ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ],
      { optional: true, params: { delay: 50 } },
    ),
  ]),
]);

/**
 * Expand/collapse animation for accordions.
 *
 * Animating height forces layout on every frame (GPU-16, slice 4.7a), so it was shortened from
 * 300/200 ms (trunk `f853ffa`) to keep that work brief.
 * TODO(zzz): slice 4.7a compares these durations with the longer ones (user decision 2026-11-12).
 */
export const expandCollapse = trigger('expandCollapse', [
  transition(':enter', [
    style({ height: 0, opacity: 0 }),
    animate('140ms ease-out', style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [animate('100ms ease-in', style({ height: 0, opacity: 0 }))]),
]);
