// projects/web-obs/src/lib/elements.ts
import { CommonModule } from '@angular/common';
import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { WebObs } from './web-obs';

// Inyecta estilos compartidos si no existen
function injectSharedStyle(href: string) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

// Ajusta la ruta según tu build
injectSharedStyle('./tailwind.generated.css');

// Bootstrapping standalone y registro como webcomponent
bootstrapApplication(WebObs, {
  providers: [importProvidersFrom(CommonModule)],
}).then((appRef) => {
  const injector = appRef.injector;
  // Define el custom element solo si no existe
  if (!customElements.get('editor-webcam')) {
    const element = document.createElement('editor-webcam');
    customElements.define('editor-webcam', element.constructor as CustomElementConstructor);
  }
});
