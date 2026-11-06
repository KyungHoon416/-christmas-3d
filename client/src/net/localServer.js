// Offline demo: runs the real authoritative Game (server/game.js) inside the page and
// exposes the same interface as Net. NPC players live in the same in-page server, walk
// around every region, chat, emote, throw snowballs and answer social requests, so the
// world can be played where WebSockets are not available (e.g. a Claude artifact).
import { Game } from '../../../server/game.js';
import { PROTOCOL_VERSION, APPEARANCE_OPTIONS, HOLD_SIDE_OFFSET, DUEL } from '../../../shared/constants.js';
import { REGIONS, getRegion } from '../../../shared/regions.js';
import { CollisionWorld } from '../../../shared/collision.js';
import cryptoShim from './cryptoShim.js';

class MemoryStore {
  constructor() { this.data = { users: {}, reports: [] }; }
  static hash(t) { return 'h' + t; }
  save() {}
  flush() {}
  createUser({ nick, adult, appearance }) {
    const id = 'u_' + cryptoShim.randomBytes(6).toString('hex');
    const token = cryptoShim.randomBytes(24).toString('base64url');
    const user = { id, nick, adult: !!adult, appearance, tokenHash: MemoryStore.hash(token), friends: [], incoming: [], blocked: [], couple: null, shareLocation: true, lastRegion: null, lastPos: null, created: Date.now() };
    this.data.users[id] = user;
    return { user, token };
  }
  byToken(t) { return Object.values(this.data.users).find((u) => u.tokenHash === MemoryStore.hash(t)) || null; }
  byNick(n) { n = n.toLowerCase(); return Object.values(this.data.users).find((u) => u.nick.toLowerCase() === n) || null; }
  get(id) { return this.data.users[id] || null; }
  report(e) { this.data.reports.push(e); }
}

const BOT_NAMES = ['지민☆', '별하', '서울러버♡', '크리스마스♥', '눈꽃', '하늘달', '루돌프', '민트초코', '겨울소년', '유리', '산타할매', '포근이', '라떼', '도윤', '하린♡', '설탕', '코코아', '은하'];
const LINES = ['와... 진짜 서울 같아..!', '메리 크리스마스~ 🎄', '눈 너무 예쁘다 ❄️', '같이 구경하실 분? ㅎㅎ', '트리 앞에서 사진 찍어요!', '여기 처음 와봐요', '어디가 제일 예뻐요?', '청계천 빛 터널 가보셨어요?', '남산 야경 미쳤어요', '손 시려워요 ㅋㅋ', '눈싸움 하실 분!', '캐럴 좋다~'];
const WHISPER_REPLIES = ['ㅎㅎ 안녕하세요!', '지금 트리 앞이에요 😊', '좋아요! 같이 걸어요', '반가워요~', '오늘 날씨 딱 크리스마스네요', '저도요!! 💕'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

class Bot {
  constructor(local, nick, region) {
    this.local = local; this.nick = nick; this.region = region;
    this.pos = null; this.target = null; this.hold = null; this.ry = 0; this.pause = 0;
    this.world = local.worlds.get(region);
    const appearance = Object.fromEntries(Object.entries(APPEARANCE_OPTIONS).map(([k, v]) => [k, pick(v)]));
    this.conn = { send: (m) => { this.onMessage(m); return 0; }, close() {} };
    local.game.onConnect(this.conn);
    local.game.onMessage(this.conn, { t: 'hello', v: PROTOCOL_VERSION, nick, adult: true, appearance, region });
  }
  send(m) { this.local.game.onMessage(this.conn, m); }
  get id() { return this.conn.session?.user.id; }

  onMessage(m) {
    switch (m.t) {
      case 'joined': this.pos = { ...m.pos }; this.ry = m.ry; break;
      case 'correct': this.pos = { ...m.pos }; this.target = null; break;
      case 'req': // NPCs are friendly: stay put and accept after a short "thinking" delay
        this.pause = Math.max(this.pause, 8); this.target = null;
        setTimeout(() => this.send({ t: 'resp', id: m.id, accept: true }), 900 + Math.random() * 1200);
        break;
      case 'social':
        for (const i of m.incoming) setTimeout(() => this.send({ t: 'friend', op: 'accept', id: i.id }), 1500);
        break;
      case 'hold': if (m.a === this.id || m.b === this.id) this.hold = m; break;
      case 'unhold': if (this.hold && (m.a === this.hold.a)) this.hold = null; break;
      case 'chat':
        if (m.ch === 'whisper' && m.to === this.id) setTimeout(() => this.send({ t: 'chat', ch: 'whisper', to: m.from, text: pick(WHISPER_REPLIES), cid: 0 }), 1500 + Math.random() * 1500);
        break;
      case 'hug': if (m.b === this.id || m.a === this.id) this.pause = 3; break;
      case 'duel':
        if (m.a === this.id || m.b === this.id) {
          this.duel = { id: m.id, opp: m.a === this.id ? m.b : m.a, startAt: performance.now() + m.countdown * 1000, nextShot: 0, ammo: DUEL.mag, strafe: 1, strafeT: 0 };
          this.hold = null; this.target = null;
        }
        break;
      case 'duelEnd': if (this.duel && this.duel.id === m.id) { this.duel = null; this.pause = 2; setTimeout(() => this.send({ t: 'emote', e: m.winner === this.id ? 'cheer' : 'bow' }), 800); } break;
      case 'shot': if (this.duel && m.duel === this.duel.id && m.by === this.duel.opp) this.dodgeCheck(m); break;
    }
  }

  // victim-side hit test for a shot fired at this NPC (same ballistics as the client)
  dodgeCheck(m) {
    const o = m.o, d = m.d;
    for (let t = 0; t <= DUEL.shotLife; t += 0.005) {
      const x = o[0] + d[0] * DUEL.shotSpeed * t, z = o[2] + d[2] * DUEL.shotSpeed * t;
      const y = o[1] + d[1] * DUEL.shotSpeed * t - 0.5 * DUEL.shotGravity * t * t;
      if (y < this.world.groundAt(x, z, y + 0.5) || this.world.blocked(x, z, y - 0.4, 0.06)) return;
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < DUEL.hitRadius && Math.abs(y - (this.pos.y + 1.0)) < 0.95) {
        const id = this.duel.id;
        setTimeout(() => { if (this.duel?.id === id) this.send({ t: 'dhit', duel: id, sid: m.sid }); }, t * 1000);
        return;
      }
    }
  }

  duelStep(dt) {
    const D = this.duel;
    const opp = this.local.game.sessions.get(D.opp);
    if (!opp) return;
    const dx = opp.pos.x - this.pos.x, dz = opp.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    this.ry = Math.atan2(dx, dz);
    // strafe sideways, keep a fighting distance of ~8-14 m
    D.strafeT -= dt;
    if (D.strafeT <= 0) { D.strafe = Math.random() < 0.5 ? -1 : 1; D.strafeT = 0.8 + Math.random() * 1.6; }
    const fx = dx / dist, fz = dz / dist;
    const adv = dist > 14 ? 1 : dist < 8 ? -1 : 0;
    const vx = (fz * D.strafe + fx * adv) * 2.6 * dt, vz = (-fx * D.strafe + fz * adv) * 2.6 * dt;
    const nx = this.pos.x + vx, nz = this.pos.z + vz;
    let anim = 'idle';
    if (!this.world.blocked(nx, nz, this.pos.y) && this.world.canStep(nx, nz, this.pos.y)) { this.pos = { x: nx, y: this.world.groundAt(nx, nz, this.pos.y), z: nz }; anim = 'walk'; }
    else D.strafe *= -1;
    this.send({ t: 'pose', ...this.pos, ry: this.ry, anim });
    // fire with human-like inaccuracy and reloads
    const now = performance.now();
    if (now < D.startAt || now < D.nextShot || dist > 45) return;
    const ox = this.pos.x + Math.sin(this.ry) * 0.5, oy = this.pos.y + 1.35, oz = this.pos.z + Math.cos(this.ry) * 0.5;
    const spread = 0.35 + dist * 0.045;
    const tx = opp.pos.x + (Math.random() - 0.5) * spread, ty = opp.pos.y + 1.0 + (Math.random() - 0.5) * spread, tz = opp.pos.z + (Math.random() - 0.5) * spread;
    const T = dist / DUEL.shotSpeed;
    let ddx = tx - ox, ddy = ty - oy + 0.5 * DUEL.shotGravity * T * T, ddz = tz - oz;
    const l = Math.hypot(ddx, ddy, ddz) || 1;
    this.send({ t: 'shot', sid: 'n' + Math.random().toString(36).slice(2, 9), o: [ox, oy, oz], d: [ddx / l, ddy / l, ddz / l] });
    D.ammo--;
    D.nextShot = now + (D.ammo <= 0 ? DUEL.reload * 1000 + 400 : 650 + Math.random() * 900);
    if (D.ammo <= 0) D.ammo = DUEL.mag;
  }

  step(dt) {
    const s = this.conn.session;
    if (!this.pos || !s) return;
    if (this.duel) return this.duelStep(dt);
    if (this.hold && this.hold.b === this.id) {
      // follow the leader at their side
      const leader = this.local.game.sessions.get(this.hold.a);
      if (leader) {
        const off = this.hold.mode === 'walk' ? HOLD_SIDE_OFFSET * 1.3 : HOLD_SIDE_OFFSET;
        const moving = Math.hypot(leader.pos.x - (this.lastLeader?.x ?? leader.pos.x), leader.pos.z - (this.lastLeader?.z ?? leader.pos.z)) > 0.02;
        this.lastLeader = { ...leader.pos };
        this.pos = { x: leader.pos.x + Math.cos(leader.ry) * off, y: leader.pos.y, z: leader.pos.z - Math.sin(leader.ry) * off };
        this.send({ t: 'pose', ...this.pos, ry: leader.ry, anim: moving ? leader.anim : 'idle' });
      }
      return;
    }
    // stop and face the player when they come close (so they can interact)
    const hu = this.local.human();
    if (hu && !hu.duel && !hu.peerDuel && hu.room?.id === this.region && Math.hypot(hu.pos.x - this.pos.x, hu.pos.z - this.pos.z) < 4.5) {
      this.ry = Math.atan2(hu.pos.x - this.pos.x, hu.pos.z - this.pos.z);
      this.target = null;
      this.pause = Math.max(this.pause, 1.5);
    }
    if (this.pause > 0) { this.pause -= dt; this.send({ t: 'pose', ...this.pos, ry: this.ry, anim: s.anim === 'hug' ? 'hug' : 'idle' }); return; }
    // stroll toward the player now and then, otherwise wander
    if (!this.target) {
      const b = this.world.bounds;
      const human = this.local.human();
      for (let i = 0; i < 12; i++) {
        let x, z;
        if (human && !human.duel && !human.peerDuel && human.room?.id === this.region && Math.random() < 0.25) { x = human.pos.x + (Math.random() - 0.5) * 8; z = human.pos.z + (Math.random() - 0.5) * 8; }
        else if (b.circle) { const a = Math.random() * 6.28, r = Math.random() * (b.r - 3); x = b.x + Math.cos(a) * r; z = b.z + Math.sin(a) * r; }
        else { x = b.minX + 3 + Math.random() * (b.maxX - b.minX - 6); z = b.minZ + 3 + Math.random() * (b.maxZ - b.minZ - 6); }
        if (!this.world.blocked(x, z, this.pos.y)) { this.target = { x, z }; break; }
      }
      if (!this.target) return;
    }
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { this.target = null; this.pause = 2 + Math.random() * 6; return; }
    const sp = 1.5 * dt;
    const nx = this.pos.x + (dx / d) * sp, nz = this.pos.z + (dz / d) * sp;
    if (this.world.blocked(nx, nz, this.pos.y) || !this.world.canStep(nx, nz, this.pos.y)) { this.target = null; return; }
    this.pos = { x: nx, y: this.world.groundAt(nx, nz, this.pos.y), z: nz };
    this.ry = Math.atan2(dx, dz);
    this.send({ t: 'pose', ...this.pos, ry: this.ry, anim: 'walk' });
  }

  idle() {
    const r = Math.random();
    const human = this.local.human();
    const near = human && human.room?.id === this.region && Math.hypot(human.pos.x - this.pos.x, human.pos.z - this.pos.z);
    if (r < 0.35) this.send({ t: 'chat', ch: Math.random() < 0.5 ? 'region' : 'nearby', text: pick(LINES), cid: 0 });
    else if (r < 0.6 && !this.hold) this.send({ t: 'emote', e: pick(['wave', 'heart', 'dance', 'cheer', 'bow']) });
    else if (r < 0.75 && near && near < 25 && !this.hold && !this.duel && !human.duel && !human.peerDuel) {
      // NPCs sometimes challenge the player to a snowball-gun duel
      this.send({ t: 'req', kind: 'duel', to: human.user.id });
    }
    else if (false) {
      // snowball at the player
      const h = human.pos, dx = h.x - this.pos.x, dz = h.z - this.pos.z, d = Math.hypot(dx, dz);
      const t = Math.max(d / 14, 0.2);
      this.ry = Math.atan2(dx, dz);
      this.send({ t: 'throw', v: [dx / t, (-0.5 + 4.9 * t * t) / t, dz / t] });
      setTimeout(() => {
        const th = [...(this.conn.session?.room?.throws || [])].reverse().find(([, v]) => v.by === this.id);
        if (th && Math.random() < 0.6) setTimeout(() => this.send({ t: 'hit', id: th[0], target: human.user.id }), t * 1000);
      }, 50);
    }
  }
}

export class LocalNet {
  constructor() {
    this.handlers = new Map();
    this.state = 'idle';
    this.rtt = 0;
    this.demo = true;
    this.game = new Game(new MemoryStore());
    this.game.start();
    this.worlds = new Map(REGIONS.map((r) => [r.id, new CollisionWorld(r.colliders, r.surfaces, r.bounds)]));
    this.bots = [];
    let n = 0;
    for (const r of REGIONS) for (let i = 0; i < 3; i++) this.bots.push(new Bot(this, BOT_NAMES[n++ % BOT_NAMES.length], r.id));
    let last = performance.now();
    this.botTimer = setInterval(() => {
      const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      for (const b of this.bots) b.step(dt);
    }, 150);
    this.chatterTimer = setInterval(() => {
      const humanRoom = this.human()?.room?.id;
      const local = this.bots.filter((b) => b.region === humanRoom);
      if (local.length && Math.random() < 0.8) pick(local).idle();
    }, 6000);
    // one NPC sends the player a friend request after a while
    setTimeout(() => {
      const h = this.human();
      const b = this.bots.find((x) => x.region === h?.room?.id) || this.bots[0];
      if (h) b.send({ t: 'req', kind: 'friend', to: h.user.id });
    }, 45000);
  }

  human() { return this.conn?.session || null; }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }
  emit(type, m) {
    for (const fn of this.handlers.get(type) || []) fn(m);
    for (const fn of this.handlers.get('*') || []) fn(m);
  }

  connect(hello) {
    this.state = 'open';
    this.conn = {
      send: (m) => {
        const copy = structuredClone(m);
        setTimeout(() => {
          if (copy.t === 'pong') { this.rtt = Math.round(performance.now() - copy.c); this.emit('rtt', { rtt: this.rtt }); return; }
          this.emit(copy.t, copy);
        }, 0);
        return 0;
      },
      close() {},
    };
    this.game.onConnect(this.conn);
    const h = hello();
    delete h.token; // fresh in-page server every load
    setTimeout(() => {
      this.emit('status', { t: 'status', state: 'open' });
      this.game.onMessage(this.conn, { t: 'hello', v: PROTOCOL_VERSION, ...h });
    }, 0);
    this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 5000);
  }

  send(m) {
    if (!this.conn) return false;
    const copy = structuredClone(m);
    setTimeout(() => this.game.onMessage(this.conn, copy), 0);
    return true;
  }

  counts() { return Object.fromEntries([...this.game.rooms.values()].map((r) => [r.id, r.players.size])); }

  close() { this.state = 'closed'; clearInterval(this.pingTimer); }
}

export function isRegion(id) { return !!getRegion(id); }
