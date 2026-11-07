// 3D ad banner × Firebase (emulators, database.rules.json enforced):
//   npx firebase emulators:start --only database,auth --project demo-christmas &
//   npx vite build --mode firebase && python3 -m http.server 8766 --directory dist-firebase &
//   node tests/e2e/ads-firebase-e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8766';
const EMU = '127.0.0.1:9000,127.0.0.1:9099';
const DB = 'http://127.0.0.1:9000', NS = 'ns=demo-christmas-default-rtdb', AUTH = 'http://127.0.0.1:9099';
const OUT = process.env.OUT || '.';
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Node's fetch ignores HTTP(S)_PROXY settings inconsistently in this sandbox -> use curl for localhost REST
const curl = (method, url, body, headers = []) => {
  const args = ['-s', '-o', '-', '-w', '\n%{http_code}', '-X', method, url, ...headers.flatMap((h) => ['-H', h])];
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  const out = execFileSync('curl', args, { env: { ...process.env, http_proxy: '', HTTP_PROXY: '', no_proxy: '*' } }).toString();
  const i = out.lastIndexOf('\n');
  return { status: +out.slice(i + 1), body: out.slice(0, i) };
};
const owner = ['Authorization: Bearer owner'];
const db = (method, path, body, token) => curl(method, `${DB}/${path}.json?${NS}${token ? '&auth=' + token : ''}`, body, token ? [] : owner);
const dbAs = (method, path, body, token) => curl(method, `${DB}/${path}.json?${NS}${token ? '&auth=' + token : ''}`, body);
const anonUser = () => JSON.parse(curl('POST', `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { returnSecureToken: true }).body);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  db('DELETE', 'ads'); db('DELETE', 'adStats'); db('DELETE', 'admins');

  // ---------------- security rules
  const u = anonUser();
  check('AD-R1', '광고 데이터 공개 읽기 (로그인 없이)', dbAs('GET', 'ads').status === 200);
  check('AD-R2', '일반 사용자는 광고 슬롯 수정 불가', dbAs('PUT', 'ads/slots/test-slot-a', { slotName: 'HACK', isActive: true }, u.idToken).status === 401);
  check('AD-R3', '통계 +1 기록 허용', dbAs('PUT', 'adStats/test-slot-a/ad_slot_click/20261107', 1, u.idToken).status === 200);
  check('AD-R4', '통계 임의 값 조작 거부 (+5)', dbAs('PUT', 'adStats/test-slot-a/ad_slot_click/20261107', 6, u.idToken).status === 401);
  check('AD-R5', '일반 사용자는 통계 읽기 불가', dbAs('GET', 'adStats', undefined, u.idToken).status === 401);
  check('AD-R6', '관리자 목록 자기 등록 불가', dbAs('PUT', `admins/${u.localId}`, true, u.idToken).status === 401);
  db('PUT', `admins/${u.localId}`, true);
  check('AD-R7', '관리자는 슬롯 저장 가능', dbAs('PUT', 'ads/slots/test-slot-a', { slotName: 'TEST SLOT A', isActive: true, targetUrl: 'https://example.com/a' }, u.idToken).status === 200);
  check('AD-R8', '관리자도 javascript: 링크 저장 불가', dbAs('PUT', 'ads/slots/test-slot-a', { slotName: 'X', isActive: true, targetUrl: 'javascript:alert(1)' }, u.idToken).status === 401);
  db('DELETE', 'ads'); db('DELETE', 'adStats'); db('DELETE', 'admins');

  // ---------------- game: live slot updates
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const game = await ctx.newPage();
  game.on('pageerror', (e) => errors.push('[game] ' + e.message));
  await game.goto(`${BASE}/?quality=low&maxfps=12&emu=${EMU}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await game.fill('[data-nick]', '광고검증'); await game.check('[data-adult]').catch(() => {}); await game.click('[data-go]');
  await game.waitForFunction(() => window.__cw?.world?.region && !document.querySelector('.loading'), null, { timeout: 150000 });
  await game.evaluate(() => document.querySelectorAll('.modal-bg').forEach((m) => m.close?.()));
  const slots = () => game.evaluate(() => window.__cw.engine.region.adBanners[0].slotList().map((s) => ({ key: s.key, status: s.status, loaded: s.loaded, name: s.data?.slotName })));
  await game.waitForFunction(() => window.__cw.adService.db, null, { timeout: 30000 });
  await game.waitForFunction(() => window.__cw.engine.region.adBanners[0].slotList().every((s) => s.data?.slotName), null, { timeout: 30000 }).catch(() => {});
  let s0 = await slots();
  check('AD-01', '광화문 광고판 1개 + TEST SLOT A/B/C 표시 (DB 비어 있으면 기본값)', s0.length === 3 && s0.every((s) => s.status === 'ACTIVE'), JSON.stringify(s0.map((s) => s.name)));

  db('PUT', 'ads/slots/test-slot-b', { slotId: 'test-slot-b', slotName: 'LIVE SLOT B', advertiserName: 'Live Test', imageUrl: '/test-assets/ad-slot-c.jpg', targetUrl: 'https://example.com/live', isActive: true, priority: 2, startDate: '2026-01-01T00:00:00.000Z', endDate: '2030-01-01T00:00:00.000Z' });
  const live = await game.waitForFunction(() => { const b = window.__cw.engine.region.adBanners[0].slots.get('B'); return b.data?.slotName === 'LIVE SLOT B' && String(b.loaded).includes('ad-slot-c.jpg'); }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('AD-04', 'Firebase DB 변경 → 슬롯 B 이미지/이름 실시간 반영', live);

  db('PATCH', 'ads/slots/test-slot-b', { endDate: '2026-01-02T00:00:00.000Z' });
  const exp = await game.waitForFunction(() => { const b = window.__cw.engine.region.adBanners[0].slots.get('B'); return b.status === 'EXPIRED' && b.loaded === 'canvas:promo'; }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('AD-06', '종료일 지난 슬롯 → 기본 크리스마스 배너로 전환', exp);
  db('PATCH', 'ads/slots/test-slot-b', { isActive: false, endDate: '2030-01-01T00:00:00.000Z' });
  const inact = await game.waitForFunction(() => window.__cw.engine.region.adBanners[0].slots.get('B').status === 'INACTIVE', null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('AD-06b', '비활성 슬롯 → 기본 배너', inact);

  // interaction + stats
  await game.evaluate(() => { const w = window.__cw.world; w.correct = () => {}; const b = window.__cw.engine.region.adBanners[0].group; const r = b.rotation.y; w.me.pos.set(b.position.x + Math.sin(r) * 4.5, 0, b.position.z + Math.cos(r) * 4.5); w.me.ry = r + Math.PI; w.cam.yaw = r; w.cam.pitch = 0.1; w.cam.dist = 5; });
  await game.waitForFunction(() => !document.querySelector('.ad-prompt').classList.contains('hidden'), null, { timeout: 20000 });
  await game.keyboard.press('KeyE');
  await game.waitForSelector('[data-visit="A"]', { timeout: 10000 });
  await game.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
  await game.click('[data-visit="A"]'); await game.click('[data-ok]');
  await sleep(2500);
  const st = JSON.parse(db('GET', 'adStats').body || '{}') || {};
  const sum = (slot, ev) => Object.values(st?.[slot]?.[ev] || {}).reduce((a, b) => a + b, 0);
  check('AD-09', '통계 기록 (view/visible/interaction/click/link_open)', sum('test-slot-a', 'ad_banner_view') >= 1 && sum('test-slot-a', 'ad_slot_interaction') >= 1 && sum('test-slot-a', 'ad_slot_click') === 1 && sum('test-slot-a', 'ad_external_link_open') === 1, JSON.stringify(st['test-slot-a']));
  check('AD-08', '확인 후에만 링크 열림', JSON.stringify(await game.evaluate(() => window.__opened)) === '["https://example.com/a"]');
  await game.keyboard.press('KeyE');

  // ---------------- admin page
  const actx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const admin = await actx.newPage();
  admin.on('pageerror', (e) => errors.push('[admin] ' + e.message));
  await admin.goto(`${BASE}/admin.html?emu=${EMU}`, { waitUntil: 'domcontentloaded' });
  await admin.click('[data-anon]');
  await admin.waitForSelector('[data-copy]', { timeout: 20000 });
  const uid = await admin.getAttribute('[data-copy]', 'data-copy');
  check('AD-A1', '관리자 아님 → 편집 불가 + UID 등록 안내', !(await admin.$('[data-edit]')), uid);
  await admin.screenshot({ path: `${OUT}/ad-admin-1-notadmin.jpg`, type: 'jpeg', quality: 75 });
  db('PUT', `admins/${uid}`, true);
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.waitForSelector('[data-edit="test-slot-a"]', { timeout: 20000 });
  await admin.click('[data-edit="test-slot-a"]');
  await admin.fill('form [name="advertiserName"]', 'ADMIN UPLOAD TEST');
  await admin.fill('form [name="targetUrl"]', 'https://example.com/admin');
  await admin.setInputFiles('form [name="file"]', 'client/public/test-assets/ad-slot-b.jpg');
  await admin.click('form [type="submit"]');
  const saved = await game.waitForFunction(() => { const a = window.__cw.engine.region.adBanners[0].slots.get('A'); return a.data?.advertiserName === 'ADMIN UPLOAD TEST' && String(a.loaded).startsWith('data:image/'); }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  check('AD-A2', '관리자 화면에서 수정 + 이미지 업로드 → 게임에 반영', saved, (await admin.$eval('.msg', (e) => e.textContent).catch(() => '')).slice(0, 120));
  check('AD-05', 'Firebase Storage 업로드', false, 'BLOCKED: 프로젝트에 Storage 버킷 없음 → DB 압축 저장 폴백으로 대체됨');
  await admin.waitForTimeout(1500);
  await admin.screenshot({ path: `${OUT}/ad-admin-2-admin.jpg`, type: 'jpeg', quality: 75, fullPage: true });
  await admin.click('[data-toggle="test-slot-c"]');
  const off = await game.waitForFunction(() => window.__cw.engine.region.adBanners[0].slots.get('C').status === 'INACTIVE', null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('AD-A3', '관리자 비활성화 → 게임 반영', off);
  admin.once('dialog', (d) => d.accept());
  await admin.click('[data-reset="test-slot-a"]');
  const reset = await game.waitForFunction(() => { const a = window.__cw.engine.region.adBanners[0].slots.get('A'); return a.data?.advertiserName === 'TEST ADVERTISER A' && String(a.loaded).includes('ad-slot-a.jpg'); }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('AD-A4', '기본 테스트 배너로 복원', reset);
  await game.evaluate(() => { window.__cw.world.cam.dist = 8; });
  await sleep(2000);
  await game.screenshot({ path: `${OUT}/ad-game-live.jpg`, type: 'jpeg', quality: 78 });
  check('AD-ERR', '페이지 오류 없음', !errors.length, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('AD-X', '예외', false, e.message.split('\n')[0]);
} finally {
  await browser.close();
  fs.writeFileSync(`${OUT}/qa-ads-firebase-results.json`, JSON.stringify(results, null, 2));
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
}
