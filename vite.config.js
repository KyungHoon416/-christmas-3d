import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'client/public',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500, sourcemap: false },
});
