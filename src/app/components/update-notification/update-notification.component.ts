import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';

import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SwUpdateService } from '../../services/sw-update.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-update-notification',
  imports: [],
  templateUrl: './update-notification.component.html',
  styleUrl: './update-notification.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateNotificationComponent implements OnInit, OnDestroy {
  private readonly swUpdateService = inject(SwUpdateService);

  readonly updateAvailable = signal(false);
  showDevTestButton = !environment.production; // Only show in development
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Subscribe to update availability
    this.swUpdateService.updateAvailable.pipe(takeUntil(this.destroy$)).subscribe((available) => {
      this.updateAvailable.set(available);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Apply the update (reload the page)
  applyUpdate(): void {
    this.swUpdateService.applyUpdate();
  }

  // DEV ONLY: Manually trigger update notification for testing
  testUpdateNotification(): void {
    this.updateAvailable.set(true);
  }
}
