import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Vanguard (Slice 1)',
    description: 'On-device prompt-privacy gate for ChatGPT and Claude. Team test build.',
    version: '0.1.0',
    permissions: ['storage', 'offscreen'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'http://localhost:8000/*',
      // 🔴 `localhost` and `127.0.0.1` are DIFFERENT origins for host_permissions matching --
      // a rule for one does not cover the other. Both are listed, on both the Slice 2 backend
      // port and the local model server, because a missing permission fails as a blocked fetch
      // inside the offscreen document: the load simply never completes, and the user sees
      // "still blocked", which is indistinguishable from the classifier disagreeing.
      // Observed 2026-07-20, after two other causes with the identical symptom.
      'http://127.0.0.1:8000/*',
      // Local model server for the sensitivity classifier (docs/team/try-the-sensitivity-classifier.md).
      // Test-rig only: the artifact is 538 MB and unpublished, and ADR 0017 already calls the
      // hash-pinned CDN fetch "not the shipping answer" for a model a third this size.
      'http://localhost:8765/*',
      'http://127.0.0.1:8765/*',
      // [set this to the founder-hosted team-test origin before the team test]
      'https://vanguard-extract.example.com/*',
    ],
    // No webRequest (ADR 0017 §6.2). No <all_urls>. Two hosts only.
    // MV3 default *should* include wasm-unsafe-eval; live Chrome applied script-src 'self'
    // only and blocked ORT WASM (R1). Pin the extension_pages CSP explicitly.
    content_security_policy: {
      // wasm-unsafe-eval on script-src AND worker-src: ORT may compile WASM in a Worker.
      // Live error after kill-offscreen quoted script-src 'self' only → stale load; pin both.
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self' 'wasm-unsafe-eval'",
    },
  },
});
