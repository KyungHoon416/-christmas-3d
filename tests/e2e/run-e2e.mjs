// End-to-end multi-client test in real browsers (Chromium via Playwright).
// Three independent browser contexts (2 desktop + 1 emulated iPhone) join the same
// server and exercise multiplayer, chat, whisper privacy, friends, hand-holding,
// couple, 3-way simultaneous WebRTC voice (fake microphones), region travel,
// screen rotation and reconnection.
//
//   npm run build && PORT=3100 npm start &     then   BASE=http://localhost:3100 npm run test:e2e
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = path.resolve('docs/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.floor(Math.random() * 9000 + 1000);

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function player(name, opts) {
  const ctx = await browser.newContext({ ...opts, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  // low quality + 10fps cap: 3-4 SwiftShader (CPU) WebGL clients share one machine
  await page.goto(BASE + '/?quality=low&maxfps=10', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.fill('[data-nick]', `${name}${tag}`.slice(0, 12));
  await page.check('[data-adult]');
  await page.click('[data-go]');
  await page.waitForFunction(() => window.__cw?.world?.region && window.__cw.world.me, null, { timeout: 60000 });
  const id = await page.evaluate(() => window.__cw.self.id);
  return { page, ctx, id, name };
}
const ev = (p, fn, arg) => p.page.evaluate(fn, arg);
// glide the local player toward (x,z) at walking speed so the server accepts it
async function walkTo(p, x, z) {
  await ev(p, async ([x, z]) => {
    const w = window.__cw.world;
    for (let i = 0; i < 400; i++) {
      const dx = x - w.me.pos.x, dz = z - w.me.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const s = Math.min(d, 0.25);
      w.me.pos.x += (dx / d) * s; w.me.pos.z += (dz / d) * s;
      await new Promise((r) => setTimeout(r, 60));
    }
  }, [x, z]);
}
const acceptToast = async (p) => { await p.page.locator('.toast.req .btn.primary').first().click({ timeout: 15000 }); };

try {
  const A = await player('Alice', { viewport: { width: 1440, height: 860 } });
  const B = await player('Bora', { ...devices['iPhone 13'] });
  const C = await player('Chan', { viewport: { width: 1280, height: 760 } });
  check('QA-01', 'PC 접속: 3D 월드 표시', await ev(A, () => window.__cw.engine.stats().calls > 20 && !!document.querySelector('.topnav')), JSON.stringify(await ev(A, () => window.__cw.engine.stats())));
  check('QA-02a', '모바일(세로) 접속: 모바일 UI/조이스틱', await ev(B, () => document.body.classList.contains('mobile') && document.body.classList.contains('portrait') && !!document.querySelector('.joystick')));

  // ---------------------------------------------------------- multiplayer
  await sleep(1500);
  const aPos = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  await walkTo(B, aPos.x + 1.2, aPos.z);
  await walkTo(C, aPos.x - 1.4, aPos.z + 0.6);
  await sleep(800);
  const seen = await ev(A, ([b, c]) => [window.__cw.world.remotes.has(b), window.__cw.world.remotes.has(c)], [B.id, C.id]);
  const bOnA = await ev(A, (b) => { const r = window.__cw.world.remotes.get(b); return r && { x: r.pos.x, z: r.pos.z }; }, B.id);
  const bSelf = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  check('QA-07', '멀티플레이: 서로 다른 클라이언트에서 상호 확인 + 위치 동기화', seen[0] && seen[1] && bOnA && Math.hypot(bOnA.x - bSelf.x, bOnA.z - bSelf.z) < 0.6, `A sees B,C=${seen}; B pos on A vs B self Δ=${bOnA ? Math.hypot(bOnA.x - bSelf.x, bOnA.z - bSelf.z).toFixed(2) : 'n/a'}m`);
  await A.page.screenshot({ path: path.join(SHOTS, 'e2e-desktop-multiplayer.jpg'), type: 'jpeg', quality: 85 });

  // ---------------------------------------------------------- chat
  await A.page.fill('[data-input]', `메리 크리스마스 ${tag}`);
  await A.page.press('[data-input]', 'Enter');
  const gotB = await B.page.waitForFunction((t) => window.__cw.chat.msgs.some((m) => m.text === t), `메리 크리스마스 ${tag}`, { timeout: 8000 }).then(() => true).catch(() => false);
  const gotC = await C.page.waitForFunction((t) => [...document.querySelectorAll('.chat .msg')].some((m) => m.textContent.includes(t)), `메리 크리스마스 ${tag}`, { timeout: 8000 }).then(() => true).catch(() => false);
  check('QA-08', '전체 채팅 실시간 송수신 (UI 입력 → 다른 클라이언트 DOM)', gotB && gotC);

  await ev(A, ([id, nick]) => window.__cw.chat.startWhisper(id, nick), [B.id, `Bora${tag}`]);
  await A.page.fill('[data-input]', `비밀 ${tag}`);
  await A.page.press('[data-input]', 'Enter');
  const wB = await B.page.waitForFunction((t) => window.__cw.chat.msgs.some((m) => m.ch === 'whisper' && m.text === t), `비밀 ${tag}`, { timeout: 8000 }).then(() => true).catch(() => false);
  await sleep(800);
  const wC = await ev(C, (t) => window.__cw.chat.msgs.some((m) => m.text === t), `비밀 ${tag}`);
  check('QA-09', '귓속말: 당사자만 수신 (제3자 미수신)', wB && !wC, `B received=${wB}, C received=${wC}`);

  // ---------------------------------------------------------- friends
  await ev(A, (id) => window.__cw.net.send({ t: 'req', kind: 'friend', to: id }), B.id);
  await B.page.waitForFunction(() => window.__cw.social.incoming.length > 0, null, { timeout: 8000 });
  await ev(B, () => window.__cw.openSheet(window.__cw.friendsEl));
  await B.page.click('.friends [data-ft="requests"]');
  await B.page.click('.friends [data-acc]');
  const frA = await A.page.waitForFunction((id) => window.__cw.social.friends.some((f) => f.id === id && f.online), B.id, { timeout: 15000 }).then(() => true).catch(() => false);
  const frB = await B.page.waitForFunction((id) => window.__cw.social.friends.some((f) => f.id === id), A.id, { timeout: 15000 }).then(() => true).catch(() => false);
  check('QA-11', '친구 신청 → 수락(모바일 UI 버튼) → 양쪽 목록 반영', frA && frB, `A list has B=${frA}, B list has A=${frB}`);
  await B.page.screenshot({ path: path.join(SHOTS, 'e2e-mobile-portrait-friends.jpg'), type: 'jpeg', quality: 85 });
  await ev(B, () => window.__cw.closeSheet(window.__cw.friendsEl));

  // ---------------------------------------------------------- hand hold
  await ev(A, (id) => window.__cw.requestInteraction('holdHand', id), B.id);
  await acceptToast(B);
  const held = await A.page.waitForFunction(() => !!window.__cw.world.hold, null, { timeout: 8000 }).then(() => true).catch(() => false);
  const bStart = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  const aStart = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  // hold W on the leader (injected into the game's input layer; Playwright key events
  // can be dropped when several headless pages compete for focus)
  await ev(A, () => { document.activeElement?.blur(); window.__cw.input.keys.add('KeyW'); });
  await sleep(6000);
  await ev(A, () => window.__cw.input.keys.delete('KeyW'));
  await sleep(700);
  const aEnd = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  const bEnd = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z, held: !!window.__cw.world.hold }));
  const moved = Math.hypot(bEnd.x - bStart.x, bEnd.z - bStart.z), gap = Math.hypot(aEnd.x - bEnd.x, aEnd.z - bEnd.z);
  const leaderMoved = Math.hypot(aEnd.x - aStart.x, aEnd.z - aStart.z);
  // frame rate in headless CPU rendering is ~3fps, so judge relative tracking, not absolute distance
  check('QA-12', '손잡기: 수락 후 함께 이동', held && bEnd.held && leaderMoved > 1.5 && moved > leaderMoved * 0.8 && gap < 1.6, `leader moved ${leaderMoved.toFixed(2)}m, follower moved ${moved.toFixed(2)}m, gap ${gap.toFixed(2)}m`);
  await A.page.screenshot({ path: path.join(SHOTS, 'e2e-hand-holding.jpg'), type: 'jpeg', quality: 85 });
  await ev(B, () => window.__cw.net.send({ t: 'release' }));
  const released = await A.page.waitForFunction(() => !window.__cw.world.hold, null, { timeout: 5000 }).then(() => true).catch(() => false);
  check('QA-12b', '손잡기: 한쪽이 취소하면 즉시 해제', released);

  // ---------------------------------------------------------- couple
  await ev(A, (id) => window.__cw.net.send({ t: 'req', kind: 'couple', to: id }), B.id);
  await acceptToast(B);
  const cp = await A.page.waitForFunction((id) => window.__cw.self.couple?.with === id, B.id, { timeout: 8000 }).then(() => true).catch(() => false);
  await ev(B, (id) => window.__cw.net.send({ t: 'friend', op: 'uncouple', id }), A.id);
  const uncp = await A.page.waitForFunction(() => !window.__cw.self.couple, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check('QA-13', '커플: 신청·수락·해제', cp && uncp);

  // ---------------------------------------------------------- voice (3-way, simultaneous)
  // bring all three within 3m and turn every mic on (fake devices emit a tone continuously)
  const aNow = await ev(A, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z }));
  await walkTo(B, aNow.x + 1.5, aNow.z);
  await walkTo(C, aNow.x - 1.5, aNow.z);
  for (const p of [A, B, C]) await ev(p, async () => { await window.__cw.toggleVoice(); await window.__cw.toggleMic(); });
  // peak RMS per remote stream over a window (metered every 50ms in-page)
  const sample = async (p, ms = 6000) => {
    await ev(p, () => window.__cw.voice.resetPeaks());
    await sleep(ms);
    const d = await ev(p, () => window.__cw.voice.debug());
    return Object.fromEntries(d.peers.map((x) => [x.id, x.peak]));
  };
  await sleep(5000);
  const [la, lb, lc] = await Promise.all([sample(A), sample(B), sample(C)]);
  const heard = (lv, ids) => ids.every((id) => (lv[id] || 0) > 0.002);
  const vA = heard(la, [B.id, C.id]), vB = heard(lb, [A.id, C.id]), vC = heard(lc, [A.id, B.id]);
  check('QA-10', '음성: 3명이 동시에 말할 때 각자 나머지 2명의 독립 오디오 스트림 수신', vA && vB && vC, `levels A=${JSON.stringify(la)} B=${JSON.stringify(lb)} C=${JSON.stringify(lc)}`);
  const gains = await ev(A, () => window.__cw.voice.debug().peers.map((p) => p.gain));
  check('QA-10b', '음성: 근거리(≤3m) 게인 ≈1', gains.length === 2 && gains.every((g) => g > 0.9), `gains=${gains}`);
  // walk C away beyond 10m -> attenuated to 0 on A
  await walkTo(C, aNow.x - 13, aNow.z);
  await A.page.waitForFunction((id) => (window.__cw.voice.debug().peers.find((p) => p.id === id)?.gain ?? 0) < 0.02, C.id, { timeout: 15000 }).catch(() => {});
  const gFar = await ev(A, (id) => window.__cw.voice.debug().peers.find((p) => p.id === id)?.gain ?? 0, C.id);
  check('QA-10c', '음성: 10m 초과 시 음소거 (거리 감쇠)', gFar < 0.02, `gain at ~13m = ${gFar}`);
  // C leaves voice and joins again as a "new joiner": A<->B must keep flowing throughout
  await ev(C, () => window.__cw.toggleVoice());
  await walkTo(C, aNow.x, aNow.z + 1.5);
  const midA = await sample(A, 3000);
  await ev(C, async () => { await window.__cw.toggleVoice(); await window.__cw.toggleMic(); });
  await sleep(6000);
  const la2 = await sample(A);
  const lb2 = await sample(B);
  check('QA-10d', '음성: 새 사용자 합류 시 기존 연결 유지 + 신규 스트림 수신', (midA[B.id] || 0) > 0.002 && (la2[B.id] || 0) > 0.002 && (la2[C.id] || 0) > 0.002 && (lb2[C.id] || 0) > 0.002, `during: ${JSON.stringify(midA)} after: A=${JSON.stringify(la2)} B=${JSON.stringify(lb2)}`);
  const duck = await ev(A, async () => { let m = 1; for (let i = 0; i < 40; i++) { m = Math.min(m, window.__cw.carol.duck); await new Promise((r) => setTimeout(r, 100)); } return m; });
  check('QA-15a', '캐럴 덕킹: 음성 대화 중 배경음 감소', duck < 1, `min duck gain over 4s=${duck}`);

  // ---------------------------------------------------------- mobile rotation
  const before = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z, net: window.__cw.net.state, mic: window.__cw.voice.mic }));
  await B.page.setViewportSize({ width: 844, height: 390 });
  await B.page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await sleep(1200);
  const after = await ev(B, () => ({ x: window.__cw.world.me.pos.x, z: window.__cw.world.me.pos.z, net: window.__cw.net.state, mic: window.__cw.voice.mic, land: document.body.classList.contains('landscape') }));
  check('QA-02b', '모바일 회전: 위치/연결/마이크 상태 유지', after.land && after.net === 'open' && after.mic === before.mic && Math.hypot(after.x - before.x, after.z - before.z) < 0.5, JSON.stringify({ before, after }));
  await B.page.screenshot({ path: path.join(SHOTS, 'e2e-mobile-landscape.jpg'), type: 'jpeg', quality: 85 });

  // ---------------------------------------------------------- region travel + cross-region whisper
  await ev(C, () => window.__cw.net.send({ t: 'join', region: 'namsan' }));
  const inNamsan = await C.page.waitForFunction(() => window.__cw.world.region?.id === 'namsan' && !document.querySelector('.loading'), null, { timeout: 120000 }).then(() => true).catch(() => false);
  await sleep(1500);
  const cGone = await ev(A, (id) => !window.__cw.world.remotes.has(id), C.id);
  check('QA-06', '서울 월드맵: 지역 이동 (이전 지역에서 퇴장 처리)', inNamsan && cGone);
  await ev(A, (id) => window.__cw.net.send({ t: 'chat', ch: 'whisper', to: id, text: 'cross-region ' + id, cid: 999 }), C.id);
  const xw = await C.page.waitForFunction((t) => window.__cw.chat.msgs.some((m) => m.text === t), 'cross-region ' + C.id, { timeout: 8000 }).then(() => true).catch(() => false);
  check('QA-09b', '귓속말: 서로 다른 지역에서도 유지', xw);
  const geoBefore = await ev(C, () => window.__cw.engine.stats().geometries);
  await ev(C, () => window.__cw.net.send({ t: 'join', region: 'gwanghwamun' }));
  await C.page.waitForFunction(() => window.__cw.world.region?.id === 'gwanghwamun' && !document.querySelector('.loading'), null, { timeout: 120000 });
  await ev(C, () => window.__cw.net.send({ t: 'join', region: 'namsan' }));
  await C.page.waitForFunction(() => window.__cw.world.region?.id === 'namsan' && !document.querySelector('.loading'), null, { timeout: 120000 });
  await sleep(1500);
  const geoAfter = await ev(C, () => window.__cw.engine.stats().geometries);
  check('QA-16a', '지역 이동 후 이전 씬 리소스 해제 (geometry 수 누적 없음)', geoAfter <= geoBefore + 15, `namsan geometries before=${geoBefore} after round-trip=${geoAfter}`);
  await C.page.screenshot({ path: path.join(SHOTS, 'e2e-namsan.jpg'), type: 'jpeg', quality: 85 });

  // ---------------------------------------------------------- reconnect
  await ev(A, () => window.__cw.net.ws.close());
  const rec = await A.page.waitForFunction(() => window.__cw.net.state === 'open' && window.__cw.world.region, null, { timeout: 90000 }).then(() => true).catch(() => false);
  const stillSeesB = await A.page.waitForFunction((id) => window.__cw.world.remotes.has(id) && !document.querySelector('.loading'), B.id, { timeout: 60000 }).then(() => true).catch(() => false);
  const sameId = (await ev(A, () => window.__cw.self.id)) === A.id;
  check('QA-07b', '네트워크 재접속: 동일 계정으로 복귀 + 다른 플레이어 재표시', rec && stillSeesB && sameId, `reconnected=${rec} seesB=${stillSeesB} sameId=${sameId}`);

  // ---------------------------------------------------------- perf sample
  const perf = await ev(A, () => window.__cw.engine.stats());
  check('QA-16', '성능 측정값 수집 (headless SwiftShader — 실제 GPU 아님)', perf.fps > 0, JSON.stringify(perf));
  check('QA-18', '콘솔/페이지 오류 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('E2E', 'runner exception', false, e.stack);
} finally {
  await browser.close();
}
fs.writeFileSync(path.resolve('docs/qa-e2e-results.json'), JSON.stringify({ date: new Date().toISOString(), base: BASE, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
