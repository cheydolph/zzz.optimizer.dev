import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NavigationComponent } from './components/navigation/navigation.component';
import { FooterComponent } from './components/footer/footer.component';
import { LoadingOverlayComponent } from './components/loading-overlay/loading-overlay.component';
import { NotificationComponent } from './components/notification/notification.component';
import { UpdateNotificationComponent } from './components/update-notification/update-notification.component';
import { AppInitService } from './services/app-init.service';
import { LoadingService } from './services/loading.service';
import { SwUpdateService } from './services/sw-update.service';
import { SeoService } from './services/seo.service';
import { AnniversaryService } from './services/anniversary.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    NavigationComponent,
    FooterComponent,
    LoadingOverlayComponent,
    NotificationComponent,
    UpdateNotificationComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly appInit = inject(AppInitService);
  private readonly loadingService = inject(LoadingService);
  private readonly swUpdate = inject(SwUpdateService);
  private readonly seo = inject(SeoService);
  private readonly anniversary = inject(AnniversaryService);

  title = 'zzz.optimizer';
  readonly isLoading = signal(false);
  readonly loadingMessage = signal('Loading...');
  private destroy$ = new Subject<void>();

  async ngOnInit() {
    // Initialize SEO structured data
    this.seo.addStructuredData();

    // Initialize Service Worker update checking (clears caches on version change)
    await this.swUpdate.init();

    // Subscribe to loading state
    this.loadingService.loading$.pipe(takeUntil(this.destroy$)).subscribe((loading) => {
      this.isLoading.set(loading);
    });

    this.loadingService.message$.pipe(takeUntil(this.destroy$)).subscribe((message) => {
      this.loadingMessage.set(message);
    });

    // Auto-load reference data on app startup
    await this.appInit.initialize();

    // Check for anniversary celebration (January 10th)
    this.anniversary.checkAndCelebrate();

    // TEST ONLY: Expose anniversary test to window for console testing
    // Usage: Open console and run window['testAnniversary']()
    (window as any)['testAnniversary'] = () => this.anniversary.testCelebration();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
