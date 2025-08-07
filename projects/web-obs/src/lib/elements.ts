import { CommonModule } from '@angular/common';
import { importProvidersFrom } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { bootstrapApplication } from '@angular/platform-browser';
import { WebObs } from './web-obs';

function injectSharedStyle(href: string) {
  const exists = !!document.querySelector(`link[href="${href}"]`);
  if (!exists) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

// Aquí usa la ruta correcta según tu build
injectSharedStyle('./styles/tailwind.generated.css');

bootstrapApplication(WebObs, {
  providers: [importProvidersFrom(CommonModule)],
}).then((appRef) => {
  const injector = appRef.injector;
  const element = createCustomElement(WebObs, { injector });
  customElements.define('editor-webcam', element);
});
