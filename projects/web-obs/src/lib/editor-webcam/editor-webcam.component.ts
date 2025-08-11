import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AudioConnection } from './types/audio-connection.interface';
import { AudioElement } from './types/audio-element.interface';
import { Preset } from './types/preset.interface';
import { VideoElement } from './types/video-element.interface';

@Component({
  selector: 'web-obs',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './editor-webcam.component.html',
  styleUrls: [
    './editor-webcam.component.css',
    './assets/tailwind.generated.css',
  ],
})
export class EditorWebcamComponent implements OnInit, AfterViewInit, OnDestroy {
  canvasWidth = 1280; // Resolución por defecto de la emisión
  canvasHeight = 720; // Resolución por defecto de la emisión
  canvasFPS = 30; // FPS por defecto de la emisión
  isResolutionSelectorVisible = false; // Indica si el selector de resolución está visible
  videoDevices: MediaDeviceInfo[] = []; // Lista de dispositivos de video
  streams: MediaStream[] = []; // Lista de streams para el destroy
  audioDevices: MediaDeviceInfo[] = []; // Lista de dispositivos de audio
  audiosCapturas: MediaStreamTrack[] = []; // Lista de capturas de audio
  audiosArchivos: string[] = []; // Lista de archivos de audio de archivos
  audioOutputDevices: MediaDeviceInfo[] = []; // Lista de dispositivos de salida de audio
  capturas: MediaStream[] = []; // Lista de capturas
  staticContent: File[] = []; // Lista de archivos estáticos
  videosElements: VideoElement[] = []; // Lista de elementos de video
  audiosElements: AudioElement[] = []; // Lista de elementos de audio
  audiosConnections: AudioConnection[] = []; // Lista de conexiones de audio
  dragVideo: VideoElement | null = null; // Video que se está arrastrando
  canvas!: HTMLCanvasElement; // El elemento canvas
  context!: CanvasRenderingContext2D; // El contexto de canvas
  editandoDimensiones = false; // Indica si se está editando las dimensiones de un video
  presets = new Map<string, Preset>(); // Presets
  private fileUrlCache = new Map<File, string>(); // Cache de URLs de archivos
  audioContext = new AudioContext(); // Contexto de audio
  mixedAudioDestination: MediaStreamAudioDestinationNode =
    this.audioContext.createMediaStreamDestination(); //Audio de grabación
  emitiendo: boolean = false; // Indica si se está emitiendo
  tiempoGrabacion: string = '00:00:00'; // Tiempo de grabación
  ready: boolean | undefined;
  private drawInterval: any;
  selectedVideoForFilter: VideoElement | null = null;
  @ViewChildren('videoElement') videoElements!: QueryList<
    ElementRef<HTMLVideoElement>
  >;
  @Input() savedFiles?: File[] | null; // Files guardados del usuario (opcional)
  @Input() savedPresets?: Map<string, Preset> | null; //Presets guardados del usuario (opcional)
  @Input() readyObserve?: Observable<boolean>; // Avisa cuando está listo para emitir (opcional)
  @Output() emision: EventEmitter<MediaStream | null> = new EventEmitter(); // Emisión de video y audio
  @Output() savePresets: EventEmitter<Map<string, Preset>> = new EventEmitter(); // Guardar presets (opcional)

  /**
   * Método para inicializar la aplicación
   */
  @HostListener('window:resize')
  onResize(): void {
    this.calculatePreset();
    this.drawAudioConnections();
  }

  /**
   * Método para inicializar la aplicación
   */
  async ngOnInit() {
    try {
      // Solicitar permisos para cámara y micrófono
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Listar todos los dispositivos multimedia
      const devices = await navigator.mediaDevices.enumerateDevices();
      stream.getTracks().forEach((track) => {
        track.stop();
      });

      // Iniciar la configuración de medios
      this.startMedias(devices);

      // Escuchar cambios en los dispositivos multimedia
      navigator.mediaDevices.ondevicechange = async () => {
        console.log('Cambio detectado en los dispositivos');
        await this.updateDevices();
      };
    } catch (error) {
      console.error('Error al acceder a los dispositivos:', error);
    }

    // Añadir archivos recibidos (si hay)
    if (this.savedFiles) {
      this.staticContent = this.savedFiles;
      setTimeout(() => this.loadFiles(this.staticContent), 100);
    }

    // Añadir presets recibidos (si hay)
    if (this.savedPresets) {
      this.presets = this.savedPresets;
    }

    // Suscrivirse al ready observable (si hay)
    if (this.readyObserve !== undefined) {
      this.readyObserve.subscribe((ready) => {
        this.ready = ready;
      });
    }

    // añadir los archivos recibidos desde la app (si hay)
    if (this.savedFiles) {
      this.staticContent = this.savedFiles;
    }

    // añadir los presets recibidos desde la app (si hay)
    if (this.savedPresets) {
      this.presets = this.savedPresets;
    }
  }

  /**
   * Método para inicializar la aplicación después de la vista
   */
  ngAfterViewInit(): void {
    this.canvas = document.getElementById('salida') as HTMLCanvasElement;
    this.context = this.canvas.getContext('2d')!;

    // Función para dibujar el canvas
    const drawFrame = () => {
      if (!this.canvas) {
        console.error('Canvas o contexto no encontrado');
        return;
      }
      if (!this.context) {
        console.error('Missing context');
        return;
      }
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.videosElements
        .filter(
          (elemento) =>
            elemento.painted && elemento.position && elemento.element
        )
        .forEach((elemento) => {
          if (
            elemento.element instanceof HTMLVideoElement &&
            elemento.position
          ) {
            const videoWidth = elemento.element.videoWidth * elemento.scale;
            const videoHeight = elemento.element.videoHeight * elemento.scale;
            if (this.context) {
              if (elemento.filters) {
                this.context.filter = `brightness(${elemento.filters.brightness}%) contrast(${elemento.filters.contrast}%) saturate(${elemento.filters.saturation}%)`;
              } else {
                this.context.filter = '';
              }
            }
            this.context?.drawImage(
              elemento.element,
              elemento.position.x,
              elemento.position.y,
              videoWidth,
              videoHeight
            );
          } else if (
            elemento.element instanceof HTMLImageElement &&
            elemento.position
          ) {
            const imageWidth = elemento.element.naturalWidth * elemento.scale;
            const imageHeight = elemento.element.naturalHeight * elemento.scale;
            if (this.context) {
              if (elemento.filters) {
                this.context.filter = `brightness(${elemento.filters.brightness}%) contrast(${elemento.filters.contrast}%) saturate(${elemento.filters.saturation}%)`;
              } else {
                this.context.filter = '';
              }
            }
            this.context?.drawImage(
              elemento.element,
              elemento.position.x,
              elemento.position.y,
              imageWidth,
              imageHeight
            );
          }
        });
    };

    // Refresca el canvas a la tasa de fotogramas requerida
    this.drawInterval = setInterval(drawFrame, 1000 / this.canvasFPS);

    // Inicia a mostrar el audio de grabación
    const audioGrabacion = document.getElementById(
      'audio-level-recorder'
    ) as HTMLDivElement;
    if (!audioGrabacion) {
      console.error('No se pudo obtener el elemento audio-level-recorder');
      return;
    }
    const analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(
      this.mixedAudioDestination.stream
    );
    const gainNode = this.audioContext.createGain();
    this.audiosElements.push({ id: 'recorder', ele: gainNode });
    source.connect(gainNode);
    gainNode.connect(analyser);

    const volume = document.getElementById(
      'volume-audio-recorder'
    ) as HTMLInputElement;
    if (!volume) {
      console.error('No se pudo obtener el elemento volume-audio-recorder');
      return;
    }
    volume.oninput = () => {
      gainNode.gain.value = parseInt(volume.value) / 100;
    };

    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Función para actualizar el nivel de volumen del audio
    function updateAudioLevel() {
      analyser.getByteFrequencyData(dataArray);
      const volume = Math.max(...dataArray) / 255;
      const percentage = Math.min(volume * 100, 100);
      audioGrabacion.style.width = `${percentage}%`; // Ajustar el ancho de la barra
      requestAnimationFrame(updateAudioLevel);
    }
    // Actualiza el nivel de volumen del audio
    updateAudioLevel();

    // Escuchar eventos de teclado
    window.addEventListener('keydown', this.handleKeydown.bind(this));

    // Carga los files recibidos (si hay)
    if (this.staticContent.length > 0) {
      this.loadFiles(this.staticContent);
    }

    // Carga los presets recibidos (si hay)
    setTimeout(() => {
      Array.from(this.presets.keys()).forEach((key) => {
        const preset = this.presets.get(key);
        preset?.elements.forEach((element) => {
          element.element = document.getElementById(element.id);
        });
      });
      this.calculatePreset();
    }, 2000);
  }

  /**
   * Evento para destruir la aplicación
   */
  ngOnDestroy() {
    // Detener todos los flujos de video
    this.streams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    // Detener todas las capturas de pantalla
    this.capturas.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    // Detener todas las capturas de audio
    this.audiosCapturas.forEach((track) => track.stop());

    // Eliminar el listener de eventos de teclado
    window.removeEventListener('keydown', this.handleKeydown.bind(this));
  }

  /**
   * Método para manejar eventos de teclado
   * @param event Evento de teclado (KeyboardEvent)
   */
  handleKeydown(event: KeyboardEvent) {
    // Verificar si se presionó Ctrl + un número
    if (event.ctrlKey && !isNaN(Number(event.key))) {
      event.preventDefault(); // Evitar el comportamiento predeterminado solo para Ctrl + número
      const shortcut = `ctrl+${event.key}`;
      const preset = Array.from(this.presets.entries()).find(
        ([_, value]) => value.shortcut === shortcut
      );
      if (preset) {
        this.aplicaPreset(preset[0]);
      }
    }
  }

  /**
   * Método para iniciar los flujos de video y audio
   * @param devices Lista de dispositivos de audio y video (MediaDeviceInfo[])
   */
  async startMedias(devices: MediaDeviceInfo[]) {
    // Asignar el video stream a cada dispositivo de video
    const videoPromises: Promise<void>[] = [];
    const audioInputPromises: Promise<void>[] = [];
    const audioOutputPromises: Promise<void>[] = [];

    devices.forEach((device) => {
      if (device.kind === 'videoinput') {
        if (!this.videoDevices.some((d) => d.deviceId === device.deviceId)) {
          this.videoDevices.push(device);
          videoPromises.push(this.getVideoStream(device.deviceId));
        }
      } else if (
        device.kind === 'audioinput' &&
        device.deviceId !== 'default'
      ) {
        this.audioDevices.push(device);
        audioInputPromises.push(this.getAudioStream(device.deviceId));
      } else if (
        device.kind === 'audiooutput' &&
        device.deviceId !== 'default'
      ) {
        audioOutputPromises.push(this.getAudioOutputStream(device));
      }
    });

    // Espera a que todas las promesas hayan terminado
    await Promise.all([
      ...videoPromises,
      ...audioInputPromises,
      ...audioOutputPromises,
    ]);
    this.drawAudioConnections();
  }

  /**
   * Método para actualizar los dispositivos de audio y video
   */
  async updateDevices() {
    try {
      // Enumerar nuevamente los dispositivos disponibles
      const allDevices = await navigator.mediaDevices.enumerateDevices();

      // Identificar dispositivos nuevos y agregarlos
      allDevices.forEach((device) => {
        if (device.kind === 'videoinput') {
          const exists = this.videoDevices.some(
            (d) => d.deviceId === device.deviceId
          );
          if (!exists) {
            console.log(
              'Dispositivo nuevo detectado:',
              device.label || 'Sin nombre'
            );
            // Agregar el dispositivo a la lista
            this.videoDevices.push(device);
            this.getVideoStream(device.deviceId);
          }
        }

        if (device.kind === 'audioinput') {
          const exists = this.audioDevices.some(
            (d) => d.deviceId === device.deviceId
          );
          if (!exists) {
            console.log(
              'Dispositivo nuevo detectado:',
              device.label || 'Sin nombre'
            );
            // Agregar el dispositivo a la lista
            this.audioDevices.push(device);
            this.getAudioStream(device.deviceId);
          }
        }
      });

      // Identificar dispositivos de video desconectados y eliminarlos
      const disconnectedVideoDevices = this.videoDevices.filter(
        (device) => !allDevices.some((d) => d.deviceId === device.deviceId)
      );

      if (disconnectedVideoDevices.length > 0) {
        // Limpiar recursos de dispositivos desconectados
        disconnectedVideoDevices.forEach((device) => {
          console.log(
            'Dispositivo desconectado:',
            device.label || 'Sin nombre'
          );

          // Detener flujos activos asociados al dispositivo
          if (device.kind === 'videoinput' || device.kind === 'audioinput') {
            const element = document.getElementById(device.deviceId) as
              | HTMLVideoElement
              | HTMLAudioElement;
            if (element && element.srcObject) {
              const stream = element.srcObject as MediaStream;
              stream.getTracks().forEach((track) => track.stop()); // Detener cada pista del flujo
              element.srcObject = null; // Limpiar la referencia al flujo
            }
          }
        });
      }

      // Identificar dispositivos de audio desconectados y eliminarlos
      const disconnectedDevices = this.audioDevices.filter(
        (device) => !allDevices.some((d) => d.deviceId === device.deviceId)
      );

      if (disconnectedDevices.length > 0) {
        // Limpiar recursos de dispositivos desconectados
        disconnectedDevices.forEach((device) => {
          console.log(
            'Dispositivo desconectado:',
            device.label || 'Sin nombre'
          );

          // Detener flujos activos asociados al dispositivo
          if (device.kind === 'videoinput' || device.kind === 'audioinput') {
            const element = document.getElementById(device.deviceId) as
              | HTMLVideoElement
              | HTMLAudioElement;
            if (element && element.srcObject) {
              const stream = element.srcObject as MediaStream;
              stream.getTracks().forEach((track) => track.stop()); // Detener cada pista del flujo
              element.srcObject = null; // Limpiar la referencia al flujo
            }
          }
        });
      }
      console.log(
        'Dispositivos actualizados:',
        this.videoDevices + '\n' + this.audioDevices
      );
    } catch (error) {
      console.error('Error al actualizar dispositivos:', error);
    }
  }

  /**
   * Método para obtener el flujo de video
   * @param deviceId ID del dispositivo de video (string)
   */
  async getVideoStream(deviceId: string) {
    try {
      let stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });

      // Obtener datos del dispositivo
      let videoTrack = stream.getVideoTracks()[0];
      let capabilities = null;
      if (typeof videoTrack.getCapabilities === 'function') {
        capabilities = videoTrack.getCapabilities(); // Capacidades del dispositivo
        //console.log('Capabilities:', capabilities.width?.max, 'x', capabilities.height?.max);
      }
      let settings = videoTrack.getSettings(); // Configuración actual

      //console.log('Current Settings:', settings.width, 'x', settings.height);

      stream.getTracks().forEach((track) => {
        track.stop();
      });

      // Seleccionar valores específicos dentro de las capacidades
      let constraints: MediaStreamConstraints;
      if (capabilities) {
        constraints = {
          video: {
            deviceId: { ideal: deviceId },
            width: { exact: capabilities.width?.max }, // Máximo permitido
            height: { exact: capabilities.height?.max }, // Máximo permitido
            frameRate: { exact: capabilities.frameRate?.max }, // Máximo permitido
          },
        };
      } else {
        constraints = {
          video: {
            deviceId: { ideal: deviceId },
            width: { ideal: 7680 }, // Máximo permitido
            height: { ideal: 4320 }, // Máximo permitido
            frameRate: { ideal: 300 }, // Máximo permitido
          },
        };
      }

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.streams.push(stream);
      videoTrack = stream.getVideoTracks()[0];
      settings = videoTrack.getSettings();
      console.log(
        'New Current Settings:',
        settings.width,
        'x',
        settings.height
      );

      // Encontrar el elemento <video> con el mismo ID que el dispositivo
      const div = document.getElementById('div-' + deviceId);
      if (!div) {
        console.log('No se encontró el elemento div-' + deviceId);
        return;
      }
      const resolution = div.querySelector('#resolution');
      if (!resolution) {
        console.error('No se encontró el elemento #resolution');
        return;
      }
      resolution.innerHTML = `${settings.width}x${settings.height} ${settings.frameRate}fps`;

      const videoElement = this.videoElements.find(
        (el) => el.nativeElement.id === deviceId
      );
      if (videoElement) {
        videoElement.nativeElement.srcObject = stream; // Asignar el stream al video
        const ele: VideoElement = {
          id: deviceId,
          element: videoElement.nativeElement,
          painted: false,
          scale: 1,
          position: null,
        };
        this.videosElements.push(ele);
        div.style.filter = ele.filters
          ? `brightness(${ele.filters.brightness}%) contrast(${ele.filters.contrast}%) saturate(${ele.filters.saturation}%)`
          : '';
      }
    } catch (error) {
      console.error('Error al obtener el stream de video:', error);
    }
  }

  /**
   * Método para obtener el flujo de audio
   * @param deviceId ID del dispositivo de audio (string)
   */
  async getAudioStream(deviceId: string): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });

      this.streams.push(stream);

      const audioTrack = stream.getAudioTracks()[0];
      const settings = audioTrack.getSettings();

      console.log('Audio Settings:', settings);

      // Añade un controlador de volumen al dispositivo
      const volume = document.getElementById(
        'volume-' + deviceId
      ) as HTMLInputElement;
      if (!volume) {
        console.error('No se pudo obtener el elemento volume-' + deviceId);
        return;
      }
      const gainNode = this.audioContext.createGain();
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(gainNode);
      gainNode.connect(this.mixedAudioDestination);
      this.audiosElements.push({ id: deviceId, ele: gainNode });
      this.audiosConnections.push({
        idEntrada: deviceId,
        entrada: gainNode,
        idSalida: 'recorder',
        salida: this.mixedAudioDestination,
      });
      const sample = this.audioContext.createMediaStreamDestination();
      gainNode.connect(sample);

      volume.oninput = () => {
        gainNode.gain.value = parseInt(volume.value) / 100;
      };

      const audioLevelElement = document.getElementById(
        'audio-level-' + deviceId
      ) as HTMLDivElement;
      if (!audioLevelElement) {
        console.error('No se pudo obtener el elemento audio-level-' + deviceId);
        return;
      }
      this.visualizeAudio(sample.stream, audioLevelElement); // Iniciar visualización de audio
    } catch (error) {
      console.error('Error al obtener el stream de audio:', error);
    }
  }

  /**
   * Función para obtener el flujo de salida de audio
   * @param device
   */
  async getAudioOutputStream(device: MediaDeviceInfo) {
    try {
      const audio = new Audio() as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };

      // Verificar si el navegador soporta setSinkId y si estamos en HTTPS
      if (
        typeof audio.setSinkId !== 'function' ||
        location.protocol !== 'https:'
      ) {
        console.warn('setSinkId no es soportado o HTTPS no está activo.');
        return;
      }

      // Guardar el dispositivo en la lista
      this.audioOutputDevices.push(device);

      // Crear un nodo de destino para capturar el audio procesado
      const destinationNode = this.audioContext.createMediaStreamDestination();

      // Crear un nodo de ganancia para ajustar el volumen
      const gainNode = this.audioContext.createGain();

      // Conectar el volumen a un slider si existe
      setTimeout(() => {
        const volume = document.getElementById(
          'volume-' + device.deviceId
        ) as HTMLInputElement;
        if (volume) {
          volume.oninput = () => {
            gainNode.gain.value = parseInt(volume.value) / 100;
          };
        } else {
          console.error(
            'No se encontró el control de volumen para ' + device.deviceId
          );
        }
      }, 100);

      // Conectar el nodo de ganancia al destino
      gainNode.connect(destinationNode);

      // Crear un `<audio>` para reproducir el audio procesado
      audio.style.display = 'none';
      audio.srcObject = destinationNode.stream;

      await audio.setSinkId(device.deviceId);

      // Agregar el audio al DOM para evitar bloqueos de reproducción automática
      document.body.appendChild(audio);

      // Reproducir el audio
      audio
        .play()
        .catch((err) => console.error('Error al reproducir el audio:', err));

      // Visualizar los niveles de audio
      const audioLevelElement = document.getElementById(
        'audio-level-' + device.deviceId
      ) as HTMLDivElement;
      if (audioLevelElement) {
        this.visualizeAudio(destinationNode.stream, audioLevelElement);
      } else {
        console.error(
          'No se encontró el elemento visualizador de audio para ' +
            device.deviceId
        );
      }

      // Retornar nodos para poder conectar fuentes de audio después
      this.audiosElements.push({ id: device.deviceId, ele: gainNode });
    } catch (error) {
      console.error('Error al obtener el stream de salida de audio:', error);
    }
  }

  /**
   * Función para visualizar el nivel de audio
   * @param stream Flujo de audio (MediaStream)
   * @param audioLevel Elemento HTML para visualizar el nivel de audio (HTMLDivElement)
   */
  async visualizeAudio(stream: MediaStream, audioLevel: HTMLDivElement) {
    const analyser = this.audioContext.createAnalyser();
    const source = this.audioContext.createMediaStreamSource(stream);

    source.connect(analyser);
    analyser.fftSize = 256;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function updateAudioLevel() {
      analyser.getByteFrequencyData(dataArray);
      const volume = Math.max(...dataArray) / 255;
      const percentage = Math.min(volume * 100, 100);
      audioLevel.style.width = `${percentage}%`; // Ajustar el ancho de la barra
      requestAnimationFrame(updateAudioLevel);
    }

    updateAudioLevel();
  }

  /**
   * Función para agregar un flujo de pantalla
   */
  async addScrean() {
    try {
      // Solicitar al usuario que seleccione una ventana, aplicación o pantalla
      const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // Opcional: captura el audio del sistema si es compatible
      });
      this.capturas.push(stream);
      stream.getAudioTracks().forEach((track) => {
        this.audiosCapturas.push(track);
      });
      setTimeout(() => {
        const div = document.getElementById('div-' + stream.id);
        if (!div) {
          console.error(
            'No se pudo encontrar el elemento con id div-' + stream.id
          );
          return;
        }
        const resolution = div.querySelector('#resolution');
        if (!resolution) {
          console.error('No se pudo encontrar el elemento con id resolution');
          return;
        }
        const settings = stream.getVideoTracks()[0].getSettings();
        resolution.innerHTML = `${settings.width}x${settings.height} ${settings.frameRate}fps`;

        const videoElement = this.videoElements.find(
          (el) => el.nativeElement.id === stream.id
        );
        if (videoElement) {
          videoElement.nativeElement.srcObject = stream;
          const ele: VideoElement = {
            id: stream.id,
            element: videoElement.nativeElement,
            painted: false,
            scale: 1,
            position: null,
          };
          this.videosElements.push(ele);
        }
        // Añade el contról de audio
        stream.getAudioTracks().forEach((track) => {
          const audioLevelElement = document.getElementById(
            'audio-level-' + track.id
          ) as HTMLDivElement;
          if (!audioLevelElement) {
            console.error(
              'No se pudo encontrar el elemento con id audio-level-' + track.id
            );
            return;
          }
          const gainNode = this.audioContext.createGain();
          const source = this.audioContext.createMediaStreamSource(stream);
          source.connect(gainNode);
          gainNode.connect(this.mixedAudioDestination);
          this.audiosElements.push({ id: track.id, ele: gainNode });
          this.audiosConnections.push({
            idEntrada: track.id,
            entrada: gainNode,
            idSalida: 'recorder',
            salida: this.mixedAudioDestination,
          });
          this.drawAudioConnections();
          const sample = this.audioContext.createMediaStreamDestination();
          gainNode.connect(sample);
          const volume = document.getElementById(
            'volume-' + stream.id
          ) as HTMLInputElement;
          if (!volume) {
            console.error(
              'No se pudo encontrar el elemento con id volume-' + stream.id
            );
            return;
          }
          volume.oninput = () => {
            gainNode.gain.value = parseInt(volume.value) / 100;
          };
          this.visualizeAudio(sample.stream, audioLevelElement); // Iniciar visualización de audio
        });
      }, 100);

      // Manejar el fin de la captura
      stream.getVideoTracks()[0].onended = () => {
        console.log('La captura ha terminado');
        this.capturas = this.capturas.filter((s) => s !== stream);
        this.audiosCapturas = this.audiosCapturas.filter(
          (t) => t.id !== stream.id
        );
        // Eliminar el objeto ele del array videosElements
        this.videosElements = this.videosElements.filter(
          (v) => v.id !== stream.id
        );
        this.audiosElements = this.audiosElements.filter(
          (element: AudioElement) => element.id !== stream.id
        );
        this.audiosConnections = this.audiosConnections.filter(
          (element: AudioConnection) =>
            element.idEntrada !== stream.id || element.idSalida !== stream.id
        );
        this.drawAudioConnections();
      };
    } catch (error) {
      console.error('Error al capturar ventana o pantalla:', error);
    }
  }

  /**
   * Función para añadir archivos y configurar el enrutamiento de audio
   */
  async addFiles() {
    const input: HTMLInputElement = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/* video/* audio/*';
    input.multiple = true;
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) {
        console.error('No se seleccionaron archivos');
        return;
      }
      // Convertir FileList a un array para trabajar con los archivos
      const list = Array.from(target.files);
      this.staticContent = this.staticContent.concat(list);
      // espera una decima de segundo que se renderizen en el front
      setTimeout(() => {
        this.loadFiles(list);
      }, 100);
    };
    input.click();
  }

  /**
   * Función para cargar archivos
   * @param files Archivos a cargar (File[])
   */
  private loadFiles(files: File[]) {
    files.forEach((file) => {
      const div = document.getElementById('div-' + file.name);
      if (!div) {
        console.error(
          'No se pudo encontrar el elemento con id div-' + file.name
        );
        return;
      }
      if (file.type.startsWith('image/')) {
        const img = document.getElementById(file.name) as HTMLImageElement;
        if (img) {
          const elemento: VideoElement = {
            id: file.name,
            element: img,
            painted: false,
            scale: 1,
            position: null,
          };
          this.videosElements.push(elemento);
        }
      } else if (file.type.startsWith('video/')) {
        const video = document.getElementById(file.name) as HTMLVideoElement;
        if (video) {
          const elemento: VideoElement = {
            id: file.name,
            element: video,
            painted: false,
            scale: 1,
            position: null,
          };
          this.videosElements.push(elemento);
          // Añadir el control de audio
          // TODO: Revisar si se puede confirmar si el audio existe
          this.audiosArchivos.push(file.name);
          const gainNode = this.audioContext.createGain();
          this.audiosElements.push({ id: file.name, ele: gainNode });
          this.audiosConnections.push({
            idEntrada: file.name,
            entrada: gainNode,
            idSalida: 'recorder',
            salida: this.mixedAudioDestination,
          });
          this.drawAudioConnections();
          video.onplaying = () => {
            const audioDiv = document.getElementById(
              'audio-level-' + file.name
            ) as HTMLDivElement;
            if (!audioDiv) {
              console.error(
                'No se encontró el elemento con id ' +
                  'audio-level-' +
                  file.name
              );
              return;
            }
            const source = this.audioContext.createMediaElementSource(video);
            source.connect(gainNode);
            gainNode.connect(this.mixedAudioDestination);
            const sample = this.audioContext.createMediaStreamDestination();
            gainNode.connect(sample);
            const volume = document.getElementById(
              'volume-' + file.name
            ) as HTMLInputElement;
            if (!volume) {
              console.error(
                'No se encontró el elemento con id ' + 'volume-' + file.name
              );
              return;
            }
            volume.oninput = () => {
              gainNode.gain.value = parseInt(volume.value) / 100;
            };
            this.visualizeAudio(sample.stream, audioDiv);
          };
        }
      } else if (file.type.startsWith('audio/')) {
        this.audiosArchivos.push(file.name);
        const audioDiv = document.getElementById(file.name) as HTMLDivElement;
        if (!audioDiv) {
          console.error(
            'No se encontró el elemento con id ' + 'audio-level-' + file.name
          );
          return;
        }
        const audio = document.createElement('audio') as HTMLAudioElement;
        audio.src = this.getFileUrl(file);
        audio.load();
        const gainNode = this.audioContext.createGain();
        this.audiosElements.push({ id: file.name, ele: gainNode });
        this.audiosConnections.push({
          idEntrada: file.name,
          entrada: gainNode,
          idSalida: 'recorder',
          salida: this.mixedAudioDestination,
        });
        this.drawAudioConnections();
        audio.onplaying = () => {
          const audioDiv = document.getElementById(
            'audio-level-' + file.name
          ) as HTMLDivElement;
          if (!audioDiv) {
            console.error(
              'No se encontró el elemento con id ' + 'audio-level-' + file.name
            );
            return;
          }
          const source = this.audioContext.createMediaElementSource(audio);
          source.connect(gainNode);
          gainNode.connect(this.mixedAudioDestination);
          const sample = this.audioContext.createMediaStreamDestination();
          gainNode.connect(sample);
          const volume = document.getElementById(
            'volume-' + file.name
          ) as HTMLInputElement;
          if (!volume) {
            console.error(
              'No se encontró el elemento con id ' + 'volume-' + file.name
            );
            return;
          }
          volume.oninput = () => {
            gainNode.gain.value = parseInt(volume.value) / 100;
          };
          this.visualizeAudio(sample.stream, audioDiv);
        };

        // Ponemos las funcionalidades a los botones de reproducción
        const playPause = audioDiv.querySelector(
          '#play-pause'
        ) as HTMLButtonElement;
        const play = audioDiv.querySelector('#play') as SVGElement;
        const pause = audioDiv.querySelector('#pause') as SVGElement;
        const restart = audioDiv.querySelector('#restart') as HTMLButtonElement;
        const loop = audioDiv.querySelector('#loop') as HTMLButtonElement;
        const loopOff = audioDiv.querySelector('#loop-off') as SVGElement;
        const loopOn = audioDiv.querySelector('#loop-on') as SVGElement;
        const time = audioDiv.querySelector('#time') as HTMLSpanElement;
        const progress = audioDiv.querySelector(
          '#progress'
        ) as HTMLInputElement;
        if (
          !audioDiv ||
          !playPause ||
          !restart ||
          !loop ||
          !time ||
          !progress
        ) {
          console.error('Missing elements');
          return;
        }
        playPause.onclick = () => {
          if (!audioDiv) {
            console.error('Missing audioDiv');
            return;
          }
          if (audio.paused) {
            audio.play();
            play.style.display = 'none';
            pause.style.display = 'block';
          } else {
            audio.pause();
            play.style.display = 'block';
            pause.style.display = 'none';
          }
        };
        restart.onclick = () => {
          if (!audioDiv) {
            console.error('Missing audioDiv');
            return;
          }
          audio.currentTime = 0;
        };

        loop.onclick = () => {
          if (!audioDiv) {
            console.error('Missing audioDiv');
            return;
          }
          if (audio.loop) {
            audio.loop = false;
            loopOff.style.display = 'block';
            loopOn.style.display = 'none';
          } else {
            audio.loop = true;
            loopOff.style.display = 'none';
            loopOn.style.display = 'block';
          }
        };

        audio.onloadedmetadata = () => {
          /* Barra de progreso */
          const duration = this.formatTime(audio.duration);
          const timeStart = this.formatTime(audio.currentTime);
          time.innerText = `${timeStart} / ${duration}`;
          audio.ontimeupdate = () => {
            if (!audioDiv) {
              console.error('Missing audioDiv');
              return;
            }
            const percentage = (audio.currentTime / audio.duration) * 100;
            progress.value = percentage.toString();
            // Mostrar el tiempo actual y la duración
            const currentTime = this.formatTime(audio.currentTime);
            time.innerText = `${currentTime} / ${duration}`;

            progress.oninput = () => {
              if (!audioDiv) {
                console.error('Missing audioDiv');
                return;
              }
              const newTime = (parseInt(progress.value) / 100) * audio.duration;
              audio.currentTime = newTime;

              // Actualizar el tiempo en el texto inmediatamente
              const currentTime = this.formatTime(audio.currentTime);
              time.innerText = `${currentTime} / ${duration}`;
            };
            // Cambia el color de las barras de audio
            const audioStream: HTMLDivElement | null | undefined = document
              .getElementById('div-' + file.name)
              ?.querySelector('#audio-stream');
            if (!audioStream) {
              console.error(
                'No se encontró el elemento con id ' + 'audio-stream'
              );
              return;
            }
            const audioBars = audioStream.querySelectorAll('div');
            const currentSample = Math.floor(
              (audio.currentTime / audio.duration) * audioStream.offsetWidth
            );
            audioBars.forEach((bar, index) => {
              if (audioBars.length < audioStream.offsetWidth * 2) {
                bar.style.backgroundColor =
                  index <= currentSample ? '#16a34a' : '#1d4ed8'; // Rojo si está en reproducción
              } else {
                bar.style.backgroundColor =
                  index / 2 <= currentSample ? '#16a34a' : '#1d4ed8'; // Rojo si está en reproducción
              }
            });
          };
          // Dibuja el flujo de audio
          this.pintaAudio(file);
        };
      }
    });
  }

  /**
   * Función para pintar el audio
   * @param file Archivo de audio (File)
   */
  async pintaAudio(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    const container: HTMLDivElement | null | undefined = document
      .getElementById('div-' + file.name)
      ?.querySelector('#audio-stream');
    if (!container) {
      console.error('No se encontró el elemento con id div-' + file.name);
      return;
    }
    const canvasWidth = container.offsetWidth;
    const canvasHeight = container.offsetHeight;
    const sampleDataLeft = audioBuffer.getChannelData(0); // Canal izquierdo
    const sampleStepLeft = Math.floor(sampleDataLeft.length / canvasWidth);
    let sampleDataRight = null;
    let sampleStepRight = null;
    if (audioBuffer.numberOfChannels > 1) {
      sampleDataRight = audioBuffer.getChannelData(1); // Canal derecho
      sampleStepRight = Math.floor(sampleDataRight.length / canvasWidth);
    }

    for (let i = 0; i < canvasWidth; i++) {
      const sampleIndexLeft = i * sampleStepLeft;
      const amplitudeLeft = Math.abs(sampleDataLeft[sampleIndexLeft]);
      const barHeightLeft = amplitudeLeft * canvasHeight;

      const barLeft = document.createElement('div');
      barLeft.style.position = 'absolute';
      barLeft.style.left = `${i}px`;
      barLeft.style.width = '1px';
      if (audioBuffer.numberOfChannels === 1) {
        barLeft.style.height = `${barHeightLeft}px`;
        barLeft.style.bottom = '0px';
      } else {
        barLeft.style.height = `${barHeightLeft / 2}px`;
        barLeft.style.bottom = '50%';
      }
      barLeft.style.backgroundColor = '#1d4ed8';
      container.appendChild(barLeft);

      if (sampleDataRight && sampleStepRight) {
        const sampleIndexRight = i * sampleStepRight;
        const amplitudeRight = Math.abs(sampleDataRight[sampleIndexRight]);
        const barHeightRight = amplitudeRight * canvasHeight;
        const barRight = document.createElement('div');
        barRight.style.position = 'absolute';
        barRight.style.left = `${i}px`;
        barRight.style.width = '1px';
        barRight.style.height = `${barHeightRight / 2}px`;
        barRight.style.top = '50%';
        barRight.style.backgroundColor = '#1d4ed8';
        container.appendChild(barRight);
      }
    }
  }

  /**
   * Función para obtener la URL de un archivo utilizando la caché
   * @param file Archivo (File)
   * @returns URL del archivo (string)
   */
  getFileUrl(file: File): string {
    if (!this.fileUrlCache.has(file)) {
      const url = URL.createObjectURL(file);
      this.fileUrlCache.set(file, url);
    }
    return this.fileUrlCache.get(file) as string;
  }

  /**
   * Método para cambiar la resolución de la emisión
   * @param $event Evento de cambio de resolución (Event)
   * @param res Resolución seleccionada (string)
   */
  cambiarResolucion($event: Event, res: string) {
    const selected = document.getElementById('selected') as HTMLDivElement;
    if (!selected) {
      console.error('Missing selected element');
      return;
    }
    const value = selected.querySelector('#value');
    if (!value) {
      console.error('Missing value element');
      return;
    }
    const string = ($event.target as HTMLDivElement).innerHTML;
    const [width, height] = res.split('x');
    this.canvasWidth = parseInt(width);
    this.canvasHeight = parseInt(height);
    value.innerHTML = string;
    this.isResolutionSelectorVisible = false;
  }

  /**
   * Método para cambiar el FPS de la emisión
   * @param fps FPS seleccionada (string)
   */
  // TODO: Revisar si se puede eliminar
  cambiarFPS(fps: string) {
    this.canvasFPS = parseInt(fps);
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
    }

    const drawFrame = () => {
      if (!this.canvas || !this.context) {
        console.error('Missing canvas or context');
        return;
      }
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.videosElements.forEach((elemento) => {
        if (!elemento.painted || !elemento.position || !this.context) {
          console.error(
            'Missing elemento.painted, elemento.position or this.context'
          );
          return;
        }
        if (elemento.element instanceof HTMLVideoElement) {
          const videoWidth = elemento.element.videoWidth * elemento.scale;
          const videoHeight = elemento.element.videoHeight * elemento.scale;
          this.context.drawImage(
            elemento.element,
            elemento.position.x,
            elemento.position.y,
            videoWidth,
            videoHeight
          );
        } else if (elemento.element instanceof HTMLImageElement) {
          const imageWidth = elemento.element.naturalWidth * elemento.scale;
          const imageHeight = elemento.element.naturalHeight * elemento.scale;
          this.context.drawImage(
            elemento.element,
            elemento.position.x,
            elemento.position.y,
            imageWidth,
            imageHeight
          );
        }
      });
    };
    this.drawInterval = setInterval(drawFrame, 1000 / this.canvasFPS);
  }

  /**
   *Empieza el arrastre de un elemento
   *
   * @param event Evento de arrastre (MouseEvent)
   * @param deviceId ID del elemento arrastrado (string)
   */
  mousedown(event: MouseEvent, deviceId: string) {
    event.preventDefault();

    const videoElement = document.getElementById(deviceId) as HTMLVideoElement;
    if (!videoElement) {
      console.error('No hay videoElement');
      return;
    }
    const ele = this.videosElements.find((el) => el.id === deviceId);
    if (!ele || !this.canvas) {
      console.error('No hay elemento');
      return;
    }

    this.dragVideo = ele;

    let ghost: HTMLVideoElement | HTMLImageElement;
    if (this.dragVideo.element instanceof HTMLVideoElement) {
      ghost = videoElement.cloneNode(true) as HTMLVideoElement;
    } else if (this.dragVideo.element instanceof HTMLImageElement) {
      ghost = videoElement.cloneNode(true) as HTMLImageElement;
    } else {
      console.error('Tipo de elemento no reconocido');
      return;
    }
    document.body.classList.add('cursor-grabbing');
    ghost.classList.remove('rounded-lg');
    ghost.style.position = 'absolute';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1000';

    // Ajustar dimensiones del ghost para que coincidan con el video original
    ghost.style.width = `${videoElement.offsetWidth}px`;
    ghost.style.height = `${videoElement.offsetHeight}px`;

    // Copiar fuente y poner en marcha si es un video
    if (
      ele.element instanceof HTMLVideoElement &&
      ghost instanceof HTMLVideoElement
    ) {
      ghost.srcObject = ele.element.srcObject;
      ghost.load();
    } else if (
      ele.element instanceof HTMLImageElement &&
      ghost instanceof HTMLImageElement
    ) {
      ghost.src = ele.element.src;
    } else {
      console.error('Tipo de elemento no reconocido');
      return;
    }

    // Dimensiones del video

    const updateGhostPosition = (
      x: number,
      y: number,
      element: HTMLElement
    ) => {
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;
      const offsetX = elementWidth / 2;
      const offsetY = elementHeight / 2;

      ghost.style.left = `${x - offsetX}px`;
      ghost.style.top = `${y - offsetY}px`;
    };

    updateGhostPosition(event.clientX, event.clientY, videoElement); // Posición inicial
    document.body.appendChild(ghost);

    // Evento para detectar `wheel`
    const wheel = (wheelEvent: WheelEvent) => {
      if (!this.dragVideo) {
        console.error('No hay video arrastrando');
        return;
      }
      if (!this.canvas) {
        console.error('No hay canvas');
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const isMouseOverCanvas: boolean =
        wheelEvent.clientX >= rect.left &&
        wheelEvent.clientX <= rect.right &&
        wheelEvent.clientY >= rect.top &&
        wheelEvent.clientY <= rect.bottom;

      if (isMouseOverCanvas) {
        wheelEvent.preventDefault();
        // Obtener tamaño actual del ghost
        const ghostStyles = window.getComputedStyle(ghost);
        const currentWidth = parseFloat(ghostStyles.width);
        const currentHeight = parseFloat(ghostStyles.height);

        // Obtener posición actual del ghost
        const currentLeft = parseFloat(ghostStyles.left);
        const currentTop = parseFloat(ghostStyles.top);

        // Incrementar o reducir tamaño en función del scroll
        const delta = wheelEvent.deltaY < 0 ? 1.05 : 0.95; // Aumenta o reduce en un 5%
        const newWidth = currentWidth * delta;
        const newHeight = currentHeight * delta;

        // Calcular la diferencia de tamaño para ajustar la posición
        const widthDiff = newWidth - currentWidth;
        const heightDiff = newHeight - currentHeight;

        // Ajustar la posición del ghost para mantener el centro alineado con el ratón
        ghost.style.left = `${currentLeft - widthDiff / 2}px`;
        ghost.style.top = `${currentTop - heightDiff / 2}px`;

        // Actualizar dimensiones del ghost
        ghost.style.width = `${Math.max(10, newWidth)}px`; // Asegurarse de que no sea demasiado pequeño
        ghost.style.height = `${Math.max(10, newHeight)}px`;
      }
    };
    document.addEventListener('wheel', wheel, { passive: false });

    // Evento para mover el ghost
    const canvasContainer = document.getElementById(
      'canvas-container'
    ) as HTMLDivElement;
    const cross = document.getElementById('cross') as HTMLDivElement;
    if (!canvasContainer || !cross) {
      console.error('No se pudo crear el elemento de la cruz');
      return;
    }
    cross.style.display = 'block';

    const mousemove = (moveEvent: MouseEvent) => {
      try {
        if (!this.dragVideo || !this.canvas) {
          console.error('No hay video arrastrando o canvas');
          return;
        }

        updateGhostPosition(moveEvent.clientX, moveEvent.clientY, ghost);

        const rect = this.canvas.getBoundingClientRect();
        const ghostRect = ghost.getBoundingClientRect();

        // Calcular las coordenadas de intersección
        const intersection = {
          left: Math.max(rect.left, ghostRect.left),
          top: Math.max(rect.top, ghostRect.top),
          right: Math.min(rect.right, ghostRect.right),
          bottom: Math.min(rect.bottom, ghostRect.bottom),
        };

        // Verificar si hay intersección
        const isIntersecting =
          intersection.left < intersection.right &&
          intersection.top < intersection.bottom;

        // Verificar si el ghost está completamente contenido dentro del canvas
        const isFullyContained =
          ghostRect.left >= rect.left &&
          ghostRect.top >= rect.top &&
          ghostRect.right <= rect.right &&
          ghostRect.bottom <= rect.bottom;

        if (isIntersecting) {
          ghost.style.clipPath = `polygon(
			        ${((intersection.left - ghostRect.left) / ghostRect.width) * 100}% 
			        ${((intersection.top - ghostRect.top) / ghostRect.height) * 100}%, 
			        ${((intersection.right - ghostRect.left) / ghostRect.width) * 100}% 
			        ${((intersection.top - ghostRect.top) / ghostRect.height) * 100}%, 
			        ${((intersection.right - ghostRect.left) / ghostRect.width) * 100}% 
			        ${((intersection.bottom - ghostRect.top) / ghostRect.height) * 100}%, 
			        ${((intersection.left - ghostRect.left) / ghostRect.width) * 100}% 
			        ${((intersection.bottom - ghostRect.top) / ghostRect.height) * 100}%
					)`;

          if (isFullyContained) {
            ghost.style.border = '2px solid #1d4ed8';
            this.canvas.style.border = '2px solid #1d4ed8';
          } else {
            ghost.style.border = '2px solid #b91c1c';
            this.canvas.style.border = '2px solid #b91c1c';
          }
        } else {
          ghost.style.clipPath = 'none'; // Restaurar si no hay intersección
          ghost.style.border = '1px solid black';
          this.canvas.style.border = '1px solid black';
        }

        const intersecciones = this.colisiones(ghost);

        if (isIntersecting) {
          // Mostrar la cruz
          this.moverCruzPosicionamiento(
            moveEvent.clientX,
            moveEvent.clientY,
            intersecciones
          );

          if (intersecciones.length > 0) {
            ghost.style.border = '2px solid #b91c1c';
          } else {
            ghost.style.border = '2px solid #1d4ed8';
          }
          intersecciones?.forEach((elemento) => {
            if (elemento.id === 'canvas-container') {
              if (this.canvas) {
                this.canvas.style.border = '2px solid #b91c1c';
              }
            } else {
              elemento.style.border = '2px solid #b91c1c';
              elemento.style.visibility = 'visible';
            }
          });
        }
      } catch (error) {
        console.error('Error al mover el video: ', error);
      }
    };
    document.addEventListener('mousemove', mousemove);

    // Evento para soltar el ratón
    const mouseup = (upEvent: MouseEvent) => {
      if (!this.dragVideo || !this.canvas) {
        console.error('No hay video arrastrando o canvas');
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const isMouseOverCanvas: boolean =
        upEvent.clientX >= rect.left &&
        upEvent.clientX <= rect.right &&
        upEvent.clientY >= rect.top &&
        upEvent.clientY <= rect.bottom;

      if (isMouseOverCanvas) {
        const ghostRect = ghost.getBoundingClientRect();
        const result: VideoElement | undefined = this.paintInCanvas(
          ghost,
          ghostRect.width,
          ghostRect.height,
          upEvent.clientX,
          upEvent.clientY
        );
        // Guardar datos en el objeto VideoElement
        if (!result) {
          console.error('Missing result');
          return;
        }
        this.dragVideo.scale = result.scale;
        this.dragVideo.position = result.position;
        this.dragVideo.painted = result.painted;

        // Añade una capa encima al elemento transmitido
        this.addCapa(this.dragVideo);
        // Quita la cruz de posicionamiento
        const cross = document.getElementById('cross') as HTMLDivElement;
        if (cross) {
          cross.style.display = 'none';
        }
      }

      // Restaurar estado
      this.canvas.style.border = '1px solid black';
      this.dragVideo = null;
      //ghost.style.visibility = 'hidden';
      ghost.remove();
      cross.style.display = 'none';
      document.removeEventListener('mousemove', mousemove);
      document.removeEventListener('wheel', wheel);
      document.removeEventListener('mouseup', mouseup);
      document.body.classList.remove('cursor-grabbing');
    };
    document.addEventListener('mouseup', mouseup);
  }

  /**
   * Método para mostrar el menú de filtros
   * @param event Evento de clic (MouseEvent)
   * @param ele Elemento con filtros (VideoElement)
   */
  showFilterMenu(event: MouseEvent, ele: VideoElement) {
    event.preventDefault(); // Bloquea el menú contextual del navegador
    event.stopPropagation();

    if (!ele.filters) {
      ele.filters = {
        brightness: 100,
        contrast: 100,
        saturation: 100,
      };
    }

    const filterMenu = document.querySelector('#filterMenu') as HTMLDivElement;
    if (!filterMenu) {
      console.error('No se encontró el elemento con id filterMenu');
      return;
    }

    // Mostrar el menú
    filterMenu.style.display = 'flex';

    // Calcular posición evitando que se salga de la pantalla
    const menuWidth = filterMenu.offsetWidth;
    const menuHeight = filterMenu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = event.pageX;
    let top = event.pageY;

    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 5; // margen de 5px
    }
    if (top + menuHeight > screenHeight) {
      top = screenHeight - menuHeight - 5;
    }

    filterMenu.style.left = `${left}px`;
    filterMenu.style.top = `${top}px`;

    // Función para cerrar el menú
    const closeFilterMenu = (e: Event) => {
      if (!filterMenu.contains(e.target as Node)) {
        this.selectedVideoForFilter = null;
        filterMenu.style.display = 'none';
        document.removeEventListener('pointerdown', closeFilterMenu);
        window.removeEventListener('scroll', closeFilterMenu);
        window.removeEventListener('resize', closeFilterMenu);
      }
    };

    // Escuchar clics fuera, scroll y resize para cerrar
    setTimeout(() => {
      document.addEventListener('pointerdown', closeFilterMenu);
      window.addEventListener('scroll', closeFilterMenu);
      window.addEventListener('resize', closeFilterMenu);
    }, 0);
  }

  /**
   * Método para mover el elemento arrastrado en el canvas
   * @param event Evento de movimiento (MouseEvent)
   */
  canvasMouseMove(event: MouseEvent) {
    event.preventDefault();
    const canvasContainer = document.getElementById(
      'canvas-container'
    ) as HTMLDivElement;
    if (!this.canvas || !canvasContainer || this.editandoDimensiones) {
      console.error('Missing canvas, canvasContainer or editandoDimensiones');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    // Obtener las coordenadas relativas al tamaño visible del canvas
    const mousex = Math.max(0, Math.round(event.clientX - rect.left)); // Redondear y evitar valores negativos
    const mousey = Math.max(0, Math.round(event.clientY - rect.top)); // Redondear y evitar valores negativos

    // Relación de escala entre el tamaño interno del canvas y el tamaño visible
    const scaleX = this.canvas.width / rect.width; // Relación horizontal
    const scaleY = this.canvas.height / rect.height; // Relación vertical

    // Obtener las coordenadas internas (relativas al tamaño interno del canvas)
    const internalMouseX = mousex * scaleX;
    const internalMouseY = mousey * scaleY;

    // Obtener las coordenadas de cada video renderizado
    const rendered = this.videosElements.filter((video) => video.painted);
    const originalGhost = document.getElementById('marco') as HTMLDivElement;
    rendered.forEach((video) => {
      let videoWidth: number = 0;
      let videoHeight: number = 0;
      if (video.element instanceof HTMLVideoElement) {
        videoWidth = video.element.videoWidth * video.scale;
        videoHeight = video.element.videoHeight * video.scale;
      } else if (video.element instanceof HTMLImageElement) {
        videoWidth = video.element.naturalWidth * video.scale;
        videoHeight = video.element.naturalHeight * video.scale;
      } else {
        console.error('Tipo de elemento no reconocido');
      }
      // Coordenadas del video en el canvas
      const videoLeft = video.position ? video.position.x : 0;
      const videoTop = video.position ? video.position.y : 0;

      // Comprobar si el ratón está dentro del área del video
      const isMouseOverVideo =
        internalMouseX >= videoLeft &&
        internalMouseX <= videoLeft + videoWidth &&
        internalMouseY >= videoTop &&
        internalMouseY <= videoTop + videoHeight;

      // Buscar el elemento "ghost"
      let ghostDiv = canvasContainer.querySelector(
        `#marco-${CSS.escape(video.id)}`
      ) as HTMLDivElement;
      if (!ghostDiv) {
        ghostDiv = originalGhost.cloneNode(true) as HTMLDivElement;
        const tiradores = ghostDiv.querySelectorAll(
          '[id*="tirador-"]'
        ) as NodeListOf<HTMLDivElement>; // Seleccionar los tiradores
        tiradores.forEach((tirador: HTMLDivElement) => {
          tirador.addEventListener('mousedown', (event: MouseEvent) => {
            this.redimensionado(event); // Llamar a la función original
          });
        });

        if (!ghostDiv) {
          console.error('Missing ghostDiv');
          return;
        }
        ghostDiv.id = 'marco-' + video.id;
        canvasContainer.appendChild(ghostDiv);
      }

      if (isMouseOverVideo) {
        // Calcular la posición y tamaño del "ghost" en el espacio visible del canvas
        const ghostLeft = videoLeft / scaleX; // Convertir a coordenadas internas del canvas
        const ghostTop = videoTop / scaleY; // Convertir a coordenadas internas del canvas
        const ghostWidth = videoWidth / scaleX; // Ajustar el tamaño para la visualización
        const ghostHeight = videoHeight / scaleY; // Ajustar el tamaño para la visualización

        // Crear o actualizar el elemento del "ghost"
        ghostDiv.style.position = 'absolute'; // Asegurarse de que el ghostDiv se posicione correctamente
        ghostDiv.style.left = `${ghostLeft}px`; // Colocar el "ghost" en la posición correcta
        ghostDiv.style.top = `${ghostTop}px`; // Colocar el "ghost" en la posición correcta
        ghostDiv.style.width = `${ghostWidth}px`; // Ajustar el ancho del "ghost"
        ghostDiv.style.height = `${ghostHeight}px`; // Ajustar la altura del "ghost"
        ghostDiv.style.visibility = 'visible'; // Hacerlo visible

        const buttonX = ghostDiv.querySelector('#buttonx') as HTMLButtonElement;
        buttonX.onclick = () => {
          video.painted = false;
          video.position = null;
          video.scale = 1;
          ghostDiv.remove();
          const capa = document.getElementById('capa-' + video.id);
          if (capa) {
            capa.remove();
          }
          const marco = document.getElementById('marco-' + video.id);
          if (marco) {
            marco.remove();
          }
        };

        // Calcular la longitud de la línea diagonal (de esquina superior izquierda a inferior derecha)
        const diagonalLength = Math.sqrt(
          Math.pow(ghostDiv.clientWidth, 2) + Math.pow(ghostDiv.clientHeight, 2)
        );

        const line1 = ghostDiv.querySelector('#line1') as HTMLDivElement;
        line1.style.width = `${diagonalLength}px`;
        line1.style.transform = `rotate(${Math.atan2(
          ghostDiv.clientHeight,
          ghostDiv.clientWidth
        )}rad)`;

        const line2 = ghostDiv.querySelector('#line2') as HTMLDivElement;
        // Aplicar estilos dinámicos
        line2.style.width = `${diagonalLength}px`;
        line2.style.transform = `rotate(${-Math.atan2(
          ghostDiv.clientHeight,
          ghostDiv.clientWidth
        )}rad)`;

        // Colocar la línea en la esquina superior derecha
        line2.style.right = '0px';
        line2.style.top = '0px';
      } else {
        // Eliminar el elemento del "ghost" si ya no está sobre el video
        ghostDiv.style.visibility = 'hidden';
      }
    });
  }

  /**
   * Método para soltar el elemento arrastrado en el canvas
   */
  canvasMouseLeave() {
    const rendered = this.videosElements.filter((video) => video.painted);
    if (rendered.length > 0) {
      rendered.forEach((video) => {
        const marco = document.getElementById('marco-' + video.id);
        if (marco) {
          marco.style.visibility = 'hidden';
        }
      });
    }
  }

  /**
   * Método para redimensionar el elemento arrastrado en el canvas
   * @param $event Evento de redimensionamiento (MouseEvent)
   */
  redimensionado($event: MouseEvent) {
    const canvasContainer = document.getElementById(
      'canvas-container'
    ) as HTMLDivElement;
    const tiradorId = ($event.target as HTMLElement).id; // ID del tirador
    const ghostId = ($event.target as HTMLElement).parentElement?.id; // ID del padre
    const posicionInicial = { x: $event.clientX, y: $event.clientY };
    if (!tiradorId || !ghostId || !canvasContainer || !this.canvas) {
      console.error('Missing tiradorId, ghostId, canvasContainer or canvas');
      return;
    }
    const ghostDiv = document.getElementById(ghostId);
    if (!ghostDiv) {
      console.error('Missing ghostDiv');
      return;
    }

    this.editandoDimensiones = true;
    // Añadir la cruz de posicionamiento
    const cross = document.getElementById('cross') as HTMLDivElement;
    if (!cross) {
      console.error('Missing cross');
      return;
    }
    cross.style.display = 'block';
    let intersecciones = this.colisiones(ghostDiv);

    // Calcular el centro del ghost para posicionar las lineas
    const rect = this.canvas.getBoundingClientRect();
    const centroX = ghostDiv.offsetLeft + ghostDiv.offsetWidth / 2 + rect.x;
    const centroY = ghostDiv.offsetTop + ghostDiv.offsetHeight / 2 + rect.y;
    this.moverCruzPosicionamiento(centroX, centroY, intersecciones);
    intersecciones?.forEach((elemento) => {
      if (elemento.id === 'canvas-container') {
        if (this.canvas) {
          this.canvas.style.border = '2px solid #b91c1c';
        }
      } else {
        elemento.style.border = '2px solid #b91c1c';
        elemento.style.visibility = 'visible';
      }
    });

    // En evento mousemove, se calcula la diferencia de posición entre el momento del click y el movimiento
    const mouseMove = ($event2: MouseEvent) => {
      const difX = $event2.clientX - posicionInicial.x;
      const difY = $event2.clientY - posicionInicial.y;
      if (!this.canvas) {
        console.error('Missing canvas');
        return;
      }
      this.canvas.style.border = '2px solid #1d4ed8';
      const elementos = canvasContainer.querySelectorAll(
        '[id^="marco"]'
      ) as NodeListOf<HTMLDivElement>;
      elementos.forEach((elemento) => {
        if (elemento.id !== ghostDiv.id) {
          elemento.style.visibility = 'hidden';
        }
      });

      // Función para recalcular las líneas diagonales
      const recalculaDiagonales = () => {
        const linea1: HTMLDivElement | null = ghostDiv.querySelector('#line1');
        const linea2: HTMLDivElement | null = ghostDiv.querySelector('#line2');

        if (!linea1 || !linea2) {
          console.error('Missing linea1 or linea2');
          return;
        }

        // Calcular la longitud de la línea diagonal (de esquina superior izquierda a inferior derecha)
        const diagonalLength = Math.sqrt(
          Math.pow(ghostDiv.clientWidth, 2) + Math.pow(ghostDiv.clientHeight, 2)
        );

        linea1.style.width = `${diagonalLength}px`;
        linea1.style.transform = `rotate(${Math.atan2(
          ghostDiv.clientHeight,
          ghostDiv.clientWidth
        )}rad)`;

        linea2.style.width = `${diagonalLength}px`;
        linea2.style.transform = `rotate(${-Math.atan2(
          ghostDiv.clientHeight,
          ghostDiv.clientWidth
        )}rad)`;

        // Colocar la línea en la esquina superior derecha
        linea2.style.right = '0px';
        linea2.style.top = '0px';
      };

      switch (tiradorId) {
        case 'tirador-tl':
          // Mueve la esquina superior izquierda
          ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
          ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;

          // Mueve la esquina inferior derecha
          ghostDiv.style.width = `${ghostDiv.offsetWidth - difX}px`;
          ghostDiv.style.height = `${ghostDiv.offsetHeight - difY}px`;
          recalculaDiagonales();
          break;

        case 'tirador-tr':
          // Mueve la esquina superior derecha
          ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;

          // Mueve la esquina inferior izquierda
          ghostDiv.style.width = `${ghostDiv.offsetWidth + difX}px`;
          ghostDiv.style.height = `${ghostDiv.offsetHeight - difY}px`;
          recalculaDiagonales();
          break;

        case 'tirador-bl':
          // Mueve la esquina inferior izquierda
          ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
          ghostDiv.style.height = `${ghostDiv.offsetHeight + difY}px`;

          // Mueve la esquina superior derecha
          ghostDiv.style.width = `${ghostDiv.offsetWidth - difX}px`;
          recalculaDiagonales();
          break;

        case 'tirador-br':
          // Mueve la esquina inferior derecha
          ghostDiv.style.width = `${ghostDiv.offsetWidth + difX}px`;
          ghostDiv.style.height = `${ghostDiv.offsetHeight + difY}px`;
          recalculaDiagonales();
          break;

        case 'tirador-center':
          ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
          ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;
          break;
        default:
          console.error('Tirador desconocido');
          break;
      }
      // Actualiza las posiciones del mouse para el próximo movimiento
      posicionInicial.x = $event2.clientX;
      posicionInicial.y = $event2.clientY;

      // Actualiza las posiciones de la cruz de posicionamiento
      // Calcular el centro del ghost para posicionar las lineas
      intersecciones = this.colisiones(ghostDiv);
      const rect = this.canvas.getBoundingClientRect();
      const centroX = ghostDiv.offsetLeft + ghostDiv.offsetWidth / 2 + rect.x;
      const centroY = ghostDiv.offsetTop + ghostDiv.offsetHeight / 2 + rect.y;
      this.moverCruzPosicionamiento(centroX, centroY, intersecciones);

      intersecciones?.forEach((elemento) => {
        if (elemento.id === 'canvas-container') {
          if (this.canvas) {
            this.canvas.style.border = '2px solid #b91c1c';
          }
        } else {
          elemento.style.border = '2px solid #b91c1c';
          elemento.style.visibility = 'visible';
        }
      });
    };
    canvasContainer.addEventListener('mousemove', mouseMove);

    // Evento mouseup
    const mouseup = () => {
      if (!this.canvas) {
        console.error('Missing canvas');
        return;
      }
      const elemento: VideoElement | undefined = this.videosElements.find(
        (el) => el.id === ghostId.substring(6)
      );
      if (!elemento || !elemento.element) {
        console.error('Missing elemento or elemento.element');
        return;
      }
      const ghostRect = ghostDiv.getBoundingClientRect();
      const result: VideoElement | undefined = this.paintInCanvas(
        elemento.element,
        ghostRect.width,
        ghostRect.height,
        ghostRect.left + ghostRect.width / 2,
        ghostRect.top + ghostRect.height / 2
      );
      // Guardar datos en el objeto VideoElement
      if (!result) {
        console.error('Missing result');
        return;
      }
      elemento.position = result.position;
      elemento.scale = result.scale; // Escala que garantiza el tamaño correcto en el canvas
      elemento.painted = true; // Marcamos el video como "pintado"

      // Restaurar estado
      canvasContainer.removeEventListener('mousemove', mouseMove);
      canvasContainer.removeEventListener('mouseup', mouseup);
      cross.style.display = 'none';
      const elementos = canvasContainer.querySelectorAll(
        '[id^="marco"]'
      ) as NodeListOf<HTMLDivElement>;
      elementos.forEach((elemento) => {
        if (elemento.id !== ghostDiv.id) {
          elemento.style.border = '1px solid black';
        }
      });
      this.canvas.style.border = '1px solid black';
      ghostDiv.style.visibility = 'hidden';
      this.editandoDimensiones = false;
    };
    canvasContainer.addEventListener('mouseup', mouseup);
  }

  /**
   * Función para pintar un elemento en el canvas
   * @param element Elemento a pintar (HTMLElement)
   * @param widthElement Ancho del elemento (number)
   * @param heightElement Alto del elemento (number)
   * @param positionX Posición horizontal del elemento (number)
   * @param positionY Posición vertical del elemento (number)
   */
  paintInCanvas(
    element: HTMLElement,
    widthElement: number,
    heightElement: number,
    positionX: number,
    positionY: number
  ) {
    if (!this.canvas) {
      console.error('Missing canvas');
      return;
    }
    const rect = this.canvas.getBoundingClientRect();

    // Relación de escala entre el tamaño visual y el interno del canvas
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    // Dimensiones del ghost en el documento
    const ghostWidthInCanvas = widthElement * scaleX; // Ajustado al canvas
    const ghostHeightInCanvas = heightElement * scaleY;

    // Dimensiones originales del video
    let originalWidth: number = 0;
    let originalHeight: number = 0;
    if (element instanceof HTMLVideoElement) {
      originalWidth = element.videoWidth;
      originalHeight = element.videoHeight;
    } else if (element instanceof HTMLImageElement) {
      originalWidth = element.naturalWidth;
      originalHeight = element.naturalHeight;
    } else {
      console.error('Tipo de elemento no reconocido');
      return;
    }

    // Calculamos la escala requerida
    const requiredScaleX = ghostWidthInCanvas / originalWidth;
    const requiredScaleY = ghostHeightInCanvas / originalHeight;
    const requiredScale = Math.min(requiredScaleX, requiredScaleY);

    // Dimensiones escaladas
    const scaledWidth = originalWidth * requiredScale;
    const scaledHeight = originalHeight * requiredScale;

    // Ajustamos la posición para centrar el ratón en el video escalado
    const canvasX = (positionX - rect.left) * scaleX - scaledWidth / 2;
    const canvasY = (positionY - rect.top) * scaleY - scaledHeight / 2;

    // Devuelve un VideoElement con la información de la imagen da pintar
    const videoElement: VideoElement = {
      id: element.id,
      element: element,
      painted: true,
      scale: requiredScale,
      position: { x: canvasX, y: canvasY },
    };
    return videoElement;
  }

  /**
   * Función para detectar las colisiones entre elementos
   * @param principal Elemento principal (HTMLElement)
   */
  colisiones(principal: HTMLElement): HTMLElement[] {
    const rect = principal.getBoundingClientRect();
    const elementosIntersecados: HTMLElement[] = [];
    const canvasContainer = document.getElementById(
      'canvas-container'
    ) as HTMLElement;
    if (!canvasContainer || !this.canvas) return elementosIntersecados;
    const elementos = canvasContainer.querySelectorAll(
      '[id^="marco"]'
    ) as NodeListOf<HTMLElement>;
    elementos.forEach((elemento) => {
      if (elemento.id != principal.id) {
        const rect2 = elemento.getBoundingClientRect();
        // Comprobamos si rect se intersecta con rect2
        const intersecta =
          rect.left < rect2.right &&
          rect.right > rect2.left &&
          rect.top < rect2.bottom &&
          rect.bottom > rect2.top;
        if (intersecta) {
          elementosIntersecados.push(elemento);
        }
      }
    });
    const canvasRect = this.canvas.getBoundingClientRect();
    const tocaBorde =
      rect.left <= canvasRect.left ||
      rect.right >= canvasRect.right ||
      rect.top <= canvasRect.top ||
      rect.bottom >= canvasRect.bottom;
    if (tocaBorde) {
      elementosIntersecados.push(canvasContainer);
    }
    return elementosIntersecados;
  }

  /**
   * Función para formatear el tiempo de grabación
   * @param seconds segundos transcurridos (number)
   * @returns el tiempo en formato hh:mm:ss (string)
   */
  // TODO: Revisar si se puede sustituir por algo en el front
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  /**
   * Método para guardar un preset
   */
  guardaPreset() {
    const name = prompt(
      'Introduce el nombre del preset \n(El mismo nombre sobrescribe el preset) ',
      'Nuevo preset'
    );
    if (name) {
      const videoElements: VideoElement[] = [];
      this.videosElements.forEach((elemento) => {
        if (elemento.painted && elemento.element) {
          const newE: VideoElement = JSON.parse(JSON.stringify(elemento));
          newE.element = elemento.element.cloneNode(true) as HTMLVideoElement;
          if (
            elemento.element instanceof HTMLVideoElement &&
            newE.element instanceof HTMLVideoElement
          ) {
            newE.element.srcObject = elemento.element.srcObject;
            newE.element.load();
          } else if (
            elemento.element instanceof HTMLImageElement &&
            newE.element instanceof HTMLImageElement
          ) {
            newE.element.src = elemento.element.src;
          }
          videoElements.push(newE);
        }
      });
      this.presets.set(name, {
        elements: videoElements,
        shortcut: 'ctrl+' + (this.presets.size + 1),
      });
      setTimeout(() => this.calculatePreset(), 100);
    }
  }

  /**
   * Método para detener un elemento
   * @param ele Elemento a detener (MediaDeviceInfo | MediaStream | File)
   */
  stopElemento(ele: MediaDeviceInfo | MediaStream | File) {
    if (ele instanceof MediaDeviceInfo) {
      const div = document.getElementById('div-' + ele.deviceId);
      if (div) {
        const videoElement = div.querySelector('video') as HTMLVideoElement;
        if (videoElement) {
          const stream = videoElement.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      }
      this.videoDevices = this.videoDevices.filter(
        (device) => device.deviceId !== ele.deviceId
      );
    } else if (ele instanceof MediaStream) {
      const div = document.getElementById('div-' + ele.id);
      if (div) {
        const videoElement = div.querySelector('video') as HTMLVideoElement;
        if (videoElement) {
          const stream = videoElement.srcObject as MediaStream;
          stream.getVideoTracks().forEach((track) => track.stop());
          stream.getAudioTracks().forEach((track) => {
            track.stop();
            this.audiosCapturas = this.audiosCapturas.filter(
              (t) => t.id !== track.id
            );
            this.audiosElements = this.audiosElements.filter(
              (element: AudioElement) => element.id !== track.id
            );
            this.audiosConnections = this.audiosConnections.filter(
              (element: AudioConnection) =>
                element.idEntrada !== track.id || element.idSalida !== track.id
            );
            this.drawAudioConnections();
          });
        }
      }
      this.capturas = this.capturas.filter((stream) => stream !== ele);
      this.audiosCapturas = this.audiosCapturas.filter(
        (track) => track.id !== ele.id
      );
      this.audiosElements = this.audiosElements.filter(
        (element: AudioElement) => element.id !== ele.id
      );
      this.audiosConnections = this.audiosConnections.filter(
        (element: AudioConnection) =>
          element.idEntrada !== ele.id || element.idSalida !== ele.id
      );
    } else if (ele instanceof File) {
      this.staticContent = this.staticContent.filter((file) => file !== ele);
      this.audiosArchivos = this.audiosArchivos.filter(
        (file) => file !== ele.name
      );
      this.audiosElements = this.audiosElements.filter(
        (element: AudioElement) => element.id !== ele.name
      );
      this.audiosConnections = this.audiosConnections.filter(
        (element: AudioConnection) =>
          element.idEntrada !== ele.name || element.idSalida !== ele.name
      );
    }
    this.drawAudioConnections();
  }

  /**
   * Método para convertir un elemento en pantalla completa
   * @param ele Elemento a convertir (MediaDeviceInfo | MediaStream | File)
   */
  fullscreen(ele: MediaDeviceInfo | MediaStream | File) {
    let elemento: VideoElement | undefined;
    if (ele instanceof MediaDeviceInfo) {
      elemento = this.videosElements.find((el) => el.id === ele.deviceId);
    } else if (ele instanceof MediaStream) {
      elemento = this.videosElements.find((el) => el.id === ele.id);
    } else if (ele instanceof File) {
      elemento = this.videosElements.find((el) => el.id === ele.name);
    } else {
      console.error('Tipo desconocido');
      return;
    }

    if (!elemento) {
      console.error('No se encontro el elemento');
      return;
    }
    if (!elemento.element) {
      console.error('No se encontro el elemento.element');
      return;
    }
    if (!this.canvas) {
      console.error('No se encontro el canvas');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const result = this.paintInCanvas(
      elemento.element,
      rect.width,
      rect.height,
      x,
      y
    );
    if (result && elemento.element) {
      elemento.position = result.position;
      elemento.scale = result.scale;
      elemento.painted = true;
      this.addCapa(elemento);
    }
  }

  /**
   * Método para agregar una capa al elemento cuando se emite
   * @param elemento Elemento a agregar la capa (VideoElement)
   */
  addCapa(elemento: VideoElement) {
    const div = document.getElementById('div-' + elemento.id);
    if (div) {
      const capa: HTMLDivElement = document
        .getElementById('capa')
        ?.cloneNode(true) as HTMLDivElement;
      capa.id = 'capa-' + elemento.id;
      capa.classList.remove('hidden');

      // Botón para detener la emisión
      const X: HTMLButtonElement = capa.querySelector(
        '#buttonxcapa'
      ) as HTMLButtonElement;
      X.onclick = () => {
        if (!elemento) {
          console.error('Missing elemento');
          return;
        }
        elemento.painted = false;
        elemento.position = null;
        elemento.scale = 1;
        div.removeChild(capa);
        const marco = document.getElementById('marco-' + elemento.id);
        if (marco) {
          marco.remove();
        }
      };

      // Botón para cambiar de posición el elemento
      const moveElement = capa.querySelector('#moveElement') as HTMLDivElement;
      if (!moveElement) {
        console.error('Missing moveElement');
        return;
      }
      moveElement.classList.remove('hidden');
      const moveElementUp = moveElement.querySelector(
        '#moveElementUp'
      ) as HTMLButtonElement;
      const moveElementDown = moveElement.querySelector(
        '#moveElementDown'
      ) as HTMLButtonElement;
      if (!moveElementUp || !moveElementDown) {
        console.error('Missing moveElementUp or moveElementDown');
        return;
      }
      moveElementUp.onclick = () => {
        this.moveElementUp(elemento);
      };
      moveElementDown.onclick = () => {
        this.moveElementDown(elemento);
      };

      // Añade los controllers si es un file de video
      if (
        elemento.element instanceof HTMLVideoElement &&
        elemento.element.src &&
        elemento.element.src.length > 0
      ) {
        const control = document
          .getElementById('control')
          ?.cloneNode(true) as HTMLDivElement;
        if (!control) {
          console.error('Missing control');
          return;
        }
        const controllers = capa.querySelector(
          '#controllers'
        ) as HTMLDivElement;
        if (!controllers) {
          console.error('Missing controllers');
          return;
        }
        control.id = 'control-' + elemento.id;
        control.style.display = 'block';
        const playPause = control.querySelector(
          '#play-pause'
        ) as HTMLButtonElement;
        const restart = control.querySelector('#restart') as HTMLButtonElement;
        const loop = control.querySelector('#loop') as HTMLButtonElement;
        const play = control.querySelector('#play') as SVGElement;
        const pause = control.querySelector('#pause') as SVGElement;
        const loopOff = control.querySelector('#loop-off') as SVGElement;
        const loopOn = control.querySelector('#loop-on') as SVGElement;
        const progress = control.querySelector('#progress') as HTMLInputElement;
        const time = control.querySelector('#time') as HTMLSpanElement;

        playPause.onclick = () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          if ((elemento.element as HTMLVideoElement).paused) {
            (elemento.element as HTMLVideoElement).play();
            play.style.display = 'none';
            pause.style.display = 'block';
          } else {
            (elemento.element as HTMLVideoElement).pause();
            play.style.display = 'block';
            pause.style.display = 'none';
          }
        };

        restart.onclick = () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          (elemento.element as HTMLVideoElement).currentTime = 0;
        };

        loop.onclick = () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          if ((elemento.element as HTMLVideoElement).loop) {
            (elemento.element as HTMLVideoElement).loop = false;
            loopOff.style.display = 'block';
            loopOn.style.display = 'none';
          } else {
            (elemento.element as HTMLVideoElement).loop = true;
            loopOff.style.display = 'none';
            loopOn.style.display = 'block';
          }
        };

        /* Barra de progreso */
        elemento.element.ontimeupdate = () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          const percentage =
            ((elemento.element as HTMLVideoElement).currentTime /
              (elemento.element as HTMLVideoElement).duration) *
            100;
          progress.value = percentage.toString();
          // Mostrar el tiempo actual y la duración
          const currentTime = this.formatTime(
            (elemento.element as HTMLVideoElement).currentTime
          );
          const duration = this.formatTime(
            (elemento.element as HTMLVideoElement).duration
          );
          time.innerText = `${currentTime} / ${duration}`;

          progress.oninput = () => {
            if (!elemento) {
              console.error('Missing elemento');
              return;
            }
            const newTime =
              (parseInt(progress.value) / 100) *
              (elemento.element as HTMLVideoElement).duration;
            (elemento.element as HTMLVideoElement).currentTime = newTime;

            // Actualizar el tiempo en el texto inmediatamente
            const currentTime = this.formatTime(
              (elemento.element as HTMLVideoElement).currentTime
            );
            const duration = this.formatTime(
              (elemento.element as HTMLVideoElement).duration
            );
            time.innerText = `${currentTime} / ${duration}`;
          };
        };

        /* Tiempo de reproducción */
        elemento.element.addEventListener('timeupdate', () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          const currentTime = this.formatTime(
            (elemento.element as HTMLVideoElement).currentTime
          );
          const duration = this.formatTime(
            (elemento.element as HTMLVideoElement).duration
          );
          time.innerText = `${currentTime} / ${duration}`;
        });
        const currentTime = this.formatTime(
          (elemento.element as HTMLVideoElement).currentTime
        );
        const duration = this.formatTime(
          (elemento.element as HTMLVideoElement).duration
        );
        time.innerText = `${currentTime} / ${duration}`;
        controllers.appendChild(control);
      }

      // Añade el evento contextmenu
      capa.addEventListener('contextmenu', (event) => {
        this.selectedVideoForFilter = elemento;
        this.showFilterMenu(event, elemento);
      });

      div.appendChild(capa);
    }
  }

  /**
   * Método para mover la cruz de posicionamiento
   * @param eventX Posición horizontal de la cruz (number)
   * @param eventY Posición vertical de la cruz (number)
   * @param intersecciones Lista de elementos de intersección (HTMLElement[])
   */
  moverCruzPosicionamiento(
    eventX: number,
    eventY: number,
    intersecciones: HTMLElement[]
  ) {
    const cross = document.getElementById('cross') as HTMLDivElement;
    if (!cross) {
      console.error('Missing cross');
      return;
    }
    if (!this.canvas) {
      console.error('Missing canvas');
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const orizontal = cross.querySelector('#orizontal') as HTMLDivElement;
    orizontal.style.display = 'none';
    orizontal.style.backgroundColor = '#1d4ed8';
    orizontal.style.width = rect.width + 'px';
    const vertical = cross.querySelector('#vertical') as HTMLDivElement;
    vertical.style.display = 'none';
    vertical.style.backgroundColor = '#1d4ed8';
    vertical.style.height = rect.height + 'px';

    const isMouseOverCanvas: boolean =
      eventX >= rect.left &&
      eventX <= rect.right &&
      eventY >= rect.top &&
      eventY <= rect.bottom;

    const cursorPosition = {
      isAbove: eventY < rect.top,
      isBelow: eventY > rect.bottom,
      isLeft: eventX < rect.left,
      isRight: eventX > rect.right,
    };
    if (
      (cursorPosition.isLeft || cursorPosition.isRight) &&
      !cursorPosition.isAbove &&
      !cursorPosition.isBelow
    ) {
      orizontal.style.display = 'block';
    }
    if (
      (cursorPosition.isAbove || cursorPosition.isBelow) &&
      !cursorPosition.isLeft &&
      !cursorPosition.isRight
    ) {
      vertical.style.display = 'block';
    }

    if (isMouseOverCanvas) {
      orizontal.style.display = 'block';
      vertical.style.display = 'block';
    }

    if (intersecciones && intersecciones.length > 0) {
      orizontal.style.backgroundColor = '#b91c1c';
      vertical.style.backgroundColor = '#b91c1c';
    }
    vertical.style.left = `${eventX - rect.left}px`;
    orizontal.style.top = `${eventY - rect.top}px`;
  }

  /**
   * Método para calcular los presets
   */
  async calculatePreset() {
    const keysArray = Array.from(this.presets.keys());
    keysArray.forEach((key) => {
      const presetDiv = document.getElementById('preset-' + key);
      if (!presetDiv) {
        console.error('Preset ' + key + ' no encontrado');
        return;
      }
      presetDiv.innerHTML = '';
      this.presets.get(key)?.elements.forEach((element: VideoElement) => {
        let ele;
        let width;
        let height;
        if (element.element instanceof HTMLVideoElement) {
          ele = document.createElement('video');
          const originalStream = element.element.srcObject as MediaStream;
          width = element.element.videoWidth;
          height = element.element.videoHeight;

          if (originalStream) {
            // Crear un nuevo flujo vacío
            const newStream = new MediaStream();

            // Copiar todas las pistas (video, audio) al nuevo flujo
            originalStream.getTracks().forEach((track) => {
              newStream.addTrack(track);
            });

            // Asignar el nuevo flujo al video
            ele.srcObject = newStream;
            ele.autoplay = true;
            ele.muted = true;
          }
        } else if (element.element instanceof HTMLImageElement) {
          ele = document.createElement('img');
          ele.src = element.element.src;
          ele.alt = element.element.id;
          width = element.element.naturalWidth;
          height = element.element.naturalHeight;
        } else {
          console.error('Tipo desconocido');
          return;
        }

        // Calculamos la escala y posición en el div respecto al canvas
        const divRect = presetDiv.getBoundingClientRect();
        if (!this.canvas || !element.position) {
          console.error('Missing this.canvas or element.position');
          return;
        }
        // Relación de escala entre el tamaño interno del canvas y el tamaño del div
        const scaleX = this.canvas.width / divRect.width;
        const scaleY = this.canvas.height / divRect.height;
        // Calculamos la posición en el div
        ele.style.position = 'absolute';
        ele.style.left = `${element.position.x / scaleX}px`;
        ele.style.top = `${element.position.y / scaleY}px`;
        ele.style.width = `${(width * element.scale) / scaleX}px`;
        ele.style.height = `${(height * element.scale) / scaleY}px`;
        presetDiv.appendChild(ele);
      });
    });
  }

  /**
   * Método para aplicar un preset
   * @param name Nombre del preset (string)
   */
  aplicaPreset(name: string) {
    // Primero, quitamos todas las capas
    // quitamos las capas de cada elemento pintado
    const elementosDiv = document.getElementById(
      'elementosDiv'
    ) as HTMLDivElement;
    if (!elementosDiv) {
      console.error('Missing elementosDiv');
      return;
    }
    this.videosElements.forEach((elemento) => {
      const capa = elementosDiv.querySelector(
        '#capa-' + CSS.escape(elemento.id)
      );
      if (capa) {
        capa.remove();
      }
    });

    // Quitamos las capas de cada preset
    const keysArray = Array.from(this.presets.keys());
    keysArray.forEach((key) => {
      const capa = document.getElementById('capa-' + key);
      if (capa) {
        capa.remove();
      }
    });

    // Borramos todo el contenido del canvas
    const preset = this.presets.get(name);
    if (!preset) {
      console.error('Missing preset');
      return;
    }
    this.videosElements.forEach((elemento) => {
      elemento.painted = false;
      elemento.scale = 1;
      elemento.position = null;
    });

    // Pintamo cada elemento del preset
    preset.elements.forEach((element) => {
      const ele = this.videosElements.find((el) => el.id === element.id);
      if (!ele) {
        console.error('Missing ele');
        return;
      }

      ele.scale = element.scale;
      ele.position = element.position;
      ele.painted = true;
    });

    // Reorganizar los elementos
    for (let i = 0; i < preset.elements.length; i++) {
      const presetElement = preset.elements[i];
      const index = this.videosElements.findIndex(
        (el) => el.id === presetElement.id
      );

      if (index === -1) continue;

      // Mover el elemento encontrado a la posición `i`
      const [element] = this.videosElements.splice(index, 1);
      this.videosElements.splice(i, 0, element);
    }

    // Añadir capa al preset activado
    const capaBase = document.getElementById('capa') as HTMLDivElement;
    if (!capaBase) {
      console.error('Missing capaBase');
      return;
    }
    const presetDiv = document.getElementById('preset-' + name);
    if (!presetDiv) {
      console.error('Missing presetDiv');
      return;
    }
    const parentDiv = presetDiv.parentElement as HTMLDivElement;
    const capa = capaBase.cloneNode(true) as HTMLDivElement;
    capa.id = 'capa-' + name;
    const xBotton = capa.querySelector('#buttonxcapa') as HTMLButtonElement;
    xBotton.onclick = () => {
      capa.remove();
    };
    capa.classList.remove('hidden');
    capa.style.zIndex = '10';
    parentDiv.appendChild(capa);

    // Añadir capa a cada elemento pintado
    const pintados = this.videosElements.filter((elemento) => elemento.painted);
    pintados.forEach((elemento) => {
      this.addCapa(elemento);
    });
  }

  /**
   * Método para mover un elemento hacia abajo en el orden de pintado
   * @param elemento Elemento a mover (VideoElement)
   */
  moveElementDown(elemento: VideoElement) {
    const index = this.videosElements.findIndex((el) => el.id === elemento.id);
    if (index > 0) {
      [this.videosElements[index - 1], this.videosElements[index]] = [
        this.videosElements[index],
        this.videosElements[index - 1],
      ];
    }
  }

  /**
   * Método para mover un elemento hacia arriba en el orden de pintado
   * @param elemento Elemento a mover (VideoElement)
   */
  moveElementUp(elemento: VideoElement) {
    const index = this.videosElements.findIndex((el) => el.id === elemento.id);
    if (index < this.videosElements.length - 1) {
      [this.videosElements[index], this.videosElements[index + 1]] = [
        this.videosElements[index + 1],
        this.videosElements[index],
      ];
    }
  }

  /**
   * Función para dibujar las conexiones de audio
   */
  drawAudioConnections() {
    setTimeout(() => {
      if (this.audiosElements.length === 0) return;
      const audios = document.getElementById('audios') as HTMLDivElement;
      const audiosRect = audios.getBoundingClientRect();
      const audiosList = document.getElementById(
        'audios-list'
      ) as HTMLDivElement;
      if (!audiosList) {
        console.error('Missing audiosList');
        return;
      }
      const conexionesIzquierda = document.getElementById(
        'conexiones-izquierda'
      ) as HTMLDivElement;
      if (!conexionesIzquierda) {
        console.error('Missing conexionesIzquierda');
        return;
      }
      const conexionesDerecha = document.getElementById(
        'conexiones-derecha'
      ) as HTMLDivElement;
      if (!conexionesDerecha) {
        console.error('Missing conexionesDerecha');
        return;
      }

      conexionesIzquierda.innerHTML = '';
      conexionesDerecha.innerHTML = '';
      conexionesIzquierda.style.width = `${
        8 * this.audiosConnections.length
      }px`;
      audiosList.style.width =
        audiosRect.width - 2 - 8 * this.audiosConnections.length + 'px';
      this.audiosConnections.forEach((elemento, index) => {
        //console.log('elemento.idEntrada ' + index + ': ' + elemento.idEntrada);
        //console.log('elemento.idSalida ' + index + ': ' + elemento.idSalida);
        const audioEntrada = document.getElementById(
          'audio-level-' + elemento.idEntrada
        ) as HTMLDivElement;
        if (!audioEntrada) {
          console.error('Missing audioEntrada');
          return;
        }
        const audioSalida = document.getElementById(
          'audio-level-' + elemento.idSalida
        ) as HTMLDivElement;
        if (!audioSalida) {
          console.error('Missing audioSalida');
          return;
        }

        const entradaRect = audioEntrada.getBoundingClientRect();
        const salidaRect = audioSalida.getBoundingClientRect();
        const start = {
          x: entradaRect.left - audiosRect.left,
          y:
            entradaRect.top -
            audiosRect.top +
            entradaRect.height / 2 +
            audios.scrollTop,
        };
        const end = {
          x: salidaRect.left - audiosRect.left,
          y:
            salidaRect.top -
            audiosRect.top +
            salidaRect.height / 2 +
            audios.scrollTop,
        };
        const square = document.createElement('div');

        square.style.position = 'absolute';
        square.style.border = '2px solid';
        square.style.borderRightWidth = '0px';

        //square.style.transition = 'border-width 0.3s ease'; // para hover suave

        // Crear botón para eliminar la conexión
        const deleteButton = document.createElement('button');
        deleteButton.innerText = 'X';
        deleteButton.style.position = 'absolute';
        deleteButton.style.left = '-2px';
        deleteButton.style.top = '0';
        deleteButton.style.width = '1rem'; // w-4 = 1rem = 16px
        deleteButton.style.height = '1rem'; // h-4 = 1rem
        deleteButton.style.borderRadius = '9999px'; // rounded-full
        deleteButton.style.display = 'none'; // hidden
        deleteButton.style.alignItems = 'center'; // flex + items-center + justify-center
        deleteButton.style.justifyContent = 'center';
        deleteButton.style.top = '0';
        deleteButton.style.right = '0';
        deleteButton.onclick = () => {
          // Eliminar la conexión de la lista
          this.audiosConnections.splice(index, 1);
          // Desconectar los nodos de audio
          elemento.entrada.disconnect(elemento.salida);
          // Eliminar el elemento visual
          square.remove();
        };

        square.addEventListener('mouseenter', () => {
          square.style.borderLeftWidth = '4px';
          square.style.borderTopWidth = '4px';
          square.style.borderBottomWidth = '4px';
          deleteButton.style.display = 'flex';
        });

        square.addEventListener('mouseleave', () => {
          square.style.borderLeftWidth = '2px';
          square.style.borderTopWidth = '2px';
          square.style.borderBottomWidth = '2px';
          deleteButton.style.display = 'none';
        });

        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
          color += letters[Math.floor(Math.random() * 16)];
        }
        color += 'f0';
        square.style.borderColor = color;
        square.style.left = `${start.x - 8 * (index + 1)}px`;
        square.style.top = `${start.y}px`;
        square.style.width = `${8 * (index + 1)}px`;
        square.style.height = `${end.y - start.y}px`;
        square.style.zIndex = (500 - (index + 1) * 10).toString();

        square.appendChild(deleteButton);

        conexionesIzquierda.appendChild(square);
      });
    }, 100);
  }

  /**
   * Método para acabar el de crear el enlace de audio
   * @param $event Evento de arrastre (MouseEvent)
   */
  audioDown($event: MouseEvent): void {
    if ($event.target instanceof HTMLInputElement) return;

    const conexionesIzquierda = document.getElementById(
      'conexiones-izquierda'
    ) as HTMLDivElement;
    if (!conexionesIzquierda) {
      console.error('Missing conexionesIzquierda');
      return;
    }

    const audios = document.getElementById('audios') as HTMLDivElement;
    if (!audios) {
      console.error('Missing audios');
      return;
    }

    const audiosRect = audios.getBoundingClientRect();
    const elementoStart = document.elementFromPoint(
      $event.clientX,
      $event.clientY
    );

    const initialScrollTop = audios.scrollTop; // 📌 Guardamos el scroll al inicio

    const startX = $event.clientX - audiosRect.left;
    const startY = $event.clientY - audiosRect.top + initialScrollTop; // ✅ Se guarda con el scroll inicial

    const conexionTemp = document.createElement('div');
    conexionTemp.style.position = 'absolute';
    conexionTemp.style.border = '2px solid';
    conexionTemp.style.borderRightWidth = '0px';
    conexionTemp.style.borderStyle = 'dashed';
    conexionTemp.style.borderColor = 'black';
    conexionTemp.style.left = `${startX}px`;
    conexionTemp.style.top = `${startY}px`;
    conexionTemp.style.width = `1px`;
    conexionTemp.style.height = `1px`;

    conexionesIzquierda.appendChild(conexionTemp);

    // 🔹 Evento para mover y actualizar el tamaño del cuadrado
    const audioMove = ($event2: MouseEvent) => {
      const actualX = $event2.clientX - audiosRect.left;
      const actualY = $event2.clientY - audiosRect.top + audios.scrollTop; // ✅ Se ajusta dinámicamente con el scroll actual
      if (actualX < startX) {
        conexionTemp.style.left = `${actualX}px`;
        conexionTemp.style.width = `${startX - actualX}px`;
      }
      if (actualY < startY) {
        conexionTemp.style.top = `${actualY}px`;
        conexionTemp.style.height = `${startY - actualY}px`;
      } else {
        conexionTemp.style.top = `${startY}px`;
        conexionTemp.style.height = `${actualY - startY}px`;
      }
    };

    // 🔹 Evento para finalizar el dibujo cuando se suelta el mouse
    const audioUp = ($event3: MouseEvent) => {
      //console.log('audioUp');
      audios.removeEventListener('mousemove', audioMove);
      audios.removeEventListener('mouseup', audioUp);

      const offsetX = parseInt(conexionTemp.style.width) + 2; // Puedes ajustar este valor según sea necesario
      conexionTemp.remove();

      const elementoFinal = document.elementFromPoint(
        $event3.clientX + offsetX,
        $event3.clientY
      );
      if (!elementoFinal) {
        console.error('Missing elementoFinal');
        return;
      }
      if (!elementoStart) {
        console.error('Missing elementoStart');
        return;
      }
      let idElementoStrart = elementoStart.id;
      if (idElementoStrart.startsWith('audio-level-')) {
        idElementoStrart = idElementoStrart.substring(12);
      } else if (idElementoStrart.startsWith('audio-')) {
        idElementoStrart = idElementoStrart.substring(6);
      } else if (idElementoStrart.startsWith('volume-')) {
        idElementoStrart = idElementoStrart.substring(7);
      } else {
        console.error('Tipo desconocido');
        return;
      }
      let idElementoFinal = elementoFinal.id;
      if (idElementoFinal.startsWith('audio-level-')) {
        idElementoFinal = idElementoFinal.substring(12);
      } else if (idElementoFinal.startsWith('audio-')) {
        idElementoFinal = idElementoFinal.substring(6);
      } else if (idElementoFinal.startsWith('volume-')) {
        idElementoFinal = idElementoFinal.substring(7);
      } else {
        console.error('Tipo desconocido');
        return;
      }

      if (idElementoStrart === idElementoFinal) return;

      const startElement = this.audiosElements.find(
        (element: AudioElement) => element.id === idElementoStrart
      );
      const endElement = this.audiosElements.find(
        (element: AudioElement) => element.id === idElementoFinal
      );
      if (
        typeof startElement === 'undefined' ||
        typeof endElement === 'undefined'
      ) {
        console.error('Elementos no encontrados');
        return;
      }
      if (endElement.id === 'audio-recorder') {
        endElement.ele = this.mixedAudioDestination;
      }
      startElement.ele.connect(endElement.ele);
      this.audiosConnections.push({
        idEntrada: idElementoStrart,
        entrada: startElement.ele as GainNode,
        idSalida: idElementoFinal,
        salida: endElement.ele as MediaStreamAudioDestinationNode,
      });
      this.drawAudioConnections();
    };

    audios.addEventListener('mousemove', audioMove);
    audios.addEventListener('mouseup', audioUp);
  }

  /**
   * Método para empezar a emitir
   */
  emitir() {
    if (!this.canvas) {
      console.error('Missing canvas');
      return;
    }
    const videoStream = this.canvas
      .captureStream(this.canvasFPS)
      .getVideoTracks()[0];
    console.log('Constrain: ' + videoStream.getSettings().frameRate);
    const audioStream = this.mixedAudioDestination.stream.getAudioTracks()[0];
    this.emision.emit(new MediaStream([videoStream, audioStream]));
    if (this.ready !== undefined) {
      if (this.ready) {
        this.emitiendo = true;
        this.calculaTiempoGrabacion();
      }
    } else {
      this.emitiendo = true;
      this.calculaTiempoGrabacion();
    }
  }

  /**
   * Método para detener la emisión
   */
  detenerEmision() {
    this.emitiendo = false;
    if (this.emision) {
      this.emision.emit(null);
    }
  }

  /**
   * Método para calcular el tiempo de grabación
   */
  async calculaTiempoGrabacion() {
    let tiempo = -1;
    const updateTimer = () => {
      if (this.emitiendo) {
        tiempo += 1;
        this.tiempoGrabacion = this.formatTime(tiempo);
        setTimeout(updateTimer, 1000);
      }
    };
    updateTimer();
  }

  /**
   * Método para guardar los presets
   */
  savePresetsFunction() {
    this.savePresets.emit(this.presets);
  }

  /**
   * Método para mostrar el menú contextual del elemento
   * @param $event Evento de clic (MouseEvent)
   * @param deviceId ID del elemento (string)
   */
  onContextMenu($event: MouseEvent, deviceId: string) {
    $event.preventDefault();
    const videoElement = document.getElementById(deviceId) as HTMLVideoElement;
    if (!videoElement) {
      console.error('No hay videoElement');
      return;
    }
    const ele = this.videosElements.find((el) => el.id === deviceId);
    if (!ele || !this.canvas) {
      console.error('No hay elemento');
      return;
    }
    this.selectedVideoForFilter = ele;
    this.showFilterMenu($event, ele);
  }

  /**
   * Método para actualizar el estilo del elemento
   */
  updateStyleElement() {
    if (!this.selectedVideoForFilter) {
      console.error('Missing this.selectedVideoForFilter');
      return;
    }
    const videoElement = document.getElementById(
      this.selectedVideoForFilter.id
    ) as HTMLVideoElement;
    if (!videoElement) {
      console.error('Missing videoElement');
      return;
    }
    if (this.selectedVideoForFilter.filters) {
      videoElement.style.filter = `brightness(${this.selectedVideoForFilter.filters.brightness}%) contrast(${this.selectedVideoForFilter.filters.contrast}%) saturate(${this.selectedVideoForFilter.filters.saturation}%)`;
    } else {
      videoElement.style.filter = '';
    }
  }
}
