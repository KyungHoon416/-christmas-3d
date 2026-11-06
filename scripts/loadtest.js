// Bot load test: N headless WebSocket clients join one room, walk around, chat,
// and we measure server tick time, bandwidth and message latency.
//   node scripts/loadtest.js [bots=40] [seconds=30] [region=gwanghwamun]
// Spins up its own in-process server on a random port (no DB persistence).
import WebSocket from 'ws';
import { createServer } from '../server/index.js';
import { PROTOCOL_VERSION } from '../shared/constants.js';
import { getRegion } from '../shared/regions.js';

const BOTS = +(process.argv[2] || 40);
const SECONDS = +(process.argv[3] || 30);
const REGION = process.argv[4] || 'gwanghwamun';
const srv = await createServer({ port: 0, dbFile: null, staticDir: null, quiet: true });
const region = getRegion(REGION);
let rx = 0, rxBytes = 0, rejects = 0;
const lat = [];

function bot(i) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    const b = { ws, i, pos: null, dir: Math.random() * Math.PI * 2 };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, nick: `bot${i}_${Date.now() % 10000}`, region: REGION })));
    ws.on('message', (d) => {
      rx++; rxBytes += d.length;
      const m = JSON.parse(d.toString());
      if (m.t === 'joined') { b.pos = { ...m.pos }; resolve(b); }
      if (m.t === 'correct') { rejects++; b.pos = { ...m.pos }; b.dir += Math.PI / 2; }
      if (m.t === 'chat' && m.from && m.text.startsWith('ts:') && i === 0) lat.push(Date.now() - +m.text.slice(3));
    });
  });
}

const bots = await Promise.all(Array.from({ length: BOTS }, (_, i) => bot(i)));
console.log(`${BOTS} bots joined ${REGION}`);
const t0 = Date.now();
const timer = setInterval(() => {
  for (const b of bots) {
    b.dir += (Math.random() - 0.5) * 0.4;
    const nx = b.pos.x + Math.cos(b.dir) * 0.2, nz = b.pos.z + Math.sin(b.dir) * 0.2;
    b.pos.x = nx; b.pos.z = nz;
    b.ws.send(JSON.stringify({ t: 'pose', x: nx, y: 0, z: nz, ry: b.dir, anim: 'walk' }));
  }
}, 1000 / 15);
const chatTimer = setInterval(() => {
  const b = bots[1 + Math.floor(Math.random() * (bots.length - 1))];
  b?.ws.send(JSON.stringify({ t: 'chat', ch: 'region', text: 'ts:' + Date.now(), cid: 1 }));
}, 500);
await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(timer); clearInterval(chatTimer);
const stats = srv.game.stats();
const dur = (Date.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const report = {
  bots: BOTS, seconds: SECONDS, region: REGION,
  serverTickMsAvg: stats.tickMs,
  serverOutKBps: +((stats.bytesOutPerSec) / 1024).toFixed(1),
  perClientInKBps: +((rxBytes / dur / BOTS) / 1024).toFixed(2),
  perClientMsgsPerSec: +((rx / dur) / BOTS).toFixed(1),
  chatLatencyMs: lat.length ? { p50: lat[Math.floor(lat.length * 0.5)], p95: lat[Math.floor(lat.length * 0.95)], n: lat.length } : null,
  rejectedMoves: rejects,
  rssMB: Math.round(process.memoryUsage().rss / 1048576),
};
console.log(JSON.stringify(report, null, 2));
for (const b of bots) b.ws.close();
await srv.close();
process.exit(0);
