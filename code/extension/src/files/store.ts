import { allResolved as spansResolved } from '../ui/send-review-logic';
import type { HeldFile } from './types';

/**
 * In-memory only, by design.
 *
 * Nothing here is written to chrome.storage or IndexedDB: the bytes and the
 * extract are the most sensitive objects the extension ever touches, and the
 * E2 reasoning applies unchanged -- a persisted readable copy is a second
 * place the value we spent the latency budget protecting can be recovered
 * from. The store dies with the tab.
 */
export class FileStore {
  private items = new Map<string, HeldFile>();
  private seq = 0;
  private listeners = new Set<() => void>();

  add(file: File): string {
    const id = `f${++this.seq}`;
    this.items.set(id, { id, file, status: { kind: 'held' } });
    this.emit();
    return id;
  }

  get(id: string): HeldFile | undefined {
    return this.items.get(id);
  }

  list(): HeldFile[] {
    return [...this.items.values()];
  }

  update(id: string, patch: Partial<Omit<HeldFile, 'id' | 'file'>>): void {
    const cur = this.items.get(id);
    if (!cur) return;
    this.items.set(id, { ...cur, ...patch });
    this.emit();
  }

  remove(id: string): void {
    this.items.delete(id);
    this.emit();
  }

  clear(): void {
    this.items.clear();
    this.emit();
  }

  /** True when every held file is safe to send. Gate consults this. */
  allResolved(): boolean {
    for (const item of this.items.values()) {
      switch (item.status.kind) {
        case 'held':
        case 'extracting':
        case 'scanning':
        case 'error':
          return false;
        case 'error_acknowledged':
          continue;
        case 'scanned':
          if (!spansResolved(item.decisions ?? new Map())) return false;
          continue;
      }
    }
    return true;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
