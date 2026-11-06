// Two browsers on the Firebase build, talking through the Firebase emulators
// (Realtime Database + Auth, with database.rules.json enforced):
//   npx firebase emulators:start --only database,auth --project demo-christmas &
//   npx vite build --mode firebase && (cd dist-firebase && python3 -m http.server 8766 &)
//   node tests/e2e/firebase-e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8766';
const LIVE = !!process.env.LIVE; // LIVE=1 BASE=https://christmas-3d.web.app -> test the deployed site
const EMU = process.env.EMU || '127.0.0.1:9000,127.0.0.1:9099';
const DB_REST = LIVE ? 'https://christmas-3d-default-rtdb.asia-southeast1.firebasedatabase.app' : `http://${EMU.split(',')[0]}`;
const NS = LIVE ? '' : '?ns=demo-christmas-default-rtdb';
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ ...(LIVE && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function player(nick, opts) {
  const ctx = await browser.newContext({ ...opts, permissions: ['microphone'], ignoreHTTPSErrors: LIVE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${nick}] ${e.message}`));
  await page.goto(`${BASE}/?quality=low&maxfps=10${LIVE ? '' : '&emu=' + EMU}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('[data-nick]', nick);
  await page.check('[data-adult]');
  await page.click('[data-go]');
  await page.waitForFunction(() => window.__cw?.world?.region && !document.querySelector('.loading'), null, { timeout: 120000 });
  return page;
}
const ev = (p, fn, a) => p.evaluate(fn, a);
const walk = (p, x, z) => ev(p, async ([x, z]) => { const w = window.__cw.world; for (let i = 0; i < 400; i++) { const dx = x - w.me.pos.x, dz = z - w.me.pos.z, d = Math.hypot(dx, dz); if (d < 0.05) break; const s = Math.min(d, 0.25); w.me.pos.x += dx / d * s; w.me.pos.z += dz / d * s; await new Promise((r) => setTimeout(r, 60)); } }, [x, z]);

try {
  const A = await player('파베A', { viewport: { width: 1000, height: 650 } });
  const B = await player('파베B', { ...devices['Pixel 7'] });
  const connected = await A.waitForFunction(() => !!window.__cw.net.room, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('F-01', 'Firebase 익명 로그인 + 실시간 DB 연결', connected, await ev(A, () => window.__cw.net.roomError || 'ok'));
  const find = (p, nick) => p.waitForFunction((n) => [...window.__cw.world.remotes.values()].find((r) => r.nick === n)?.id, nick, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => null);
  const bOnA = await find(A, '파베B');
  const aOnB = await find(B, '파베A');
  check('F-02', '서로 보임 (presence)', !!bOnA && !!aOnB, `${bOnA} / ${aOnB}`);

  const a = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z, ry: window.__cw.world.me.ry }));
  await walk(B, a.x + 1.5, a.z);
  await sleep(1500);
  const seen = await ev(A, (id) => { const r = window.__cw.world.remotes.get(id); return r && [r.pos.x, r.pos.z]; }, bOnA);
  const self = await ev(B, () => [window.__cw.world.me.pos.x, window.__cw.world.me.pos.z]);
  check('F-03', '이동 동기화 (pose 노드)', seen && Math.hypot(seen[0] - self[0], seen[1] - self[1]) < 0.5, seen ? `Δ=${Math.hypot(seen[0] - self[0], seen[1] - self[1]).toFixed(2)}m` : '');

  await A.fill('[data-input]', '파이어베이스 안녕!');
  await A.press('[data-input]', 'Enter');
  check('F-04', '채팅', await B.waitForFunction(() => window.__cw.chat.msgs.some((m) => m.text === '파이어베이스 안녕!'), null, { timeout: 15000 }).then(() => true).catch(() => false));

  // voice: both join + mic on, signalling goes through rooms/main/rtc/{uid}
  for (const p of [A, B]) await ev(p, async () => { await window.__cw.toggleVoice(); await window.__cw.toggleMic(); });
  const conn = await A.waitForFunction(() => window.__cw.voice.debug().peers.some((p) => p.state === 'connected'), null, { timeout: 40000 }).then(() => true).catch(() => false);
  await ev(A, () => window.__cw.voice.resetPeaks()); await ev(B, () => window.__cw.voice.resetPeaks());
  await sleep(6000);
  const va = await ev(A, () => window.__cw.voice.debug().peers);
  const vb = await ev(B, () => window.__cw.voice.debug().peers);
  check('F-05', '음성 대화: WebRTC 연결 + 양방향 수신 (DB 시그널링)', conn && va.some((p) => p.peak > 0.002) && vb.some((p) => p.peak > 0.002), `A=${JSON.stringify(va.map((p) => [p.state, p.peak]))} B=${JSON.stringify(vb.map((p) => [p.state, p.peak]))}`);

  // duel with a hit
  for (const p of [A, B]) await ev(p, () => { window.__dlog = []; for (const t of ['duel', 'duelEnd', 'dscore', 'reqResult']) window.__cw.net.on(t, (m) => window.__dlog.push(JSON.stringify(m).slice(0, 160))); });
  await ev(A, (id) => window.__cw.requestDuel(id), bOnA);
  await B.locator('.toast.req', { hasText: '파베A' }).locator('.btn.primary').first().click({ timeout: 20000 });
  const dA = await A.waitForFunction(() => window.__cw.duel.inDuel, null, { timeout: 20000 }).then(() => true).catch(() => false);
  const front = await ev(A, () => { const w = window.__cw.world; return { x: w.me.pos.x + Math.sin(w.me.ry) * 8, z: w.me.pos.z + Math.cos(w.me.ry) * 8 }; });
  await walk(B, front.x, front.z);
  await sleep(2500);
  await ev(A, async (id) => {
    const app = window.__cw, w = app.world;
    for (let i = 0; i < 30 && app.duel.inDuel; i++) {
      const r = w.remotes.get(id);
      if (r) { const c = app.engine.camera.position; w.cam.yaw = Math.atan2(r.pos.x - c.x, r.pos.z - c.z) + Math.PI; w.cam.pitch = 0.04; }
      await new Promise((res) => setTimeout(res, 250));
      app.duel.fire();
      await new Promise((res) => setTimeout(res, 300));
      if ((app.duel.active?.hp?.[id] ?? 100) < 100) break;
    }
  }, bOnA);
  await sleep(2000);
  console.log('A log', JSON.stringify(await ev(A, () => window.__dlog)));
  console.log('B log', JSON.stringify(await ev(B, () => window.__dlog)));
  const hpA = await ev(A, (id) => window.__cw.duel.active?.hp[id], bOnA);
  const hpB = await ev(B, () => window.__cw.duel.active?.hp[window.__cw.self.id]);
  check('F-06', '눈싸움 대결: 명중/체력 양쪽 일치', dA && hpA < 100 && hpA === hpB, `B hp on A=${hpA}, on B=${hpB}`);
  await ev(B, () => window.__cw.duel.forfeit());

  // security rules: player B cannot overwrite player A's presence
  const url = (uid) => `${DB_REST}/rooms/main/peers/${uid}.json${NS}`;
  // curl (honours the HTTPS proxy in CI sandboxes) for the unauthenticated REST checks
  const { execSync } = await import('node:child_process');
  const status = (args) => +execSync(`curl -s -o /dev/null -m 15 -w "%{http_code}" ${args}`).toString();
  const anonWrite = status(`-X PUT -d '{"n":"hacked"}' "${url(bOnA.slice(2))}"`);
  const anonRead = status(`"${DB_REST}/rooms/main/peers.json${NS}"`);
  // B (signed in) tries to overwrite A's presence through the SDK
  const crossWrite = await ev(B, (uidA) => window.__cw.net.debugWriteOther?.(uidA), aOnB.slice(2));
  check('F-07', '보안 규칙: 비로그인 읽기/쓰기 거부, 남의 데이터 쓰기 거부', [401, 403].includes(anonWrite) && [401, 403].includes(anonRead) && crossWrite === 'denied', `anon PUT ${anonWrite}, anon GET ${anonRead}, B->A write ${crossWrite}`);
  check('F-08', '페이지 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('F-E', 'runner exception', false, e.stack);
} finally {
  await browser.close();
}
fs.writeFileSync(LIVE ? 'docs/qa-firebase-live-results.json' : 'docs/qa-firebase-results.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
