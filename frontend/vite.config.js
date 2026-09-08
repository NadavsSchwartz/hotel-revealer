import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    proxy: { '/api': { target: 'http://127.0.0.1:5000', changeOrigin: false } },
  },
  build: {
    outDir: 'dist', emptyOutDir: true,
    modulePreload: {
      // WebKit caches failed dynamic module preloads across reloads (bug 270357).
      // Keep initial HTML preloads; Vite still loads lazy-route CSS dependencies.
      resolveDependencies: (_filename, dependencies, { hostType }) => hostType === 'js' ? [] : dependencies,
    },
  },
});
