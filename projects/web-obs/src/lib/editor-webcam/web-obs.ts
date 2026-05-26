import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChild, ViewChildren, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AUDIO_PROCESSOR } from './audio-processor';
import { CANVAS_RENDERER } from './canvas-renderer';
import { AudioConnection } from './types/audio-connection.interface';
import { AudioElement } from './types/audio-element.interface';
import { Preset } from './types/preset.interface';
import { VideoElement } from './types/video-element.interface';

@Component({
  selector: 'web-obs',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './web-obs.html',
  styleUrls: ['./web-obs.css', './assets/tailwind.generated.css'],
  encapsulation: ViewEncapsulation.ShadowDom, // Mejorar aislamiento
})
export class WebOBS implements OnInit, AfterViewInit, OnDestroy, OnChanges {
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
  private canvasWorker!: Worker; // Worker para el canvas
  editandoDimensiones = false; // Indica si se está editando las dimensiones de un video
  presets = new Map<string, Preset>(); // Presets
  audioContext!: AudioContext;
  mixedAudioDestination!: MediaStreamAudioDestinationNode;
  recordAudioDestination!: MediaStreamAudioDestinationNode;
  emitiendo: boolean = false; // Indica si se está emitiendo
  tiempoGrabacion: string = '00:00:00'; // Tiempo de grabación
  statusMessage: string = ''; // Mensaje de estado para el usuario
  selectedVideoForFilter: VideoElement | null = null;
  selectedAudioForEqualizer: string | null = null;
  equalizerValues: number[] = [0, 0, 0, 0, 0]; // Variables para sincronizar con sliders
  private workletLoaded = false;
  private readonly drawInterval: any;
  private readonly fileUrlCache = new Map<File, string>(); // Cache de URLs de archivos
  private readonly boundCanvasMouseMove = this.canvasMouseMove.bind(this);
  private readonly handleKeydownRef = this.handleKeydown.bind(this);

  private workletLoadingPromise: Promise<void> | null = null;
  private isDrawing = false;
  private readonly imageBitmapCache = new Map<string, { bitmap: ImageBitmap; filter: string; width: number; height: number }>();
  private ticking = false;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly el: ElementRef,
  ) {}

  // para múltiples streams
  private readonly mediaElementSources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private readonly equalizerFilters = new Map<string, BiquadFilterNode[]>();
  private readonly workletNodes = new Map<string, AudioWorkletNode>(); // key: id de stream o generated id
  private readonly audioSources = new Map<string, MediaStreamAudioSourceNode>();
  private readonly silentGains = new Map<string, GainNode>();

  @ViewChildren('videoElement') videoElements!: QueryList<ElementRef<HTMLVideoElement>>;
  @ViewChildren('deviceDiv') deviceDivs!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('captureDiv') captureDivs!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('staticDiv') staticDivs!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChildren('volumeInput') volumeInputs!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChildren('audioLevelDiv') audioLevelDivs!: QueryList<ElementRef<HTMLDivElement>>;
  @ViewChild('salida') salida!: ElementRef<HTMLCanvasElement>;
  @ViewChild('audioLevelRecorder') audioLevelRecorder!: ElementRef<HTMLDivElement>;
  @ViewChild('volumeAudioRecorder') volumeAudioRecorder!: ElementRef<HTMLInputElement>;
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('cross') cross!: ElementRef<HTMLDivElement>;
  @ViewChild('marco') marcoTemplate!: ElementRef<HTMLDivElement>;
  @ViewChild('capa') capaTemplate!: ElementRef<HTMLDivElement>;
  @ViewChild('audios') audios!: ElementRef<HTMLDivElement>;
  @ViewChild('audiosList') audiosList!: ElementRef<HTMLDivElement>;
  @ViewChild('conexionesIzquierda') conexionesIzquierda!: ElementRef<HTMLDivElement>;
  @ViewChild('conexionesDerecha') conexionesDerecha!: ElementRef<HTMLDivElement>;
  @ViewChild('elementosDiv') elementosDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('presetsDiv') presetsDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('control') controlTemplate!: ElementRef<HTMLDivElement>;
  @ViewChild('selected') selected!: ElementRef<HTMLDivElement>;
  @ViewChild('filterMenu') filterMenu!: ElementRef<HTMLDivElement>;
  @ViewChildren('filterSlider') filterSliders!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild('equalizerMenu') equalizerMenu!: ElementRef<HTMLDivElement>;
  @ViewChildren('equalizerSlider') equalizerSliders!: QueryList<ElementRef<HTMLInputElement>>;
  @Input() savedFiles?: File[] | null; // Files guardados del usuario (opcional)
  @Input() savedPresets?: Map<string, Preset> | null; //Presets guardados del usuario (opcional)
  @Input() isInLive?: boolean; // Avisa cuando está listo para emitir (opcional)
  @Input() status?: string; // Observa el estado de la emisión (opcional)
  @Output() emision: EventEmitter<MediaStream | null> = new EventEmitter(); // Emisión de video y audio
  @Output() savePresets: EventEmitter<Map<string, Preset>> = new EventEmitter(); // Guardar presets (opcional)

  /**
   * Elije si utilizar la señal del padre o la propia
   */
  get estadoEmision(): boolean {
    return this.isInLive ?? this.emitiendo;
  }

  /**
   * @summary Carga el worklet de procesamiento de audio.
   * @description Carga el AudioWorklet si aún no ha sido cargado, o devuelve la promesa de carga existente.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el AudioWorklet ha sido cargado.
   */
  async loadAudioWorklet(): Promise<void> {
    if (this.workletLoaded) return;
    if (this.workletLoadingPromise) return this.workletLoadingPromise;

    this.workletLoadingPromise = (async () => {
      try {
        await this.ensureAudioContext();

        // Crear un blob con el código del worklet
        const blob = new Blob([AUDIO_PROCESSOR], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);

        await this.audioContext.audioWorklet.addModule(blobUrl);

        this.workletLoaded = true;
      } catch (err) {
        console.error('❌ Error cargando AudioWorklet:', err);
        this.workletLoaded = false;
        throw err;
      } finally {
        this.workletLoadingPromise = null;
      }
    })();

    return this.workletLoadingPromise;
  }

  /**
   * @summary Detecta cambios en los inputs del componente.
   * @description Reacciona a cambios en los inputs recibidos desde el componente padre.
   * @param {SimpleChanges} changes Objeto con los cambios detectados.
   */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['isInLive'] && this.isInLive !== undefined) {
      if (this.isInLive) {
        this.calculaTiempoGrabacion();
      }
    }
  }

  /**
   * @summary Manejador de evento de redimensionamiento de ventana.
   * @description Recalcula los presets y redibuja las conexiones de audio al cambiar el tamaño de la ventana.
   */
  @HostListener('window:resize')
  onResize(): void {
    this.calculatePreset();
    this.drawAudioConnections();
  }

  /**
   * @summary Inicializa el componente.
   * @description Método del ciclo de vida de Angular que inicia la inicialización asíncrona de la aplicación.
   */
  ngOnInit(): void {
    this.initialize().catch((err) => console.error('Error inicializando:', err));
  }

  /**
   * @summary Inicializa la aplicación.
   * @description Configura dispositivos, carga archivos y presets.
   */
  private async initialize() {
    try {
      if (this.isMobile()) {
        alert('¡¡¡ATENCIÓN!! Esta aplicación no está pensada para dispositivos móviles.');
        this.statusMessage = '<span style="color: red; font-weight: bold;">¡¡¡ATENCIÓN!! Esta aplicación no está pensada para dispositivos móviles.</span>';
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.stopStream(stream);
      this.startMedias(devices);

      navigator.mediaDevices.ondevicechange = async () => {
        await this.updateDevices();
      };

      if (this.savedFiles) {
        this.staticContent = this.savedFiles;
        setTimeout(() => this.loadFiles(this.staticContent), 100);
      }

      if (this.savedPresets) {
        this.presets = this.savedPresets;
      }
    } catch (error) {
      console.error('Error al acceder a los dispositivos:', error);
    }
  }

  /**
   * @summary Inicializa el componente después de que la vista ha sido inicializada.
   * @description Configura el canvas, inicia el bucle de dibujado, inicializa el grabador de audio y los listeners de eventos.
   */
  ngAfterViewInit() {
    this.canvas = this.salida.nativeElement;

    // Inicializar el worker del canvas
    const blob = new Blob([CANVAS_RENDERER], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    this.canvasWorker = new Worker(blobUrl);

    const offscreen = this.canvas.transferControlToOffscreen();
    this.canvasWorker.postMessage({ type: 'init', payload: { canvas: offscreen, fps: this.canvasFPS } }, [offscreen]);

    // Refresca el canvas a la tasa de fotogramas requerida
    // this.drawInterval = setInterval(this.drawFrame, 1000 / this.canvasFPS);
    this.updateWorkerLayers();

    // Inicialización del audio diferida hasta la interacción del usuario
    this.initAudioRecorder();

    this.initEventListeners();
    this.loadStaticContent();
    this.cdr.detectChanges();
  }

  /**
   * @summary Inicializa el grabador de audio.
   * @description Configura el AudioContext, nodos de ganancia y visualización de audio para la grabación.
   */
  private initAudioRecorder() {
    this.ensureAudioContext().then(() => {
      // Inicia a mostrar el audio de grabación
      const audioGrabacion = this.audioLevelRecorder?.nativeElement;
      if (!audioGrabacion) {
        console.error('No se pudo obtener el elemento audio-level-recorder');
        return;
      }

      // Crear un gainNode para controlar el volumen
      const gainNode = this.audioContext.createGain();
      this.audiosElements.push({ id: 'recorder', ele: gainNode });
      this.createEqualizer('recorder');

      // Conectar el flujo de audio mixto al gainNode
      const source = this.audioContext.createMediaStreamSource(this.mixedAudioDestination.stream);
      source.connect(gainNode);

      // Conectar el ecualizador
      const filters = this.equalizerFilters.get('recorder');
      if (filters) {
        let prevNode: AudioNode = gainNode;
        for (const filter of filters) {
          prevNode.connect(filter);
          prevNode = filter;
        }
        prevNode.connect(this.recordAudioDestination);
      } else {
        gainNode.connect(this.recordAudioDestination);
      }

      const sample = this.audioContext.createMediaStreamDestination();
      if (filters && filters.length > 0) {
        filters[filters.length - 1].connect(sample);
      } else {
        gainNode.connect(sample);
      }

      // Slider de volumen
      const volume = this.volumeAudioRecorder?.nativeElement;
      if (volume) {
        volume.oninput = () => {
          gainNode.gain.value = Number.parseInt(volume.value) / 100;
        };
      }

      // Visualización de audio mediante Worklet (RMS)
      this.visualizeAudio(sample.stream, audioGrabacion, 'recorder').catch((err) => console.error('Error visualizando audio:', err));
    });
  }

  /**
   * @summary Inicializa los event listeners.
   * @description Configura listeners para eventos de teclado y para reanudar el audio en la interacción del usuario.
   */
  private initEventListeners() {
    // Escuchar eventos de teclado
    globalThis.window.addEventListener('keydown', this.handleKeydownRef);

    // Añadir listener global para reanudar audio en la primera interacción
    const resumeAudio = async () => {
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume();
        globalThis.window.removeEventListener('click', resumeAudio);
      }
    };
    globalThis.window.addEventListener('click', resumeAudio);
  }

  /**
   * @summary Carga el contenido estático.
   * @description Carga los archivos y presets guardados previamente.
   */
  private loadStaticContent() {
    // Carga los files recibidos (si hay)
    if (this.staticContent?.length > 0) {
      this.loadFiles(this.staticContent);
    }

    // Carga los presets recibidos (si hay)
    if (this.presets?.size > 0) {
      setTimeout(() => {
        for (const key of Array.from(this.presets.keys())) {
          const preset = this.presets.get(key);
          if (preset) {
            for (const element of preset.elements) {
              element.element = this.elementosDiv.nativeElement.querySelector(`#${CSS.escape(element.id)}`);
            }
          }
        }
        this.calculatePreset();
      }, 2000);
    }
  }

  /**
   * @summary Limpia los recursos al destruir el componente.
   * @description Detiene todos los flujos de medios, elimina listeners y cierra el AudioContext.
   */
  ngOnDestroy() {
    if (this.canvasWorker) {
      this.canvasWorker.terminate();
    }
    this.stopAllStreams();
    this.removeListeners();
    this.cleanupAudioResources();
  }

  private stopAllStreams() {
    for (const stream of this.streams) this.stopStream(stream);
    for (const captura of this.capturas) this.stopStream(captura);
    for (const track of this.audiosCapturas) if (track.readyState === 'live') track.stop();
  }

  private removeListeners() {
    globalThis.window.removeEventListener('keydown', this.handleKeydownRef);
  }

  private cleanupAudioResources() {
    try {
      for (const [id, node] of this.workletNodes) {
        try {
          node.port.onmessage = null;
          node.disconnect();
          node.port.close();
        } catch (e) {
          console.warn('⚠️ error disconnect node', id, e);
        }
      }
      this.workletNodes.clear();

      for (const [id, src] of this.audioSources) {
        try {
          src.disconnect();
        } catch (e) {
          console.warn('⚠️ error disconnect node', id, e);
        }
      }
      this.audioSources.clear();

      for (const [id, g] of this.silentGains) {
        try {
          g.disconnect();
        } catch (e) {
          console.warn('⚠️ error disconnect node', id, e);
        }
      }
      this.silentGains.clear();

      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch((err) => console.warn('⚠️ Error cerrando AudioContext:', err));
      }
    } finally {
      this.workletLoaded = false;
      this.workletLoadingPromise = null;
      this.audioContext = new AudioContext();
    }
  }

  /**
   * @summary Detiene un flujo de medios.
   * @param stream El flujo de medios a detener.
   */
  private stopStream(stream: MediaStream) {
    // Detiene todos los tracks de un MediaStream
    for (const track of stream.getAudioTracks()) {
      track.stop();
      this.audiosCapturas = this.audiosCapturas.filter((t) => t.id !== track.id);
      this.audiosElements = this.audiosElements.filter((element: AudioElement) => element.id !== track.id);
      this.audiosConnections = this.audiosConnections.filter((element: AudioConnection) => element.idEntrada !== track.id || element.idSalida !== track.id);
      this.drawAudioConnections();
    }
    for (const track of stream.getVideoTracks()) {
      track.stop();
    }
  }

  /**
   * @summary Verifica si el dispositivo es móvil.
   * @description Comprueba la cadena del User Agent para determinar si se está ejecutando en un dispositivo móvil.
   * @returns {boolean} True si es móvil, false en caso contrario.
   */
  isMobile(): boolean {
    const ua = navigator.userAgent || (globalThis.window as any).opera;
    return /android|iphone|ipad|ipod|opera mini|iemobile|wpdesktop/i.test(ua);
  }

  /**
   * @summary Maneja eventos de teclado.
   * @description Detecta atajos de teclado (Ctrl + número) para activar presets.
   * @param {KeyboardEvent} event El evento de teclado.
   */
  handleKeydown(event: KeyboardEvent) {
    // Verificar si se presionó Ctrl + un número
    if (event.ctrlKey && !Number.isNaN(Number(event.key))) {
      event.preventDefault(); // Evitar el comportamiento predeterminado solo para Ctrl + número
      const shortcut = `ctrl+${event.key}`;
      const preset = Array.from(this.presets.entries()).find(([_, value]) => value.shortcut === shortcut);
      if (preset) {
        this.aplicaPreset(preset[0]);
      }
    }
  }

  aplicaPreset(name: string) {
    this._removeExistingLayers();

    const preset = this.presets.get(name);
    if (!preset) {
      console.error('Missing preset');
      return;
    }

    this._resetVideoElements();
    this._applyPresetElements(preset);
    this._reorderVideoElements(preset);
    this.cdr.detectChanges();
    this._addPresetLayer(name);
    this._addLayersToPaintedElements();
    this.updateWorkerLayers();
    this.cdr.detectChanges();
  }

  private _removeExistingLayers() {
    const elementosDiv = this.elementosDiv.nativeElement;
    if (!elementosDiv) return;

    for (const elemento of this.videosElements) {
      elementosDiv.querySelector('#capa-' + CSS.escape(elemento.id))?.remove();
    }

    this._removePresetLayers();
  }

  private _removePresetLayers() {
    if (!this.presetsDiv) return;
    const presetsDiv = this.presetsDiv.nativeElement;
    if (!presetsDiv) return;

    for (const key of Array.from(this.presets.keys())) {
      presetsDiv.querySelector(`#capa-${CSS.escape(key)}`)?.remove();
    }
  }

  private _resetVideoElements() {
    for (const elemento of this.videosElements) {
      elemento.painted = false;
      elemento.scale = 1;
      elemento.position = null;
    }
  }

  private _applyPresetElements(preset: Preset) {
    for (const element of preset.elements) {
      const ele = this.videosElements.find((el) => el.id === element.id);
      if (ele) {
        ele.scale = element.scale;
        ele.position = element.position;
        ele.painted = true;
      }
    }
  }

  private _reorderVideoElements(preset: Preset) {
    for (let i = 0; i < preset.elements.length; i++) {
      const presetElement = preset.elements[i];
      const index = this.videosElements.findIndex((el) => el.id === presetElement.id);
      if (index !== -1) {
        const [element] = this.videosElements.splice(index, 1);
        this.videosElements.splice(i, 0, element);
      }
    }
  }

  private _addPresetLayer(name: string) {
    const presetDiv = this.presetsDiv.nativeElement.querySelector(`#preset-${CSS.escape(name)}`);
    if (!presetDiv) return;

    const capa = this.capaTemplate.nativeElement.cloneNode(true) as HTMLDivElement;
    capa.id = 'capa-' + name;
    capa.querySelector('#buttonxcapa')?.addEventListener('click', () => capa.remove());
    capa.classList.remove('hidden');
    capa.style.zIndex = '10';
    (presetDiv.parentElement as HTMLDivElement).appendChild(capa);
  }

  private _addLayersToPaintedElements() {
    for (const elemento of this.videosElements.filter((e) => e.painted)) {
      this.addCapa(elemento);
    }
  }

  /**
   * @summary Finaliza la interacción de arrastre.
   * @description Lógica compartida para soltar el elemento arrastrado, restaurar estados y limpiar listeners.
   */
  /**
   * @summary Finaliza el proceso de arrastre de un elemento.
   * @description Calcula la posición final en el canvas, actualiza el estado del elemento y limpia los eventos y elementos temporales.
   * @param {MouseEvent} upEvent Evento de soltar el ratón.
   * @param {HTMLElement} ghost Elemento visual ghost.
   * @param {Function} mousemove Referencia a la función de movimiento para eliminar el listener.
   * @param {Function} mouseup Referencia a la función de subida para eliminar el listener.
   * @param {Function} wheel Referencia a la función de scroll para eliminar el listener.
   */
  private _handleDragEnd(upEvent: MouseEvent, ghost: HTMLElement, mousemove: (e: MouseEvent) => void, mouseup: (e: MouseEvent) => void, wheel: (e: WheelEvent) => void) {
    if (!this.dragVideo || !this.canvas) {
      console.error('No hay video arrastrando o canvas');
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const isMouseOverCanvas: boolean = upEvent.clientX >= rect.left && upEvent.clientX <= rect.right && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom;

    if (isMouseOverCanvas) {
      const ghostRect = ghost.getBoundingClientRect();
      const result: VideoElement | undefined = this.paintInCanvas(ghost as HTMLVideoElement | HTMLImageElement, ghostRect.width, ghostRect.height, upEvent.clientX, upEvent.clientY);
      if (!result) {
        console.error('Missing result');
        return;
      }
      this.dragVideo.scale = result.scale;
      this.dragVideo.position = result.position;
      this.dragVideo.painted = result.painted;

      this.addCapa(this.dragVideo);
      this._removePresetLayers();
      this.updateWorkerLayers();
      if (this.cross) {
        this.cross.nativeElement.style.display = 'none';
      }
    }

    this.canvas.style.border = '1px solid black';
    this.dragVideo = null;
    ghost.remove();
    if (this.cross) {
      this.cross.nativeElement.style.display = 'none';
    }
    document.removeEventListener('pointermove', mousemove);
    document.removeEventListener('wheel', wheel);
    document.removeEventListener('pointerup', mouseup);
    document.body.classList.remove('cursor-grabbing');
  }

  /**
   * @summary Inicia los flujos de medios (video y audio).
   * @description Obtiene los streams de los dispositivos de video y audio disponibles y los configura.
   * @param {MediaDeviceInfo[]} devices Lista de dispositivos de audio y video.
   */
  async startMedias(devices: MediaDeviceInfo[]) {
    // Asignar el video stream a cada dispositivo de video
    const videoPromises: Promise<void>[] = [];
    const audioInputPromises: Promise<void>[] = [];
    const audioOutputPromises: Promise<void>[] = [];

    for (const device of devices) {
      if (device.kind === 'videoinput') {
        if (!this.videoDevices.some((d) => d.deviceId === device.deviceId)) {
          this.videoDevices.push(device);
          videoPromises.push(this.getVideoStream(device.deviceId));
        }
      } else if (device.kind === 'audioinput' && device.deviceId !== 'default') {
        this.audioDevices.push(device);
        audioInputPromises.push(this.getAudioStream(device.deviceId));
      } else if (device.kind === 'audiooutput' && device.deviceId !== 'default') {
        audioOutputPromises.push(this.getAudioOutputStream(device));
      }
    }

    // Espera a que todas las promesas hayan terminado
    await Promise.all([...videoPromises, ...audioInputPromises, ...audioOutputPromises]);
    this.drawAudioConnections();
  }

  /**
   * @summary Actualiza la lista de dispositivos de audio y video.
   * @description Detecta cambios en los dispositivos conectados y actualiza las listas internas.
   */
  async updateDevices() {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      this.addNewDevices(allDevices);
      this.removeDisconnectedDevices(allDevices);
    } catch (error) {
      console.error('Error al actualizar dispositivos:', error);
    }
  }

  /**
   * @summary Añade nuevos dispositivos detectados a las listas correspondientes.
   * @param {MediaDeviceInfo[]} allDevices Lista completa de dispositivos detectados.
   */
  private addNewDevices(allDevices: MediaDeviceInfo[]) {
    for (const device of allDevices) {
      if (device.kind === 'videoinput' && !this.videoDevices.some((d) => d.deviceId === device.deviceId)) {
        this.videoDevices.push(device);
        this.getVideoStream(device.deviceId);
      } else if (device.kind === 'audioinput' && !this.audioDevices.some((d) => d.deviceId === device.deviceId)) {
        this.audioDevices.push(device);
        this.getAudioStream(device.deviceId);
      }
    }
  }

  /**
   * @summary Elimina dispositivos que ya no están conectados.
   * @param {MediaDeviceInfo[]} allDevices Lista completa de dispositivos actualmente conectados.
   */
  private removeDisconnectedDevices(allDevices: MediaDeviceInfo[]) {
    const disconnected = [...this.videoDevices.filter((d) => !allDevices.some((ad) => ad.deviceId === d.deviceId)), ...this.audioDevices.filter((d) => !allDevices.some((ad) => ad.deviceId === d.deviceId))];

    for (const device of disconnected) {
      const element = this.elementosDiv.nativeElement.querySelector(`#${CSS.escape(device.deviceId)}`) as HTMLVideoElement | HTMLAudioElement;
      if (element?.srcObject) {
        this.stopStream(element.srcObject as MediaStream);
        element.srcObject = null;
      }
    }
    this.videoDevices = this.videoDevices.filter((d) => allDevices.some((ad) => ad.deviceId === d.deviceId));
    this.audioDevices = this.audioDevices.filter((d) => allDevices.some((ad) => ad.deviceId === d.deviceId));
  }

  /**
   * @summary Obtiene el stream de video de un dispositivo específico.
   * @description Solicita acceso al stream de video de un dispositivo y configura las constraints óptimas.
   * @param {string} deviceId El ID del dispositivo de video.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el stream es obtenido.
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
        //// console.log('Capabilities:', capabilities.width?.max, 'x', capabilities.height?.max);
      }

      this.stopStream(stream);

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
      const settings = videoTrack.getSettings();

      // Encontrar el elemento <video> con el mismo ID que el dispositivo
      const div = this.deviceDivs.find((el) => el.nativeElement.id === 'div-' + deviceId);
      if (!div) {
        console.error('No se encontró el elemento div-' + deviceId);
        return;
      }
      const resolution = div.nativeElement.querySelector('#resolution');
      if (!resolution) {
        console.error('No se encontró el elemento #resolution');
        return;
      }
      resolution.innerHTML = `${settings.width}x${settings.height} ${settings.frameRate}fps`;

      const videoElement = this.videoElements.find((el) => el.nativeElement.id === deviceId);
      if (videoElement) {
        videoElement.nativeElement.srcObject = stream; // Asignar el stream al video
        videoElement.nativeElement.muted = true; // Silenciar el video por defecto para evitar salida por altavoces
        const ele: VideoElement = {
          id: deviceId,
          element: videoElement.nativeElement,
          painted: false,
          scale: 1,
          position: { x: 0, y: 0 },
        };
        this.videosElements.push(ele);
        div.nativeElement.style.filter = ele.filters ? `brightness(${ele.filters.brightness}%) contrast(${ele.filters.contrast}%) saturate(${ele.filters.saturation}%)` : '';

        // Enviar stream al worker
        const track = stream.getVideoTracks()[0];
        this.sendVideoTrackToWorker(deviceId, track);
        this.updateWorkerLayers();
      }
    } catch (error) {
      console.error('Error al obtener el stream de video:', error);
    }
  }

  /**
   * @summary Obtiene el stream de audio de un dispositivo específico.
   * @description Solicita acceso al stream de audio de un dispositivo, configura el volumen y la visualización.
   * @param {string} deviceId El ID del dispositivo de audio.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el stream es obtenido.
   */
  async getAudioStream(deviceId: string): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      });

      this.streams.push(stream);

      await this.ensureAudioContext(); // importante!!

      // Añade un controlador de volumen al dispositivo
      const volumeRef = this.volumeInputs.find((el) => el.nativeElement.id === 'volume-' + deviceId);
      if (!volumeRef) {
        console.error('No se pudo obtener la referencia volume-' + deviceId);
        return;
      }
      const volume = volumeRef.nativeElement;
      const gainNode = this.createGainNode(deviceId);
      const source = this.audioContext.createMediaStreamSource(stream);

      // Crear ecualizador
      const filters = this.createEqualizer(deviceId);
      let prevNode: AudioNode = source;
      for (const filter of filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(gainNode);

      gainNode.connect(this.mixedAudioDestination);
      const sample = this.audioContext.createMediaStreamDestination();
      gainNode.connect(sample);

      volume.oninput = () => {
        gainNode.gain.value = Number.parseInt(volume.value) / 100;
      };

      const audioLevelRef = this.audioLevelDivs.find((el) => el.nativeElement.id === 'audio-level-' + deviceId);
      if (!audioLevelRef) {
        console.error('No se pudo obtener la referencia audio-level-' + deviceId);
        return;
      }
      this.visualizeAudio(sample.stream, audioLevelRef.nativeElement); // Iniciar visualización de audio
    } catch (error) {
      console.error('Error al obtener el stream de audio:', error);
    }
  }

  /**
   * @summary Obtiene el stream de salida de audio.
   * @description Configura un dispositivo de salida de audio para reproducir el audio procesado.
   * @param {MediaDeviceInfo} device El dispositivo de salida de audio.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el stream de salida es configurado.
   */
  async getAudioOutputStream(device: MediaDeviceInfo) {
    try {
      const audio = new Audio() as HTMLAudioElement & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };

      // Verificar si el navegador soporta setSinkId
      if (typeof audio.setSinkId !== 'function') {
        console.warn('setSinkId no es soportado.');
        return;
      }

      // Guardar el dispositivo en la lista
      this.audioOutputDevices.push(device);

      await this.ensureAudioContext();

      // Crear un nodo de destino para capturar el audio procesado
      const destinationNode = this.audioContext.createMediaStreamDestination();

      // Crear un nodo de ganancia para ajustar el volumen
      const gainNode = this.audioContext.createGain();

      // Crear ecualizador
      const filters = this.createEqualizer(device.deviceId);

      // IMPORTANTE: Ponemos la ganancia a 0 para que no salga nada por defecto
      gainNode.gain.value = 0;

      // Conectar el volumen a un slider si existe
      setTimeout(() => {
        try {
          const volumeRef = this.volumeInputs.find((el) => el.nativeElement.id === 'volume-' + device.deviceId);
          if (volumeRef) {
            const volume = volumeRef.nativeElement;
            gainNode.gain.value = Number.parseInt(volume.value, 10) / 100;
            volume.oninput = () => {
              gainNode.gain.value = Number.parseInt(volume.value, 10) / 100;
            };
          } else {
            console.error('No se encontró el control de volumen para ' + device.deviceId);
          }
        } catch (e) {
          console.error('Error configurando slider de volumen:', e);
        }
      }, 500); // Aumentamos tiempo para asegurar que el DOM esté listo

      // Conectar el nodo de ganancia al destino
      let prevNode: AudioNode = gainNode;
      for (const filter of filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(destinationNode);

      // Crear un `<audio>` para reproducir el audio procesado
      audio.style.display = 'none';
      audio.srcObject = destinationNode.stream;
      audio.muted = true; // Silenciar el audio por defecto para evitar salida por altavoces

      // Intentar setSinkId
      try {
        await (audio as any).setSinkId(device.deviceId);
      } catch (err) {
        console.error('Error crítico al establecer setSinkId para ' + device.label + ':', err);
      }

      // Agregar el audio al DOM
      document.body.appendChild(audio);

      // Visualizar los niveles de audio
      const audioLevelRef = this.audioLevelDivs.find((el) => el.nativeElement.id === 'audio-level-' + device.deviceId);
      if (audioLevelRef) {
        this.visualizeAudio(destinationNode.stream, audioLevelRef.nativeElement);
      } else {
        console.error('No se encontró el elemento visualizador de audio para ' + device.deviceId);
      }

      // Retornar nodos para poder conectar fuentes de audio después
      this.audiosElements.push({ id: device.deviceId, ele: gainNode });
    } catch (error) {
      console.error('Error fatal al obtener el stream de salida de audio para ' + device.label + ':', error);
    }
  }

  /**
   * Conecta un flujo de audio a un AudioWorklet para visualizar su nivel RMS en tiempo real.
   *
   * Esta función:
   *  - Garantiza que el AudioWorklet esté cargado y el AudioContext activo.
   *  - Permite tener múltiples flujos de audio simultáneos, identificados por un `id`.
   *  - Limpia cualquier nodo previo asociado al mismo `id` para evitar conflictos.
   *  - Conecta el flujo al AudioWorklet y a un nodo silencioso para procesar audio sin emitir sonido.
   *  - Escucha los mensajes del Worklet, incluyendo:
   *      - `worker-started`: cuando el Worklet se inicia por primera vez.
   *      - `pre-worker-started`: cuando el Worklet ya estaba activo.
   *      - `rms`: valor RMS del audio, usado para actualizar la barra de nivel.
   *  - Actualiza el ancho del elemento `audioLevel` según el RMS del flujo.
   *  - Guarda referencias internas de nodos, fuentes y gains para poder limpiar más tarde.
   *
   * @param stream Flujo de audio (MediaStream) a visualizar.
   * @param audioLevel Elemento HTML (HTMLDivElement) donde se mostrará el nivel de audio.
   * @param id Identificador opcional para el flujo; si no se proporciona, se genera uno único.
   */
  async visualizeAudio(stream: MediaStream, audioLevel: HTMLDivElement, id?: string) {
    // id para identificar este worklet/nodo (usa stream.id si disponible)
    const nodeId = id ?? stream.id ?? `stream-${Math.random().toString(36).slice(2, 9)}`;

    // 1) Asegúrate del contexto y del worklet cargado (serializado)
    await this.loadAudioWorklet(); // ya hace ensureAudioContext internamente

    // 2) Si ya existe un nodo para este id, limpiarlo
    if (this.workletNodes.has(nodeId)) {
      try {
        const prevNode = this.workletNodes.get(nodeId)!;
        prevNode.port.onmessage = null;
        prevNode.disconnect();
        this.workletNodes.delete(nodeId);
      } catch (e) {
        console.warn('⚠️ Error limpiando prev worklet node', e);
      }
      // limpiar fuentes/gains también
      const prevSource = this.audioSources.get(nodeId);
      if (prevSource) {
        try {
          prevSource.disconnect();
        } catch (e) {
          console.warn('⚠️ error disconnect node', nodeId, e);
        }
        this.audioSources.delete(nodeId);
      }
      const prevGain = this.silentGains.get(nodeId);
      if (prevGain) {
        try {
          prevGain.disconnect();
        } catch (e) {
          console.warn('⚠️ error disconnect node', nodeId, e);
        }
        this.silentGains.delete(nodeId);
      }
    }

    // 3) Crear fuente y nodo (usa nombre fijo 'audio-processor')
    const source = this.audioContext.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(this.audioContext, 'audio-processor');

    // 4) Silent gain
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;

    // 5) Conexiones: source -> node -> silentGain -> Destination Fantasma
    source.connect(node);
    node.connect(silentGain);

    // Usamos un destino fantasma en lugar de audioContext.destination para evitar salida por altavoces
    const ghostDestination = this.audioContext.createMediaStreamDestination();
    silentGain.connect(ghostDestination);

    // 6) Escuchar mensajes
    node.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data.rms === 'number') {
        const percentage = Math.min(data.rms * 300, 100);
        requestAnimationFrame(() => {
          audioLevel.style.width = `${percentage}%`;
        });
      }
    };

    // 7) Guardar referencias
    this.workletNodes.set(nodeId, node);
    this.audioSources.set(nodeId, source);
    this.silentGains.set(nodeId, silentGain);
  }

  /**
   * @summary Asegura que el AudioContext esté funcionando.
   * @description Inicializa o reanuda el AudioContext si es necesario.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el AudioContext está activo.
   */
  private async ensureAudioContext(): Promise<void> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
      this.mixedAudioDestination = this.audioContext.createMediaStreamDestination();
      this.recordAudioDestination = this.audioContext.createMediaStreamDestination();
    }
    if (this.audioContext?.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn('⚠️ No se pudo reanudar AudioContext:', err);
      }
    }
  }

  /**
   * @summary Agrega un flujo de pantalla.
   * @description Solicita al usuario compartir su pantalla o ventana, y añade el stream de video y audio.
   * @returns {Promise<void>} Una promesa que se resuelve cuando el flujo de pantalla es agregado.
   */
  async addScrean() {
    try {
      // Solicitar al usuario que seleccione una ventana, aplicación o pantalla
      const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true, // Opcional: captura el audio del sistema si es compatible
      });
      this.capturas.push(stream);
      for (const track of stream.getAudioTracks()) {
        this.audiosCapturas.push(track);
      }

      setTimeout(() => {
        const div = this.captureDivs.find((el) => el.nativeElement.id === 'div-' + stream.id);
        if (!div) {
          console.error('No se pudo encontrar el elemento con id div-' + stream.id);
          return;
        }
        const resolution = div.nativeElement.querySelector('#resolution');
        if (!resolution) {
          console.error('No se pudo encontrar el elemento con id resolution');
          return;
        }
        const settings = stream.getVideoTracks()[0].getSettings();
        resolution.innerHTML = `${settings.width}x${settings.height} ${settings.frameRate}fps`;

        const videoElement = this.videoElements.find((el) => el.nativeElement.id === stream.id);
        if (videoElement) {
          videoElement.nativeElement.srcObject = stream;
          videoElement.nativeElement.muted = true; // Silenciar el video por defecto para evitar salida por altavoces
          const ele: VideoElement = {
            id: stream.id,
            element: videoElement.nativeElement,
            painted: false,
            scale: 1,
            position: { x: 0, y: 0 },
          };
          this.videosElements.push(ele);

          // Enviar stream al worker
          const track = stream.getVideoTracks()[0];
          this.sendVideoTrackToWorker(stream.id, track);
          this.updateWorkerLayers();
        }
        // Añade el contról de audio
        for (const track of stream.getAudioTracks()) {
          const audioLevelRef = this.audioLevelDivs.find((el) => el.nativeElement.id === 'audio-level-' + track.id);
          if (!audioLevelRef) {
            console.error('No se pudo encontrar la referencia audio-level-' + track.id);
            return;
          }
          const audioLevelElement = audioLevelRef.nativeElement;
          const gainNode = this.createGainNode(track.id);
          const audioStream = new MediaStream([track]);
          const source = this.audioContext.createMediaStreamSource(audioStream);

          // Crear ecualizador
          const filters = this.createEqualizer(track.id);
          let prevNode: AudioNode = source;
          for (const filter of filters) {
            prevNode.connect(filter);
            prevNode = filter;
          }
          prevNode.connect(gainNode);

          gainNode.connect(this.mixedAudioDestination);
          const sample = this.audioContext.createMediaStreamDestination();
          gainNode.connect(sample);

          const volume = this.volumeInputs.find((el) => el.nativeElement.id === 'volume-' + track.id)?.nativeElement;
          if (!volume) {
            console.error('No se pudo encontrar el elemento de volumen para el track:', track.id);
            return;
          }
          volume.oninput = () => {
            gainNode.gain.value = Number.parseInt(volume.value) / 100;
          };
          this.visualizeAudio(sample.stream, audioLevelElement, track.id); // Iniciar visualización de audio con id único
        }
      }, 100);

      // Manejar el fin de la captura
      stream.getVideoTracks()[0].onended = () => {
        this.capturas = this.capturas.filter((s) => s !== stream);
        this.audiosCapturas = this.audiosCapturas.filter((t) => t.id !== stream.id);
        // Eliminar el objeto ele del array videosElements
        this.videosElements = this.videosElements.filter((v) => v.id !== stream.id);
        this.audiosElements = this.audiosElements.filter((element: AudioElement) => element.id !== stream.id);
        this.audiosConnections = this.audiosConnections.filter((element: AudioConnection) => element.idEntrada !== stream.id || element.idSalida !== stream.id);
        this.drawAudioConnections();
      };
    } catch (error) {
      console.error('Error al capturar ventana o pantalla:', error);
    }
  }

  /**
   * @summary Abre un selector de archivos para añadir contenido estático.
   * @description Permite al usuario seleccionar múltiples archivos de imagen, video o audio para cargar.
   * @returns {Promise<void>} Una promesa que se resuelve cuando los archivos son seleccionados.
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
   * @summary Carga archivos estáticos seleccionados.
   * @description Procesa archivos de imagen, video o audio y los añade al editor.
   * @param {File[]} files Lista de archivos a cargar.
   * @returns {Promise<void>} Una promesa que se resuelve cuando los archivos son cargados.
   */
  async loadFiles(files: File[]) {
    await this.ensureAudioContextSafe();

    for (const file of files) {
      const div = this.staticDivs.find((el) => el.nativeElement.id === 'div-' + file.name);
      if (!div) {
        console.error('No se pudo encontrar el elemento con id div-' + file.name);
        continue;
      }

      if (file.type.startsWith('image/')) {
        this.processImageFile(file);
      } else if (file.type.startsWith('video/')) {
        this.processVideoFile(file);
      } else if (file.type.startsWith('audio/')) {
        this.processAudioFile(file);
      }
    }
  }

  /**
   * @summary Asegura que el AudioContext esté activo de forma segura.
   */
  private async ensureAudioContextSafe() {
    try {
      if (typeof this.ensureAudioContext === 'function') {
        await this.ensureAudioContext();
      }
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContext();
        this.mixedAudioDestination = this.audioContext.createMediaStreamDestination();
      }
    } catch (err) {
      console.warn('⚠️ No se pudo asegurar AudioContext:', err);
    }
  }

  /**
   * @summary Procesa un archivo de imagen y lo añade a los elementos de video.
   * @param {File} file El archivo de imagen.
   */
  private processImageFile(file: File) {
    const img = this.staticDivs.find((el) => el.nativeElement.id === 'div-' + file.name)?.nativeElement.querySelector('img');
    if (img) {
      const ele: VideoElement = {
        id: file.name,
        element: img,
        painted: false,
        scale: 1,
        position: null,
      };
      this.videosElements.push(ele);

      if (img.complete) {
        this.sendImageToWorker(ele);
      } else {
        img.onload = () => this.sendImageToWorker(ele);
      }
    } else {
      console.warn('Imagen no encontrada en DOM:', file.name);
    }
  }

  /**
   * @summary Procesa un archivo de video, lo añade a los elementos y configura su audio.
   * @param {File} file El archivo de video.
   */
  private processVideoFile(file: File) {
    const video = this.staticDivs.find((el) => el.nativeElement.id === 'div-' + file.name)?.nativeElement.querySelector('video');
    if (!video) {
      console.warn('Video element no encontrado en DOM:', file.name);
      return;
    }

    const ele: VideoElement = {
      id: file.name,
      element: video,
      painted: false,
      scale: 1,
      position: { x: 0, y: 0 },
    };
    this.videosElements.push(ele);
    this.audiosArchivos.push(file.name);

    // Enviar track al worker cuando el video esté listo
    const sendTrack = () => {
      const stream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
          this.sendVideoTrackToWorker(ele.id, track);
          this.updateWorkerLayers();
        }
      }
    };

    // Forzar el envío del track inicial para que se renderice aunque esté en pausa
    sendTrack();

    // Inicializar audio inmediatamente
    this.setupMediaElementAudio(video, file.name);

    video.onplaying = () => {
      sendTrack();
    };

    if (!video.paused) {
      sendTrack();
    }
  }

  /**
   * @summary Procesa un archivo de audio, lo carga y configura sus controles.
   * @param {File} file El archivo de audio.
   */
  private processAudioFile(file: File) {
    this.audiosArchivos.push(file.name);
    const audioLevelRef = this.audioLevelDivs.find((el) => el.nativeElement.id === 'audio-level-' + file.name);
    if (!audioLevelRef) {
      console.error('No se pudo encontrar la referencia audio-level-' + file.name);
      return;
    }
    const audioDiv = audioLevelRef.nativeElement;

    const audio: HTMLAudioElement = document.createElement('audio');
    audio.src = this.getFileUrl(file);
    audio.load();

    audio.onplaying = () => this.setupAudioElement(audio, file.name, audioDiv);
    this.setupAudioControls(audio, audioDiv, file);
  }

  /**
   * @summary Configura el audio para un elemento multimedia (video o audio).
   * @param {HTMLVideoElement | HTMLAudioElement} element El elemento multimedia.
   * @param {string} id ID único del elemento.
   */
  private setupMediaElementAudio(element: HTMLVideoElement | HTMLAudioElement, id: string) {
    // Intentar buscar el elemento en el DOM después de un pequeño retardo
    // ya que el @for de Angular puede tardar un ciclo en renderizar el elemento.
    setTimeout(() => {
      const audioLevelRef = this.audioLevelDivs.find((el) => el.nativeElement.id === 'audio-level-' + id);
      if (!audioLevelRef) {
        console.warn('No se pudo encontrar audioLevelRef para:', id, 'después de retardo.');
        return;
      }
      const audioDiv = audioLevelRef.nativeElement;

      // Inicializar ecualizador para archivos de video
      this.createEqualizer(id);

      this.setupAudioElement(element, id, audioDiv);
    }, 100);
  }

  /**
   * @summary Inicializa los nodos de audio y la visualización para un elemento.
   * @param {HTMLMediaElement} element El elemento multimedia.
   * @param {string} id ID único.
   * @param {HTMLDivElement} audioDiv Contenedor para la visualización del nivel de audio.
   */
  private setupAudioElement(element: HTMLMediaElement, id: string, audioDiv: HTMLDivElement) {
    const gainNode = this.createGainNode(id);
    let source = this.mediaElementSources.get(element);
    if (!source) {
      source = this.audioContext.createMediaElementSource(element);
      element.muted = true; // Silenciar el elemento multimedia por defecto
      this.mediaElementSources.set(element, source);
    }

    // Crear ecualizador
    const filters = this.createEqualizer(id);
    let prevNode: AudioNode = source;
    for (const filter of filters) {
      prevNode.connect(filter);
      prevNode = filter;
    }
    prevNode.connect(gainNode);

    gainNode.connect(this.mixedAudioDestination);
    const sample = this.audioContext.createMediaStreamDestination();
    gainNode.connect(sample);

    const volumeRef = this.volumeInputs.find((el) => el.nativeElement.id === 'volume-' + id);
    if (volumeRef) {
      volumeRef.nativeElement.oninput = () => (gainNode.gain.value = Number.parseInt(volumeRef.nativeElement.value, 10) / 100);
    }
    this.visualizeAudio(sample.stream, audioDiv, id).catch((err) => console.error('Error visualizando audio:', err));
  }

  private createEqualizer(id: string): BiquadFilterNode[] {
    const frequencies = [60, 250, 1000, 4000, 12000];
    const filters = frequencies.map((freq) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    this.equalizerFilters.set(id, filters);
    return filters;
  }

  /**
   * @summary Configura los controles interactivos (play, pause, loop, progreso) para un audio.
   * @param {HTMLAudioElement} audio El elemento de audio.
   * @param {HTMLDivElement} audioDiv El contenedor de controles.
   * @param {File} file El archivo original.
   */
  private setupAudioControls(audio: HTMLAudioElement, audioDiv: HTMLDivElement, file: File) {
    const controls = {
      playPause: audioDiv.querySelector('#play-pause') as HTMLButtonElement,
      play: audioDiv.querySelector('#play') as SVGElement,
      pause: audioDiv.querySelector('#pause') as SVGElement,
      restart: audioDiv.querySelector('#restart') as HTMLButtonElement,
      loop: audioDiv.querySelector('#loop') as HTMLButtonElement,
      loopOff: audioDiv.querySelector('#loop-off') as SVGElement,
      loopOn: audioDiv.querySelector('#loop-on') as SVGElement,
      time: audioDiv.querySelector('#time') as HTMLSpanElement,
      progress: audioDiv.querySelector('#progress') as HTMLInputElement,
    };
    if (!controls.playPause || !controls.restart || !controls.loop || !controls.time || !controls.progress) return;

    controls.playPause.onclick = () => {
      if (audio.paused) {
        audio.play();
        controls.play.style.display = 'none';
        controls.pause.style.display = 'block';
      } else {
        audio.pause();
        controls.play.style.display = 'block';
        controls.pause.style.display = 'none';
      }
    };
    controls.restart.onclick = () => (audio.currentTime = 0);
    controls.loop.onclick = () => {
      audio.loop = !audio.loop;
      controls.loopOff.style.display = audio.loop ? 'none' : 'block';
      controls.loopOn.style.display = audio.loop ? 'block' : 'none';
    };

    audio.onloadedmetadata = () => {
      const duration = this.formatTime(audio.duration);
      audio.ontimeupdate = () => {
        const percentage = (audio.currentTime / audio.duration) * 100;
        controls.progress.value = percentage.toString();
        controls.time.innerText = `${this.formatTime(audio.currentTime)} / ${duration}`;
      };
    };
  }

  /**
   * @summary Obtiene la URL de objeto de un archivo.
   * @description Utiliza caché para devolver la URL creada con URL.createObjectURL.
   * @param {File} file El archivo.
   * @returns {string} La URL del archivo.
   */
  getFileUrl(file: File): string {
    if (!this.fileUrlCache.has(file)) {
      const url = URL.createObjectURL(file);
      this.fileUrlCache.set(file, url);
    }
    return this.fileUrlCache.get(file) as string;
  }

  /**
   * @summary Cambia la resolución de la emisión.
   * @description Actualiza el ancho y alto del lienzo de la emisión según la selección.
   * @param {Event} $event El evento de cambio.
   * @param {string} res La resolución seleccionada en formato "ancho x alto".
   */
  cambiarResolucion($event: Event, res: string) {
    const selected = this.selected.nativeElement;
    const value = selected.querySelector('#value');
    if (!value) {
      console.error('Missing value element');
      return;
    }
    const string = ($event.target as HTMLDivElement).innerHTML;
    const [width, height] = res.split('x');
    this.canvasWidth = Number.parseInt(width);
    this.canvasHeight = Number.parseInt(height);

    if (this.canvasWorker) {
      this.canvasWorker.postMessage({ type: 'resize', payload: { width: this.canvasWidth, height: this.canvasHeight } });
    }

    value.innerHTML = string;
    this.isResolutionSelectorVisible = false;
  }

  /**
   * @summary Cambia los FPS de la emisión.
   * @description Actualiza la tasa de fotogramas por segundo y reinicia el intervalo de dibujado.
   * @param {string} fps Los FPS seleccionados.
   */
  cambiarFPS(fps: string) {
    this.canvasFPS = Number.parseInt(fps);
    if (this.drawInterval) {
      clearInterval(this.drawInterval);
    }
  }

  /**
   * @summary Inicia el arrastre de un elemento visual.
   * @description Crea un "ghost" del elemento arrastrado y gestiona su movimiento y redimensionamiento sobre el canvas.
   * @param {MouseEvent} event El evento de ratón.
   * @param {string} deviceId El ID del elemento arrastrado.
   */
  mousedown(event: MouseEvent, deviceId: string) {
    if (event.button !== 0) return;
    event.preventDefault();

    const ele = this.videosElements.find((el) => el.id === deviceId);
    if (!ele?.element || !this.canvas) {
      console.error('No hay elemento o canvas');
      return;
    }
    const videoElement = ele.element;

    this.dragVideo = ele;

    let ghost: HTMLVideoElement | HTMLImageElement;
    if (videoElement instanceof HTMLVideoElement) {
      ghost = videoElement.cloneNode(true) as HTMLVideoElement;
    } else if (videoElement instanceof HTMLImageElement) {
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
    if (ele.element instanceof HTMLVideoElement && ghost instanceof HTMLVideoElement) {
      ghost.srcObject = ele.element.srcObject;
      ghost.load();
    } else if (ele.element instanceof HTMLImageElement && ghost instanceof HTMLImageElement) {
      ghost.src = ele.element.src;
    } else {
      console.error('Tipo de elemento no reconocido');
      return;
    }

    // Dimensiones del video

    const updateGhostPosition = (x: number, y: number, element: HTMLElement) => {
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;
      const offsetX = elementWidth / 2;
      const offsetY = elementHeight / 2 - window.scrollY;

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
      const isMouseOverCanvas: boolean = wheelEvent.clientX >= rect.left && wheelEvent.clientX <= rect.right && wheelEvent.clientY >= rect.top && wheelEvent.clientY <= rect.bottom;

      if (isMouseOverCanvas) {
        wheelEvent.preventDefault();
        // Obtener tamaño actual del ghost
        const ghostStyles = globalThis.window.getComputedStyle(ghost);
        const currentWidth = Number.parseFloat(ghostStyles.width);
        const currentHeight = Number.parseFloat(ghostStyles.height);

        // Obtener posición actual del ghost
        const currentLeft = Number.parseFloat(ghostStyles.left);
        const currentTop = Number.parseFloat(ghostStyles.top);

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
    const cross = this.cross.nativeElement;

    cross.style.display = 'block';
    const vertical = cross.querySelector('#vertical') as HTMLDivElement;
    const horizontal = cross.querySelector('#orizontal') as HTMLDivElement;
    if (vertical) vertical.style.display = 'none';
    if (horizontal) horizontal.style.display = 'none';

    const mousemove = (moveEvent: MouseEvent) => {
      this.handleDragMove(moveEvent, ghost, vertical, horizontal);
    };
    document.addEventListener('pointermove', mousemove);

    // Evento para soltar el ratón
    const mouseup = (upEvent: MouseEvent) => {
      this._handleDragEnd(upEvent, ghost, mousemove, mouseup, wheel);
    };
    document.addEventListener('pointerup', mouseup);
  }

  /**
   * @summary Obtiene el rectángulo en pantalla de un elemento de video.
   * @param {VideoElement} video El elemento de video.
   * @returns {Object | null} El rectángulo con coordenadas de pantalla.
   */
  private _getElementScreenRect(video: VideoElement): { left: number; top: number; right: number; bottom: number } | null {
    if (!video.position || !this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;

    const { videoWidth, videoHeight } = this._getVideoDimensions(video);

    const left = video.position.x * scaleX + rect.left;
    const top = video.position.y * scaleY + rect.top;
    const width = videoWidth * scaleX;
    const height = videoHeight * scaleY;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

  /**
   * @summary Calcula las intersecciones de forma matemática sin leer el DOM repetidamente.
   * @param {Object} principalRect Rectángulo del elemento que se mueve.
   * @param {string} excludeId ID a excluir del cálculo.
   * @returns {string[]} Lista de IDs de elementos que colisionan.
   */
  private colisionesMatematicas(principalRect: { left: number; top: number; right: number; bottom: number }, excludeId?: string): string[] {
    const idsIntersecados: string[] = [];
    if (!this.canvas) return idsIntersecados;

    const canvasRect = this.canvas.getBoundingClientRect();

    // Colisión con bordes del canvas
    const tocaBorde = principalRect.left <= canvasRect.left || principalRect.right >= canvasRect.right || principalRect.top <= canvasRect.top || principalRect.bottom >= canvasRect.bottom;

    if (tocaBorde) {
      idsIntersecados.push('canvas-container');
    }

    // Colisión con otros elementos
    for (const video of this.videosElements) {
      if (!video.painted || video.id === excludeId) continue;

      const rect2 = this._getElementScreenRect(video);
      if (!rect2) continue;

      const intersecta = principalRect.left < rect2.right && principalRect.right > rect2.left && principalRect.top < rect2.bottom && principalRect.bottom > rect2.top;

      if (intersecta) {
        idsIntersecados.push(`marco-${video.id}`);
      }
    }

    return idsIntersecados;
  }

  /**
   * @summary Actualiza los estilos del canvas y elementos en colisión durante el arrastre.
   * @param {string[]} interseccionesIds Lista de IDs de elementos con los que colisiona.
   * @param {HTMLElement} ghost Elemento ghost.
   */
  private updateCanvasAndCollisionStylesByIds(interseccionesIds: string[], ghost: HTMLElement) {
    if (interseccionesIds.length > 0) {
      ghost.style.border = '2px solid #b91c1c';
    } else {
      ghost.style.border = '2px solid #1d4ed8';
    }

    // Resetear bordes de todos los marcos visibles
    const rendered = this.videosElements.filter((v) => v.painted);
    for (const v of rendered) {
      const marco = this.canvasContainer.nativeElement.querySelector(`#marco-${CSS.escape(v.id)}`) as HTMLElement;
      if (marco) {
        marco.style.border = '1px solid black';
      }
    }
    if (this.canvas) this.canvas.style.border = '1px solid black';

    for (const id of interseccionesIds) {
      if (id === 'canvas-container') {
        if (this.canvas) this.canvas.style.border = '2px solid #b91c1c';
      } else {
        const elemento = this.canvasContainer.nativeElement.querySelector(`#${CSS.escape(id)}`) as HTMLElement;
        if (elemento) {
          elemento.style.border = '2px solid #b91c1c';
          elemento.style.visibility = 'visible';
        }
      }
    }
  }

  /**
   * @summary Maneja el movimiento del elemento "ghost" durante el arrastre.
   * @param {MouseEvent} moveEvent Evento de movimiento del ratón.
   * @param {HTMLElement} ghost Elemento visual que representa el objeto arrastrado.
   * @param {HTMLElement} vertical Línea guía vertical.
   * @param {HTMLElement} horizontal Línea guía horizontal.
   */
  private handleDragMove(moveEvent: MouseEvent, ghost: HTMLElement, vertical: HTMLElement, horizontal: HTMLElement) {
    if (this.ticking) return;
    this.ticking = true;

    requestAnimationFrame(() => {
      try {
        if (!this.dragVideo || !this.canvas) return;

        this.updateGhostPosition(moveEvent.clientX, moveEvent.clientY, ghost);
        const rect = this.canvas.getBoundingClientRect();
        const ghostRect = ghost.getBoundingClientRect();
        const intersection = this.getIntersection(rect, ghostRect);
        const isIntersecting = intersection.left < intersection.right && intersection.top < intersection.bottom;

        this.updateGhostStyles(ghost, intersection, ghostRect, isIntersecting);

        if (isIntersecting) {
          const interseccionesIds = this.colisionesMatematicas(ghostRect, this.dragVideo.id);
          this.moverCruzPosicionamiento(moveEvent.clientX, moveEvent.clientY, interseccionesIds);
          this.updateCanvasAndCollisionStylesByIds(interseccionesIds, ghost);
        } else {
          vertical.style.display = 'none';
          horizontal.style.display = 'none';
        }
      } catch (error) {
        console.error('Error al mover el video: ', error);
      } finally {
        this.ticking = false;
      }
    });
  }

  /**
   * @summary Calcula la intersección entre el canvas y el elemento ghost.
   * @param {DOMRect} rect Rectángulo del canvas.
   * @param {DOMRect} ghostRect Rectángulo del elemento ghost.
   * @returns {Object} Coordenadas de la intersección.
   */
  private getIntersection(rect: DOMRect, ghostRect: DOMRect) {
    return {
      left: Math.max(rect.left, ghostRect.left),
      top: Math.max(rect.top, ghostRect.top),
      right: Math.min(rect.right, ghostRect.right),
      bottom: Math.min(rect.bottom, ghostRect.bottom),
    };
  }

  /**
   * @summary Actualiza los estilos visuales del ghost basándose en su posición y colisión.
   * @param {HTMLElement} ghost Elemento ghost.
   * @param {any} intersection Datos de intersección.
   * @param {DOMRect} ghostRect Rectángulo del ghost.
   * @param {boolean} isIntersecting Indica si hay intersección con el canvas.
   */
  private updateGhostStyles(ghost: HTMLElement, intersection: any, ghostRect: DOMRect, isIntersecting: boolean) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const isFullyContained = ghostRect.left >= rect.left && ghostRect.top >= rect.top && ghostRect.right <= rect.right && ghostRect.bottom <= rect.bottom;

    if (isIntersecting) {
      ghost.style.clipPath = `polygon(${((intersection.left - ghostRect.left) / ghostRect.width) * 100}% ${((intersection.top - ghostRect.top) / ghostRect.height) * 100}%, ${((intersection.right - ghostRect.left) / ghostRect.width) * 100}% ${((intersection.top - ghostRect.top) / ghostRect.height) * 100}%, ${((intersection.right - ghostRect.left) / ghostRect.width) * 100}% ${((intersection.bottom - ghostRect.top) / ghostRect.height) * 100}%, ${((intersection.left - ghostRect.left) / ghostRect.width) * 100}% ${((intersection.bottom - ghostRect.top) / ghostRect.height) * 100}%)`;
      const color = isFullyContained ? '#1d4ed8' : '#b91c1c';
      ghost.style.border = `2px solid ${color}`;
      this.canvas.style.border = `2px solid ${color}`;
    } else {
      ghost.style.clipPath = 'none';
      ghost.style.border = '1px solid black';
      this.canvas.style.border = '1px solid black';
    }
  }

  /**
   * @summary Actualiza un filtro de video.
   * @param {string} filter El nombre del filtro.
   * @param {number} value El valor del filtro.
   */
  public updateFilter(filter: string, value: number) {
    if (!this.selectedVideoForFilter) return;

    this.selectedVideoForFilter.filters![filter as keyof { brightness: number; contrast: number; saturation: number }] = value;

    const ele = this.selectedVideoForFilter;
    if (ele.element) {
      ele.element.style.filter = `brightness(${ele.filters!.brightness}%) contrast(${ele.filters!.contrast}%) saturate(${ele.filters!.saturation}%)`;
    }
  }

  /**
   * @summary Muestra el menú de filtros para un elemento de video.
   * @param {MouseEvent} event Evento de ratón.
   * @param {VideoElement} ele Elemento de video seleccionado.
   */
  private showFilterMenu(event: MouseEvent, ele: VideoElement) {
    event.preventDefault(); // Bloquea el menú contextual del navegador
    event.stopPropagation();

    ele.filters ??= {
      brightness: 100,
      contrast: 100,
      saturation: 100,
    };

    const filterMenu = this.filterMenu.nativeElement;

    this.selectedVideoForFilter = ele;

    // Actualizar sliders con los valores actuales del elemento
    if (this.filterSliders) {
      const sliders = this.filterSliders.toArray();
      if (sliders[0]) sliders[0].nativeElement.value = ele.filters!.brightness.toString();
      if (sliders[1]) sliders[1].nativeElement.value = ele.filters!.contrast.toString();
      if (sliders[2]) sliders[2].nativeElement.value = ele.filters!.saturation.toString();
    } else {
      console.log('No se encontraron sliders');
    }

    // Mostrar el menú
    filterMenu.style.display = 'flex';

    // Calcular posición evitando que se salga de la pantalla
    const menuWidth = filterMenu.offsetWidth;
    const menuHeight = filterMenu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY - menuHeight;

    // Ajustar si se sale por la derecha
    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 5;
    }
    // Ajustar si se sale por arriba
    if (top < 0) {
      top = event.clientY; // Si no cabe arriba, ponerlo debajo del cursor
    }

    filterMenu.style.left = `${left}px`;
    filterMenu.style.top = `${top}px`;

    // Función para cerrar el menú
    const closeFilterMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      // No cerrar si el clic es dentro del menú o en un input (evita conflictos con sliders)
      if (filterMenu.contains(target) || target.tagName === 'INPUT') {
        return;
      }
      this.selectedVideoForFilter = null;
      filterMenu.style.display = 'none';
      document.removeEventListener('click', closeFilterMenu);
      window.removeEventListener('scroll', closeFilterMenu);
      window.removeEventListener('resize', closeFilterMenu);
    };

    // Escuchar clics fuera, scroll y resize para cerrar
    setTimeout(() => {
      document.addEventListener('click', closeFilterMenu);
      window.addEventListener('scroll', closeFilterMenu);
      window.addEventListener('resize', closeFilterMenu);
    }, 0);
  }

  /**
   * @summary Muestra el menú de ecualizador para un elemento de audio.
   * @param {MouseEvent} event Evento de ratón.
   * @param {string} audioId ID del audio seleccionado.
   */
  private showEqualizerMenu(event: MouseEvent, audioId: string) {
    event.preventDefault();
    event.stopPropagation();

    // El ID que viene del HTML podría tener el prefijo 'audio-'
    // Pero necesitamos asegurarnos de que el ID con el que buscamos en el mapa
    // sea EXACTAMENTE el que se usó al llamar a createEqualizer.
    // Analizando los logs, el ID en el mapa es 'cd1a31...' y el que intentas buscar es 'audio-cd1a31...'

    // Intentemos quitar 'audio-' solo si está presente.
    const actualId = audioId.startsWith('audio-') ? audioId.replace('audio-', '') : audioId;
    this.selectedAudioForEqualizer = actualId;

    console.log('Buscando ecualizador para:', this.selectedAudioForEqualizer);
    console.log('Map de filtros actual:', Array.from(this.equalizerFilters.keys()));

    const filters = this.equalizerFilters.get(this.selectedAudioForEqualizer);
    if (filters) {
      this.equalizerValues = filters.map((f) => f.gain.value);
      this.cdr.detectChanges();
    } else {
      console.warn('No se encontró ecualizador para:', this.selectedAudioForEqualizer);
    }

    const equalizerMenu = this.equalizerMenu.nativeElement;
    equalizerMenu.style.display = 'flex';
    this.cdr.detectChanges();

    // Sincronizar sliders con los valores reales del nodo de audio
    const domFilters = this.equalizerFilters.get(actualId);
    if (domFilters) {
      const sliders = equalizerMenu.querySelectorAll('input[type="range"]');
      domFilters.forEach((filter, index) => {
        if (sliders[index]) {
          (sliders[index] as HTMLInputElement).value = filter.gain.value.toString();
        }
      });
    }

    // Calcular posición evitando que se salga de la pantalla
    const menuWidth = equalizerMenu.offsetWidth;
    const menuHeight = equalizerMenu.offsetHeight;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let left = event.clientX;
    let top = event.clientY - menuHeight;

    // Ajustar si se sale por la derecha
    if (left + menuWidth > screenWidth) {
      left = screenWidth - menuWidth - 5;
    }
    // Ajustar si se sale por arriba
    if (top < 0) {
      top = event.clientY; // Si no cabe arriba, ponerlo debajo del cursor
    }

    equalizerMenu.style.left = `${left}px`;
    equalizerMenu.style.top = `${top}px`;

    // Función para cerrar el menú
    const closeEqualizerMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      // No cerrar si el clic es dentro del menú o en un input (evita conflictos con sliders)
      if (equalizerMenu.contains(target) || target.tagName === 'INPUT') {
        return;
      }
      this.selectedAudioForEqualizer = null;
      equalizerMenu.style.display = 'none';
      document.removeEventListener('click', closeEqualizerMenu);
      window.removeEventListener('scroll', closeEqualizerMenu);
      window.removeEventListener('resize', closeEqualizerMenu);
    };

    // Escuchar clics fuera, scroll y resize para cerrar
    setTimeout(() => {
      document.addEventListener('click', closeEqualizerMenu);
      window.addEventListener('scroll', closeEqualizerMenu);
      window.addEventListener('resize', closeEqualizerMenu);
    }, 0);
  }

  /**
   * @summary Maneja el movimiento del ratón sobre el canvas.
   * @description Detecta si el ratón está sobre un video renderizado y muestra un marco de edición.
   * @param {MouseEvent} event El evento de movimiento del ratón.
   */
  canvasMouseMove(event: MouseEvent) {
    event.preventDefault();
    if (this.editandoDimensiones) return;

    const { internalMouseX, internalMouseY, scaleX, scaleY } = this._getMouseInternalCoordinates(event);
    const rendered = this.videosElements
      .filter((video) => video.painted)
      .slice()
      .reverse();
    const originalGhost = this.marcoTemplate.nativeElement;
    let finded = false;

    for (const video of rendered) {
      const { videoWidth, videoHeight } = this._getVideoDimensions(video);
      const videoLeft = video.position ? video.position.x : 0;
      const videoTop = video.position ? video.position.y : 0;

      const isMouseOverVideo = internalMouseX >= videoLeft && internalMouseX <= videoLeft + videoWidth && internalMouseY >= videoTop && internalMouseY <= videoTop + videoHeight;

      let ghostDiv = this.canvasContainer.nativeElement.querySelector(`#marco-${CSS.escape(video.id)}`) as HTMLDivElement;
      if (!ghostDiv) {
        ghostDiv = this._createGhostDiv(video, originalGhost);
      }

      if (isMouseOverVideo && !finded) {
        this._updateGhostDivVisibility(ghostDiv, videoLeft, videoTop, videoWidth, videoHeight, scaleX, scaleY);
        this._setupGhostDivActions(ghostDiv, video);
        this._updateGhostDivDiagonals(ghostDiv);
        finded = true;
      } else {
        ghostDiv.style.visibility = 'hidden';
        ghostDiv.removeEventListener('pointermove', this.boundCanvasMouseMove);
      }
    }
  }

  /**
   * @summary Obtiene las coordenadas internas del ratón relativas al canvas.
   * @param {MouseEvent} event Evento de ratón.
   * @returns {Object} Coordenadas internas y escalas.
   */
  private _getMouseInternalCoordinates(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const mousex = Math.max(0, Math.round(event.clientX - rect.left));
    const mousey = Math.max(0, Math.round(event.clientY - rect.top));
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      internalMouseX: mousex * scaleX,
      internalMouseY: mousey * scaleY,
      scaleX,
      scaleY,
    };
  }

  /**
   * @summary Obtiene las dimensiones actuales (escaladas) de un video o imagen.
   * @param {any} video Objeto de video o imagen.
   * @returns {Object} Ancho y alto calculados.
   */
  private _getVideoDimensions(video: any) {
    let videoWidth = 0;
    let videoHeight = 0;
    if (video.element instanceof HTMLVideoElement) {
      videoWidth = video.element.videoWidth * video.scale;
      videoHeight = video.element.videoHeight * video.scale;
    } else if (video.element instanceof HTMLImageElement) {
      videoWidth = video.element.naturalWidth * video.scale;
      videoHeight = video.element.naturalHeight * video.scale;
    } else {
      console.error('Tipo de elemento no reconocido');
    }
    return { videoWidth, videoHeight };
  }

  /**
   * @summary Crea un div "ghost" (marco de edición) para un elemento.
   * @param {any} video Elemento de video.
   * @param {any} originalGhost Plantilla del marco.
   * @returns {HTMLDivElement} El div creado.
   */
  private _createGhostDiv(video: any, originalGhost: any) {
    const ghostDiv = originalGhost.cloneNode(true) as HTMLDivElement;
    const tiradores: NodeListOf<HTMLDivElement> = ghostDiv.querySelectorAll('[id*="tirador-"]');
    for (const tirador of tiradores) {
      tirador.addEventListener('pointerdown', (event: MouseEvent) => {
        this.redimensionado(event);
      });
    }
    ghostDiv.id = 'marco-' + video.id;
    this.canvasContainer.nativeElement.appendChild(ghostDiv);
    return ghostDiv;
  }

  /**
   * @summary Actualiza la visibilidad y posición de un marco de edición.
   * @param {HTMLDivElement} ghostDiv El marco de edición.
   * @param {number} videoLeft Posición X.
   * @param {number} videoTop Posición Y.
   * @param {number} videoWidth Ancho.
   * @param {number} videoHeight Alto.
   * @param {number} scaleX Escala horizontal.
   * @param {number} scaleY Escala vertical.
   */
  private _updateGhostDivVisibility(ghostDiv: HTMLDivElement, videoLeft: number, videoTop: number, videoWidth: number, videoHeight: number, scaleX: number, scaleY: number) {
    ghostDiv.style.position = 'absolute';
    ghostDiv.style.left = `${videoLeft / scaleX}px`;
    ghostDiv.style.top = `${videoTop / scaleY}px`;
    ghostDiv.style.width = `${videoWidth / scaleX}px`;
    ghostDiv.style.height = `${videoHeight / scaleY}px`;
    ghostDiv.style.visibility = 'visible';
  }

  /**
   * @summary Configura las acciones (como eliminar) en un marco de edición.
   * @param {HTMLDivElement} ghostDiv El marco de edición.
   * @param {any} video El elemento asociado.
   */
  private _setupGhostDivActions(ghostDiv: HTMLDivElement, video: any) {
    const buttonX = ghostDiv.querySelector('#buttonx') as HTMLButtonElement;
    buttonX.onclick = () => {
      video.painted = false;
      video.position = null;
      video.scale = 1;
      ghostDiv.remove();
      const capaElement = this.elementosDiv.nativeElement.querySelector(`#capa-${CSS.escape(video.id)}`);
      if (capaElement) capaElement.remove();
      const marcoElement = this.canvasContainer.nativeElement.querySelector(`#marco-${CSS.escape(video.id)}`) as HTMLElement;
      if (marcoElement) marcoElement.remove();
      this._removePresetLayers();
      this.updateWorkerLayers();
    };
    ghostDiv.addEventListener('pointermove', this.boundCanvasMouseMove);
  }

  /**
   * @summary Actualiza las líneas diagonales de un marco de edición.
   * @param {HTMLDivElement} ghostDiv El marco de edición.
   */
  private _updateGhostDivDiagonals(ghostDiv: HTMLDivElement) {
    const diagonalLength = Math.sqrt(Math.pow(ghostDiv.clientWidth, 2) + Math.pow(ghostDiv.clientHeight, 2));
    const line1 = ghostDiv.querySelector('#line1') as HTMLDivElement;
    line1.style.width = `${diagonalLength}px`;
    line1.style.transform = `rotate(${Math.atan2(ghostDiv.clientHeight, ghostDiv.clientWidth)}rad)`;
    const line2 = ghostDiv.querySelector('#line2') as HTMLDivElement;
    line2.style.width = `${diagonalLength}px`;
    line2.style.transform = `rotate(${-Math.atan2(ghostDiv.clientHeight, ghostDiv.clientWidth)}rad)`;
    line2.style.right = '0px';
    line2.style.top = '0px';
  }

  /**
   * @summary Maneja la salida del ratón del canvas.
   * @description Oculta los marcos de edición de los videos cuando el ratón sale del área del canvas.
   */
  canvasMouseLeave() {
    const rendered = this.videosElements.filter((video) => video.painted);
    if (rendered.length > 0) {
      for (const video of rendered) {
        const marco = this.canvasContainer.nativeElement.querySelector(`#marco-${CSS.escape(video.id)}`) as HTMLElement;
        if (marco) {
          marco.style.visibility = 'hidden';
          marco.removeEventListener('pointermove', this.boundCanvasMouseMove);
        }
      }
    }
  }

  /**
   * @summary Inicia el redimensionamiento de un elemento en el canvas.
   * @description Permite redimensionar y mover un elemento visual en el canvas, mostrando cruces de posicionamiento y detectando colisiones.
   * @param {MouseEvent} $event El evento de ratón que inicia el redimensionamiento.
   */
  redimensionado($event: MouseEvent) {
    const canvasContainer = this.canvasContainer.nativeElement;
    const tiradorId = ($event.target as HTMLElement).id;
    const ghostId = ($event.target as HTMLElement).parentElement?.id;
    const posicionInicial = { x: $event.clientX, y: $event.clientY };

    if (!tiradorId || !ghostId || !canvasContainer || !this.canvas) {
      console.error('Missing required elements for resizing');
      return;
    }

    const ghostDiv = canvasContainer.querySelector(`#${CSS.escape(ghostId)}`) as HTMLElement;
    if (!ghostDiv) return;

    const deviceId = ghostId.substring(6);
    this._startResizing(ghostDiv, deviceId);

    const mouseMove = ($event2: MouseEvent) => {
      const difX = $event2.clientX - posicionInicial.x;
      const difY = $event2.clientY - posicionInicial.y;

      this._handleResizingStep(ghostDiv, tiradorId, difX, difY);

      posicionInicial.x = $event2.clientX;
      posicionInicial.y = $event2.clientY;

      this._updateResizingUI(ghostDiv, deviceId);
    };

    const mouseup = () => {
      this._finishResizing(ghostDiv, ghostId, mouseMove, mouseup);
    };

    canvasContainer.addEventListener('pointermove', mouseMove);
    canvasContainer.addEventListener('pointerup', mouseup);
  }

  /**
   * @summary Inicia el estado de redimensionamiento.
   * @param {HTMLElement} ghostDiv El marco que se va a redimensionar.
   * @param {string} deviceId ID del dispositivo.
   */
  private _startResizing(ghostDiv: HTMLElement, deviceId: string) {
    this.editandoDimensiones = true;
    if (this.cross) {
      this.cross.nativeElement.style.display = 'block';
    }
    this._updateResizingUI(ghostDiv, deviceId);
  }

  /**
   * @summary Maneja un paso individual (movimiento del ratón) durante el redimensionamiento.
   * @param {HTMLElement} ghostDiv El marco.
   * @param {string} tiradorId ID del tirador usado.
   * @param {number} difX Diferencia en X.
   * @param {number} difY Diferencia en Y.
   */
  private _handleResizingStep(ghostDiv: HTMLElement, tiradorId: string, difX: number, difY: number) {
    if (!this.canvas) return;
    this.canvas.style.border = '2px solid #1d4ed8';

    const canvasContainer = this.canvasContainer.nativeElement;
    const elementos: NodeListOf<HTMLDivElement> = canvasContainer.querySelectorAll('[id^="marco"]');
    for (const elemento of elementos) {
      if (elemento.id !== ghostDiv.id) {
        elemento.style.visibility = 'hidden';
      }
    }

    this.handleResizing(tiradorId, difX, difY, ghostDiv, this._recalculaDiagonales.bind(this));
  }

  /**
   * @summary Recalcula las líneas diagonales de un marco tras un cambio de tamaño.
   * @param {HTMLElement} ghostDiv El marco.
   */
  private _recalculaDiagonales(ghostDiv: HTMLElement) {
    const linea1: HTMLDivElement | null = ghostDiv.querySelector('#line1');
    const linea2: HTMLDivElement | null = ghostDiv.querySelector('#line2');

    if (!linea1 || !linea2) return;

    const diagonalLength = Math.sqrt(Math.pow(ghostDiv.clientWidth, 2) + Math.pow(ghostDiv.clientHeight, 2));
    const angle = Math.atan2(ghostDiv.clientHeight, ghostDiv.clientWidth);

    linea1.style.width = `${diagonalLength}px`;
    linea1.style.transform = `rotate(${angle}rad)`;

    linea2.style.width = `${diagonalLength}px`;
    linea2.style.transform = `rotate(${-angle}rad)`;
    linea2.style.right = '0px';
    linea2.style.top = '0px';
  }

  /**
   * @summary Actualiza la interfaz de usuario (colisiones, cruces) durante el redimensionamiento.
   * @param {HTMLElement} ghostDiv El marco.
   * @param {string} deviceId ID del dispositivo.
   */
  private _updateResizingUI(ghostDiv: HTMLElement, deviceId: string) {
    if (this.ticking) return;
    this.ticking = true;

    requestAnimationFrame(() => {
      try {
        if (!this.canvas) return;

        const ghostRect = ghostDiv.getBoundingClientRect();
        const interseccionesIds = this.colisionesMatematicas(ghostRect, deviceId);
        const rect = this.canvas.getBoundingClientRect();
        const centroX = ghostDiv.offsetLeft + ghostDiv.offsetWidth / 2 + rect.x;
        const centroY = ghostDiv.offsetTop + ghostDiv.offsetHeight / 2 + rect.y;

        this.moverCruzPosicionamiento(centroX, centroY, interseccionesIds);
        this.updateCanvasAndCollisionStylesByIds(interseccionesIds, ghostDiv);
      } finally {
        this.ticking = false;
      }
    });
  }

  /**
   * @summary Finaliza el proceso de redimensionamiento y actualiza el elemento en el canvas.
   * @param {HTMLElement} ghostDiv El marco.
   * @param {string} ghostId ID del marco.
   * @param {any} moveFn Referencia a la función de movimiento para eliminar el listener.
   * @param {any} upFn Referencia a la función de subida para eliminar el listener.
   */
  private _finishResizing(ghostDiv: HTMLElement, ghostId: string, moveFn: any, upFn: any) {
    if (!this.canvas) return;

    const canvasContainer = this.canvasContainer.nativeElement;
    const elemento: VideoElement | undefined = this.videosElements.find((el) => el.id === ghostId.substring(6));

    if (elemento?.element) {
      const ghostRect = ghostDiv.getBoundingClientRect();
      const result = this.paintInCanvas(elemento.element as any, ghostRect.width, ghostRect.height, ghostRect.left + ghostRect.width / 2, ghostRect.top + ghostRect.height / 2);

      if (result) {
        elemento.position = result.position;
        elemento.scale = result.scale;
        elemento.painted = true;
      }
    }

    canvasContainer.removeEventListener('pointermove', moveFn);
    canvasContainer.removeEventListener('pointerup', upFn);

    if (this.cross) {
      this.cross.nativeElement.style.display = 'none';
    }

    const elementos: NodeListOf<HTMLDivElement> = canvasContainer.querySelectorAll('[id^="marco"]');
    for (const el of elementos) {
      if (el.id !== ghostDiv.id) {
        el.style.border = '1px solid black';
      }
    }

    this.canvas.style.border = '1px solid black';
    ghostDiv.style.visibility = 'hidden';
    this.editandoDimensiones = false;
    this._removePresetLayers();
    this.updateWorkerLayers();
  }

  /**
   * @summary Lógica central para calcular las nuevas dimensiones según el tirador usado.
   * @param {string} tiradorId ID del tirador.
   * @param {number} difX Diferencia en X.
   * @param {number} difY Diferencia en Y.
   * @param {HTMLElement} ghostDiv El marco.
   * @param {Function} recalculaDiagonales Función para actualizar las diagonales.
   */
  private handleResizing(tiradorId: string, difX: number, difY: number, ghostDiv: HTMLElement, recalculaDiagonales: (ghostDiv: HTMLElement) => void) {
    switch (tiradorId) {
      case 'tirador-tl':
        ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
        ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;
        ghostDiv.style.width = `${ghostDiv.offsetWidth - difX}px`;
        ghostDiv.style.height = `${ghostDiv.offsetHeight - difY}px`;
        recalculaDiagonales(ghostDiv);
        break;
      case 'tirador-tr':
        ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;
        ghostDiv.style.width = `${ghostDiv.offsetWidth + difX}px`;
        ghostDiv.style.height = `${ghostDiv.offsetHeight - difY}px`;
        recalculaDiagonales(ghostDiv);
        break;
      case 'tirador-bl':
        ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
        ghostDiv.style.height = `${ghostDiv.offsetHeight + difY}px`;
        ghostDiv.style.width = `${ghostDiv.offsetWidth - difX}px`;
        recalculaDiagonales(ghostDiv);
        break;
      case 'tirador-br':
        ghostDiv.style.width = `${ghostDiv.offsetWidth + difX}px`;
        ghostDiv.style.height = `${ghostDiv.offsetHeight + difY}px`;
        recalculaDiagonales(ghostDiv);
        break;
      case 'tirador-center':
        ghostDiv.style.left = `${ghostDiv.offsetLeft + difX}px`;
        ghostDiv.style.top = `${ghostDiv.offsetTop + difY}px`;
        break;
      default:
        console.error('Tirador desconocido');
        break;
    }
  }

  /**
   * @summary Pinta un elemento (video o imagen) en el canvas con la escala y posición correctas.
   * @param {HTMLVideoElement | HTMLImageElement} element El elemento de video o imagen a pintar.
   * @param {number} width El ancho del elemento en el DOM.
   * @param {number} height La altura del elemento en el DOM.
   * @param {number} clientX La posición X del ratón en la ventana.
   * @param {number} clientY La posición Y del ratón en la ventana.
   * @returns {VideoElement} Un objeto VideoElement con la escala y posición calculadas.
   */
  private paintInCanvas(element: HTMLVideoElement | HTMLImageElement, widthElement: number, heightElement: number, clientX: number, clientY: number): VideoElement {
    if (!this.canvas) {
      console.error('Missing canvas');
      return {} as VideoElement;
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
      return {} as VideoElement;
    }

    // Calculamos la escala requerida
    const requiredScaleX = ghostWidthInCanvas / originalWidth;
    const requiredScaleY = ghostHeightInCanvas / originalHeight;
    const requiredScale = Math.min(requiredScaleX, requiredScaleY);

    // Dimensiones escaladas
    const scaledWidth = originalWidth * requiredScale;
    const scaledHeight = originalHeight * requiredScale;

    // Ajustamos la posición para centrar el ratón en el video escalado
    const canvasX = (clientX - rect.left) * scaleX - scaledWidth / 2;
    const canvasY = (clientY - rect.top) * scaleY - scaledHeight / 2;

    // Devuelve un VideoElement con la información de la imagen da pintar
    return {
      id: element.id,
      element: element,
      painted: true,
      scale: requiredScale,
      position: { x: canvasX, y: canvasY },
    };
  }

  /**
   * @summary Formatea un número de segundos a un formato de tiempo hh:mm:ss.
   * @param {number} seconds Los segundos a formatear.
   * @returns {string} El tiempo formateado como "hh:mm:ss".
   */
  private formatTime(seconds: number): string {
    if (Number.isNaN(seconds) || !Number.isFinite(seconds)) {
      return '00:00:00';
    }
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hrs.toString().padStart(2, '0')}:` + `${mins.toString().padStart(2, '0')}:` + `${secs.toString().padStart(2, '0')}`;
  }

  /**
   * @summary Guarda la configuración actual del canvas como un preset.
   * @description Pide un nombre al usuario y guarda la posición y escala de los elementos pintados en un nuevo preset.
   */
  guardaPreset() {
    console.log('guardaPreset called');
    const name = prompt('Introduce el nombre del preset \n(El mismo nombre sobrescribe el preset) ', 'Nuevo preset');
    if (!name) return;

    const videoElements = this.createVideoElementsList();
    this.presets.set(name, {
      elements: videoElements,
      shortcut: 'ctrl+' + (this.presets.size + 1),
    });
    setTimeout(() => this.calculatePreset(), 100);
    this.aplicaPreset(name);
  }

  /**
   * @summary Crea una lista de VideoElements listos para ser guardados en un preset.
   * @returns {VideoElement[]} Lista de elementos filtrados y mapeados.
   */
  private createVideoElementsList(): VideoElement[] {
    return this.videosElements.filter((el) => el.painted && el.element).map((el) => this.mapToVideoElement(el));
  }

  /**
   * @summary Mapea un elemento interno a la estructura de VideoElement para persistencia.
   * @param {any} el Elemento a mapear.
   * @returns {VideoElement} Objeto mapeado.
   */
  private mapToVideoElement(el: any): VideoElement {
    let srcOrSrcObject: MediaStream | string | null = null;
    if (el.element instanceof HTMLVideoElement) {
      srcOrSrcObject = el.element.srcObject as MediaStream;
    } else if (el.element instanceof HTMLImageElement) {
      srcOrSrcObject = el.element.src;
    }

    return {
      id: el.id,
      element: null,
      painted: el.painted,
      scale: el.scale,
      position: el.position ? { ...el.position } : null,
      width: el.element instanceof HTMLVideoElement ? (el.element as HTMLVideoElement).videoWidth : el.element instanceof HTMLImageElement ? (el.element as HTMLImageElement).naturalWidth : 0,
      height: el.element instanceof HTMLVideoElement ? (el.element as HTMLVideoElement).videoHeight : el.element instanceof HTMLImageElement ? (el.element as HTMLImageElement).naturalHeight : 0,
      filters: el.filters ? { ...el.filters } : undefined,
      srcOrSrcObject,
    };
  }

  /**
   * @summary Detiene y elimina un elemento de la emisión.
   * @description Detiene el stream o elimina el archivo, y actualiza las listas de elementos activos y conexiones de audio.
   * @param {MediaDeviceInfo | MediaStream | File} ele El elemento a detener (dispositivo, stream o archivo).
   */
  stopElemento(ele: MediaDeviceInfo | MediaStream | File) {
    if (ele instanceof MediaDeviceInfo) {
      const divRef = this.deviceDivs.find((el) => el.nativeElement.id === 'div-' + ele.deviceId);
      if (divRef) {
        const videoElement = divRef.nativeElement.querySelector('video') as HTMLVideoElement;
        if (videoElement) {
          const stream = videoElement.srcObject as MediaStream;
          this.stopStream(stream);
        }
      }
      this.videoDevices = this.videoDevices.filter((device) => device.deviceId !== ele.deviceId);
    } else if (ele instanceof MediaStream) {
      const divRef = this.captureDivs.find((el) => el.nativeElement.id === 'div-' + ele.id);
      if (divRef) {
        const videoElement = divRef.nativeElement.querySelector('video') as HTMLVideoElement;
        if (videoElement) {
          const stream = videoElement.srcObject as MediaStream;
          this.stopStream(stream);
        }
      }
      this.capturas = this.capturas.filter((stream) => stream !== ele);
      this.audiosCapturas = this.audiosCapturas.filter((track) => track.id !== ele.id);
      this.audiosElements = this.audiosElements.filter((element: AudioElement) => element.id !== ele.id);
      this.audiosConnections = this.audiosConnections.filter((element: AudioConnection) => element.idEntrada !== ele.id || element.idSalida !== ele.id);
    } else if (ele instanceof File) {
      this.staticContent = this.staticContent.filter((file) => file !== ele);
      this.audiosArchivos = this.audiosArchivos.filter((file) => file !== ele.name);
      this.audiosElements = this.audiosElements.filter((element: AudioElement) => element.id !== ele.name);
      this.audiosConnections = this.audiosConnections.filter((element: AudioConnection) => element.idEntrada !== ele.name || element.idSalida !== ele.name);
    }
    this.drawAudioConnections();
  }

  /**
   * @summary Ajusta un elemento a pantalla completa en el canvas.
   * @description Calcula el tamaño y posición para que el elemento ocupe el canvas entero.
   * @param {MediaDeviceInfo | MediaStream | File} ele El elemento a ajustar.
   */
  fullscreen(ele: MediaDeviceInfo | MediaStream | File) {
    let elemento: VideoElement | undefined;

    // Intento de encontrar el ID independientemente del tipo
    const id = (ele as any).deviceId || (ele as any).id || (ele as any).name;

    // Buscar en videosElements
    elemento = this.videosElements.find((el) => el.id === id);

    // Fallback especial para MediaStream
    if (!elemento && ele instanceof MediaStream) {
      const videoTrackId = ele.getVideoTracks()[0]?.id;
      elemento = this.videosElements.find((el) => el.id === videoTrackId);
    }

    if (!elemento) {
      console.error('No se encontro el elemento con id:', id);
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
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const result = this.paintInCanvas(elemento.element as HTMLVideoElement | HTMLImageElement, rect.width, rect.height, x, y);
    if (result && elemento.element) {
      elemento.position = result.position;
      elemento.scale = result.scale;
      elemento.painted = true;
      this.addCapa(elemento);
      this._removePresetLayers();
    }
  }

  /**
   * @summary Agrega una capa de control sobre un elemento en el editor.
   * @description Crea botones de control (detener, mover, play/pause para videos) y añade el evento de menú contextual.
   * @param {VideoElement} elemento El elemento de video sobre el que añadir la capa.
   */
  addCapa(elemento: VideoElement) {
    const divRef = this.deviceDivs.find((el) => el.nativeElement.id === 'div-' + elemento.id) || this.captureDivs.find((el) => el.nativeElement.id === 'div-' + elemento.id) || this.staticDivs.find((el) => el.nativeElement.id === 'div-' + elemento.id);

    if (divRef) {
      const div = divRef.nativeElement;
      const capa: HTMLDivElement = this.capaTemplate.nativeElement.cloneNode(true) as HTMLDivElement;
      capa.id = 'capa-' + elemento.id;
      capa.classList.remove('hidden');

      // Botón para detener la emisión
      const X: HTMLButtonElement = capa.querySelector('#buttonxcapa') as HTMLButtonElement;
      X.onclick = () => {
        if (!elemento) {
          console.error('Missing elemento');
          return;
        }
        elemento.painted = false;
        elemento.position = null;
        elemento.scale = 1;
        capa.remove();
        const marco = this.canvasContainer.nativeElement.querySelector(`#marco-${CSS.escape(elemento.id)}`) as HTMLElement;
        if (marco) {
          marco.remove();
        }
        this._removePresetLayers();
        this.updateWorkerLayers();
      };

      // Botón para cambiar de posición el elemento
      const moveElement = capa.querySelector('#moveElement') as HTMLDivElement;
      if (!moveElement) {
        console.error('Missing moveElement');
        return;
      }
      moveElement.classList.remove('hidden');
      const moveElementUp = moveElement.querySelector('#moveElementUp') as HTMLButtonElement;
      const moveElementDown = moveElement.querySelector('#moveElementDown') as HTMLButtonElement;
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
      if (elemento.element instanceof HTMLVideoElement && elemento.element.src && elemento.element.src.length > 0) {
        const control = this.controlTemplate.nativeElement.cloneNode(true) as HTMLDivElement;
        if (!control) {
          console.error('Missing control');
          return;
        }
        const controllers = capa.querySelector('#controllers') as HTMLDivElement;
        if (!controllers) {
          console.error('Missing controllers');
          return;
        }
        control.id = 'control-' + elemento.id;
        control.style.display = 'block';
        const playPause = control.querySelector('#play-pause') as HTMLButtonElement;
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
          const percentage = ((elemento.element as HTMLVideoElement).currentTime / (elemento.element as HTMLVideoElement).duration) * 100;
          progress.value = percentage.toString();
          // Mostrar el tiempo actual y la duración
          const currentTime = this.formatTime((elemento.element as HTMLVideoElement).currentTime);
          const duration = this.formatTime((elemento.element as HTMLVideoElement).duration);
          time.innerText = `${currentTime} / ${duration}`;

          progress.oninput = () => {
            if (!elemento) {
              console.error('Missing elemento');
              return;
            }
            const newTime = (Number.parseInt(progress.value) / 100) * (elemento.element as HTMLVideoElement).duration;
            (elemento.element as HTMLVideoElement).currentTime = newTime;

            // Actualizar el tiempo en el texto inmediatamente
            const currentTime = this.formatTime((elemento.element as HTMLVideoElement).currentTime);
            const duration = this.formatTime((elemento.element as HTMLVideoElement).duration);
            time.innerText = `${currentTime} / ${duration}`;
          };
        };

        /* Tiempo de reproducción */
        elemento.element.addEventListener('timeupdate', () => {
          if (!elemento) {
            console.error('Missing elemento');
            return;
          }
          const currentTime = this.formatTime((elemento.element as HTMLVideoElement).currentTime);
          const duration = this.formatTime((elemento.element as HTMLVideoElement).duration);
          time.innerText = `${currentTime} / ${duration}`;
        });
        const currentTime = this.formatTime(elemento.element.currentTime);
        const duration = this.formatTime(elemento.element.duration);
        time.innerText = `${currentTime} / ${duration}`;
        controllers.appendChild(control);
      }

      // Añade el evento contextmenu
      capa.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.selectedVideoForFilter = elemento;
        this.showFilterMenu(event, elemento);
      });

      div.appendChild(capa);
      this.updateWorkerLayers();
    }
  }

  /**
   * @summary Actualiza la posición del elemento ghost para que siga al ratón.
   * @param {number} x Coordenada X del ratón.
   * @param {number} y Coordenada Y del ratón.
   * @param {HTMLElement} element Elemento a posicionar.
   */
  private updateGhostPosition(x: number, y: number, element: HTMLElement) {
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;
    const offsetX = elementWidth / 2;
    const offsetY = elementHeight / 2 - window.scrollY;

    element.style.left = `${x - offsetX}px`;
    element.style.top = `${y - offsetY}px`;
  }

  /**
   * @summary Mueve la cruz de posicionamiento en el editor.
   * @description Actualiza la posición visual de las líneas guía (cruz) durante el arrastre o redimensionamiento.
   * @param {number} eventX Posición horizontal del ratón.
   * @param {number} eventY Posición vertical del ratón.
   * @param {string[]} intersecciones Lista de IDs de elementos colisionados.
   */
  moverCruzPosicionamiento(eventX: number, eventY: number, intersecciones: string[]) {
    if (!this.cross) {
      console.error('Missing cross');
      return;
    }
    if (!this.canvas) {
      console.error('Missing canvas');
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const orizontal = this.cross.nativeElement.querySelector('#orizontal') as HTMLDivElement;
    if (!orizontal) {
      console.error('Missing orizontal');
      return;
    }
    orizontal.style.display = 'none';
    orizontal.style.backgroundColor = '#1d4ed8';
    orizontal.style.width = rect.width + 'px';

    const vertical = this.cross.nativeElement.querySelector('#vertical') as HTMLDivElement;
    if (!vertical) {
      console.error('Missing vertical');
      return;
    }
    vertical.style.display = 'none';
    vertical.style.backgroundColor = '#1d4ed8';
    vertical.style.height = rect.height + 'px';

    const isMouseOverCanvas: boolean = eventX >= rect.left && eventX <= rect.right && eventY >= rect.top && eventY <= rect.bottom;

    const cursorPosition = {
      isAbove: eventY < rect.top,
      isBelow: eventY > rect.bottom,
      isLeft: eventX < rect.left,
      isRight: eventX > rect.right,
    };
    if ((cursorPosition.isLeft || cursorPosition.isRight) && !cursorPosition.isAbove && !cursorPosition.isBelow) {
      orizontal.style.display = 'block';
    }
    if ((cursorPosition.isAbove || cursorPosition.isBelow) && !cursorPosition.isLeft && !cursorPosition.isRight) {
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
   * @summary Calcula la vista previa de los presets.
   * @description Renderiza una miniatura de cada preset guardado en su contenedor correspondiente.
   * @returns {Promise<void>} Una promesa que se resuelve cuando todos los presets han sido calculados.
   */
  async calculatePreset() {
    console.log('calculatePreset called');
    this.cdr.detectChanges();
    setTimeout(() => {
      for (const [key, preset] of this.presets.entries()) {
        const presetDiv = this.presetsDiv.nativeElement.querySelector(`[id="preset-${key}"]`);
        console.log(`Buscando presetDiv para key: ${key}, encontrado: ${!!presetDiv}`);
        if (!presetDiv) continue;

        presetDiv.innerHTML = '';
        this.renderPresetElements(presetDiv as HTMLElement, preset.elements);
      }
    }, 50);
  }

  /**
   * @summary Renderiza los elementos de un preset en un contenedor específico.
   * @param {HTMLElement} presetDiv Contenedor del preset.
   * @param {VideoElement[]} elements Elementos a renderizar.
   */
  private renderPresetElements(presetDiv: HTMLElement, elements: VideoElement[]) {
    const divRect = presetDiv.getBoundingClientRect();
    if (!this.canvas) return;

    const canvasWidth = this.canvas.width || 1920;
    const canvasHeight = this.canvas.height || 1080;

    const scaleX = canvasWidth / (divRect.width || 1);
    const scaleY = canvasHeight / (divRect.height || 1);

    for (const element of elements) {
      const ele = this.createPresetElement(element);
      if (!ele || !element.position) continue;

      const { width, height } = this._getPresetElementDimensions(element);

      Object.assign(ele.style, {
        position: 'absolute',
        left: `${element.position.x / scaleX}px`,
        top: `${element.position.y / scaleY}px`,
        width: `${(width * element.scale) / scaleX}px`,
        height: `${(height * element.scale) / scaleY}px`,
        objectFit: 'contain',
      });

      presetDiv.appendChild(ele);
    }
  }

  /**
   * @summary Obtiene las dimensiones originales de un elemento de preset.
   * @param {VideoElement} element El elemento del preset.
   * @returns {{width: number, height: number}} Dimensiones calculadas.
   */
  private _getPresetElementDimensions(element: VideoElement): { width: number; height: number } {
    if (element.width && element.height) {
      return { width: element.width, height: element.height };
    }

    let width = 1280;
    let height = 720;

    if (element.srcOrSrcObject instanceof MediaStream) {
      const videoTrack = element.srcOrSrcObject.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        width = settings.width || 1280;
        height = settings.height || 720;
      }
    } else if (typeof element.srcOrSrcObject === 'string') {
      width = element.element instanceof HTMLImageElement ? element.element.naturalWidth : 100;
      height = element.element instanceof HTMLImageElement ? element.element.naturalHeight : 100;
    }

    return { width, height };
  }

  /**
   * @summary Crea un elemento visual (video o imagen) para la miniatura de un preset.
   * @param {VideoElement} element Datos del elemento.
   * @returns {HTMLElement | null} El elemento creado o null.
   */
  private createPresetElement(element: VideoElement): HTMLElement | null {
    console.log('Creando preset element:', element.srcOrSrcObject);
    if (element.srcOrSrcObject instanceof MediaStream) {
      const ele = document.createElement('video');
      ele.srcObject = element.srcOrSrcObject.clone();
      ele.autoplay = true;
      ele.muted = true;
      ele.playsInline = true;
      ele.style.pointerEvents = 'none';
      ele.play().catch((e) => console.error('Error al reproducir el video del preset:', e));
      return ele;
    } else if (typeof element.srcOrSrcObject === 'string') {
      const ele = document.createElement('img');
      ele.src = element.srcOrSrcObject;
      ele.style.pointerEvents = 'none';
      return ele;
    }
    return null;
  }

  /**
   * @summary Mueve un elemento hacia abajo en el orden de renderizado.
   * @param {VideoElement} elemento El elemento a mover.
   */
  moveElementDown(elemento: VideoElement) {
    const index = this.videosElements.findIndex((el) => el.id === elemento.id);
    if (index > 0) {
      [this.videosElements[index - 1], this.videosElements[index]] = [this.videosElements[index], this.videosElements[index - 1]];
      this._removePresetLayers();
      this.updateWorkerLayers();
    }
  }

  /**
   * @summary Mueve un elemento hacia arriba en el orden de renderizado.
   * @param {VideoElement} elemento El elemento a mover.
   */
  moveElementUp(elemento: VideoElement) {
    const index = this.videosElements.findIndex((el) => el.id === elemento.id);
    if (index < this.videosElements.length - 1) {
      [this.videosElements[index], this.videosElements[index + 1]] = [this.videosElements[index + 1], this.videosElements[index]];
      this._removePresetLayers();
      this.updateWorkerLayers();
    }
  }

  /**
   * @summary Dibuja las conexiones visuales de audio.
   * @description Renderiza líneas y contenedores visuales que representan las conexiones entre entradas y salidas de audio.
   */
  drawAudioConnections() {
    setTimeout(() => {
      if (!this.audiosElements.length) return;

      const audios = this.audios.nativeElement;
      if (!audios) return;

      const audiosRect = audios.getBoundingClientRect();
      const audiosList = this.audiosList.nativeElement;
      const conexionesIzquierda = this.conexionesIzquierda.nativeElement;
      const conexionesDerecha = this.conexionesDerecha.nativeElement;

      if (!audiosList || !conexionesIzquierda || !conexionesDerecha) return;

      conexionesIzquierda.innerHTML = '';
      conexionesDerecha.innerHTML = '';

      const connectionWidth = 8;
      const totalConnections = this.audiosConnections.length;

      conexionesIzquierda.style.width = `${connectionWidth * totalConnections}px`;
      audiosList.style.width = `${audiosRect.width - 2 - connectionWidth * totalConnections}px`;

      for (let i = 0; i < this.audiosConnections.length; i++) {
        this._drawSingleAudioConnection(i, audiosRect, connectionWidth);
      }
    }, 100);
  }

  /**
   * @summary Dibuja una única conexión de audio visual.
   * @param {number} index Índice de la conexión.
   * @param {DOMRect} audiosRect Rectángulo del contenedor de audio.
   * @param {number} connectionWidth Ancho de la línea de conexión.
   */
  private _drawSingleAudioConnection(index: number, audiosRect: DOMRect, connectionWidth: number) {
    const connection = this.audiosConnections[index];

    const isRecorderEntrada = connection.idEntrada === 'recorder';
    const entradaRef = isRecorderEntrada ? this.audioLevelRecorder : this.audioLevelDivs.find((el) => el.nativeElement.id === `audio-level-${connection.idEntrada}`);
    const salidaRef = connection.idSalida === 'recorder' ? this.audioLevelRecorder : this.audioLevelDivs.find((el) => el.nativeElement.id === `audio-level-${connection.idSalida}`);

    if (!entradaRef || !salidaRef) return;

    const start = this._getConnectionPoint(entradaRef.nativeElement, audiosRect);
    const end = this._getConnectionPoint(salidaRef.nativeElement, audiosRect);

    const square = this._createConnectionSquare(index, start, end, connectionWidth);
    const deleteButton = this._createConnectionDeleteButton(index, connection, square);

    this._setupConnectionHover(square, deleteButton);

    square.appendChild(deleteButton);
    this.conexionesIzquierda.nativeElement.appendChild(square);
  }

  /**
   * @summary Obtiene el punto de conexión visual relativo al contenedor.
   * @param {HTMLElement} element Elemento de nivel de audio.
   * @param {DOMRect} audiosRect Rectángulo del contenedor.
   * @returns {Object} Coordenadas X e Y.
   */
  private _getConnectionPoint(element: HTMLElement, audiosRect: DOMRect): { x: number; y: number } {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - audiosRect.left,
      y: rect.top - audiosRect.top + rect.height / 2 + this.audios.nativeElement.scrollTop,
    };
  }

  /**
   * @summary Crea el elemento visual (cuadrado/línea) de la conexión.
   * @param {number} index Índice.
   * @param {any} start Punto de inicio.
   * @param {any} end Punto de fin.
   * @param {number} connectionWidth Ancho.
   * @returns {HTMLDivElement} El div de la conexión.
   */
  private _createConnectionSquare(index: number, start: any, end: any, connectionWidth: number): HTMLDivElement {
    const square = document.createElement('div');
    square.style.position = 'absolute';
    square.style.border = '2px solid';
    square.style.borderRightWidth = '0px';
    square.style.borderColor = this._getRandomColor();
    square.style.left = `${start.x - connectionWidth * (index + 1)}px`;
    square.style.top = `${Math.min(start.y, end.y)}px`;
    square.style.width = `${connectionWidth * (index + 1)}px`;
    square.style.height = `${Math.abs(end.y - start.y)}px`;
    square.style.zIndex = `${500 - (index + 1) * 10}`;
    return square;
  }

  /**
   * @summary Crea el botón de eliminación para una conexión de audio.
   * @param {number} index Índice.
   * @param {AudioConnection} connection Objeto de conexión.
   * @param {HTMLElement} square Elemento visual de la conexión.
   * @returns {HTMLButtonElement} El botón creado.
   */
  private _createConnectionDeleteButton(index: number, connection: AudioConnection, square: HTMLElement): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerText = 'X';
    btn.style.cssText = 'position:absolute;width:1rem;height:1rem;border-radius:9999px;display:none;align-items:center;justify-content:center;top:0;right:0;';

    btn.onclick = () => {
      this.audiosConnections.splice(index, 1);
      try {
        connection.entrada.disconnect(connection.salida);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'InvalidAccessError')) {
          console.warn('⚠️ Error al desconectar nodos de audio:', e);
        }
      }
      square.remove();
      this.drawAudioConnections();
    };
    return btn;
  }

  /**
   * @summary Configura los efectos de hover para una conexión de audio.
   * @param {HTMLElement} square Elemento visual.
   * @param {HTMLElement} deleteButton Botón de eliminar.
   */
  private _setupConnectionHover(square: HTMLElement, deleteButton: HTMLElement) {
    square.addEventListener('pointerenter', () => {
      square.style.borderWidth = '4px';
      square.style.borderRightWidth = '0px';
      deleteButton.style.display = 'flex';
    });
    square.addEventListener('pointerleave', () => {
      square.style.borderWidth = '2px';
      square.style.borderRightWidth = '0px';
      deleteButton.style.display = 'none';
    });
  }

  /**
   * @summary Genera un color hexadecimal aleatorio para las líneas de audio.
   * @returns {string} Color en formato hexadecimal.
   */
  private _getRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color + 'f0';
  }

  /**
   * @summary Inicia la creación de una conexión de audio.
   * @description Maneja el evento de arrastre para comenzar a dibujar una conexión temporal entre nodos de audio.
   * @param {MouseEvent} $event El evento de ratón.
   */
  audioDown($event: MouseEvent): void {
    this.ensureAudioContext().then(() => {
      if (this.audioContext.state === 'suspended') this.audioContext.resume();
    });

    if ($event.target instanceof HTMLInputElement) return;

    const audios = this.audios.nativeElement;
    const conexionesIzquierda = this.conexionesIzquierda.nativeElement;
    if (!audios || !conexionesIzquierda) return;

    const audiosRect = audios.getBoundingClientRect();
    const elementoStart = ($event.currentTarget as HTMLElement).closest('.audio-bar') || ($event.currentTarget as HTMLElement);
    const startPos = {
      x: $event.clientX - audiosRect.left,
      y: $event.clientY - audiosRect.top + audios.scrollTop,
    };

    const conexionTemp = this._createTempConnectionElement(startPos);
    conexionesIzquierda.appendChild(conexionTemp);

    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    audios.style.pointerEvents = 'auto';

    const hoverOverlayStart = document.createElement('div');
    hoverOverlayStart.style.cssText = 'position:absolute;pointer-events:none;background:rgba(0,0,0,0.2);z-index:9999;';
    conexionesIzquierda.appendChild(hoverOverlayStart);

    const hoverOverlayEnd = document.createElement('div');
    hoverOverlayEnd.style.cssText = 'position:absolute;pointer-events:none;background:rgba(0,0,0,0.2);display:none;z-index:9999;';
    conexionesIzquierda.appendChild(hoverOverlayEnd);

    if (elementoStart instanceof HTMLElement) {
      const rect = elementoStart.getBoundingClientRect();
      hoverOverlayStart.style.left = `${rect.left - audiosRect.left}px`;
      hoverOverlayStart.style.top = `${rect.top - audiosRect.top + audios.scrollTop}px`;
      hoverOverlayStart.style.width = `${rect.width}px`;
      hoverOverlayStart.style.height = `${rect.height}px`;
    }

    let lastHoveredElement: Element | null = null;

    const audioMove = (e: MouseEvent) => {
      const actualX = e.clientX - audiosRect.left;
      const actualY = e.clientY - audiosRect.top + audios.scrollTop;

      if (actualX < startPos.x) {
        conexionTemp.style.left = `${actualX}px`;
        conexionTemp.style.width = `${startPos.x - actualX}px`;
      } else {
        conexionTemp.style.left = `${startPos.x}px`;
        conexionTemp.style.width = `${actualX - startPos.x}px`;
      }

      if (actualY < startPos.y) {
        conexionTemp.style.top = `${actualY}px`;
        conexionTemp.style.height = `${startPos.y - actualY}px`;
      } else {
        conexionTemp.style.top = `${startPos.y}px`;
        conexionTemp.style.height = `${actualY - startPos.y}px`;
      }

      const root = document.elementFromPoint(e.clientX, e.clientY);
      const hoveredElement = root?.shadowRoot?.elementFromPoint(e.clientX, e.clientY) || root;

      // Buscar el audio-bar más cercano en la misma fila (altura del ratón)
      const allAudioBars = Array.from(audios.querySelectorAll('.audio-bar'));
      const target =
        allAudioBars.find((bar) => {
          const rect = bar.getBoundingClientRect();
          return e.clientY >= rect.top && e.clientY <= rect.bottom;
        }) || (hoveredElement instanceof Element ? hoveredElement.closest('.audio-bar') : null);

      const idStart = this._getAudioElementId(elementoStart);
      const idTarget = this._getAudioElementId(target);

      const isStartOutput = this.audioOutputDevices.some((d) => d.deviceId === idStart);
      const isTargetOutput = this.audioOutputDevices.some((d) => d.deviceId === idTarget);

      const isLogicValid = idStart && idTarget && idStart !== idTarget && (isTargetOutput !== isStartOutput || idTarget === 'audio-recorder');

      if (target instanceof HTMLElement && isLogicValid) {
        const rect = target.getBoundingClientRect();
        hoverOverlayEnd.style.left = `${rect.left - audiosRect.left}px`;
        hoverOverlayEnd.style.top = `${rect.top - audiosRect.top + audios.scrollTop}px`;
        hoverOverlayEnd.style.width = `${rect.width}px`;
        hoverOverlayEnd.style.height = `${rect.height}px`;
        hoverOverlayEnd.style.display = 'block';
      } else {
        hoverOverlayEnd.style.display = 'none';
      }
    };

    const audioUp = (e: MouseEvent) => {
      audios.removeEventListener('pointermove', audioMove);
      audios.removeEventListener('pointerup', audioUp);
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
      audios.style.pointerEvents = '';
      hoverOverlayStart.remove();
      hoverOverlayEnd.remove();
      this._finalizeAudioConnection(e, elementoStart, conexionTemp);
    };

    audios.addEventListener('pointermove', audioMove);
    audios.addEventListener('pointerup', audioUp);
  }

  /**
   * @summary Crea un elemento temporal para visualizar la conexión mientras se arrastra.
   * @param {Object} pos Posición inicial.
   * @returns {HTMLDivElement} El elemento temporal.
   */
  private _createTempConnectionElement(pos: { x: number; y: number }): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;border:2px dashed black;border-right-width:0px;left:${pos.x}px;top:${pos.y}px;width:1px;height:1px;`;
    return el;
  }

  /**
   * @summary Finaliza la creación de una conexión de audio y establece el vínculo real entre nodos.
   * @param {MouseEvent} event Evento de ratón.
   * @param {Element | null} elementoStart Elemento donde comenzó la conexión.
   * @param {HTMLDivElement} conexionTemp Elemento visual temporal.
   */
  private _finalizeAudioConnection(event: MouseEvent, elementoStart: Element | null, conexionTemp: HTMLDivElement) {
    conexionTemp.remove();

    const root = document.elementFromPoint(event.clientX, event.clientY);
    const elementAtDrop = root?.shadowRoot?.elementFromPoint(event.clientX, event.clientY) || root;

    // Buscar el audio-bar más cercano en la misma fila (altura del ratón)
    const allAudioBars = Array.from(this.audios.nativeElement.querySelectorAll('.audio-bar'));
    const target =
      allAudioBars.find((bar) => {
        const rect = bar.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      }) || (elementAtDrop instanceof Element ? elementAtDrop.closest('.audio-bar') : null);

    const idStart = this._getAudioElementId(elementoStart);
    const idFinal = this._getAudioElementId(target);

    const isStartOutput = this.audioOutputDevices.some((d) => d.deviceId === idStart);
    const isFinalOutput = this.audioOutputDevices.some((d) => d.deviceId === idFinal);
    const isLogicValid = idStart && idFinal && idStart !== idFinal && (isFinalOutput !== isStartOutput || idFinal === 'audio-recorder');

    if (!isLogicValid) return;

    const startNode = this.audiosElements.find((el) => el.id === idStart);
    const endNode = this.audiosElements.find((el) => el.id === idFinal);

    if (startNode && endNode) {
      // Determinar quién es entrada (fuente) y quién es salida (destino)
      // Solo permitimos conectar de una fuente de audio (dispositivo/archivo) a un destino (salida/grabador)
      const isStartOutput = this.audioOutputDevices.some((d) => d.deviceId === idStart) || idStart === 'audio-recorder';
      const isEndOutput = this.audioOutputDevices.some((d) => d.deviceId === idFinal) || idFinal === 'audio-recorder';

      let sourceNode, destinationNode;
      let entradaId, salidaId;

      if (!isStartOutput && isEndOutput) {
        sourceNode = startNode.ele;
        destinationNode = endNode.id === 'audio-recorder' ? this.mixedAudioDestination : endNode.ele;
        entradaId = idStart;
        salidaId = idFinal;
      } else if (isStartOutput && !isEndOutput) {
        sourceNode = endNode.ele;
        destinationNode = startNode.id === 'audio-recorder' ? this.mixedAudioDestination : startNode.ele;
        entradaId = idFinal;
        salidaId = idStart;
      } else {
        return; // Ambas son entradas o ambas son salidas
      }

      sourceNode.connect(destinationNode);
      this.audiosConnections.push({
        idEntrada: entradaId,
        entrada: sourceNode as GainNode,
        idSalida: salidaId,
        salida: destinationNode as MediaStreamAudioDestinationNode,
      });
      this.drawAudioConnections();
    }
  }

  /**
   * @summary Extrae el ID del dispositivo de audio a partir de un elemento del DOM.
   * @param {Element | null} element El elemento del DOM.
   * @returns {string | null} El ID extraído o null.
   */
  private _getAudioElementId(element: Element | null): string | null {
    if (!element?.id) return null;
    if (element.id.startsWith('audio-level-')) return element.id.substring(12);
    if (element.id.startsWith('audio-')) return element.id.substring(6);
    if (element.id.startsWith('volume-')) return element.id.substring(7);
    return element.id;
  }

  /**
   * @summary Inicia la emisión de video y audio.
   * @description Captura el stream del canvas y el stream de audio mixto, y emite el stream combinado.
   */
  emitir() {
    if (!this.canvas) {
      console.error('Missing canvas');
      return;
    }
    const videoStream = this.canvas.captureStream(this.canvasFPS).getVideoTracks()[0];
    const audioStream = this.recordAudioDestination.stream.getAudioTracks()[0];
    this.emision.emit(new MediaStream([videoStream, audioStream]));

    if (this.isInLive === undefined) {
      this.emitiendo = true;
      this.calculaTiempoGrabacion();
    }
  }

  /**
   * @summary Detiene la emisión.
   * @description Emite un valor nulo para detener la emisión y actualiza el estado.
   */
  detenerEmision() {
    if (this.emision) {
      this.emision.emit(null);
    }
    if (this.isInLive === undefined) {
      this.emitiendo = false;
    }
  }

  /**
   * @summary Calcula el tiempo de grabación.
   * @description Inicia un temporizador que actualiza el tiempo de grabación transcurrido.
   * @returns {Promise<void>}
   */
  async calculaTiempoGrabacion() {
    let tiempo = -1;
    const updateTimer = () => {
      if (this.estadoEmision) {
        tiempo += 1;
        this.tiempoGrabacion = this.formatTime(tiempo);
        setTimeout(updateTimer, 1000);
      }
    };
    updateTimer();
  }

  /**
   * @summary Guarda los presets actuales.
   * @description Emite un evento para guardar los presets definidos.
   */
  savePresetsFunction() {
    this.savePresets.emit(this.presets);
  }

  /**
   * @summary Muestra el menú contextual de filtros.
   * @param {MouseEvent} $event El evento de clic.
   * @param {string} deviceId El ID del elemento seleccionado.
   */
  onContextMenu($event: MouseEvent, deviceId: string) {
    $event.preventDefault();
    const videoElement = this.elementosDiv.nativeElement.querySelector(`#${CSS.escape(deviceId)}`) as HTMLVideoElement;
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
   * @summary Muestra el menú contextual de ecualizador para un elemento de audio.
   * @param {MouseEvent} event Evento de clic derecho.
   * @param {string} audioId ID del elemento seleccionado.
   */
  onAudioContextMenu($event: MouseEvent, audioId: string) {
    $event.preventDefault();
    this.showEqualizerMenu($event, audioId);
  }

  /**
   * @summary Actualiza el estilo (filtros) del elemento seleccionado.
   * @description Aplica los filtros de brillo, contraste y saturación al elemento de video.
   */
  updateStyleElement() {
    if (!this.selectedVideoForFilter) {
      console.error('Missing this.selectedVideoForFilter');
      return;
    }
    const videoElement = this.elementosDiv.nativeElement.querySelector(`#${CSS.escape(this.selectedVideoForFilter.id)}`) as HTMLVideoElement;
    if (!videoElement) {
      console.error('Missing videoElement');
      return;
    }
    if (this.selectedVideoForFilter.filters) {
      videoElement.style.filter = `brightness(${this.selectedVideoForFilter.filters.brightness}%) contrast(${this.selectedVideoForFilter.filters.contrast}%) saturate(${this.selectedVideoForFilter.filters.saturation}%)`;
    } else {
      videoElement.style.filter = '';
    }
    this.updateWorkerLayers();
  }

  updateEqualizer(bandIndex: number, gainValue: number) {
    if (!this.selectedAudioForEqualizer) return;
    this.equalizerValues[bandIndex] = gainValue;
    const idToSearch = this.selectedAudioForEqualizer;
    const filters = this.equalizerFilters.get(idToSearch);
    if (filters?.[bandIndex]) {
      filters[bandIndex].gain.value = gainValue;
    } else {
      const freq = [60, 250, 1000, 4000, 12000][bandIndex];
      console.warn(`No se encontró ecualizador para: ${idToSearch} (banda: ${freq}Hz)`);
    }
  }

  resetFilters() {
    if (!this.selectedVideoForFilter) return;
    this.selectedVideoForFilter.filters = { brightness: 100, contrast: 100, saturation: 100 };
    this.updateStyleElement();

    // Resetear inputs en el DOM
    const inputs = this.filterMenu.nativeElement.querySelectorAll('input');
    inputs.forEach((input) => {
      input.value = '100';
    });
  }

  resetEqualizer() {
    console.log('resetEqualizer called');

    if (!this.selectedAudioForEqualizer) return;
    const filters = this.equalizerFilters.get(this.selectedAudioForEqualizer);
    if (filters) {
      filters.forEach((filter) => {
        filter.gain.value = 0;
      });

      // Actualizar visualmente todos los sliders del menú usando el DOM nativo
      this.equalizerValues = [0, 0, 0, 0, 0];
      this.cdr.detectChanges();
    } else {
      console.log('No se encontró el nodo de audio');
    }
  }

  snapToMiddle(event: Event) {
    const input = event.target as HTMLInputElement;
    const min = Number.parseFloat(input.min);
    const max = Number.parseFloat(input.max);
    const middle = min + (max - min) / 2;
    const val = Number.parseFloat(input.value);

    // Si está cerca del 50%, aplicar "snap"
    if (Math.abs(val - middle) < (max - min) * 0.05) {
      input.value = middle.toString();
      input.dispatchEvent(new Event('input'));
    }
  }

  /**
   * @summary Dibuja un fotograma en el canvas.
   * @description Envía los elementos de video e imagen al worker para ser renderizados en el OffscreenCanvas.
   */
  private updateWorkerLayers() {
    if (!this.canvasWorker) return;

    const layers = this.videosElements.map((el) => {
      const element = el.element;
      let width = 0,
        height = 0;
      if (element instanceof HTMLVideoElement) {
        width = (element.videoWidth || 1280) * el.scale;
        height = (element.videoHeight || 720) * el.scale;
      } else if (element instanceof HTMLImageElement) {
        width = (element.naturalWidth || element.width || 100) * el.scale;
        height = (element.naturalHeight || element.height || 100) * el.scale;
      }

      const filter = el.filters ? `brightness(${el.filters.brightness}%) contrast(${el.filters.contrast}%) saturate(${el.filters.saturation}%)` : 'none';

      return {
        id: el.id,
        x: el.position?.x || 0,
        y: el.position?.y || 0,
        width,
        height,
        filter,
        visible: el.painted,
      };
    });

    this.canvasWorker.postMessage({ type: 'updateLayers', payload: { layers } });
  }

  private async sendImageToWorker(el: VideoElement) {
    if (!this.canvasWorker || !(el.element instanceof HTMLImageElement)) return;
    try {
      const bitmap = await createImageBitmap(el.element);
      this.canvasWorker.postMessage({ type: 'addBitmap', payload: { id: el.id, bitmap } }, [bitmap]);
      this.updateWorkerLayers();
    } catch (e) {
      console.error('Error sending image to worker:', e);
    }
  }

  private sendVideoTrackToWorker(id: string, track: MediaStreamTrack) {
    if (!this.canvasWorker) return;
    try {
      // @ts-ignore
      const processor = new MediaStreamTrackProcessor({ track });
      const readable = processor.readable;
      this.canvasWorker.postMessage({ type: 'addTrack', payload: { id, readable } }, [readable]);
    } catch (e) {
      console.error('Error al enviar stream al worker:', e);
    }
  }

  drawFrame = async () => {
    if (!this.canvasWorker || this.isDrawing) return;
    this.isDrawing = true;

    const layers = [];
    const transferables: (ImageBitmap | VideoFrame)[] = [];

    try {
      // Iteramos todos los elementos (videos e imágenes)
      for (const elemento of this.videosElements) {
        const { element, position, painted, scale, filters } = elemento;

        // Saltamos elementos que no deben dibujarse
        if (!painted || !element || !position) continue;

        // Calculamos dimensiones escaladas
        let width = 0,
          height = 0;
        let isVideo = false;
        if (element instanceof HTMLVideoElement) {
          width = element.videoWidth * scale;
          height = element.videoHeight * scale;
          isVideo = true;
        } else if (element instanceof HTMLImageElement) {
          width = element.naturalWidth * scale;
          height = element.naturalHeight * scale;
        } else {
          continue; // No es video ni imagen
        }

        const filter = filters ? `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)` : 'none';

        try {
          let source: ImageBitmap | VideoFrame;

          if (isVideo) {
            // VideoFrame es mucho más ligero para videos (WebCodecs API)
            source = new VideoFrame(element);
          } else {
            // Optimización: Caché para imágenes estáticas
            const cached = this.imageBitmapCache.get(elemento.id);
            if (cached?.filter === filter && cached.width === width && cached.height === height) {
              // Clonamos el bitmap de la caché para poder transferirlo sin invalidar la caché
              source = await createImageBitmap(cached.bitmap);
            } else {
              const bitmap = await createImageBitmap(element);
              // Actualizar caché
              if (cached) cached.bitmap.close();
              this.imageBitmapCache.set(elemento.id, { bitmap, filter, width, height });
              source = await createImageBitmap(bitmap);
            }
          }

          layers.push({
            id: elemento.id,
            bitmap: source,
            x: position.x,
            y: position.y,
            width,
            height,
            filter,
          });
          transferables.push(source);
        } catch (e) {
          console.error('Error creando source para el elemento:', elemento.id, e);
        }
      }

      // Enviamos todas las capas al worker en un solo mensaje
      // Siempre enviamos el mensaje para que el worker pueda limpiar el canvas si no hay capas
      this.canvasWorker.postMessage({ type: 'render', payload: { layers } }, transferables);
    } finally {
      this.isDrawing = false;
    }
  };

  /**
   * @summary Crea un nodo de ganancia de audio (GainNode).
   * @description Inicializa un GainNode, lo añade a la lista de elementos de audio y establece una conexión con el destino de audio mixto.
   * @param {string} id El ID único para el nodo de ganancia.
   * @returns {GainNode} El nodo de ganancia creado.
   */
  private createGainNode(id: string): GainNode {
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1;
    this.audiosElements.push({ id: id, ele: gainNode });
    this.audiosConnections.push({
      idEntrada: id,
      entrada: gainNode,
      idSalida: 'recorder',
      salida: this.mixedAudioDestination,
    });
    this.drawAudioConnections();
    return gainNode;
  }
}
