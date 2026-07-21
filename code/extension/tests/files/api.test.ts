import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { extractFile } from '../../src/files/api';
import { setApiBase, setDemoToken } from '../../src/files/config';

const okBody = {
  extract: 'Ahmad 880101-14-5566',
  chars: 20,
  truncated: false,
  format: 'txt',
  coverage: { read: ['file text'], not_read: [], pages_total: null, pages_with_text: null },
  warnings: [],
};

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
}

beforeEach(async () => {
  await setApiBase('https://vanguard-extract.onrender.com');
  await setDemoToken('test-demo-token');
});

afterEach(() => vi.unstubAllGlobals());

describe('extractFile', () => {
  it('returns the parsed body on 200', async () => {
    vi.stubGlobal('fetch', mockFetch(200, okBody));
    const r = await extractFile(new File(['x'], 'a.txt'));
    expect(r.extract).toContain('880101-14-5566');
  });

  it('throws a typed error carrying the backend message verbatim', async () => {
    vi.stubGlobal('fetch', mockFetch(422, {
      error: { code: 'no_text_layer', message: 'This PDF looks like a scan…' },
    }));
    await expect(extractFile(new File(['x'], 'a.txt'))).rejects.toMatchObject({
      code: 'no_text_layer',
      message: 'This PDF looks like a scan…',
    });
  });

  it('refuses an oversized file WITHOUT uploading it', async () => {
    const fetchSpy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', fetchSpy);
    const huge = new File([new ArrayBuffer(11 * 1024 * 1024)], 'big.txt');
    await expect(extractFile(huge)).rejects.toMatchObject({ code: 'too_large' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a dead backend to a network error naming the fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(extractFile(new File(['x'], 'a.txt'))).rejects.toMatchObject({ code: 'network' });
  });
});

describe('demo bearer token', () => {
  it('sends Authorization: Bearer from Options storage on extract', async () => {
    const spy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', spy);
    await extractFile(new File(['x'], 'a.txt'));
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-demo-token');
  });

  it('refuses hosted extract when no key is pasted', async () => {
    await setDemoToken('');
    const spy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', spy);
    await expect(extractFile(new File(['x'], 'a.txt'))).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('omits Authorization on localhost when no key is pasted', async () => {
    await setApiBase('http://localhost:8000');
    await setDemoToken('');
    const spy = mockFetch(200, okBody);
    vi.stubGlobal('fetch', spy);
    await extractFile(new File(['x'], 'a.txt'));
    const init = spy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
