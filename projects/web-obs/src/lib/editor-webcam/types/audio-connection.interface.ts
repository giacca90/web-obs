// Interface para el elemento de audio
export interface AudioConnection {
  idEntrada: string;
  entrada: GainNode;
  idSalida: string;
  salida: MediaStreamAudioDestinationNode;
}
