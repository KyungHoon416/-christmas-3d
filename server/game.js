// Transport-agnostic game server core. `conn` objects need { send(obj), close() }.
// All authority lives here: identity, rooms, movement validation, chat routing,
// social graph, consent-based interactions and WebRTC signalling relay.
import crypto from 'node:crypto';
import {
  PROTOCOL_VERSION, RUN_SPEED, MAX_SPEED_TOLERANCE, NET_TICK_HZ, DETAIL_RADIUS, FAR_EVERY,
  NEARBY_CHAT_RADIUS, INTERACT_RADIUS, HOLD_MAX_DISTANCE, CHAT_MAX_LEN, CHAT_RATE, NICK_RE,
  EMOTES, VOICE_DISCONNECT, sanitizeAppearance, DUEL,
} from '../shared/constants.js';
import { REGIONS, getRegion, DEFAULT_REGION } from '../shared/regions.js';
import { CollisionWorld } from '../shared/collision.js';

const ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'wave', 'heart', 'dance', 'cheer', 'bow', 'sit', 'hug', 'skate', 'throw', 'aim']);
const REQ_TTL = 30000;
const PARTY_MAX = 6;
const now = () => Date.now();
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rid = () => crypto.randomBytes(5).toString('hex');

class Bucket {
  constructor(burst, perSec) { this.cap = burst; this.rate = perSec; this.tokens = burst; this.t = now(); }
  take(n = 1) {
    const t = now();
    this.tokens = Math.min(this.cap, this.tokens + ((t - this.t) / 1000) * this.rate);
    this.t = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

export class Game {
  constructor(store, { log = () => {} } = {}) {
    this.store = store;
    this.log = log;
    this.sessions = new Map(); // userId -> session
    this.rooms = new Map();
    for (const r of REGIONS) {
      this.rooms.set(r.id, {
        id: r.id, region: r, players: new Set(), holds: new Map(),
        world: new CollisionWorld(r.colliders, r.surfaces, r.bounds),
        tick: 0, throws: new Map(), scores: new Map(),
      });
    }
    this.requests = new Map();
    this.parties = new Map();
    this.duels = new Map();
    this.history = { all: [] };
    this.metrics = { msgsIn: 0, bytesOut: 0, tickMs: 0, rejectedMoves: 0, started: now() };
    this.chatSeq = 0;
  }

  // ------------------------------------------------------------ connection
  onConnect(conn) {
    conn.session = null;
    conn.msgBucket = new Bucket(80, 60);
  }

  onClose(conn) {
    const s = conn.session;
    if (!s || s.conn !== conn) return;
    this.leaveRoom(s);
    this.sessions.delete(s.user.id);
    this.leaveParty(s);
    this.store.save();
    this.notifyFriends(s.user.id);
  }

  send(s, msg) {
    if (!s?.conn) return;
    this.metrics.bytesOut += s.conn.send(msg) || 0;
  }

  onMessage(conn, msg) {
    this.metrics.msgsIn++;
    if (!conn.msgBucket.take()) return;
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') return this.hello(conn, msg);
    if (msg.t === 'ping') return conn.send({ t: 'pong', c: msg.c, s: now() });
    const s = conn.session;
    if (!s) return conn.send({ t: 'error', code: 'unauth' });
    switch (msg.t) {
      case 'join': return this.join(s, msg.region);
      case 'pose': return this.pose(s, msg);
      case 'chat': return this.chat(s, msg);
      case 'emote': return this.emote(s, msg.e);
      case 'req': return this.request(s, msg);
      case 'resp': return this.respond(s, msg);
      case 'friend': return this.friendOp(s, msg);
      case 'report': return this.report(s, msg);
      case 'release': return this.releaseHold(s, 'cancel');
      case 'appearance': return this.setAppearance(s, msg.appearance);
      case 'settings': return this.settings(s, msg);
      case 'voice': return this.voiceState(s, msg);
      case 'rtc': return this.rtcRelay(s, msg);
      case 'party': if (msg.op === 'leave') this.leaveParty(s); return;
      case 'throw': return this.throwBall(s, msg);
      case 'hit': return this.hit(s, msg);
      case 'shot': return this.shot(s, msg);
      case 'dhit': return this.duelHit(s, msg);
      case 'seat': return this.seat(s, msg);
      case 'warp': return this.warp(s, msg);
      case 'forfeit': return s.duel && this.endDuel(s.duel, this.opponent(s.duel, s.user.id), 'forfeit');
      case 'read': return; // read receipts are client-side only for now
      default: return conn.send({ t: 'error', code: 'unknown', m: msg.t });
    }
  }

  // ------------------------------------------------------------ auth
  hello(conn, msg) {
    if (conn.session) return;
    if (msg.v !== PROTOCOL_VERSION) return conn.send({ t: 'error', code: 'version', need: PROTOCOL_VERSION });
    let user = msg.token ? this.store.byToken(msg.token) : null;
    let token = msg.token;
    if (!user) {
      const nick = String(msg.nick || '').trim();
      if (!NICK_RE.test(nick)) return conn.send({ t: 'error', code: 'nick', m: '닉네임은 2~12자 (한글/영문/숫자)' });
      if (this.store.byNick(nick)) return conn.send({ t: 'error', code: 'nick_taken', m: '이미 사용 중인 닉네임입니다' });
      ({ user, token } = this.store.createUser({ nick, adult: msg.adult === true, appearance: sanitizeAppearance(msg.appearance) }));
    }
    const old = this.sessions.get(user.id);
    if (old) {
      // Same account reconnecting (refresh/network change): replace the old socket.
      old.conn.session = null;
      this.leaveRoom(old);
      this.send(old, { t: 'error', code: 'replaced', m: '다른 곳에서 접속하여 연결이 종료되었습니다' });
      old.conn.close();
    }
    const s = {
      user, conn, room: null, pos: { x: 0, y: 0, z: 0 }, ry: 0, anim: 'idle', lastPose: 0,
      chatBucket: new Bucket(CHAT_RATE.burst, CHAT_RATE.perSec), reqBucket: new Bucket(5, 0.5),
      throwBucket: new Bucket(3, 1.5), shotBucket: new Bucket(DUEL.mag, DUEL.maxShotsPerSec), duel: null, voice: { inVoice: false, mic: false, speaking: false },
      hold: null, party: old?.party || null, strikes: 0,
    };
    conn.session = s;
    this.sessions.set(user.id, s);
    if (s.party) this.parties.get(s.party)?.members.add(user.id);
    conn.send({ t: 'welcome', token, you: this.selfView(user), regions: REGIONS.map((r) => ({ id: r.id, count: this.rooms.get(r.id).players.size })), history: this.history.all.slice(-30) });
    const region = getRegion(msg.region) ? msg.region : (user.lastRegion || DEFAULT_REGION);
    this.join(s, region, user.lastRegion === region ? user.lastPos : null);
    this.sendSocial(s);
    this.notifyFriends(user.id);
  }

  selfView(u) {
    return { id: u.id, nick: u.nick, adult: u.adult, appearance: u.appearance, shareLocation: u.shareLocation, couple: u.couple };
  }

  publicView(s) {
    return { id: s.user.id, nick: s.user.nick, appearance: s.user.appearance, x: s.pos.x, y: s.pos.y, z: s.pos.z, ry: s.ry, anim: s.anim, couple: s.user.couple, voice: s.voice };
  }

  // ------------------------------------------------------------ rooms
  join(s, regionId, resumePos = null) {
    const room = this.rooms.get(regionId);
    if (!room) return this.send(s, { t: 'error', code: 'region' });
    this.releaseHold(s, 'region');
    this.leaveRoom(s);
    const r = room.region;
    let p = resumePos && !room.world.blocked(resumePos.x, resumePos.z, resumePos.y || 0) ? { ...resumePos } : null;
    if (!p) {
      p = { x: r.spawn.x, y: 0, z: r.spawn.z };
      // spread spawns so people don't stack inside each other
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * 3;
        const c = { x: r.spawn.x + Math.cos(a) * d, z: r.spawn.z + Math.sin(a) * d };
        if (!room.world.blocked(c.x, c.z, 0)) { p = { ...c, y: room.world.groundAt(c.x, c.z, 0) }; break; }
      }
    }
    s.pos = p;
    s.ry = r.spawn.rot;
    s.anim = 'idle';
    s.lastPose = now();
    s.room = room;
    s.voice.inVoice = s.voice.inVoice && true;
    room.players.add(s);
    s.user.lastRegion = regionId;
    this.store.save();
    const players = [...room.players].filter((o) => o !== s).map((o) => this.publicView(o));
    const holds = [...room.holds.values()].filter((h, i, a) => a.indexOf(h) === i);
    this.send(s, { t: 'joined', region: regionId, pos: p, ry: s.ry, players, holds, scores: [...room.scores], seats: room.seats ? Object.fromEntries(room.seats) : {} });
    this.broadcastRoom(room, { t: 'pjoin', p: this.publicView(s) }, s);
    this.notifyFriends(s.user.id);
  }

  leaveRoom(s) {
    const room = s.room;
    if (!room) return;
    this.releaseHold(s, 'leave');
    this.standUp(s, false);
    if (s.duel) this.endDuel(s.duel, this.opponent(s.duel, s.user.id), 'left');
    room.players.delete(s);
    s.user.lastPos = { ...s.pos };
    s.room = null;
    this.broadcastRoom(room, { t: 'pleave', id: s.user.id });
  }

  broadcastRoom(room, msg, except = null) {
    for (const o of room.players) if (o !== except) this.send(o, msg);
  }

  // ------------------------------------------------------------ seats & zone warps (DDP)
  seat(s, m) {
    const room = s.room;
    if (!room || !room.region.seats) return;
    room.seats ||= new Map(); // seatId -> userId
    if (!m.sit) return this.standUp(s, true);
    const seat = room.region.seats.find((x) => x.id === m.id);
    if (!seat) return this.send(s, { t: 'seat', ok: false, reason: 'unknown' });
    if (s.duel) return this.send(s, { t: 'seat', ok: false, reason: 'duel' });
    if (dist2(s.pos, seat) > 4.5 || Math.abs((s.pos.y || 0) - seat.y) > 1.3) return this.send(s, { t: 'seat', ok: false, reason: 'far' });
    const occ = room.seats.get(seat.id);
    if (occ && occ !== s.user.id) return this.send(s, { t: 'seat', ok: false, reason: 'taken' });
    this.releaseHold(s, 'seat');
    if (s.seat && s.seat !== seat.id) room.seats.delete(s.seat);
    room.seats.set(seat.id, s.user.id);
    s.seat = seat.id;
    s.pos = { x: seat.x, y: seat.y, z: seat.z };
    s.ry = seat.ry;
    s.anim = 'sit';
    s.lastPose = now();
    this.send(s, { t: 'seat', ok: true, id: seat.id, pos: s.pos, ry: seat.ry });
    this.broadcastRoom(room, { t: 'seats', taken: Object.fromEntries(room.seats) });
  }

  standUp(s, notify) {
    const room = s.room;
    if (!s.seat || !room?.seats) { s.seat = null; return; }
    if (room.seats.get(s.seat) === s.user.id) room.seats.delete(s.seat);
    s.seat = null;
    if (notify) this.send(s, { t: 'seat', ok: true, id: null });
    this.broadcastRoom(room, { t: 'seats', taken: Object.fromEntries(room.seats) });
  }

  warp(s, m) {
    const room = s.room;
    const p = room?.region.warps?.[m.zone];
    if (!p) return this.send(s, { t: 'error', code: 'warp' });
    if (s.duel) return this.send(s, { t: 'notice', m: '눈싸움 대결 중에는 구역 이동을 할 수 없어요.' });
    this.releaseHold(s, 'warp');
    this.standUp(s, false);
    // small spread so several people warping at once don't stack
    let q = { ...p };
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 1.2;
      const c = { x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d };
      if (!room.world.blocked(c.x, c.z, c.y) && Math.abs(room.world.groundAt(c.x, c.z, c.y + 0.2) - c.y) < 0.05) { q = c; break; }
    }
    s.pos = q;
    s.lastPose = now();
    this.send(s, { t: 'correct', pos: s.pos, reason: 'warp', zone: m.zone });
  }

  // ------------------------------------------------------------ movement
  pose(s, m) {
    const room = s.room;
    if (!room) return;
    const x = +m.x, y = +m.y, z = +m.z, ry = +m.ry;
    if (![x, y, z, ry].every(Number.isFinite)) return;
    const t = now();
    const dt = Math.max(0.03, Math.min(1.5, (t - s.lastPose) / 1000));
    const moved = Math.hypot(x - s.pos.x, z - s.pos.z);
    const maxMove = (RUN_SPEED + MAX_SPEED_TOLERANCE) * dt + 0.6;
    const follower = s.hold && s.hold.b === s.user.id;
    const minY = room.region.low !== undefined ? room.region.low - 1 : -1;
    let reason = null;
    if (moved > maxMove && !follower) reason = 'speed';
    else if (y < minY || y > (room.region.high ?? 6)) reason = 'height';
    else if (room.world.blocked(x, z, y, 0.25)) reason = 'collision';
    if (follower) {
      const leader = this.sessions.get(s.hold.a);
      if (leader && dist2(leader.pos, { x, z }) > HOLD_MAX_DISTANCE + 1) reason = 'hold';
    }
    if (reason) {
      this.metrics.rejectedMoves++;
      s.strikes++;
      s.lastPose = t;
      this.send(s, { t: 'correct', pos: s.pos, reason });
      return;
    }
    s.pos = { x, y, z };
    s.ry = ry;
    s.anim = ANIMS.has(m.anim) ? m.anim : 'idle';
    if (s.seat && moved > 0.4) this.standUp(s, true); // walked away from the seat
    s.lastPose = t;
  }

  tick() {
    const t0 = performance.now();
    for (const room of this.rooms.values()) {
      room.tick++;
      if (room.players.size === 0) continue;
      // auto-release holds that drifted apart
      for (const h of new Set(room.holds.values())) {
        const a = this.sessions.get(h.a), b = this.sessions.get(h.b);
        if (!a || !b || dist2(a.pos, b.pos) > HOLD_MAX_DISTANCE) this.releaseHold(a || b, 'distance');
      }
      const all = [...room.players];
      for (const s of all) {
        const rows = [];
        for (const o of all) {
          if (o === s) continue;
          const far = dist2(o.pos, s.pos) > DETAIL_RADIUS;
          if (far && room.tick % FAR_EVERY !== 0) continue;
          rows.push([o.user.id, +o.pos.x.toFixed(2), +o.pos.y.toFixed(2), +o.pos.z.toFixed(2), +o.ry.toFixed(2), o.anim]);
        }
        if (rows.length) this.send(s, { t: 'snap', p: rows });
      }
      for (const [k, th] of room.throws) if (now() - th.t > 4000) room.throws.delete(k);
    }
    this.tickDuels();
    this.metrics.tickMs = this.metrics.tickMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  start() {
    this.interval = setInterval(() => this.tick(), 1000 / NET_TICK_HZ);
    this.reqSweep = setInterval(() => {
      for (const [k, r] of this.requests) if (now() - r.t > REQ_TTL) this.requests.delete(k);
    }, 5000);
  }

  stop() { clearInterval(this.interval); clearInterval(this.reqSweep); }

  // ------------------------------------------------------------ chat
  isBlocked(a, b) {
    const ua = this.store.get(a), ub = this.store.get(b);
    return !!(ua?.blocked.includes(b) || ub?.blocked.includes(a));
  }

  chat(s, m) {
    const ack = (ok, err) => this.send(s, { t: 'chatAck', cid: m.cid, ok, err });
    const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return ack(false, 'empty');
    if (!s.chatBucket.take()) return ack(false, 'rate');
    const ch = m.ch;
    const msg = { t: 'chat', id: ++this.chatSeq, ch, from: s.user.id, nick: s.user.nick, text, ts: now() };
    let targets = [];
    if (ch === 'all') {
      targets = [...this.sessions.values()];
      this.history.all.push(msg);
      if (this.history.all.length > 100) this.history.all.shift();
    } else if (ch === 'region') {
      if (!s.room) return ack(false, 'noroom');
      msg.region = s.room.id;
      targets = [...s.room.players];
    } else if (ch === 'nearby') {
      if (!s.room) return ack(false, 'noroom');
      targets = [...s.room.players].filter((o) => dist2(o.pos, s.pos) <= NEARBY_CHAT_RADIUS);
    } else if (ch === 'party') {
      const p = s.party && this.parties.get(s.party);
      if (!p) return ack(false, 'noparty');
      targets = [...p.members].map((id) => this.sessions.get(id)).filter(Boolean);
    } else if (ch === 'whisper') {
      const to = this.sessions.get(m.to);
      if (!to || to === s) return ack(false, 'offline');
      if (this.isBlocked(s.user.id, to.user.id)) return ack(false, 'blocked');
      msg.to = to.user.id;
      msg.toNick = to.user.nick;
      // Delivered ONLY to the two participants.
      targets = [to, s];
    } else return ack(false, 'channel');
    for (const o of targets) {
      if (o !== s && this.isBlocked(o.user.id, s.user.id)) continue;
      this.send(o, msg);
    }
    ack(true);
  }

  emote(s, e) {
    if (!s.room || !EMOTES.includes(e)) return;
    s.anim = e;
    this.broadcastRoom(s.room, { t: 'emote', id: s.user.id, e });
  }

  // ------------------------------------------------------------ requests (consent)
  request(s, m) {
    const kind = m.kind;
    const target = this.sessions.get(m.to);
    const fail = (err) => this.send(s, { t: 'reqResult', kind, to: m.to, ok: false, err });
    if (!['friend', 'couple', 'holdHand', 'walk', 'hug', 'party', 'invite', 'voice', 'duel'].includes(kind)) return fail('kind');
    if (!s.reqBucket.take()) return fail('rate');
    let targetUser = target?.user || null;
    if (kind === 'friend' && !targetUser) {
      // friend requests can target offline users by id or nickname
      targetUser = this.store.get(m.to) || (m.nick ? this.store.byNick(String(m.nick)) : null);
    }
    if (!targetUser || targetUser.id === s.user.id) return fail('notfound');
    if (this.isBlocked(s.user.id, targetUser.id)) return fail('blocked');
    const me = s.user;
    if (kind === 'friend') {
      if (me.friends.includes(targetUser.id)) return fail('already');
      if (me.incoming.includes(targetUser.id)) {
        // they already asked us -> accept immediately
        return this.makeFriends(me, targetUser);
      }
      if (!targetUser.incoming.includes(me.id)) targetUser.incoming.push(me.id);
      this.store.save();
      if (target) this.sendSocial(target);
      return this.send(s, { t: 'reqResult', kind, to: targetUser.id, ok: true, pending: true });
    }
    if (!target) return fail('offline');
    if (kind === 'couple') {
      if (!me.adult || !targetUser.adult) return fail('adult');
      if (me.couple || targetUser.couple) return fail('taken');
      if (!me.friends.includes(targetUser.id)) return fail('notfriend');
    }
    if (['holdHand', 'walk', 'hug'].includes(kind)) {
      if (!s.room || s.room !== target.room) return fail('room');
      if (dist2(s.pos, target.pos) > INTERACT_RADIUS) return fail('far');
      if (kind !== 'hug' && (s.hold || target.hold)) return fail('busy');
    }
    if (kind === 'party') {
      const p = s.party && this.parties.get(s.party);
      if (p && p.members.size >= PARTY_MAX) return fail('full');
      if (target.party && target.party === s.party) return fail('already');
    }
    if (kind === 'invite' && !s.room) return fail('room');
    if (kind === 'duel') {
      if (!s.room || s.room !== target.room) return fail('room');
      if (dist2(s.pos, target.pos) > DUEL.range) return fail('far');
      if (s.duel || target.duel) return fail('busy');
      if (s.hold || target.hold) return fail('busy');
    }
    for (const r of this.requests.values()) if (r.from === me.id && r.to === targetUser.id && r.kind === kind) return fail('pending');
    const id = rid();
    const req = { id, kind, from: me.id, to: targetUser.id, t: now(), region: s.room?.id };
    this.requests.set(id, req);
    this.send(target, { t: 'req', id, kind, from: me.id, nick: me.nick, region: req.region });
    this.send(s, { t: 'reqResult', kind, to: targetUser.id, ok: true, pending: true, id });
  }

  respond(s, m) {
    // friend requests are persisted, handled by friendOp accept/decline
    const req = this.requests.get(m.id);
    if (!req || req.to !== s.user.id) return this.send(s, { t: 'error', code: 'noreq' });
    this.requests.delete(m.id);
    const from = this.sessions.get(req.from);
    const result = (ok, err) => from && this.send(from, { t: 'reqResult', kind: req.kind, to: s.user.id, ok, err, final: true, nick: s.user.nick });
    if (!m.accept) return result(false, 'declined');
    if (!from) return this.send(s, { t: 'error', code: 'offline' });
    if (now() - req.t > REQ_TTL) return result(false, 'expired');
    switch (req.kind) {
      case 'couple': {
        if (!s.user.adult || !from.user.adult) return result(false, 'adult');
        if (s.user.couple || from.user.couple) return result(false, 'taken');
        s.user.couple = { with: from.user.id, nick: from.user.nick, since: now() };
        from.user.couple = { with: s.user.id, nick: s.user.nick, since: now() };
        this.store.save();
        result(true);
        for (const x of [s, from]) { this.send(x, { t: 'self', you: this.selfView(x.user) }); this.sendSocial(x); }
        if (s.room) this.broadcastRoom(s.room, { t: 'couple', a: s.user.id, b: from.user.id });
        return;
      }
      case 'holdHand': case 'walk': {
        if (s.room !== from.room || dist2(s.pos, from.pos) > INTERACT_RADIUS + 1) return result(false, 'far');
        if (s.hold || from.hold) return result(false, 'busy');
        const h = { a: from.user.id, b: s.user.id, mode: req.kind === 'walk' ? 'walk' : 'hand' };
        s.hold = h; from.hold = h;
        s.room.holds.set(h.a, h); s.room.holds.set(h.b, h);
        result(true);
        return this.broadcastRoom(s.room, { t: 'hold', ...h });
      }
      case 'hug': {
        if (s.room !== from.room || dist2(s.pos, from.pos) > INTERACT_RADIUS + 1) return result(false, 'far');
        result(true);
        return this.broadcastRoom(s.room, { t: 'hug', a: from.user.id, b: s.user.id });
      }
      case 'party': {
        let p = from.party && this.parties.get(from.party);
        if (!p) { p = { id: rid(), members: new Set([from.user.id]) }; this.parties.set(p.id, p); from.party = p.id; }
        if (p.members.size >= PARTY_MAX) return result(false, 'full');
        this.leaveParty(s);
        p.members.add(s.user.id); s.party = p.id;
        result(true);
        return this.sendParty(p);
      }
      case 'voice':
        return result(true);
      case 'duel': {
        if (s.room !== from.room || s.duel || from.duel) return result(false, 'busy');
        result(true);
        return this.startDuel(from, s);
      }
      case 'invite': {
        result(true);
        if (req.region) this.join(s, req.region);
        return;
      }
    }
  }

  releaseHold(s, reason) {
    if (!s?.hold) return;
    const h = s.hold;
    const a = this.sessions.get(h.a), b = this.sessions.get(h.b);
    for (const x of [a, b]) if (x) x.hold = null;
    const room = s.room;
    if (room) {
      room.holds.delete(h.a); room.holds.delete(h.b);
      this.broadcastRoom(room, { t: 'unhold', a: h.a, b: h.b, reason });
    }
  }

  // ------------------------------------------------------------ friends
  makeFriends(a, b) {
    a.incoming = a.incoming.filter((x) => x !== b.id);
    b.incoming = b.incoming.filter((x) => x !== a.id);
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
    this.store.save();
    for (const u of [a, b]) { const x = this.sessions.get(u.id); if (x) this.sendSocial(x); }
  }

  friendOp(s, m) {
    const me = s.user;
    const other = this.store.get(m.id);
    if (!other) return this.send(s, { t: 'error', code: 'notfound' });
    const os = this.sessions.get(other.id);
    switch (m.op) {
      case 'accept':
        if (!me.incoming.includes(other.id)) return;
        this.makeFriends(me, other);
        if (os) this.send(os, { t: 'notice', m: `${me.nick}님이 친구 신청을 수락했습니다` });
        return;
      case 'decline':
        me.incoming = me.incoming.filter((x) => x !== other.id);
        break;
      case 'remove':
        me.friends = me.friends.filter((x) => x !== other.id);
        other.friends = other.friends.filter((x) => x !== me.id);
        if (me.couple?.with === other.id) this.dissolveCouple(me, other);
        break;
      case 'block':
        if (!me.blocked.includes(other.id)) me.blocked.push(other.id);
        me.friends = me.friends.filter((x) => x !== other.id);
        other.friends = other.friends.filter((x) => x !== me.id);
        me.incoming = me.incoming.filter((x) => x !== other.id);
        other.incoming = other.incoming.filter((x) => x !== me.id);
        if (me.couple?.with === other.id) this.dissolveCouple(me, other);
        if (s.hold && (s.hold.a === other.id || s.hold.b === other.id)) this.releaseHold(s, 'blocked');
        break;
      case 'unblock':
        me.blocked = me.blocked.filter((x) => x !== other.id);
        break;
      case 'uncouple':
        if (me.couple?.with === other.id) this.dissolveCouple(me, other);
        break;
      default: return;
    }
    this.store.save();
    this.sendSocial(s);
    if (os) this.sendSocial(os);
  }

  dissolveCouple(a, b) {
    a.couple = null; b.couple = null;
    for (const u of [a, b]) {
      const x = this.sessions.get(u.id);
      if (x) { this.send(x, { t: 'self', you: this.selfView(u) }); if (x.room) this.broadcastRoom(x.room, { t: 'couple', a: u.id, b: null }); }
    }
  }

  report(s, m) {
    const target = this.store.get(m.id);
    if (!target) return;
    this.store.report({ by: s.user.id, target: target.id, reason: String(m.reason || '').slice(0, 300) });
    this.send(s, { t: 'notice', m: '신고가 접수되었습니다. 검토 후 조치됩니다.' });
  }

  sendSocial(s) {
    const u = s.user;
    const view = (id) => {
      const f = this.store.get(id);
      if (!f) return null;
      const fs = this.sessions.get(id);
      const shares = f.shareLocation;
      return { id, nick: f.nick, online: !!fs, region: fs && shares ? fs.room?.id || null : null, sharing: shares, couple: f.couple?.with === u.id };
    };
    const p = s.party && this.parties.get(s.party);
    this.send(s, {
      t: 'social',
      friends: u.friends.map(view).filter(Boolean),
      incoming: u.incoming.map((id) => ({ id, nick: this.store.get(id)?.nick })).filter((x) => x.nick),
      blocked: u.blocked.map((id) => ({ id, nick: this.store.get(id)?.nick })).filter((x) => x.nick),
      couple: u.couple,
      party: p ? [...p.members].map((id) => ({ id, nick: this.store.get(id)?.nick, online: this.sessions.has(id) })) : null,
    });
  }

  notifyFriends(userId) {
    const u = this.store.get(userId);
    if (!u) return;
    for (const f of u.friends) { const x = this.sessions.get(f); if (x) this.sendSocial(x); }
  }

  sendParty(p) { for (const id of p.members) { const x = this.sessions.get(id); if (x) this.sendSocial(x); } }

  leaveParty(s) {
    const p = s.party && this.parties.get(s.party);
    s.party = null;
    if (!p) return;
    p.members.delete(s.user.id);
    if (p.members.size <= 1) {
      for (const id of p.members) { const x = this.sessions.get(id); if (x) x.party = null; }
      this.parties.delete(p.id);
      for (const id of p.members) { const x = this.sessions.get(id); if (x) this.sendSocial(x); }
    } else this.sendParty(p);
    if (s.conn) this.sendSocial(s);
  }

  setAppearance(s, a) {
    s.user.appearance = sanitizeAppearance(a);
    this.store.save();
    this.send(s, { t: 'self', you: this.selfView(s.user) });
    if (s.room) this.broadcastRoom(s.room, { t: 'look', id: s.user.id, appearance: s.user.appearance }, s);
  }

  settings(s, m) {
    if (typeof m.shareLocation === 'boolean') s.user.shareLocation = m.shareLocation;
    this.store.save();
    this.send(s, { t: 'self', you: this.selfView(s.user) });
    this.notifyFriends(s.user.id);
  }

  // ------------------------------------------------------------ voice signalling
  voiceState(s, m) {
    s.voice = { inVoice: !!m.inVoice, mic: !!m.mic && !!m.inVoice, speaking: !!m.speaking && !!m.mic };
    if (s.room) this.broadcastRoom(s.room, { t: 'voice', id: s.user.id, ...s.voice }, s);
  }

  rtcRelay(s, m) {
    const to = this.sessions.get(m.to);
    if (!to || !s.room || to.room !== s.room) return;
    if (!s.voice.inVoice || !to.voice.inVoice) return;
    if (this.isBlocked(s.user.id, to.user.id)) return;
    if (dist2(s.pos, to.pos) > VOICE_DISCONNECT + 12) return;
    const data = m.data;
    if (!data || typeof data !== 'object' || JSON.stringify(data).length > 12000) return;
    this.send(to, { t: 'rtc', from: s.user.id, data });
  }

  // ------------------------------------------------------------ 1:1 snowball-gun duel
  // Shots are relayed to the whole room (spectators see them). Hits are reported by
  // the player who got hit (victim-authoritative), validated against a recent shot
  // from the opponent, and scored here.
  startDuel(a, b) {
    const id = rid();
    const now = Date.now();
    const d = { id, a: a.user.id, b: b.user.id, hp: { [a.user.id]: DUEL.hp, [b.user.id]: DUEL.hp }, room: a.room, startAt: now + DUEL.countdown * 1000, ends: now + (DUEL.countdown + DUEL.seconds) * 1000, shots: new Map() };
    this.duels.set(id, d);
    a.duel = d; b.duel = d;
    this.releaseHold(a, 'duel'); this.releaseHold(b, 'duel');
    this.broadcastRoom(a.room, { t: 'duel', id, a: d.a, b: d.b, hp: d.hp, countdown: DUEL.countdown, seconds: DUEL.seconds });
    return d;
  }

  opponent(d, id) { return d.a === id ? d.b : d.a; }

  shot(s, m) {
    const d = s.duel;
    if (!d || !s.room || Date.now() < d.startAt - 300) return;
    if (!s.shotBucket.take()) return;
    const o = m.o, dir = m.d;
    if (![o, dir].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return;
    if (Math.hypot(o[0] - s.pos.x, o[1] - s.pos.y - 1.3, o[2] - s.pos.z) > 2.5) return; // must fire from own body
    const len = Math.hypot(...dir) || 1;
    const sid = String(m.sid || rid()).slice(0, 24);
    d.shots.set(sid, { t: Date.now(), by: s.user.id });
    if (d.shots.size > 40) d.shots.delete(d.shots.keys().next().value);
    this.broadcastRoom(s.room, { t: 'shot', sid, by: s.user.id, duel: d.id, o, d: dir.map((v) => v / len) });
  }

  duelHit(s, m) {
    const d = s.duel;
    if (!d || m.duel !== d.id) return;
    const sh = d.shots.get(m.sid);
    const opp = this.opponent(d, s.user.id);
    if (!sh || sh.by !== opp || Date.now() - sh.t > 3000) return;
    d.shots.delete(m.sid);
    d.hp[s.user.id] = Math.max(0, d.hp[s.user.id] - DUEL.damage);
    this.broadcastRoom(d.room, { t: 'dscore', id: d.id, hp: d.hp, victim: s.user.id, by: opp });
    if (d.hp[s.user.id] <= 0) this.endDuel(d, opp, 'ko');
  }

  endDuel(d, winner, reason) {
    if (!this.duels.has(d.id)) return;
    this.duels.delete(d.id);
    for (const id of [d.a, d.b]) { const x = this.sessions.get(id); if (x && x.duel === d) x.duel = null; }
    const nick = (id) => this.store.get(id)?.nick || '?';
    this.broadcastRoom(d.room, { t: 'duelEnd', id: d.id, a: d.a, b: d.b, winner, reason, hp: d.hp, winnerNick: winner ? nick(winner) : null });
  }

  tickDuels() {
    const now = Date.now();
    for (const d of [...this.duels.values()]) {
      if (now < d.ends) continue;
      const ha = d.hp[d.a], hb = d.hp[d.b];
      this.endDuel(d, ha === hb ? null : ha > hb ? d.a : d.b, 'time');
    }
  }

  // ------------------------------------------------------------ snowball mini-game
  throwBall(s, m) {
    if (!s.room || !s.throwBucket.take()) return;
    const v = m.v;
    if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || Math.hypot(...v) > 30) return;
    const id = rid();
    s.room.throws.set(id, { by: s.user.id, t: now(), o: { ...s.pos } });
    this.broadcastRoom(s.room, { t: 'throw', id, by: s.user.id, o: [s.pos.x, s.pos.y + 1.5, s.pos.z], v });
  }

  hit(s, m) {
    const room = s.room;
    const th = room?.throws.get(m.id);
    if (!th || th.by !== s.user.id) return;
    const target = this.sessions.get(m.target);
    if (!target || target.room !== room || target === s) return;
    if (dist2(th.o, target.pos) > 40) return;
    room.throws.delete(m.id);
    room.scores.set(s.user.nick, (room.scores.get(s.user.nick) || 0) + 1);
    this.broadcastRoom(room, { t: 'hitfx', target: target.user.id, by: s.user.id, score: room.scores.get(s.user.nick) });
  }

  stats() {
    const up = (now() - this.metrics.started) / 1000;
    return {
      online: this.sessions.size,
      rooms: [...this.rooms.values()].map((r) => ({ id: r.id, players: r.players.size, holds: r.holds.size / 2 })),
      msgsInPerSec: +(this.metrics.msgsIn / up).toFixed(1),
      bytesOutPerSec: Math.round(this.metrics.bytesOut / up),
      tickMs: +this.metrics.tickMs.toFixed(3),
      rejectedMoves: this.metrics.rejectedMoves,
      uptimeSec: Math.round(up),
    };
  }
}
