// HTTP (static client + small JSON API) and WebSocket entrypoint.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { Store } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export function createServer({ port = 3000, dbFile = path.join(ROOT, 'server/data/db.json'), staticDir = path.join(ROOT, 'dist'), quiet = false } = {}) {
  const store = new Store(dbFile);
  const game = new Game(store);
  game.start();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/health') return json(res, { ok: true });
    if (url.pathname === '/api/metrics') return json(res, { ...game.stats(), memMB: Math.round(process.memoryUsage().rss / 1048576) });
    if (url.pathname === '/api/config') {
      // ICE servers are configured by env so TURN credentials never live in the repo.
      const ice = [{ urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }];
      if (process.env.TURN_URL) ice.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
      return json(res, { iceServers: ice });
    }
    if (!staticDir || !fs.existsSync(staticDir)) { res.writeHead(404); return res.end('client not built: run npm run build'); }
    let p = path.normalize(path.join(staticDir, decodeURIComponent(url.pathname)));
    if (!p.startsWith(staticDir)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(staticDir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': p.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(p).pipe(res);
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => {
    const conn = {
      ip: req.socket.remoteAddress,
      send(obj) {
        if (ws.readyState !== 1) return 0;
        const s = JSON.stringify(obj);
        ws.send(s);
        return s.length;
      },
      close() { try { ws.close(4000, 'replaced'); } catch {} },
    };
    game.onConnect(conn);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      try { game.onMessage(conn, msg); } catch (e) { console.error('[game] handler error', msg?.t, e); }
    });
    ws.on('close', () => game.onClose(conn));
    ws.on('error', () => {});
  });
  // Drop dead sockets (mobile sleep, network loss) so rooms don't keep ghosts.
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);

  return new Promise((resolve) => {
    server.listen(port, () => {
      const actual = server.address().port;
      if (!quiet) console.log(`[christmas-world] http://localhost:${actual}  (ws: /ws)`);
      resolve({
        port: actual, game, store,
        close: () => new Promise((r) => { clearInterval(hb); game.stop(); store.flush(); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }),
      });
    });
  });
}

function json(res, obj) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const srv = await createServer({ port: +(process.env.PORT || 3000) });
  const shutdown = async () => { await srv.close(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
