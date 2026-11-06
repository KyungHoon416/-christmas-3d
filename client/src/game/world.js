// Client-side game world: local player prediction, third-person camera,
// remote player interpolation, consent-based interactions and snowballs.
import * as THREE from 'three';
import { CollisionWorld } from '../../../shared/collision.js';
import { WALK_SPEED, RUN_SPEED, JUMP_VELOCITY, GRAVITY, NET_SEND_HZ, HOLD_SIDE_OFFSET, PLAYER_RADIUS } from '../../../shared/constants.js';
import { Character } from '../engine/character.js';

const INTERP_DELAY = 130; // ms
const tmpV = new THREE.Vector3();
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const hashSeed = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export class World {
  constructor(engine, input, net, hooks = {}) {
    this.engine = engine;
    this.input = input;
    this.net = net;
    this.hooks = hooks;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.remotes = new Map();
    this.me = null;
    this.region = null;
    this.cam = { yaw: Math.PI, pitch: 0.28, dist: 6.5, curDist: 6.5, target: new THREE.Vector3() };
    this.hold = null; // { a, b, mode }
    this.sendAcc = 0;
    this.lastSent = null;
    this.footAcc = 0;
    this.footSide = 1;
    this.balls = [];
    this.raycaster = new THREE.Raycaster();
    this.emoteUntil = 0;
    this.photoMode = false;
    input.onTap = (x, y) => this.pick(x, y);
  }

  // ---------------------------------------------------------------- region
  enterRegion(region, { pos, ry, players, holds }) {
    for (const r of this.remotes.values()) this.removeRemote(r.id);
    this.balls.forEach((b) => b.mesh.removeFromParent());
    this.balls = [];
    this.region = region;
    this.engine.loadRegion(region);
    this.coll = new CollisionWorld(region.colliders, region.surfaces, region.bounds);
    const big = region.colliders.filter((c) => (c.t === 'box' && Math.min(c.hw, c.hd) > 0.8) || (c.t === 'circle' && c.r > 1.5) || c.t === 'ellipse');
    this.camColl = new CollisionWorld(big, [], null);
    if (!this.me) {
      this.me = { char: new Character(this.self.appearance, { seed: hashSeed(this.self.id) }), pos: new THREE.Vector3(), vel: new THREE.Vector3(), vy: 0, ry: 0, grounded: true, anim: 'idle' };
    }
    this.scene.add(this.me.char.root);
    this.me.pos.set(pos.x, pos.y || 0, pos.z);
    this.me.vel.set(0, 0, 0);
    this.me.ry = ry ?? 0;
    this.cam.yaw = this.me.ry + Math.PI;
    this.cam.target.copy(this.me.pos);
    this.hold = null;
    this.me.char.holdSide = 0;
    for (const p of players) this.addRemote(p);
    for (const h of holds || []) this.applyHold(h);
    this.lastSent = null;
  }

  setSelf(self) {
    const changed = this.self && JSON.stringify(this.self.appearance) !== JSON.stringify(self.appearance);
    this.self = self;
    if (this.me && changed) this.me.char.setAppearance(self.appearance);
  }

  // ---------------------------------------------------------------- remotes
  addRemote(p) {
    if (this.remotes.has(p.id)) this.removeRemote(p.id);
    const char = new Character(p.appearance, { seed: hashSeed(p.id) });
    char.root.position.set(p.x, p.y, p.z);
    char.root.rotation.y = p.ry;
    char.root.userData.playerId = p.id;
    this.scene.add(char.root);
    const r = { id: p.id, nick: p.nick, char, couple: p.couple, voice: p.voice || {}, buf: [{ t: performance.now(), x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim }], pos: new THREE.Vector3(p.x, p.y, p.z), ry: p.ry, anim: p.anim, footAcc: 0, last: new THREE.Vector3(p.x, p.y, p.z), emoteUntil: 0 };
    this.remotes.set(p.id, r);
    this.hooks.onRemoteAdded?.(r);
    return r;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.char.dispose();
    this.remotes.delete(id);
    this.hooks.onRemoteRemoved?.(r);
  }

  onSnapshot(rows) {
    const t = performance.now();
    for (const [id, x, y, z, ry, anim] of rows) {
      const r = this.remotes.get(id);
      if (!r) continue;
      r.buf.push({ t, x, y, z, ry, anim });
      if (r.buf.length > 30) r.buf.shift();
    }
  }

  // ---------------------------------------------------------------- interactions
  applyHold(h) {
    this.hold = null;
    const mine = this.self && (h.a === this.self.id || h.b === this.self.id);
    for (const id of [h.a, h.b]) {
      const r = this.remotes.get(id);
      if (r) { r.char.holdSide = id === h.a ? 1 : -1; if (h.mode === 'walk') r.char.holdSide = 0; r.hold = h; }
    }
    if (mine) {
      this.hold = h;
      this.me.char.holdSide = h.mode === 'walk' ? 0 : h.a === this.self.id ? 1 : -1;
    }
  }

  clearHold(h) {
    for (const id of [h.a, h.b]) { const r = this.remotes.get(id); if (r) { r.char.holdSide = 0; r.hold = null; } }
    if (this.hold && (this.hold.a === h.a || this.hold.b === h.b)) { this.hold = null; this.me.char.holdSide = 0; }
  }

  isFollower() { return this.hold && this.hold.b === this.self.id; }

  playEmote(id, e) {
    const dur = e === 'sit' ? 1e9 : e === 'dance' ? 6000 : 3000;
    if (id === this.self.id) { this.me.anim = e; this.emoteUntil = performance.now() + dur; return; }
    const r = this.remotes.get(id);
    if (r) { r.emote = e; r.emoteUntil = performance.now() + dur; }
  }

  hug(a, b) {
    const pa = a === this.self.id ? this.me.pos : this.remotes.get(a)?.pos;
    const pb = b === this.self.id ? this.me.pos : this.remotes.get(b)?.pos;
    if (!pa || !pb) return;
    for (const [id, from, to] of [[a, pa, pb], [b, pb, pa]]) {
      const face = Math.atan2(to.x - from.x, to.z - from.z);
      if (id === this.self.id) { this.me.ry = face; }
      this.playEmote(id, 'hug');
    }
  }

  pick(x, y) {
    if (this.photoMode) return;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.remotes.values()].map((r) => r.char.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    if (!hit) return this.hooks.onSelectPlayer?.(null);
    let o = hit.object;
    while (o && !o.userData.playerId) o = o.parent;
    if (o) this.hooks.onSelectPlayer?.(o.userData.playerId, x, y);
  }

  distanceTo(id) {
    const r = this.remotes.get(id);
    return r ? r.pos.distanceTo(this.me.pos) : Infinity;
  }

  // ---------------------------------------------------------------- snowballs
  throwSnowball() {
    if (!this.me) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = Math.max(dir.y, -0.1) + 0.22;
    dir.normalize().multiplyScalar(17);
    this.me.ry = Math.atan2(dir.x, dir.z);
    this.playEmote(this.self.id, 'throw');
    this.emoteUntil = performance.now() + 500;
    this.net.send({ t: 'throw', v: [dir.x, dir.y, dir.z] });
  }

  spawnBall(msg) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    const mine = msg.by === this.self.id;
    const o = mine ? this.me.pos.clone().add(new THREE.Vector3(0, 1.5, 0)) : new THREE.Vector3(...msg.o);
    mesh.position.copy(o);
    this.scene.add(mesh);
    this.balls.push({ id: msg.id, mine, by: msg.by, mesh, vel: new THREE.Vector3(...msg.v), life: 3 });
  }

  updateBalls(dt) {
    for (const b of [...this.balls]) {
      b.vel.y -= GRAVITY * 0.7 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const p = b.mesh.position;
      let done = b.life <= 0 || p.y < this.coll.groundAt(p.x, p.z, p.y + 1) || this.coll.blocked(p.x, p.z, p.y - 0.5, 0.1);
      if (!done) {
        for (const r of this.remotes.values()) {
          if (r.id === b.by) continue;
          tmpV.copy(r.pos); tmpV.y += 1.0;
          if (tmpV.distanceTo(p) < 0.6) {
            done = true;
            if (b.mine) this.net.send({ t: 'hit', id: b.id, target: r.id });
            break;
          }
        }
      }
      if (done) { this.splash(p); b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.mesh.removeFromParent(); this.balls.splice(this.balls.indexOf(b), 1); }
    }
  }

  splash(p) {
    const g = new THREE.BufferGeometry();
    const n = 24, arr = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { arr.set([p.x, p.y, p.z], i * 3); vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)); }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09 }));
    this.scene.add(pts);
    let life = 0.6;
    const upd = (dt) => {
      life -= dt;
      for (let i = 0; i < n; i++) { vel[i].y -= 9 * dt; arr[i * 3] += vel[i].x * dt; arr[i * 3 + 1] += vel[i].y * dt; arr[i * 3 + 2] += vel[i].z * dt; }
      g.attributes.position.needsUpdate = true;
      if (life <= 0) { pts.removeFromParent(); g.dispose(); pts.material.dispose(); this.engine.updaters.splice(this.engine.updaters.indexOf(upd), 1); }
    };
    this.engine.updaters.push(upd);
  }

  hitEffect(targetId) {
    const p = targetId === this.self.id ? this.me.pos : this.remotes.get(targetId)?.pos;
    if (p) this.splash(p.clone().add(new THREE.Vector3(0, 1.2, 0)));
  }

  correct(pos) {
    this.me.pos.set(pos.x, pos.y || 0, pos.z);
    this.me.vel.set(0, 0, 0);
  }

  onIce(x, z) {
    return (this.region.ice || []).some((r) => Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!this.me || !this.region) return;
    const inp = this.input.sample();
    const me = this.me;
    const now = performance.now();
    // camera orbit
    this.cam.yaw -= inp.lookX * 0.0055;
    this.cam.pitch = Math.max(-0.35, Math.min(1.15, this.cam.pitch + inp.lookY * 0.004));
    this.cam.dist = Math.max(2.2, Math.min(16, this.cam.dist + inp.zoom * 0.9));

    const wantMove = Math.hypot(inp.x, inp.z) > 0.05;
    if (this.isFollower()) {
      if (wantMove) this.hooks.onFollowerTriedMove?.();
      const leader = this.remotes.get(this.hold.a);
      if (leader) {
        const off = this.hold.mode === 'walk' ? HOLD_SIDE_OFFSET * 1.3 : HOLD_SIDE_OFFSET;
        const tx = leader.pos.x + Math.cos(leader.ry) * off, tz = leader.pos.z - Math.sin(leader.ry) * off;
        const p = { x: tx, y: leader.pos.y, z: tz };
        this.coll.resolve(p, PLAYER_RADIUS * 0.6);
        me.pos.lerp(tmpV.set(p.x, leader.pos.y, p.z), 1 - Math.exp(-14 * dt));
        me.ry = lerpAngle(me.ry, leader.ry, 1 - Math.exp(-10 * dt));
        const sp = leader.speed || 0;
        me.anim = sp > 0.2 ? (sp > 4.2 ? 'run' : 'walk') : 'idle';
        me.speed = sp;
      }
    } else {
      // camera-relative movement
      const sin = Math.sin(this.cam.yaw), cos = Math.cos(this.cam.yaw);
      // forward = direction the camera looks (from camera toward player)
      const fx = -sin, fz = -cos, rx = -cos, rz = sin;
      const dx = fx * inp.z - rx * inp.x, dz = fz * inp.z - rz * inp.x;
      const ice = this.onIce(me.pos.x, me.pos.z);
      const speed = (inp.run ? RUN_SPEED : WALK_SPEED) * (ice ? 1.05 : 1);
      const k = ice ? 1.6 : 12;
      me.vel.x += (dx * speed - me.vel.x) * (1 - Math.exp(-k * dt));
      me.vel.z += (dz * speed - me.vel.z) * (1 - Math.exp(-k * dt));
      const nx = me.pos.x + me.vel.x * dt, nz = me.pos.z + me.vel.z * dt;
      const p = { x: me.pos.x, y: me.pos.y, z: me.pos.z };
      if (this.coll.canStep(nx, nz, me.pos.y)) { p.x = nx; p.z = nz; }
      else if (this.coll.canStep(nx, me.pos.z, me.pos.y)) p.x = nx;
      else if (this.coll.canStep(me.pos.x, nz, me.pos.y)) p.z = nz;
      this.coll.resolve(p);
      me.pos.x = p.x; me.pos.z = p.z;
      // vertical
      const ground = this.coll.groundAt(me.pos.x, me.pos.z, me.pos.y);
      if (me.grounded && inp.jump) { me.vy = JUMP_VELOCITY; me.grounded = false; }
      me.vy -= GRAVITY * dt;
      me.pos.y += me.vy * dt;
      if (me.pos.y <= ground) { me.pos.y = ground; me.vy = 0; me.grounded = true; }
      else if (me.pos.y - ground > 0.05) me.grounded = false;
      // the leader of a hand-hold walks a bit slower
      const hs = Math.hypot(me.vel.x, me.vel.z);
      me.speed = hs;
      if (hs > 0.3) me.ry = lerpAngle(me.ry, Math.atan2(me.vel.x, me.vel.z), 1 - Math.exp(-10 * dt));
      if (wantMove && now < this.emoteUntil) this.emoteUntil = 0;
      if (now < this.emoteUntil) { /* keep emote */ }
      else me.anim = !me.grounded ? 'jump' : hs > 0.2 ? (ice ? 'skate' : hs > 4.2 ? 'run' : 'walk') : 'idle';
    }
    me.char.play(me.anim);
    me.char.root.position.copy(me.pos);
    me.char.root.rotation.y = me.ry;
    me.char.update(dt, me.speed || 0, me.grounded || this.isFollower());

    // footprints
    if (me.grounded && (me.speed || 0) > 0.3 && me.anim !== 'skate') {
      this.footAcc += (me.speed || 0) * dt;
      if (this.footAcc > 0.7) { this.footAcc = 0; this.footSide *= -1; this.engine.footprints.add(me.pos.x, me.pos.y, me.pos.z, me.ry, this.footSide); }
    }

    this.updateRemotes(dt, now);
    this.updateBalls(dt);
    this.updateCamera(dt);
    this.engine.focus(me.pos);

    // network: send pose at NET_SEND_HZ (and keepalive each second)
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / NET_SEND_HZ) {
      const s = { x: +me.pos.x.toFixed(3), y: +me.pos.y.toFixed(3), z: +me.pos.z.toFixed(3), ry: +me.ry.toFixed(3), anim: me.anim };
      const l = this.lastSent;
      if (!l || l.x !== s.x || l.z !== s.z || l.y !== s.y || l.ry !== s.ry || l.anim !== s.anim || this.sendAcc > 1) {
        this.net.send({ t: 'pose', ...s });
        this.lastSent = s;
        this.sendAcc = 0;
      } else this.sendAcc = 1 / NET_SEND_HZ;
    }
  }

  updateRemotes(dt, now) {
    const renderT = now - INTERP_DELAY;
    for (const r of this.remotes.values()) {
      const b = r.buf;
      let s0 = b[0], s1 = b[b.length - 1];
      for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= renderT) { s0 = b[i]; s1 = b[i + 1] || b[i]; break; }
      const span = s1.t - s0.t;
      const k = span > 0 ? Math.min(1, (renderT - s0.t) / span) : 1;
      const prev = tmpV.copy(r.pos);
      r.pos.set(s0.x + (s1.x - s0.x) * k, s0.y + (s1.y - s0.y) * k, s0.z + (s1.z - s0.z) * k);
      r.ry = lerpAngle(s0.ry, s1.ry, k);
      const sp = prev.distanceTo(r.pos) / Math.max(dt, 1e-3);
      r.speed = r.speed === undefined ? sp : r.speed * 0.8 + sp * 0.2;
      // on the leader's screen, keep my follower glued to my side
      if (this.hold && this.hold.a === this.self.id && this.hold.b === r.id) {
        const off = this.hold.mode === 'walk' ? HOLD_SIDE_OFFSET * 1.3 : HOLD_SIDE_OFFSET;
        r.pos.set(this.me.pos.x + Math.cos(this.me.ry) * off, this.me.pos.y, this.me.pos.z - Math.sin(this.me.ry) * off);
        r.ry = this.me.ry;
        r.speed = this.me.speed;
      }
      let anim = s1.anim || 'idle';
      if (r.emote && now < r.emoteUntil && (r.speed || 0) < 0.3) anim = r.emote;
      if (this.hold?.a === this.self.id && this.hold.b === r.id) anim = this.me.anim === 'skate' ? 'skate' : this.me.speed > 0.2 ? (this.me.speed > 4.2 ? 'run' : 'walk') : 'idle';
      r.char.play(anim);
      r.char.root.position.copy(r.pos);
      r.char.root.rotation.y = r.ry;
      // animate fully only when reasonably close (cheap LOD for crowds)
      const d = r.pos.distanceTo(this.camera.position);
      r.char.root.visible = d < 140;
      if (d < 60 || (now | 0) % 3 === 0) r.char.update(dt, anim === 'idle' ? 0 : r.speed, anim !== 'jump');
      if ((r.speed || 0) > 0.3 && anim !== 'skate' && d < 50) {
        r.footAcc += r.speed * dt;
        if (r.footAcc > 0.7) { r.footAcc = 0; r.side = -(r.side || 1); this.engine.footprints.add(r.pos.x, r.pos.y, r.pos.z, r.ry, r.side); }
      }
    }
  }

  updateCamera(dt) {
    const me = this.me;
    const target = this.cam.target;
    target.lerp(tmpV.set(me.pos.x, me.pos.y + 1.45, me.pos.z), 1 - Math.exp(-14 * dt));
    const yaw = this.cam.yaw, pitch = this.cam.pitch;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // pull the camera in front of walls (2D march against large colliders)
    let maxD = this.cam.dist;
    for (let d = 0.6; d <= this.cam.dist; d += 0.35) {
      const px = target.x + dir.x * d, pz = target.z + dir.z * d, py = target.y + dir.y * d;
      if (this.camColl.blocked(px, pz, py - 1.0, 0.3)) { maxD = Math.max(1.2, d - 0.4); break; }
    }
    // fast in, slow out => no jitter when grazing corners
    const k = maxD < this.cam.curDist ? 18 : 4;
    this.cam.curDist += (maxD - this.cam.curDist) * (1 - Math.exp(-k * dt));
    const pos = tmpV.copy(target).addScaledVector(dir, this.cam.curDist);
    const groundY = this.coll.groundAt(pos.x, pos.z, target.y) + 0.4;
    if (pos.y < groundY) pos.y = groundY;
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  cameraForwardYaw() { return this.cam.yaw + Math.PI; }
}
