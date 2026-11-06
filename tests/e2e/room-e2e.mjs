// Two real browser pages meet through the artifact `room` capability (mocked with
// BroadcastChannel): presence sync, chat, whisper, hand-holding and a 1:1 duel.
//   node scripts/build-artifact.mjs && (cd dist-demo && python3 -m http.server 8765 &)
//   BASE=http://localhost:8765 node tests/e2e/room-e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765';
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await ctx.addInitScript({ path: path.resolve('tests/e2e/mock-room.js') });
const errors = [];
async function player(nick) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${nick}] ${e.message}`));
  await page.goto(BASE + '/artifact-test.html?quality=low&maxfps=10', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('[data-nick]', nick);
  await page.check('[data-adult]');
  await page.click('[data-go]');
  await page.waitForFunction(() => window.__cw?.world?.region && !document.querySelector('.loading'), null, { timeout: 120000 });
  return page;
}
const ev = (p, fn, a) => p.evaluate(fn, a);

try {
  const A = await player('눈송이');
  const B = await player('겨울별');
  const peerOf = async (p, nick) => p.waitForFunction((n) => [...window.__cw.world.remotes.values()].find((r) => r.nick === n)?.id, nick, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  const bOnA = await peerOf(A, '겨울별');
  const aOnB = await peerOf(B, '눈송이');
  check('R-01', '같은 링크의 두 사람이 서로를 봄 (presence 동기화)', bOnA?.startsWith('p_') && aOnB?.startsWith('p_'), `${bOnA} / ${aOnB}`);

  // move B toward A and check the position on A's screen
  const aPos = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  await ev(B, async ([x, z]) => { const w = window.__cw.world; for (let i = 0; i < 300; i++) { const dx = x - w.me.pos.x, dz = z - w.me.pos.z, d = Math.hypot(dx, dz); if (d < 0.05) break; const s = Math.min(d, 0.2); w.me.pos.x += dx / d * s; w.me.pos.z += dz / d * s; await new Promise((r) => setTimeout(r, 60)); } }, [aPos.x + 1.6, aPos.z]);
  await sleep(1500);
  const seen = await ev(A, (id) => { const r = window.__cw.world.remotes.get(id); return r && { x: r.pos.x, z: r.pos.z }; }, bOnA);
  const self = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  check('R-02', '이동 동기화', seen && Math.hypot(seen.x - self.x, seen.z - self.z) < 0.5, seen ? `Δ=${Math.hypot(seen.x - self.x, seen.z - self.z).toFixed(2)}m` : 'not seen');

  await A.fill('[data-input]', '안녕 겨울별!');
  await A.press('[data-input]', 'Enter');
  const chat = await B.waitForFunction(() => window.__cw.chat.msgs.some((m) => m.text === '안녕 겨울별!' && m.nick === '눈송이'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('R-03', '채팅 전달', chat);

  await ev(B, ([id]) => window.__cw.chat.startWhisper(id, '눈송이'), [aOnB]);
  await B.fill('[data-input]', '비밀이야');
  await B.press('[data-input]', 'Enter');
  const wh = await A.waitForFunction(() => window.__cw.chat.msgs.some((m) => m.ch === 'whisper' && m.text === '비밀이야'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('R-04', '귓속말 전달', wh);

  await ev(A, (id) => window.__cw.requestInteraction('holdHand', id), bOnA);
  await B.locator('.toast.req', { hasText: '눈송이' }).locator('.btn.primary').first().click({ timeout: 15000 });
  const held = await A.waitForFunction(() => !!window.__cw.world.hold, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const bStart = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  await ev(A, () => { document.activeElement?.blur(); window.__cw.input.keys.add('KeyW'); });
  await sleep(5000);
  await ev(A, () => window.__cw.input.keys.delete('KeyW'));
  await sleep(1200);
  const bEnd = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z, held: !!window.__cw.world.hold }));
  const moved = Math.hypot(bEnd.x - bStart.x, bEnd.z - bStart.z);
  check('R-05', '손잡고 함께 이동', held && bEnd.held && moved > 1, `follower moved ${moved.toFixed(2)}m`);
  await ev(A, () => window.__cw.net.send({ t: 'release' }));
  await B.waitForFunction(() => !window.__cw.world.hold, null, { timeout: 10000 }).catch(() => {});

  // duel: A challenges, B accepts; A fires at B; B forfeits
  await ev(A, (id) => window.__cw.requestDuel(id), bOnA);
  await B.locator('.toast.req', { hasText: '눈송이' }).locator('.btn.primary').first().click({ timeout: 15000 });
  const dA = await A.waitForFunction(() => window.__cw.duel.inDuel, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const dB = await B.waitForFunction(() => window.__cw.duel.inDuel, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('R-06', '1:1 눈싸움 대결 시작 (양쪽)', dA && dB);
  // spread out like a real duel: B steps 8 m in front of A
  const front = await ev(A, () => { const w = window.__cw.world; return { x: w.me.pos.x + Math.sin(w.me.ry) * 8, z: w.me.pos.z + Math.cos(w.me.ry) * 8 }; });
  await ev(B, async ([x, z]) => { const w = window.__cw.world; for (let i = 0; i < 300; i++) { const dx = x - w.me.pos.x, dz = z - w.me.pos.z, d = Math.hypot(dx, dz); if (d < 0.05) break; const s = Math.min(d, 0.25); w.me.pos.x += dx / d * s; w.me.pos.z += dz / d * s; await new Promise((r) => setTimeout(r, 60)); } }, [front.x, front.z]);
  await sleep(2000);
  await ev(B, () => { const d = window.__cw.duel; const orig = d.onShot.bind(d); window.__shots = []; d.onShot = (m) => { window.__shots.push({ by: m.by, duel: m.duel, active: d.active?.id, opp: d.active?.opp, o: m.o, d: m.d, me: [window.__cw.world.me.pos.x, window.__cw.world.me.pos.y, window.__cw.world.me.pos.z] }); orig(m); }; });
  await ev(A, async (id) => {
    const app = window.__cw, w = app.world;
    for (let i = 0; i < 30 && app.duel.inDuel; i++) {
      const r = w.remotes.get(id);
      // put the crosshair (camera ray) on the opponent, like a player moving the mouse
      if (r) { const c = app.engine.camera.position; const dx = r.pos.x - c.x, dz = r.pos.z - c.z; w.cam.yaw = Math.atan2(dx, dz) + Math.PI; w.cam.pitch = 0.04; }
      await new Promise((res) => setTimeout(res, 250));
      app.duel.fire();
      await new Promise((r) => setTimeout(r, 350));
      if ((app.duel.active?.hp?.[id] ?? 100) < 100) break;
    }
  }, bOnA);
  await sleep(1500);
  console.log('B received shots:', JSON.stringify((await ev(B, () => window.__shots)).slice(0, 3)));
  console.log('A view of B:', JSON.stringify(await ev(A, (id) => { const r = window.__cw.world.remotes.get(id); return [r.pos.x, r.pos.y, r.pos.z, window.__cw.world.me.pos.x, window.__cw.world.me.pos.z]; }, bOnA)));
  const hpA = await ev(A, (id) => window.__cw.duel.active?.hp[id], bOnA);
  const hpB = await ev(B, () => window.__cw.duel.active?.hp[window.__cw.self.id]);
  check('R-07', '명중 판정과 체력이 양쪽에서 일치', hpA !== undefined && hpA < 100 && hpA === hpB, `B hp on A=${hpA}, on B=${hpB}`);
  await ev(B, () => window.__cw.duel.forfeit());
  const endA = await A.waitForFunction(() => !window.__cw.duel.inDuel, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const statsA = await ev(A, () => window.__cw.duel.stats);
  check('R-08', '항복 → 양쪽 대결 종료, 승자 기록', endA && statsA.w >= 1, JSON.stringify(statsA));
  await A.screenshot({ path: 'docs/screenshots/room-duel.jpg', type: 'jpeg', quality: 85, timeout: 120000 }).catch(() => {});
  check('R-09', '페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('R-E', 'runner exception', false, e.stack);
} finally {
  await browser.close();
}
fs.writeFileSync('docs/qa-room-results.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
