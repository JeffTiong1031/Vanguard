import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Vanguard (Slice 1)',
    description: 'On-device prompt-privacy gate for ChatGPT and Claude. Team test build.',
    version: '0.1.0',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['https://chatgpt.com/*', 'https://claude.ai/*'],
    // No webRequest (ADR 0017 §6.2). No <all_urls>. Two hosts only.
  },
});
