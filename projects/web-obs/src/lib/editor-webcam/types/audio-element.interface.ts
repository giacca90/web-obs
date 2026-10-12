export interface AudioElement {
  id: string;
  ele: GainNode | MediaStreamAudioDestinationNode;
  label: string;
}
