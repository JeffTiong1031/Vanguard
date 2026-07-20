import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Built into the service's static dir so one process serves API and console.
  build: { outDir: '../app/static', emptyOutDir: true },
  server: {
    // `npm run dev` proxies the API so the console can hot-reload against a
    // running service.
    proxy: { '/v1': 'http://localhost:8001' },
  },
});
