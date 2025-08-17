import { NgModule } from '@angular/core';
import { WebOBS } from './editor-webcam/web-obs';

@NgModule({
  imports: [WebOBS],
  exports: [WebOBS],
})
export class WebOBSModule {}
