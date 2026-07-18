export type SurfaceAdapter = {
  host: string;
  getComposer(): HTMLElement | null;
  readText(): string | null;
  writeText(text: string): void;
  isSendControl(path: EventTarget[]): boolean;
  onPaste(cb: (text: string) => void): void;
  /** Every file input the surface uses. Re-queried each call: the provider
   *  re-mounts these on navigation (D4). */
  fileInputs(): HTMLInputElement[];
};
