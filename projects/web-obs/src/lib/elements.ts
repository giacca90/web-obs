import { createCustomElement } from '@angular/elements';
import { bootstrapApplication } from '@angular/platform-browser';
import { WebOBS } from './editor-webcam/web-obs';

import 'zone.js';
const bootstrap = async () => {
  try {
    // Bootstrap la aplicación y obtener el injector
    const appRef = await bootstrapApplication(WebOBS);
    const injector = appRef.injector;

    // Crear el elemento personalizado
    const webComponent = createCustomElement(WebOBS, { injector });

    // Registrar si no existe
    if (!customElements.get('web-obs')) {
      customElements.define('web-obs', webComponent);
      console.log('WebOBS registrado como <web-obs>');
    }
  } catch (error) {
    console.error('Error al registrar el componente:', error);
  }
};

// Iniciar el bootstrap
bootstrap();
