import { Component } from '@angular/core';
import { EditorWebcamComponent } from '../../../web-obs/src/public-api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EditorWebcamComponent],
  templateUrl: './app.html',
})
export class AppComponent {}
