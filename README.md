# 🎥 Angular WebComponent OBS-Like Studio

Una poderosa librería Angular exportada como **Web Component**, que trae capacidades de producción audiovisual directamente al navegador. Ideal para transmisiones en vivo, grabaciones y composiciones multimedia complejas, todo desde el frontend.

---

## 🚀 Características Principales

- 🎚️ **Control total de resolución y FPS**
  - Define resoluciones personalizadas
  - Control de frames por segundo para fluidez o eficiencia

- 🖼️ **Manipulación avanzada de medios**
  - Posicionamiento y escala de imágenes y videos
  - Rotación, opacidad, brillo, contraste y más ajustes visuales
  - Soporte para múltiples fuentes simultáneas

- 🔊 **Procesamiento de audio**
  - Control de volumen y mezcla de múltiples pistas
  - Posible integración con Web Audio API para efectos avanzados

- ⚡ **Alto rendimiento**
  - Diseñado para trabajar en tiempo real con múltiples elementos
  - Renderizado optimizado para navegadores modernos

- 🧩 **Completamente modular**
  - Exportado como Web Component
  - Fácil integración en proyectos Angular, React, Vue, o vanilla JS

---

## 📦 Instalación

Puedes instalarlo vía npm:

```bash
npm install nombre-de-tu-paquete
```

O usarlo directamente como Web Component:

```html
<script type="module" src="ruta/hacia/tu/webcomponent.js"></script>
```

---

## 🧪 Uso Básico

```html
<obs-studio
  resolution="1280x720"
  fps="30"
  [sources]="[ ... ]"
  [audioSettings]="{ ... }"
></obs-studio>
```

### 📄 Ejemplo de configuración

```ts
sources = [
  {
    type: 'video',
    src: 'video.mp4',
    x: 100,
    y: 150,
    scale: 0.5,
    brightness: 1.2,
    contrast: 0.8
  },
  {
    type: 'image',
    src: 'logo.png',
    x: 10,
    y: 10,
    scale: 0.3,
    opacity: 0.9
  }
];

audioSettings = {
  gain: 0.8,
  mute: false
};
```

---

## ⚙️ Opciones Avanzadas

| Opción           | Tipo     | Descripción                                     |
|------------------|----------|-------------------------------------------------|
| `resolution`     | string   | Formato `"anchoxalto"` (ej. `"1920x1080"`)     |
| `fps`            | number   | Cuadros por segundo                             |
| `sources`        | array    | Lista de fuentes de video o imagen              |
| `audioSettings`  | object   | Control de mezcla, volumen, muteo, etc.         |

---

## 💡 Casos de Uso

- Streaming en vivo directamente desde el navegador
- Aplicaciones de edición o presentación multimedia
- Producción de contenido para plataformas educativas o e-learning
- Captura y composición de video sin herramientas externas

---

## 🛠️ Requisitos

- Navegador moderno con soporte para Web Components y WebRTC
- Angular 12+ si se integra directamente como módulo (opcional)

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Si deseas reportar un bug, sugerir una mejora o enviar un PR, siéntete libre de hacerlo.

---

## 📄 Licencia

MIT License

---

## 👨‍💻 Autor

Desarrollado por [Tu Nombre o Empresa](https://tusitio.com)
