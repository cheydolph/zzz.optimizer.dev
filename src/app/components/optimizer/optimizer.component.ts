import { Component, ChangeDetectionStrategy } from '@angular/core';


@Component({
  selector: 'app-optimizer',
  imports: [],
  templateUrl: './optimizer.component.html',
  styleUrls: ['./optimizer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OptimizerComponent {
  // This component just displays scoring documentation
  // No actual optimization functionality
}
