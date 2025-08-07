import { Component } from '@angular/core';
import { EditorWebcamComponent } from '../../../web-obs/src/public-api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EditorWebcamComponent],
  template: `
    <h1 class="text-4xl w-full text-center font-bold text-blue-600">WebOBS</h1>
    <WebOBS></WebOBS>
  `,
})
export class AppComponent {}
