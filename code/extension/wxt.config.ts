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
