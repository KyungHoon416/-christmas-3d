// 1:1 snowball-gun duel: gun model, over-the-shoulder aiming, ammo/reload, projectile
// simulation for every shot in the room, victim-side hit detection, HUD and results.
import * as THREE from 'three';
import { DUEL } from '../../../shared/constants.js';
import { el, $, esc, toast } from '../ui/dom.js';
import { radialTexture } from '../engine/textures.js';

const gunMats = {
  body: new THREE.MeshStandardMaterial({ color: 0xe9f1ff, roughness: 0.35, metalness: 0.2 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xff5f9e, roughness: 0.4, metalness: 0.1 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b3350, roughness: 0.5, metalness: 0.5 }),
  tank: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x1b4f7a, emissiveIntensity: 0.6 }),
  snow: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
};

// Snow blaster: barrel along +Z, grip down. Returned group is rotated so the barrel
// follows the forearm (-Y in the forearm's local space).
export function makeSnowGun() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.09, 0.11, 0.32), gunMats.body, 0, 0.03, 0.06);
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.26, 12), gunMats.dark, 0, 0.045, 0.32, Math.PI / 2);
  add(new THREE.TorusGeometry(0.038, 0.012, 6, 14), gunMats.accent, 0, 0.045, 0.45);
  add(new THREE.SphereGeometry(0.065, 14, 10), gunMats.tank, 0, 0.13, 0.02);
  add(new THREE.SphereGeometry(0.045, 10, 8), gunMats.snow, 0, 0.13, 0.02);
  add(new THREE.BoxGeometry(0.06, 0.12, 0.06), gunMats.dark, 0, -0.06, -0.02, 0.25);
  add(new THREE.BoxGeometry(0.095, 0.02, 0.2), gunMats.accent, 0, -0.025, 0.08);
  const holder = new THREE.Group();
  g.rotation.x = Math.PI / 2; // +Z barrel -> -Y (along the forearm)
  g.position.set(0, -0.3, 0.03);
  holder.add(g);
  holder.userData.muzzle = new THREE.Object3D();
  holder.userData.muzzle.position.set(0, 0.045, 0.47);
  g.add(holder.userData.muzzle);
  return holder;
}

const loadStats = () => { try { return JSON.parse(localStorage.getItem('cw.duelStats')) || { w: 0, l: 0, d: 0 }; } catch { return { w: 0, l: 0, d: 0 }; } };

export class DuelController {
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.scene = app.engine.scene;
    this.active = null; // my duel
    this.spectating = new Map(); // duel id -> {a,b}
    this.shots = [];
    this.ammo = DUEL.mag;
    this.reloadUntil = 0;
    this.lastFire = 0;
    this.stats = loadStats();
    this.shotGeo = new THREE.SphereGeometry(0.09, 10, 8);
    this.shotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfdcff, emissiveIntensity: 0.7, roughness: 0.6 });
    this.glowMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(220,235,255,0.9)', 'rgba(220,235,255,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  }

  get inDuel() { return !!this.active; }
  get live() { return this.active && performance.now() >= this.active.startAt; }

  // ------------------------------------------------------------ lifecycle
  onDuel(m) {
    const me = this.app.self.id;
    for (const id of [m.a, m.b]) this.setArmed(id, true);
    if (m.a !== me && m.b !== me) { this.spectating.set(m.id, m); return; }
    const opp = m.a === me ? m.b : m.a;
    this.active = { id: m.id, opp, oppNick: this.app.nickOf(opp), hp: { ...m.hp }, startAt: performance.now() + m.countdown * 1000, ends: performance.now() + (m.countdown + m.seconds) * 1000, reported: new Set() };
    this.ammo = DUEL.mag;
    this.reloadUntil = 0;
    this.world.aim = true;
    document.body.classList.add('dueling');
    this.app.closePlayerMenu?.();
    this.buildHud();
    this.countdown(m.countdown);
  }

  setArmed(id, on) {
    const char = id === this.app.self.id ? this.world.me?.char : this.world.remotes.get(id)?.char;
    if (!char) return;
    char.aiming = on;
    if (on && !char.gun) { char.gun = makeSnowGun(); char.armR.el.add(char.gun); }
    if (!on && char.gun) { char.gun.removeFromParent(); char.gun = null; }
  }

  onScore(m) {
    const d = this.active && this.active.id === m.id ? this.active : null;
    this.world.splashAt?.(m.victim);
    if (!d) return;
    d.hp = { ...m.hp };
    if (m.victim === this.app.self.id) this.flash('hit');
    else this.hitMarker();
    this.renderHud();
  }

  onEnd(m) {
    for (const id of [m.a, m.b]) this.setArmed(id, false);
    this.spectating.delete(m.id);
    if (!this.active || this.active.id !== m.id) {
      if (m.winnerNick) this.app.chat?.addSystem(`❄️ 눈싸움 대결 종료 — ${m.winnerNick} 승리`);
      return;
    }
    const me = this.app.self.id;
    const result = m.winner === null ? 'draw' : m.winner === me ? 'win' : 'lose';
    this.stats[result === 'win' ? 'w' : result === 'lose' ? 'l' : 'd']++;
    try { localStorage.setItem('cw.duelStats', JSON.stringify(this.stats)); } catch {}
    const why = { ko: '', time: ' (시간 종료)', forfeit: m.winner === me ? ' (상대 항복)' : ' (항복)', left: ' (상대가 떠남)' }[m.reason] || '';
    this.banner(result === 'win' ? '승리!' : result === 'lose' ? '패배' : '무승부', `${this.app.self.nick} ${m.hp[me] ?? 0} : ${m.hp[this.active.opp] ?? 0} ${this.active.oppNick}${why}`, result);
    this.active = null;
    this.world.aim = false;
    document.body.classList.remove('dueling');
    this.hud?.remove(); this.hud = null;
    this.crosshair?.remove(); this.crosshair = null;
    this.app.updateActionState?.();
  }

  forfeit() { if (this.active) this.app.net.send({ t: 'forfeit' }); }

  // ------------------------------------------------------------ firing
  reload() {
    if (!this.active || this.reloadUntil || this.ammo === DUEL.mag) return;
    this.reloadUntil = performance.now() + DUEL.reload * 1000;
    this.renderHud();
  }

  fire() {
    if (!this.active) return false;
    const now = performance.now();
    if (now < this.active.startAt) return true;
    if (this.reloadUntil) return true;
    if (now - this.lastFire < DUEL.fireInterval * 1000) return true;
    if (this.ammo <= 0) { this.reload(); return true; }
    this.lastFire = now;
    this.ammo--;
    const me = this.world.me;
    const gun = me.char.gun;
    const muzzle = new THREE.Vector3();
    if (gun) gun.userData.muzzle.getWorldPosition(muzzle); else muzzle.set(me.pos.x, me.pos.y + 1.35, me.pos.z);
    const aim = this.aimPoint();
    let dir = aim.sub(muzzle).normalize();
    const camDir = new THREE.Vector3();
    this.app.engine.camera.getWorldDirection(camDir);
    if (dir.dot(camDir) < 0.3) dir = camDir; // never fire backwards
    const sid = Math.random().toString(36).slice(2, 10);
    this.app.net.send({ t: 'shot', sid, o: [+muzzle.x.toFixed(3), +muzzle.y.toFixed(3), +muzzle.z.toFixed(3)], d: [+dir.x.toFixed(4), +dir.y.toFixed(4), +dir.z.toFixed(4)] });
    me.char.recoil = 0.12;
    if (this.ammo <= 0) this.reload();
    this.renderHud();
    return true;
  }

  // first thing under the crosshair: a player or a wall (march along the camera ray)
  aimPoint() {
    const cam = this.app.engine.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const p = new THREE.Vector3();
    const c = new THREE.Vector3();
    // start past my own character so nothing between the camera and me is targeted
    const start = cam.position.distanceTo(this.world.me.pos) + 0.6;
    for (let s = start; s < 60; s += 0.25) {
      p.copy(cam.position).addScaledVector(dir, s);
      for (const r of this.world.remotes.values()) {
        c.set(r.pos.x, r.pos.y + 1.05, r.pos.z);
        if (Math.abs(p.x - c.x) < 0.45 && Math.abs(p.z - c.z) < 0.45 && p.y > r.pos.y + 0.1 && p.y < r.pos.y + 1.85) return p.clone();
      }
      if (p.y < this.world.coll.groundAt(p.x, p.z, p.y) || this.world.coll.blocked(p.x, p.z, p.y - 1, 0.05)) return p.clone();
    }
    return cam.position.clone().addScaledVector(dir, 60);
  }

  // ------------------------------------------------------------ projectiles
  onShot(m) {
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    mesh.position.set(...m.o);
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.set(0.6, 0.6, 1);
    mesh.add(glow);
    this.scene.add(mesh);
    const mine = m.by === this.app.self.id;
    const shooter = mine ? this.world.me : this.world.remotes.get(m.by);
    if (shooter?.char && !mine) shooter.char.recoil = 0.12;
    this.shots.push({ ...m, mesh, t: 0, origin: new THREE.Vector3(...m.o), dir: new THREE.Vector3(...m.d), mine });
  }

  update(dt) {
    const now = performance.now();
    if (this.active) {
      if (this.reloadUntil && now >= this.reloadUntil) { this.reloadUntil = 0; this.ammo = DUEL.mag; this.renderHud(); }
      this.hudAcc = (this.hudAcc || 0) + dt;
      if (this.hudAcc > 0.25) { this.hudAcc = 0; this.renderHud(); }
    }
    const me = this.world.me;
    const p = new THREE.Vector3();
    for (const s of [...this.shots]) {
      // sub-step the flight (~17 cm per step) so fast shots can't tunnel through a body
      const t1 = s.t + dt;
      let done = false;
      for (let t = s.t + 0.005; !done && t <= t1 + 1e-9; t += 0.005) {
        p.copy(s.origin).addScaledVector(s.dir, DUEL.shotSpeed * t);
        p.y -= 0.5 * DUEL.shotGravity * t * t;
        done = this.stepShot(s, p, me);
      }
      s.t = t1;
      if (s.t > DUEL.shotLife) done = true;
      s.mesh.position.copy(p);
      if (done) {
        this.world.splash(p.clone());
        s.mesh.removeFromParent();
        this.shots.splice(this.shots.indexOf(s), 1);
      }
    }
  }

  // one sub-step: true when the shot stops here
  stepShot(s, p, me) {
    {
      let done = p.y < this.world.coll.groundAt(p.x, p.z, p.y + 0.5) || this.world.coll.blocked(p.x, p.z, p.y - 0.4, 0.06);
      // am I the target of this shot?
      if (!done && this.active && s.duel === this.active.id && s.by === this.active.opp && me) {
        const dy = p.y - (me.pos.y + 1.0);
        if (Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < DUEL.hitRadius && Math.abs(dy) < 0.95 && !this.active.reported.has(s.sid)) {
          this.active.reported.add(s.sid);
          this.app.net.send({ t: 'dhit', duel: this.active.id, sid: s.sid });
          done = true;
        }
      }
      // visual stop on any other body
      if (!done) {
        for (const r of this.world.remotes.values()) {
          if (r.id === s.by) continue;
          if (Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < DUEL.hitRadius && p.y > r.pos.y && p.y < r.pos.y + 1.9) { done = true; break; }
        }
      }
      return done;
    }
  }

  // ------------------------------------------------------------ HUD
  buildHud() {
    this.hud?.remove();
    this.hud = el(`<div class="duel-hud glass">
      <div class="side me"><b data-mn></b><div class="bar"><i data-mhp></i></div></div>
      <div class="mid"><div class="vs">VS</div><div class="timer" data-time></div></div>
      <div class="side opp"><b data-on></b><div class="bar"><i data-ohp></i></div></div>
      <div class="ammo" data-ammo></div>
      <button class="btn small danger" data-forfeit>항복</button></div>`);
    $('[data-forfeit]', this.hud).onclick = () => this.forfeit();
    this.app.root.appendChild(this.hud);
    this.crosshair = el('<div class="crosshair"><i></i><i></i><i></i><i></i></div>');
    this.app.root.appendChild(this.crosshair);
    this.renderHud();
  }

  renderHud() {
    const d = this.active;
    if (!d || !this.hud) return;
    const me = this.app.self.id;
    $('[data-mn]', this.hud).textContent = this.app.self.nick;
    $('[data-on]', this.hud).textContent = d.oppNick;
    $('[data-mhp]', this.hud).style.width = (d.hp[me] ?? 0) + '%';
    $('[data-ohp]', this.hud).style.width = (d.hp[d.opp] ?? 0) + '%';
    const left = Math.max(0, Math.ceil((d.ends - performance.now()) / 1000));
    $('[data-time]', this.hud).textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    $('[data-ammo]', this.hud).innerHTML = this.reloadUntil ? '<span class="reloading">장전 중…</span>' : Array.from({ length: DUEL.mag }, (_, i) => `<span class="pip ${i < this.ammo ? 'on' : ''}"></span>`).join('') + '<span class="key">R 재장전</span>';
  }

  countdown(n) {
    const c = el('<div class="duel-count"></div>');
    this.app.root.appendChild(c);
    const step = (k) => {
      c.textContent = k > 0 ? k : '발사!';
      c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
      if (k > 0) setTimeout(() => step(k - 1), 1000); else setTimeout(() => c.remove(), 700);
    };
    step(n);
    if (!this.app.mobile) toast(`❄️ ${esc(this.active.oppNick)}님과 1:1 눈싸움 대결! 화면 중앙 조준점으로 조준하고 스페이스바(꾹 누르면 연사)나 클릭으로 발사하세요.`, { ms: 5000 });
  }

  flash(kind) {
    const f = el(`<div class="duel-flash ${kind}"></div>`);
    this.app.root.appendChild(f);
    setTimeout(() => f.remove(), 450);
  }

  hitMarker() {
    if (!this.crosshair) return;
    this.crosshair.classList.remove('hit'); void this.crosshair.offsetWidth; this.crosshair.classList.add('hit');
  }

  banner(title, sub, kind) {
    const b = el(`<div class="duel-banner ${kind}"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div><div class="r">전적 ${this.stats.w}승 ${this.stats.l}패 ${this.stats.d}무</div></div>`);
    this.app.root.appendChild(b);
    setTimeout(() => b.remove(), 4200);
  }
}
