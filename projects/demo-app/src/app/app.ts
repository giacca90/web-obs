import { Component } from '@angular/core';
import { WebOBS } from '../../../web-obs/src/public-api';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [WebOBS],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class AppComponent {}
