// In-world ad banner interaction: applies slot data to the 3D banners of the current
// region, shows an "E 광고 보기" prompt near a banner, opens a detail panel, and only opens
// an advertiser link after an explicit confirmation. Logs view/visible/interaction/click.
import * as THREE from 'three';
import { el, $, esc, modal, confirmDialog, toast } from '../ui/dom.js';
import { safeTargetUrl, SLOT_STATUS } from '../../../shared/ads.js';

const STATUS_KO = { ACTIVE: '노출 중', INACTIVE: '비활성', SCHEDULED: '예약됨', EXPIRED: '종료됨' };
const _v = new THREE.Vector3(), _frustum = new THREE.Frustum(), _m = new THREE.Matrix4(), _box = new THREE.Box3();

export class AdController {
  constructor(app, service) {
    this.app = app;
    this.service = service;
    this.seen = new Set(); // per-session view/visible logging
    this.acc = 0;
    this.prompt = el('<button class="ddp-prompt ad-prompt hidden" type="button"><kbd>E</kbd><span data-t></span></button>');
    this.prompt.onclick = () => this.act();
    document.getElementById('app').appendChild(this.prompt);
    service.onChange(() => this.apply());
  }

  banners() { return this.app.engine.region?.adBanners || []; }
  device() { return this.app.mobile ? 'mobile' : 'desktop'; }

  apply() {
    for (const b of this.banners()) {
      b.group.visible = this.service.locations[b.location.locationId]?.isActive !== false; // admin can switch a board off
      b.setSlots(this.service.slots, this.service.images);
    }
    if (this.panel) this.renderPanel();
  }

  update(dt) {
    const list = this.banners();
    if (list !== this._list) { this._list = list; this.apply(); }
    const me = this.app.world.me;
    if (!list.length || !me) return this.hidePrompt();
    // nearest banner the player stands in front of
    this.near = null;
    for (const b of list) {
      if (!b.group.visible) continue;
      _v.copy(me.pos); b.group.worldToLocal(_v);
      if (_v.z > 0.3 && _v.z < 7.5 && Math.abs(_v.x) < b.type.width / 2 + 1.5) { this.near = b; break; }
    }
    if (this.panel) this.showPrompt('광고 닫기');
    else if (this.near && !this.app.duel.inDuel) this.showPrompt('광고 보기 · ' + (this.near.location.title || '광고판'));
    else this.hidePrompt();
    // view / visible analytics (once per session)
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    const cam = this.app.engine.camera;
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const b of list) {
      if (!b.group.visible) continue;
      if (b.group.position.distanceTo(cam.position) > 45) continue;
      _box.setFromObject(b.group);
      if (!_frustum.intersectsBox(_box)) continue;
      const loc = b.location;
      const meta = { locationId: loc.locationId, region: loc.region, device: this.device() };
      for (const s of b.slotList()) {
        if (!this.seen.has('v:' + loc.locationId)) { this.seen.add('v:' + loc.locationId); this.service.log('ad_banner_view', { ...meta, slotId: s.slotId }); }
        if (s.status === SLOT_STATUS.ACTIVE && !this.seen.has('s:' + s.slotId)) { this.seen.add('s:' + s.slotId); this.service.log('ad_slot_visible', { ...meta, slotId: s.slotId }); }
      }
    }
  }

  showPrompt(text) {
    if (this._pt !== text) { $('[data-t]', this.prompt).textContent = text; this._pt = text; }
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('over-modal', !!this.panel);
  }
  hidePrompt() { this.prompt.classList.add('hidden'); }

  // E key / prompt button
  act() {
    if (this.panel) { this.panel.close(); return true; }
    if (!this.near || this.app.duel.inDuel) return false;
    this.open(this.near);
    return true;
  }

  open(b) {
    if (this.panel) return;
    this.openBanner = b;
    const loc = b.location;
    const m = modal(`광고 · ${esc(loc.title || '광고판')}`, '<div data-adbody></div>', { wide: true, onClose: () => { if (this.panel === m) { this.panel = null; this.openBanner = null; } } });
    this.panel = m;
    this.renderPanel();
    for (const s of b.slotList()) if (s.status === SLOT_STATUS.ACTIVE) this.service.log('ad_slot_interaction', { slotId: s.slotId, locationId: loc.locationId, region: loc.region, device: this.device() });
  }

  renderPanel() {
    const m = this.panel, b = this.openBanner;
    if (!m || !b) return;
    const body = $('[data-adbody]', m);
    const cards = b.slotList().map((s) => {
      const d = s.data || {};
      const active = s.status === SLOT_STATUS.ACTIVE;
      const url = active ? safeTargetUrl(d.targetUrl) : null;
      const thumb = b.slots.get(s.key).mat.map?.image;
      return { s, d, active, url, thumb };
    });
    body.innerHTML = `<p class="note ad-disclosure">📢 이 게시판은 <b>광고</b>입니다. 현재는 <b>테스트 광고 구좌</b>이며, 링크는 직접 선택했을 때만 새 창으로 열립니다.</p>
      <div class="ad-cards">${cards.map(({ s, d, active, url }) => `<div class="ad-card ${s.key === 'A' ? 'main' : ''}">
        <div class="ad-thumb" data-thumb="${s.key}"></div>
        <div class="ad-meta"><div class="ad-row"><b>${esc(d.slotName || s.slotId)}</b><span class="tag ${active ? 'pink' : ''}">${STATUS_KO[s.status] || s.status}</span><span class="tag">AD</span></div>
        <div class="note">${active ? esc(d.advertiserName || '') : '기본 크리스마스 배너 표시 중'}</div>
        ${active && d.description ? `<div class="note">${esc(d.description)}</div>` : ''}
        ${url ? `<button class="btn primary sm" data-visit="${s.key}">사이트 방문 ↗</button><div class="note ad-host">${esc(new URL(url).host)}</div>` : ''}</div></div>`).join('')}</div>
      <p class="note ad-closehint"><kbd>E</kbd> 키 또는 아래 버튼으로 닫기</p>`;
    for (const c of cards) {
      const holder = $(`[data-thumb="${c.s.key}"]`, body);
      if (c.thumb && holder) holder.appendChild(c.thumb instanceof HTMLCanvasElement ? cloneCanvas(c.thumb) : c.thumb.cloneNode());
    }
    body.querySelectorAll('[data-visit]').forEach((btn) => (btn.onclick = () => this.visit(b, btn.dataset.visit)));
  }

  async visit(b, key) {
    const s = b.slots.get(key);
    const url = safeTargetUrl(s?.data?.targetUrl);
    if (!url || s.status !== SLOT_STATUS.ACTIVE) return;
    const meta = { slotId: s.slotId, locationId: b.location.locationId, region: b.location.region, device: this.device() };
    this.service.log('ad_slot_click', meta);
    const ok = await confirmDialog('외부 사이트로 이동', `광고주 사이트로 이동합니다.<br/><b>${esc(new URL(url).host)}</b><br/><span class="note">${esc(url)}</span><br/>새 창(탭)에서 열립니다. 이동할까요?`, '이동하기');
    if (!ok) return;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    this.service.log('ad_external_link_open', meta);
    if (!w) toast('팝업이 차단되었어요. 브라우저에서 팝업을 허용해 주세요.', { type: 'err' });
  }
}

function cloneCanvas(c) {
  const n = document.createElement('canvas'); n.width = c.width; n.height = c.height;
  n.getContext('2d').drawImage(c, 0, 0);
  return n;
}
