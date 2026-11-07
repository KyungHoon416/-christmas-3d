// Ad admin (admin.html). Google sign-in; write access is enforced by database.rules.json:
// only uids listed as `admins/{uid}: true` (set once in the Firebase console) can change /ads.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, onValue, get, set, update, remove, connectDatabaseEmulator } from 'firebase/database';
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { loadFirebaseConfig } from '../net/firebaseRoom.js';
import { AD_LOCATIONS, AD_TYPES, DEFAULT_SLOTS, slotStatus, safeTargetUrl, AD_EVENTS } from '../../../shared/ads.js';
import { adArtCanvas } from '../ads/adArt.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const params = new URLSearchParams(location.search);
const emu = params.get('emu');
const root = $('#root');

const state = { user: null, isAdmin: false, slots: {}, images: {}, locations: {}, stats: null, editing: null, msg: null };

const cfg = emu ? { apiKey: 'demo-key', projectId: 'demo-christmas', databaseURL: `http://${emu.split(',')[0]}?ns=demo-christmas-default-rtdb`, authDomain: 'localhost' } : await loadFirebaseConfig().catch((e) => { root.innerHTML = `<div class="card msg err">Firebase 설정을 불러오지 못했습니다: ${esc(e.message)}<br/>이 페이지는 Firebase Hosting(christmas-3d.web.app/admin)에서 열어야 합니다.</div>`; throw e; });
const app = initializeApp(cfg, 'admin');
const auth = getAuth(app);
const db = getDatabase(app);
if (emu) { const [d, a] = emu.split(','); connectAuthEmulator(auth, `http://${a}`, { disableWarnings: true }); const [h, p] = d.split(':'); connectDatabaseEmulator(db, h, +p); }

// public data (anyone can read /ads)
onValue(ref(db, 'ads/slots'), (s) => { state.slots = s.val() || {}; render(); });
onValue(ref(db, 'ads/images'), (s) => { state.images = s.val() || {}; render(); });
onValue(ref(db, 'ads/locations'), (s) => { state.locations = s.val() || {}; render(); });

onAuthStateChanged(auth, async (u) => {
  state.user = u; state.isAdmin = false; state.stats = null;
  if (u) {
    state.isAdmin = (await get(ref(db, `admins/${u.uid}`)).catch(() => null))?.val() === true;
    if (state.isAdmin) onValue(ref(db, 'adStats'), (s) => { state.stats = s.val() || {}; render(); }, () => {});
  }
  renderHeader(); render();
});

function renderHeader() {
  const u = state.user;
  $('#who').textContent = u ? `${u.email || '익명(테스트)'} · ${state.isAdmin ? '관리자' : '관리자 아님'}` : '로그인 필요';
  $('#authbtns').innerHTML = u ? '<button class="btn" data-out>로그아웃</button>' : `<button class="btn primary" data-in>Google 로그인</button>${emu ? ' <button class="btn" data-anon>에뮬레이터 테스트 로그인</button>' : ''}`;
  $('[data-out]')?.addEventListener('click', () => signOut(auth));
  $('[data-in]')?.addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => flash(loginError(e), true)));
  $('[data-anon]')?.addEventListener('click', () => signInAnonymously(auth));
}
const loginError = (e) => e.code === 'auth/operation-not-allowed' ? 'Firebase 콘솔 → Authentication → 로그인 방법에서 Google을 사용 설정해 주세요.' : e.code === 'auth/unauthorized-domain' ? '이 도메인이 Authentication → 설정 → 승인된 도메인에 없습니다.' : `로그인 실패: ${e.message}`;

function flash(text, err = false) { state.msg = { text, err }; render(); clearTimeout(flash.t); flash.t = setTimeout(() => { state.msg = null; render(); }, 6000); }

const merged = () => ({ ...DEFAULT_SLOTS, ...state.slots });
const imgSrc = (slotId, d) => (d?.imageUrl?.startsWith('rtdb:') ? state.images[slotId] : d?.imageUrl) || '';
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-');
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function render() {
  const S = merged();
  const u = state.user;
  let h = '';
  if (state.msg) h += `<div class="msg ${state.msg.err ? 'err' : ''}">${esc(state.msg.text)}</div>`;
  if (!u) h += `<div class="card"><h2>관리자 로그인</h2><p>광고 수정은 관리자만 할 수 있습니다. Google 계정으로 로그인하세요. 누구나 아래에서 현재 광고 상태를 볼 수는 있습니다.</p></div>`;
  else if (!state.isAdmin) h += `<div class="card"><h2>관리자 권한 등록 (최초 1회)</h2>
    <p>이 계정은 아직 관리자가 아닙니다. Firebase 콘솔 → Realtime Database → 데이터에서 루트에 아래 항목을 추가하세요:</p>
    <p><code>admins</code> → <code>${esc(u.uid)}</code> : <code>true</code> &nbsp;<button class="btn" data-copy="${esc(u.uid)}">UID 복사</button></p>
    <p class="note">추가 후 이 페이지를 새로고침하면 편집 기능이 열립니다. (보안 규칙이 서버에서 권한을 검사하므로, 관리자가 아니면 화면을 조작해도 저장되지 않습니다.)</p></div>`;

  for (const loc of AD_LOCATIONS) {
    const live = state.locations[loc.locationId];
    const locActive = live ? live.isActive : loc.isActive;
    h += `<div class="card"><h2>📍 ${esc(loc.placeName)} <span class="note">(${esc(loc.locationId)} · ${esc(loc.region)})</span></h2>
      <div class="row"><span class="tag ${locActive ? 'ACTIVE' : 'INACTIVE'}">${locActive ? '광고판 켜짐' : '광고판 꺼짐'}</span>
      <span class="note">위치 x ${loc.position.x}, z ${loc.position.z}, 회전 ${loc.rotation.y} · 유형 ${loc.type} (슬롯 ${Object.keys(loc.slots).join('/')})</span></div>
      <canvas class="preview" width="1200" height="660" data-loc="${esc(loc.locationId)}"></canvas>
      <p class="note">미리보기: 현재 데이터 기준으로 게임 안 광고판에 표시될 모습 (종료·비활성 슬롯은 기본 크리스마스 배너).</p>
      <table><thead><tr><th>슬롯</th><th>이미지</th><th>광고주 / 설명</th><th class="hide-m">링크</th><th>기간</th><th>상태</th><th></th></tr></thead><tbody>
      ${Object.entries(loc.slots).map(([key, slotId]) => {
        const d = S[slotId] || {}; const st = slotStatus(d); const src = imgSrc(slotId, d);
        return `<tr><td><b>${esc(key)}</b><br/>${esc(d.slotName || slotId)}<br/><span class="note">${esc(slotId)}${state.slots[slotId] ? '' : ' · 기본값(미저장)'}</span></td>
          <td>${src ? `<img class="thumb" src="${esc(src)}" alt=""/>` : '<span class="note">없음</span>'}</td>
          <td>${esc(d.advertiserName || '-')}<br/><span class="note">${esc(d.description || '')}</span></td>
          <td class="hide-m">${safeTargetUrl(d.targetUrl) ? `<a href="${esc(d.targetUrl)}" target="_blank" rel="noopener noreferrer">${esc(d.targetUrl)}</a>` : '-'}</td>
          <td class="note">${fmt(d.startDate)}<br/>~ ${fmt(d.endDate)}</td>
          <td><span class="tag ${st}">${st}</span><br/><span class="note">${d.isActive === false ? '비활성' : '활성'}</span></td>
          <td>${state.isAdmin ? `<div class="row"><button class="btn primary" data-edit="${esc(slotId)}">수정</button>
            <button class="btn" data-toggle="${esc(slotId)}">${d.isActive === false ? '활성화' : '비활성화'}</button>
            <button class="btn danger" data-reset="${esc(slotId)}">기본 테스트 배너로 복원</button></div>` : ''}</td></tr>`;
      }).join('')}</tbody></table>
      ${state.isAdmin ? `<div class="row" style="margin-top:10px"><button class="btn" data-locToggle="${esc(loc.locationId)}">${locActive ? '광고판 끄기' : '광고판 켜기'}</button>
        <button class="btn" data-seed="${esc(loc.locationId)}">TEST SLOT A/B/C 초기 데이터 저장</button></div>` : ''}</div>`;
  }

  if (state.isAdmin && state.editing) h += editForm(state.editing, S[state.editing] || {});
  if (state.isAdmin) h += statsCard();
  h += `<div class="card note">광고 데이터는 Realtime Database <code>/ads</code>에 저장되고 게임에 실시간 반영됩니다. Google AdSense 코드는 3D 광고판에 넣지 않습니다(정책상 불가). 3D 광고판은 직접 판매형/테스트 이미지 전용입니다.</div>`;
  root.innerHTML = h;
  bind();
  for (const c of root.querySelectorAll('canvas[data-loc]')) drawPreview(c, AD_LOCATIONS.find((l) => l.locationId === c.dataset.loc), S);
}

function editForm(slotId, d) {
  return `<div class="card" id="editcard"><h2>✏️ ${esc(slotId)} 수정</h2>
  <form class="slot" data-form="${esc(slotId)}">
    <label>슬롯 이름<input name="slotName" maxlength="60" value="${esc(d.slotName || '')}" required/></label>
    <label>광고주명<input name="advertiserName" maxlength="80" value="${esc(d.advertiserName || '')}"/></label>
    <label class="full">설명<textarea name="description" maxlength="300" rows="2">${esc(d.description || '')}</textarea></label>
    <label class="full">클릭 URL (https://)<input name="targetUrl" type="url" maxlength="1000" value="${esc(d.targetUrl || '')}" placeholder="https://example.com"/></label>
    <label class="full">이미지 URL<input name="imageUrl" maxlength="1000" value="${esc(d.imageUrl || '')}" placeholder="https://… 또는 아래에서 업로드"/></label>
    <label class="full">이미지 업로드 (JPG/PNG, 권장 1280×800 · 슬롯 A 16:10, B/C 16:9)<input name="file" type="file" accept="image/jpeg,image/png,image/webp"/></label>
    <label>시작일<input name="startDate" type="datetime-local" value="${toLocalInput(d.startDate)}"/></label>
    <label>종료일<input name="endDate" type="datetime-local" value="${toLocalInput(d.endDate)}"/></label>
    <label>우선순위<input name="priority" type="number" value="${esc(d.priority ?? 1)}"/></label>
    <label>노출<select name="isActive"><option value="1" ${d.isActive !== false ? 'selected' : ''}>활성</option><option value="0" ${d.isActive === false ? 'selected' : ''}>비활성</option></select></label>
    <div class="row full"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-cancel>취소</button><span class="note" data-upmsg></span></div>
  </form></div>`;
}

function statsCard() {
  const st = state.stats || {};
  const rows = Object.keys(merged()).map((slotId) => {
    const ev = st[slotId] || {};
    const cells = AD_EVENTS.map((e) => Object.values(ev[e] || {}).reduce((a, b) => a + b, 0));
    return `<tr><td>${esc(slotId)}</td>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="card"><h2>📊 광고 통계 (누적)</h2><table><thead><tr><th>슬롯</th>${AD_EVENTS.map((e) => `<th>${e.replace('ad_', '')}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <p class="note">세션당 1회 집계: banner_view / slot_visible. 사용자가 직접 누른 경우만: interaction(패널 열기) / click(사이트 방문 버튼) / external_link_open(확인 후 이동). 일별 값은 <code>/adStats/{slotId}/{event}/{yyyymmdd}</code>.</p></div>`;
}

function bind() {
  root.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => flash('UID를 복사했어요'))));
  root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { state.editing = b.dataset.edit; render(); $('#editcard')?.scrollIntoView({ behavior: 'smooth' }); }));
  root.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => save(b.dataset.toggle, { ...merged()[b.dataset.toggle], isActive: merged()[b.dataset.toggle]?.isActive === false })));
  root.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = async () => {
    if (!confirm('이 슬롯을 기본 TEST 배너로 되돌릴까요?')) return;
    await remove(ref(db, `ads/images/${b.dataset.reset}`)).catch(() => {});
    save(b.dataset.reset, { ...DEFAULT_SLOTS[b.dataset.reset] });
  }));
  root.querySelectorAll('[data-seed]').forEach((b) => (b.onclick = async () => {
    for (const id of Object.values(AD_LOCATIONS.find((l) => l.locationId === b.dataset.seed).slots)) if (!state.slots[id]) await save(id, { ...DEFAULT_SLOTS[id] }, true);
    flash('TEST SLOT 초기 데이터를 저장했어요');
  }));
  root.querySelectorAll('[data-locToggle]').forEach((b) => (b.onclick = () => {
    const id = b.dataset.loctoggle; const cur = state.locations[id]?.isActive ?? true;
    set(ref(db, `ads/locations/${id}`), { isActive: !cur, updatedAt: Date.now() }).then(() => flash(!cur ? '광고판을 켰어요' : '광고판을 껐어요')).catch((e) => flash('실패: ' + e.message, true));
  }));
  const f = root.querySelector('form[data-form]');
  if (f) {
    f.querySelector('[data-cancel]').onclick = () => { state.editing = null; render(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const slotId = f.dataset.form, fd = new FormData(f);
      const url = String(fd.get('targetUrl') || '').trim();
      if (url && !safeTargetUrl(url)) return flash('클릭 URL은 http(s):// 주소여야 합니다', true);
      const sd = fd.get('startDate'), ed = fd.get('endDate');
      if (sd && ed && new Date(ed) <= new Date(sd)) return flash('종료일이 시작일보다 뒤여야 합니다', true);
      const data = {
        ...merged()[slotId], slotId,
        slotName: String(fd.get('slotName')).trim().slice(0, 60), advertiserName: String(fd.get('advertiserName')).trim().slice(0, 80),
        description: String(fd.get('description')).trim().slice(0, 300), targetUrl: url,
        imageUrl: String(fd.get('imageUrl') || '').trim(), priority: +fd.get('priority') || 1, isActive: fd.get('isActive') === '1',
        startDate: sd ? new Date(sd).toISOString() : '', endDate: ed ? new Date(ed).toISOString() : '',
      };
      const file = fd.get('file');
      if (file && file.size) {
        const m = f.querySelector('[data-upmsg]'); m.textContent = '이미지 업로드 중…';
        try { data.imageUrl = await uploadImage(slotId, file, (t) => (m.textContent = t)); } catch (err) { return flash('이미지 업로드 실패: ' + err.message, true); }
      }
      await save(slotId, data);
      state.editing = null; render();
    };
  }
}

async function save(slotId, d, quiet = false) {
  const now = Date.now();
  const clean = Object.fromEntries(Object.entries({ ...d, slotId, locationId: d.locationId || DEFAULT_SLOTS[slotId]?.locationId || '', updatedAt: now, createdAt: state.slots[slotId]?.createdAt || now, updatedBy: state.user?.uid || '' })
    .filter(([k, v]) => v !== undefined && ['slotId', 'locationId', 'slotName', 'advertiserName', 'imageUrl', 'targetUrl', 'description', 'isActive', 'priority', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'updatedBy'].includes(k)));
  try { await set(ref(db, `ads/slots/${slotId}`), clean); if (!quiet) flash(`${slotId} 저장 완료 — 게임에 바로 반영됩니다`); }
  catch (e) { flash(`저장 실패 (${e.code || e.message}). 관리자 권한을 확인하세요.`, true); throw e; }
}

// Firebase Storage first; if Storage is not enabled for the project, store a compressed
// copy in the database (/ads/images/{slotId}, < 450 KB) instead.
async function uploadImage(slotId, file, progress) {
  if (file.size > 8 * 1024 * 1024) throw new Error('8MB 이하 이미지를 올려 주세요');
  try {
    const st = getStorage(app);
    const r = sref(st, `ads/${state.user.uid}/${slotId}-${Date.now()}.${(file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`);
    await withTimeout(uploadBytes(r, file, { contentType: file.type }), 20000);
    progress('Storage 업로드 완료');
    return await getDownloadURL(r);
  } catch (e) {
    progress('Storage 사용 불가 → 데이터베이스에 압축 저장 중…');
    const dataUrl = await compress(file);
    await set(ref(db, `ads/images/${slotId}`), dataUrl);
    flash(`Firebase Storage를 사용할 수 없어(${e.code || e.message}) 이미지를 압축해 데이터베이스에 저장했어요.`);
    return `rtdb:${slotId}`;
  }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function compress(file) {
  const img = await createImageBitmap(file);
  let w = img.width, h = img.height;
  const k = Math.min(1, 1280 / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  for (let q = 0.85; q > 0.3; q -= 0.1) { const u = c.toDataURL('image/jpeg', q); if (u.length < 440000) return u; }
  throw new Error('이미지를 충분히 줄일 수 없어요');
}

// 2D preview of the banner face using the same layout as the 3D banner
function drawPreview(c, loc, S) {
  const g = c.getContext('2d'), T = AD_TYPES[loc.type];
  const W = c.width, H = c.height, k = W / (T.width + 0.6), ox = W / 2, oy = H - 0.2 * k;
  const X = (x) => ox + x * k, Y = (y) => oy - y * k;
  g.fillStyle = '#1b1d3a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#cfcad6'; roundRect(g, X(-T.width / 2), Y(T.height), T.width * k, (T.height - T.baseH) * k, 40); g.fill();
  g.fillStyle = '#4a3c30'; roundRect(g, X(T.title.x - T.title.w / 2), Y(T.title.y + T.title.h / 2), T.title.w * k, T.title.h * k, 20); g.fill();
  g.fillStyle = '#fff1d8'; g.font = `600 ${Math.round(T.title.h * k * 0.45)}px "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(loc.title, X(T.title.x), Y(T.title.y));
  for (const s of T.slots) {
    const slotId = loc.slots[s.key], d = S[slotId], st = slotStatus(d);
    const x = X(s.x - s.w / 2), y = Y(s.y + s.h / 2), w = s.w * k, h = s.h * k;
    const art = (kind, opts) => g.drawImage(adArtCanvas(kind, Math.round(w), Math.round(h), opts), x, y, w, h);
    const src = st === 'ACTIVE' ? imgSrc(slotId, d) : '';
    if (!src) art(st === 'ACTIVE' ? s.key : 'promo', { title: d?.slotName });
    else {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { const a = im.width / im.height, sa = w / h; let sx = 0, sy = 0, sw = im.width, sh = im.height; if (a > sa) { sw = im.height * sa; sx = (im.width - sw) / 2; } else { sh = im.width / sa; sy = (im.height - sh) / 2; } g.drawImage(im, sx, sy, sw, sh, x, y, w, h); label(); };
      im.onerror = () => { art(s.key, { title: d?.slotName }); label(); };
      im.src = src.startsWith('/test-assets/') ? src.slice(1) : src;
    }
    const label = () => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 8, y + 8, 170, 26); g.fillStyle = '#fff'; g.font = '600 14px sans-serif'; g.textAlign = 'left'; g.fillText(`${s.key} · ${st}`, x + 16, y + 21); g.textAlign = 'center'; };
    label();
  }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

render();
renderHeader();
