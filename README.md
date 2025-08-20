```
 _________________________________________________________________________________
|                                                                                 |
|  GGGGGG    IIII     AAA      CCCCCC    CCCCCC      AAA      9999999     00000   |
| GG    GG    II     AA AA    CC    CC  CC    CC    AA AA    99     99   00   00  |
| GG          II    AA   AA   CC        CC         AA   AA   99     99  00     00 |
| GG   GGGG   II   AA     AA  CC        CC        AA     AA   99999999  00     00 |
| GG    GG    II   AAAAAAAAA  CC        CC        AAAAAAAAA         99  00     00 |
| GG    GG    II   AA     AA  CC    CC  CC    CC  AA     AA  99     99   00   00  |
|  GGGGGG    IIII  AA     AA   CCCCCC    CCCCCC   AA     AA   9999999     00000   |
|_________________________________________________________________________________|
```

# Web-OBS

## Una alternativa sencilla a OBS para el navegador

### ¿Qué es Web-OBS?

Web-OBS es una librería de Angular 20 y un WebComponent que permite crear broadcasts de video y audio directamente en el navegador.

### ¿Cómo funciona?

Utilizando las capacidades de los navegadores modernos, permite capturar la webcam, el micrófono, compartir imágenes, videos y audios, compartir pantalla...
Y permite acomodar cada elemento, crear presets, acceder a presets con atajos de teclado, etc.
Te permite utilizar las funciones principales de OBS, pero en el navegador.

### ¿Cómo se utiliza?

Está disponible en npm, en dos versiones:

- Componente Angular 20
- Componente Web

Para saber como utilizar cada una, puedes ver los READMEs de cada una en la carpeta `docs`.

### DEMO

<https://giacca90.github.io/web-obs/>

<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; text-align: center;">
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_1.gif" alt="Posicionamiento de elementos" style="width: 100%; height: auto;">
    <p>Posicionamiento de elementos</p>
  </div>
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_2.gif" alt="Configuración de aspecto" style="width: 100%; height: auto;">
    <p>Configuración de aspecto</p>
  </div>
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_3.gif" alt="Sobreposición de elementos" style="width: 100%; height: auto;">
    <p>Sobreposición de elementos</p>
  </div>
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_4.gif" alt="Pantalla compartida" style="width: 100%; height: auto;">
    <p>Pantalla compartida</p>
  </div>
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_5.gif" alt="Crear un preset" style="width: 100%; height: auto;">
    <p>Crear un preset</p>
  </div>
  <div style="flex: 1 1 200px; max-width: 200px;">
    <img src="https://github.com/giacca90/web-obs/raw/a2f3432efb0ca4ca8173fa11d3d9b13504565d46/docs/web-obs_6.gif" alt="Atajos de teclado" style="width: 100%; height: auto;">
    <p>Atajos de teclado</p>
  </div>
</div>

### Parametros

El componente puede recibir los siguientes parametros:

- `savedFiles`: Archivos guardados del usuario (opcional). Type: `File[]`
- `savedPresets`: Presets guardados del usuario (opcional). Type: `Map<string, Preset>`
- `readyObserve`: Avisa cuando el componente padre está listo para emitir (opcional) Type: `Observable<boolean>`

También puede emitir los siguientes eventos:

- `emision`: Emite el video y audio (opcional) Type: `EventEmitter<MediaStream | null>`
- `savePresets`: Los presets para guardar (opcional) Type: `EventEmitter<Map<string, Preset>>`

Ejemplo completo:

```
<WebOBS
(emision)="emiteWebcam($event)"
(savePresets)="savePresets($event)"
[readyObserve]="this.readyObserver"
[savedPresets]="this.savedPresets"
[savedFiles]="this.savedFiles">
</WebOBS>

```

### Notas adicionales

- Las funciones avanzadas de audio necesitan una conexion segura (HTTPS) para funcionar.
- No emite directamente, devuelve un MediaStream, que se puede redirigir al backend, también por WebRTC.
