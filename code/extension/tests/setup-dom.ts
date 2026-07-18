/**
 * jsdom gaps for Slice 2 file attach/capture tests (U27/U28).
 * Browsers provide these; jsdom does not.
 */

if (typeof globalThis.chrome === 'undefined') {
  const store: Record<string, unknown> = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys: string | string[] | Record<string, unknown> | null) => {
          if (keys === null) return { ...store };
          if (typeof keys === 'string') return { [keys]: store[keys] };
          if (Array.isArray(keys)) {
            const out: Record<string, unknown> = {};
            for (const key of keys) out[key] = store[key];
            return out;
          }
          const out: Record<string, unknown> = {};
          for (const key of Object.keys(keys)) out[key] = store[key];
          return out;
        },
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
    },
  } as typeof chrome;
}

function emptyFileList(): FileList {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  } as FileList;
}

function toFileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item(index: number) {
      return files[index] ?? null;
    },
    [Symbol.iterator]: function* () {
      for (const f of files) yield f;
    },
  } as FileList;
  files.forEach((f, i) => {
    (list as FileList & Record<number, File>)[i] = f;
  });
  return list;
}

class DataTransferPoly implements DataTransfer {
  #files: File[] = [];
  #data = new Map<string, string>();
  #itemEntries: DataTransferItem[] = [];

  dropEffect = 'none';
  effectAllowed = 'all';

  get files(): FileList {
    return toFileList(this.#files);
  }

  get items(): DataTransferItemList {
    const self = this;
    const arr = this.#itemEntries;
    const list = {
      get length() {
        return arr.length;
      },
      add(item: File | string, type = 'text/plain') {
        self.#addItem(item, type);
      },
      clear() {
        self.#files.length = 0;
        self.#data.clear();
        arr.length = 0;
      },
      remove(_index: number) {},
      [Symbol.iterator]: function* () {
        for (const entry of arr) yield entry;
      },
    };
    return list as unknown as DataTransferItemList;
  }

  #addItem(item: File | string, type: string): void {
    if (item instanceof File) {
      this.#files.push(item);
      this.#itemEntries.push({
        kind: 'file',
        type: item.type || 'application/octet-stream',
        getAsFile: () => item,
      } as DataTransferItem);
      return;
    }
    this.#data.set(type, item);
    this.#itemEntries.push({
      kind: 'string',
      type,
      getAsFile: () => null,
    } as DataTransferItem);
  }

  get types(): readonly string[] {
    const types: string[] = [];
    if (this.#files.length > 0) types.push('Files');
    for (const key of this.#data.keys()) types.push(key);
    return types;
  }

  setData(format: string, data: string): void {
    this.#data.set(format, data);
  }

  getData(format: string): string {
    return this.#data.get(format) ?? '';
  }

  clearData(): void {
    this.#data.clear();
  }
}

globalThis.DataTransfer = DataTransferPoly as unknown as typeof DataTransfer;

globalThis.DragEvent = class DragEventPoly extends Event {
  readonly dataTransfer: DataTransfer | null;

  constructor(type: string, init?: DragEventInit) {
    super(type, init);
    this.dataTransfer = init?.dataTransfer ?? null;
  }
} as unknown as typeof DragEvent;

globalThis.ClipboardEvent = class ClipboardEventPoly extends Event {
  readonly clipboardData: DataTransfer | null;

  constructor(type: string, init?: ClipboardEventInit) {
    super(type, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
} as unknown as typeof ClipboardEvent;

// jsdom keeps HTMLInputElement.files read-only; U28 needs assignment.
if (typeof HTMLInputElement !== 'undefined') {
  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    enumerable: true,
    get(this: HTMLInputElement & { __vanguardFiles?: FileList }) {
      return this.__vanguardFiles ?? emptyFileList();
    },
    set(this: HTMLInputElement & { __vanguardFiles?: FileList }, value: FileList) {
      this.__vanguardFiles = value;
    },
  });
}
