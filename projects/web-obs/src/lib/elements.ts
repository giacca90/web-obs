import { createCustomElement } from '@angular/elements';
import { bootstrapApplication } from '@angular/platform-browser';
import { EditorWebcamComponent } from './editor-webcam/editor-webcam.component';

const bootstrap = async () => {
  try {
    // Bootstrap la aplicación y obtener el injector
    const appRef = await bootstrapApplication(EditorWebcamComponent);
    const injector = appRef.injector;

    // Crear el elemento personalizado
    const webComponent = createCustomElement(EditorWebcamComponent, { injector });

    // Registrar si no existe
    if (!customElements.get('editor-webcam')) {
      customElements.define('editor-webcam', webComponent);
      console.log('EditorWebcamComponent registrado como <editor-webcam>');
    }
  } catch (error) {
    console.error('Error al registrar el componente:', error);
  }
};

// Iniciar el bootstrap
bootstrap();
