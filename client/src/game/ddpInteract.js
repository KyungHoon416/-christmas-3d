// DDP interior interactions: artworks (exhibition), products (design store), art-hall
// seats, zone tracking (breadcrumb / ambience) and zone warps. Works with every net
// layer: seats are validated by the game server (server/game.js `seat`), and in the
// peer-to-peer modes a seat is also treated as taken when a remote player sits on it.
import * as THREE from 'three';
import { el, $, esc, toast, modal } from '../ui/dom.js';
import { ZONES, L } from '../../../shared/ddp.js';
import { productMesh, artworkTexture } from '../engine/ddpBuilder.js';

const ZONE_NAME = Object.fromEntries(ZONES.map((z) => [z.id, z.name]));
const REASON = { far: '좌석에 조금 더 가까이 가 주세요', taken: '이미 다른 사람이 앉아 있는 좌석이에요', duel: '대결 중에는 앉을 수 없어요', unknown: '좌석 정보를 찾을 수 없어요' };

export class DDPInteraction {
  constructor(app) {
    this.app = app;
    this.zone = null;
    this.taken = {}; // seatId -> userId (server)
    this.target = null;
    this.prompt = el('<button class="ddp-prompt hidden" type="button"><kbd>E</kbd><span data-t></span></button>');
    this.prompt.onclick = () => this.act();
    document.getElementById('app').appendChild(this.prompt);
    const n = app.net;
    n.on('seat', (m) => this.onSeat(m));
    n.on('seats', (m) => { this.taken = m.taken || {}; });
    n.on('joined', (m) => { this.taken = m.seats || {}; this.zone = null; this.app.world.seated = null; });
    n.on('correct', (m) => { if (m.reason === 'warp') { this.app.world.seated = null; toast(`🚪 ${ZONE_NAME[m.zone] || ''}(으)로 이동했어요`); } });
    app.world.hooks.onStand = () => n.send({ t: 'seat', sit: false });
  }

  get region() { return this.app.world.region; }
  active() { return !!this.region?.zones; }

  zoneName() { return this.zone ? ZONE_NAME[this.zone] : null; }

  // breadcrumb: 대한민국 > 서울 > DDP > 메인 로비
  breadcrumb() {
    const r = this.region;
    const parts = ['대한민국', '서울', r ? r.name : '-'];
    if (this.active() && this.zone) parts.push(this.zoneName() + (this.app.world.me?.pos.y > 3 ? ' (2F)' : ''));
    return parts;
  }

  update(dt) {
    const w = this.app.world, me = w.me;
    if (!this.active() || !me) {
      if (this.zone !== null) { this.zone = null; this.setIndoor(false); this.app.updateProfile(); }
      this.hidePrompt();
      return;
    }
    const z = this.region.zoneOf(me.pos.x, me.pos.y, me.pos.z);
    const floor = me.pos.y > 3 ? 2 : 1;
    if (z !== this.zone || floor !== this.floor) {
      const prev = this.zone;
      this.zone = z; this.floor = floor;
      this.setIndoor(z !== 'plaza');
      this.app.updateProfile();
      if (prev && prev !== z) toast(`📍 DDP · ${this.zoneName()}`, { ms: 1800 });
    }
    this.findTarget();
  }

  setIndoor(on) {
    this.app.engine.indoor = on;
    this.app.carol?.setIndoor?.(on);
  }

  // ------------------------------------------------------------ targets
  findTarget() {
    const w = this.app.world, me = w.me, D = this.region.ddp;
    let best = null;
    if (w.seated) { this.showPrompt('일어나기 (이동 키로도 일어나요)', { kind: 'stand' }); return; }
    if (this.app.duel.inDuel) return this.hidePrompt();
    const p = me.pos;
    const near = (x, z, y, r, dy = 1.2) => Math.hypot(x - p.x, z - p.z) < r && Math.abs(y - p.y) < dy;
    if (this.zone === 'exhibition') {
      for (const a of D.artworks) {
        const [x, z] = L(a.lx, a.lz);
        if (near(x, z + 1.2, 0, 2.6, 2)) { best = { kind: 'art', item: a, d: Math.hypot(x - p.x, z - p.z) }; break; }
      }
    } else if (this.zone === 'store') {
      for (const it of D.products) {
        const [x, z] = L(it.lx, it.lz);
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 2.4 && (!best || d < best.d)) best = { kind: 'product', item: it, d };
      }
    } else if (this.zone === 'hall') {
      // nearest free seat in the row next to me (rows are entered from the aisles)
      for (const s of this.region.seats) {
        if (Math.abs(s.y - p.y) > 0.7 || Math.abs(s.x - p.x) > 0.9) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d > 4 || this.isTaken(s)) continue;
        if (!best || d < best.d) best = { kind: 'seat', item: s, d };
      }
    }
    if (!best) return this.hidePrompt();
    const label = best.kind === 'art' ? `작품 보기 · ${best.item.title}` : best.kind === 'product' ? `상품 보기 · ${best.item.name}` : '좌석에 앉기';
    this.showPrompt(label, best);
  }

  isTaken(seat) {
    const me = this.app.self?.id;
    const occ = this.taken[seat.id];
    if (occ && occ !== me) return true;
    for (const r of this.app.world.remotes.values()) if (r.anim === 'sit' && Math.hypot(r.pos.x - seat.x, r.pos.z - seat.z) < 0.3) return true;
    return false;
  }

  showPrompt(text, target) {
    this.target = target;
    if (this._ptext !== text) { $('[data-t]', this.prompt).textContent = text; this._ptext = text; }
    this.prompt.classList.remove('hidden');
  }
  hidePrompt() { this.target = null; if (!this.prompt.classList.contains('hidden')) this.prompt.classList.add('hidden'); }

  // ------------------------------------------------------------ actions
  act() {
    const t = this.target;
    if (!t) return false;
    if (t.kind === 'stand') { this.app.world.seated = null; this.app.net.send({ t: 'seat', sit: false }); return true; }
    if (t.kind === 'seat') { this.app.net.send({ t: 'seat', id: t.item.id, sit: true }); return true; }
    if (t.kind === 'art') { this.openArtwork(t.item); return true; }
    if (t.kind === 'product') { this.openProduct(t.item); return true; }
    return false;
  }

  onSeat(m) {
    const w = this.app.world;
    if (!m.ok) { toast(REASON[m.reason] || '앉을 수 없어요', { type: 'err' }); return; }
    if (m.id) {
      w.seated = { x: m.pos.x, y: m.pos.y, z: m.pos.z, ry: m.ry, id: m.id };
      w.me.pos.set(m.pos.x, m.pos.y, m.pos.z);
      w.cam.yaw = m.ry + Math.PI; // look at the stage
      toast('🎭 좌석에 앉았어요 · 이동 키나 [일어나기]로 일어나요', { ms: 2600 });
    } else w.seated = null;
  }

  warp(zone) {
    if (!this.region?.warps?.[zone]) return;
    this.app.net.send({ t: 'warp', zone });
  }

  openArtwork(a) {
    const i = this.region.ddp.artworks.indexOf(a);
    const img = artworkTexture(i, a.title).image.toDataURL('image/jpeg', 0.85);
    modal(esc(a.title), `<div class="ddp-art"><img src="${img}" alt="${esc(a.title)}"/>
      <div><span class="tag pink">테스트용 콘텐츠</span>
      <p class="note" style="margin-top:10px">${esc(a.desc)}</p>
      <p class="note">이 작품과 설명은 기능 확인을 위한 <b>임시 콘텐츠</b>입니다. 실제 DDP 전시 작품이 아니며, 실제 전시 정보는 운영 데이터로 교체될 예정입니다.</p>
      <p class="note">위치: DDP · 전시 공간 (1F)</p></div></div>`, { wide: true });
  }

  openProduct(p) {
    const m = modal(esc(p.name), `<div class="ddp-art"><canvas class="ddp-prod" data-pv></canvas>
      <div><span class="tag">전시 소품 · 판매 기능 없음</span>
      <p class="note" style="margin-top:10px">${esc(p.desc)}</p>
      <p class="note">가격·결제·구매 기능은 제공하지 않습니다. 드래그해서 돌려 볼 수 있어요.</p>
      <p class="note">위치: DDP · 디자인 스토어 (1F)</p></div></div>`, { wide: true, onClose: () => stop() });
    const c = $('[data-pv]', m);
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xfff3e0, 0x302838, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 2); sc.add(dl);
    const obj = productMesh(p.shape);
    obj.scale.setScalar(3.2);
    sc.add(obj);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    cam.position.set(0, 1.4, 3.4); cam.lookAt(0, 0.8, 0);
    let rot = 0, drag = null, raf = 0, alive = true;
    c.addEventListener('pointerdown', (e) => { drag = e.clientX; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (drag !== null) { rot += (e.clientX - drag) * 0.01; drag = e.clientX; } });
    c.addEventListener('pointerup', () => { drag = null; });
    const loop = () => {
      if (!alive || !c.isConnected) return stop();
      raf = requestAnimationFrame(loop);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      if (drag === null) rot += 0.012;
      obj.rotation.y = rot;
      r.render(sc, cam);
    };
    const stop = () => {
      if (!alive) return;
      alive = false; cancelAnimationFrame(raf);
      obj.traverse((o) => { o.geometry?.dispose(); if (o.material && !o.material.userData?.shared) o.material.dispose(); });
      r.dispose(); r.forceContextLoss?.();
    };
    loop();
  }
}
