import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { ADSENSE_CLIENT } from './shared/ads.js';

// Google AdSense site verification for the normal web page only (never inside the 3D world).
// Enabled when ADSENSE_CLIENT (shared/ads.js) or VITE_ADSENSE_CLIENT is set, for non-demo builds.
function adsense(mode) {
  const client = (process.env.VITE_ADSENSE_CLIENT || ADSENSE_CLIENT || '').trim();
  if (!/^ca-pub-\d{10,20}$/.test(client) || mode === 'demo') return null;
  return {
    name: 'adsense-verification',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('index.html')) return html;
      return html.replace('</head>', `  <meta name="google-adsense-account" content="${client}" />\n  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>\n</head>`);
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'ads.txt', source: `google.com, ${client.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n` }); },
  };
}

// `vite build --mode demo` produces a self-contained offline build (dist-demo/) where
// the game server runs inside the page with NPC players — used for the Claude artifact.
export default defineConfig(({ mode }) => ({
  root: '.',
  plugins: [adsense(mode)].filter(Boolean),
  base: mode === 'demo' ? './' : '/',
  publicDir: 'client/public',
  define: { __DEMO__: JSON.stringify(mode === 'demo'), __FIREBASE__: JSON.stringify(mode === 'firebase') },
  resolve: { alias: { 'node:crypto': fileURLToPath(new URL('./client/src/net/cryptoShim.js', import.meta.url)) } },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : mode === 'firebase' ? 'dist-firebase' : 'dist', chunkSizeWarningLimit: 1500, sourcemap: false, target: 'es2022',
    // the ad admin page ships with the Firebase / server builds (not the offline artifact build)
    rollupOptions: mode === 'demo' ? {} : { input: { main: 'index.html', admin: 'admin.html' } },
  },
}));
