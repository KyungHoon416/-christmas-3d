import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// `vite build --mode demo` produces a self-contained offline build (dist-demo/) where
// the game server runs inside the page with NPC players — used for the Claude artifact.
export default defineConfig(({ mode }) => ({
  root: '.',
  base: mode === 'demo' ? './' : '/',
  publicDir: 'client/public',
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  resolve: { alias: { 'node:crypto': fileURLToPath(new URL('./client/src/net/cryptoShim.js', import.meta.url)) } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', chunkSizeWarningLimit: 1500, sourcemap: false },
}));
