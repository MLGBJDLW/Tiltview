export interface TransformState {
  rotation: number;
  scale: number;
  translateX: number;
  translateY: number;
  flipH: boolean;
  flipV: boolean;
  autoFit: boolean;
}

export interface SiteConfig {
  name: string;
  hostname: string[];
  videoSelector: string;
  containerSelector?: string;
}

export interface PlayerAdapter {
  name: string;
  canHandle(url: string): boolean;
  findVideoElement(): HTMLVideoElement | null;
  findTransformTarget(): HTMLElement | null;
  findPlayerContainer?(): HTMLElement | null;
  findControlBarRight?(): HTMLElement | null;
  findPlayerOverlayParent?(): HTMLElement | null;
}
