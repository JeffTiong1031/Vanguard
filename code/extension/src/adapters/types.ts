export type SurfaceAdapter = {
  host: string;
  getComposer(): HTMLElement | null;
  readText(): string | null;
  writeText(text: string): void;
  isSendControl(path: EventTarget[]): boolean;
  onPaste(cb: (text: string) => void): void;
};
