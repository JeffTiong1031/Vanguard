// src/detection/l2/pin.ts
//
// Verify each pinned model file's SHA-256 BEFORE transformers.js loads it, then seed the browser
// Cache so transformers.js reads our verified bytes instead of re-fetching (doc 05 §7; ADR 0017
// weights row). Hash-pinning is the security invariant here: this function fetches, hashes, and
// THROWS on mismatch, fail-closed. It never silently downgrades to "load anyway".
import manifest from '../../../models.manifest.json';

// VERIFIED against node_modules/@huggingface/transformers@3.8.1/src/{env.js,utils/hub.js}:
//   env.remoteHost = 'https://huggingface.co/'
//   env.remotePathTemplate = '{model}/resolve/{revision}/'   (revision defaults to 'main')
// hub.js builds `remoteURL = pathJoin(remoteHost, remotePathTemplate..., filename)`, and — when
// `env.useBrowserCache = true` and the cache is not a FileCache (i.e. it's the browser Cache API
// via `caches.open('transformers-cache')`) — that exact `remoteURL` string is the cache key
// (`proposedCacheKey`) it looks up with `cache.match(...)`. So `fileUrl` below must byte-for-byte
// match `pathJoin('https://huggingface.co/', '{model}/resolve/main/', file)`, which it does.
const HOST = 'https://huggingface.co';
const fileUrl = (modelId: string, file: string) => `${HOST}/${modelId}/resolve/main/${file}`;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPinnedModel(modelId: string): Promise<void> {
  const files = (manifest as Record<string, Record<string, string>>)[modelId];
  if (!files) throw new Error(`no pin manifest for ${modelId}`);
  const cache = await caches.open('transformers-cache');
  for (const [file, expected] of Object.entries(files)) {
    const url = fileUrl(modelId, file);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`fetch ${file} failed: ${res.status}`);
    const bytes = await res.clone().arrayBuffer();
    const got = await sha256Hex(bytes);
    if (got !== expected) throw new Error(`hash mismatch for ${file}: ${got} != ${expected}`);
    await cache.put(url, new Response(bytes, { headers: res.headers }));
  }
}
