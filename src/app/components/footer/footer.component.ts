import { Component, ChangeDetectionStrategy } from '@angular/core';

import { RouterLink } from '@angular/router';
import { version } from '../../../../package.json';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  version = version;
  currentYear = new Date().getFullYear();
}
