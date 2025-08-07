// Interface para el elemento de video
export interface VideoElement {
  id: string;
  element: HTMLElement | null;
  painted: boolean;
  scale: number;
  position: { x: number; y: number } | null;
  filters?: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
}
