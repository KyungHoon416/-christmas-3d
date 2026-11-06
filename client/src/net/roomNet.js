// Real multiplayer inside a Claude artifact.
// The artifact `room` capability shares one small "presence" object per open page with
// everyone viewing the artifact right now. Each page keeps running its own in-page game
// (LocalNet: NPCs, collision, validation) and additionally publishes in its presence:
//   - who it is (nickname, look, region) and its live pose
//   - an "outbox" of the last few events (chat, emotes, requests/answers, shots, hits)
//     numbered by a sequence, which other pages read exactly once.
// Presence can be set by every viewer (topic events need Contributor access), so even
// view-only invitees can play. Peers are injected into the app as ordinary remote
// players ("p_<peer>") by synthesising the same messages the real server would send.
import { LocalNet } from './localServer.js';
import { getRegion } from '../../../shared/regions.js';
import { INTERACT_RADIUS, HOLD_MAX_DISTANCE, NEARBY_CHAT_RADIUS, DUEL, EMOTES, sanitizeAppearance } from '../../../shared/constants.js';

const OUTBOX = 6;
const TEXT_MAX = 120;
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const rid = () => Math.random().toString(36).slice(2, 10);

export class RoomNet extends LocalNet {
  constructor() {
    super();
    this.room = null;
    this.myPeer = null;
    this.peers = new Map();
    this.out = [];
    this.seq = 0;
    this.pendingIn = new Map();
    this.pendingOut = new Map();
    this.pfriends = new Map();
    this.pblocked = new Map();
    this.pcouple = null;
    this.phold = null;
    this.pduel = null;
    this.lastPoseAt = 0;
    this.localSocial = { friends: [], incoming: [], blocked: [], couple: null, party: null };
    this.lastSelf = null;
    this.initRoom();
    this.linkTimer = setInterval(() => this.checkLinks(), 400);
  }

  // ------------------------------------------------------------ helpers
  get me() { return this.human(); }
  get selfId() { return this.me?.user.id; }
  get myRegion() { return this.me?.room?.id || null; }
  pid(label) { return 'p_' + label; }
  isPeer(id) { return typeof id === 'string' && id.startsWith('p_'); }
  peerOf(id) { return this.peers.get(String(id).slice(2)); }
  later(type, m) { setTimeout(() => this.emit(type, m), 0); }
  dist(st) { const s = this.me; return s && st ? Math.hypot(st.x - s.pos.x, st.z - s.pos.z) : Infinity; }
  busy() { const s = this.me; return !!(this.phold || this.pduel || s?.hold || s?.duel); }
  get connectedPeers() { return [...this.peers.values()].filter((p) => p.present).length; }

  async initRoom() {
    if (!window.claude?.use) return;
    let room = null;
    try { room = await window.claude.use('room'); } catch { room = null; }
    if (!room) return;
    this.room = room;
    room.onPeers((ch) => this.onPeers(ch), () => { this.room = null; });
    this.publishAll();
  }

  presence(patch) {
    if (!this.room) return;
    this.room.presence(patch).catch((e) => {
      if (e?.code === 'invalid_argument' && patch.o && this.out.length > 1) { this.out.shift(); this.presence({ o: this.out }); }
    });
  }

  publishAll() {
    const s = this.me;
    if (!s) return;
    this.presence({ v: 1, n: s.user.nick, ap: s.user.appearance, ad: !!s.user.adult, r: this.myRegion, x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2), ry: +s.ry.toFixed(2), a: s.anim, cp: this.pcouple ? this.pcouple.with.slice(2) : null, du: this.pduel?.id || s.duel?.id || null, bz: this.busy(), o: this.out });
  }

  push(e) {
    e.s = ++this.seq;
    this.out.push(e);
    while (this.out.length > OUTBOX) this.out.shift();
    this.presence({ o: this.out });
  }

  counts() {
    const c = super.counts();
    for (const p of this.peers.values()) if (p.present && p.region && c[p.region] !== undefined) c[p.region]++;
    return c;
  }

  // ------------------------------------------------------------ messages from the in-page server
  emit(type, m) {
    if (type === 'social') { this.localSocial = m; return super.emit('social', this.mergeSocial()); }
    if (type === 'self') { this.lastSelf = m.you; return super.emit('self', { ...m, you: this.mergeSelf(m.you) }); }
    if (type === 'welcome') { this.lastSelf = m.you; super.emit(type, { ...m, you: this.mergeSelf(m.you) }); setTimeout(() => this.publishAll(), 0); return; }
    if (type === 'joined') {
      // region changed: show the peers that are in the same region
      const players = [...m.players];
      for (const st of this.peers.values()) {
        st.shown = st.present && st.region === m.region;
        if (st.shown) players.push(this.view(st));
      }
      super.emit(type, { ...m, players });
      setTimeout(() => this.publishAll(), 0);
      return;
    }
    if (type === 'duel' || type === 'duelEnd') setTimeout(() => this.presence({ du: this.me?.duel?.id || this.pduel?.id || null, bz: this.busy() }), 0);
    super.emit(type, m);
  }

  mergeSocial() {
    const s = this.localSocial;
    const peerFriends = [...this.pfriends].map(([id, nick]) => {
      const st = this.peerOf(id);
      return { id, nick: st?.nick || nick, online: !!st?.present, region: st?.present ? st.region : null, sharing: true, couple: this.pcouple?.with === id };
    });
    return { ...s, friends: [...s.friends, ...peerFriends], blocked: [...s.blocked, ...[...this.pblocked].map(([id, nick]) => ({ id, nick }))] };
  }

  mergeSelf(you) { return this.pcouple ? { ...you, couple: this.pcouple } : you; }
  emitSocial() { super.emit('social', this.mergeSocial()); }
  emitSelf() { if (this.lastSelf) super.emit('self', { t: 'self', you: this.mergeSelf(this.lastSelf) }); }

  view(st) {
    return { id: this.pid(st.label), nick: st.nick, appearance: st.app, x: st.x, y: st.y, z: st.z, ry: st.ry, anim: st.anim, couple: st.cp ? { with: st.cp === this.myPeer ? this.selfId : this.pid(st.cp) } : null, voice: st.vc || {} };
  }

  // ------------------------------------------------------------ messages from the app
  send(m) {
    switch (m.t) {
      case 'pose': {
        super.send(m);
        const now = performance.now();
        if (now - this.lastPoseAt > 90) { this.lastPoseAt = now; this.presence({ x: +num(m.x).toFixed(2), y: +num(m.y).toFixed(2), z: +num(m.z).toFixed(2), ry: +num(m.ry).toFixed(2), a: m.anim }); }
        return true;
      }
      case 'join':
        if (this.pduel) this.endPDuel(this.opp(), 'left', true);
        if (this.phold) this.endHold('region', true);
        return super.send(m);
      case 'chat': return this.chatOut(m);
      case 'emote': super.send(m); this.push({ k: 'em', e: m.e }); return true;
      case 'req': if (this.isPeer(m.to)) return this.reqOut(m); break;
      case 'resp': if (this.pendingIn.has(m.id)) return this.respOut(m); break;
      case 'friend': if (this.isPeer(m.id)) return this.friendOut(m); break;
      case 'release': if (this.phold) { this.endHold('cancel', true); return true; } break;
      case 'shot': {
        const d = this.pduel;
        if (d) this.later('shot', { t: 'shot', sid: m.sid, by: this.selfId, duel: d.id, o: m.o, d: m.d });
        else super.send(m);
        this.push({ k: 'sh', du: d?.id || this.me?.duel?.id || null, sid: m.sid, o: m.o.map((v) => +(+v).toFixed(2)), d: m.d.map((v) => +(+v).toFixed(3)) });
        return true;
      }
      case 'dhit':
        if (this.pduel && m.duel === this.pduel.id) { this.push({ k: 'dh', du: m.duel, sid: m.sid }); this.damage(this.selfId); return true; }
        break;
      case 'forfeit':
        if (this.pduel) { this.push({ k: 'ff', du: this.pduel.id }); this.endPDuel(this.opp(), 'forfeit'); return true; }
        break;
      case 'appearance': super.send(m); setTimeout(() => this.presence({ ap: this.me?.user.appearance }), 50); return true;
      case 'report': if (this.isPeer(m.id)) { this.later('notice', { t: 'notice', m: '신고가 접수되었습니다. (데모: 이 기기에서 해당 사용자를 차단할 수 있어요)' }); return true; } break;
    }
    return super.send(m);
  }

  chatOut(m) {
    const me = this.me;
    if (m.ch === 'whisper' && this.isPeer(m.to)) {
      const st = this.peerOf(m.to);
      const text = String(m.text || '').trim().slice(0, TEXT_MAX);
      if (!st?.present) { this.later('chatAck', { t: 'chatAck', cid: m.cid, ok: false, err: 'offline' }); return true; }
      if (this.pblocked.has(m.to)) { this.later('chatAck', { t: 'chatAck', cid: m.cid, ok: false, err: 'blocked' }); return true; }
      this.push({ k: 'w', to: st.label, x: text });
      this.later('chat', { t: 'chat', id: 'w' + rid(), ch: 'whisper', from: this.selfId, nick: me.user.nick, to: m.to, toNick: st.nick, text, ts: Date.now() });
      this.later('chatAck', { t: 'chatAck', cid: m.cid, ok: true });
      return true;
    }
    super.send(m);
    if (['all', 'region', 'nearby'].includes(m.ch)) this.push({ k: 'c', ch: m.ch, x: String(m.text || '').trim().slice(0, TEXT_MAX) });
    return true;
  }

  reqOut(m) {
    const st = this.peerOf(m.to);
    const fail = (err) => { this.later('reqResult', { t: 'reqResult', kind: m.kind, to: m.to, ok: false, err }); return true; };
    if (!st?.present) return fail('offline');
    if (this.pblocked.has(m.to)) return fail('blocked');
    const k = m.kind;
    if (['party', 'invite', 'voice'].includes(k)) return fail('unsupported');
    if (['holdHand', 'walk', 'hug', 'duel'].includes(k) && st.region !== this.myRegion) return fail('room');
    if (['holdHand', 'walk', 'hug'].includes(k) && this.dist(st) > INTERACT_RADIUS) return fail('far');
    if (k === 'duel' && this.dist(st) > DUEL.range) return fail('far');
    if (['holdHand', 'walk', 'duel'].includes(k) && (this.busy() || st.bz)) return fail('busy');
    if (k === 'friend' && this.pfriends.has(m.to)) return fail('already');
    if (k === 'couple') {
      if (!this.me.user.adult || !st.adult) return fail('adult');
      if (!this.pfriends.has(m.to)) return fail('notfriend');
      if (this.pcouple || this.me.user.couple || st.cp) return fail('taken');
    }
    for (const r of this.pendingOut.values()) if (r.label === st.label && r.kind === k && performance.now() - r.t < 30000) return fail('pending');
    const id = rid();
    this.pendingOut.set(id, { label: st.label, kind: k, t: performance.now() });
    this.push({ k: 'rq', to: st.label, rid: id, kind: k });
    this.later('reqResult', { t: 'reqResult', kind: k, to: m.to, ok: true, pending: true, id });
    return true;
  }

  respOut(m) {
    const rec = this.pendingIn.get(m.id);
    this.pendingIn.delete(m.id);
    const st = this.peers.get(rec.label);
    let ok = !!m.accept && !!st?.present;
    if (ok && ['holdHand', 'walk', 'hug'].includes(rec.kind) && this.dist(st) > INTERACT_RADIUS + 1) ok = false;
    if (ok && ['holdHand', 'walk', 'duel'].includes(rec.kind) && this.busy()) ok = false;
    this.push({ k: 'rs', to: rec.label, rid: rec.rid, ok });
    if (ok) this.apply(rec.kind, this.pid(rec.label), this.selfId, rec.rid, st);
    else if (m.accept) this.later('notice', { t: 'notice', m: '요청을 처리할 수 없는 상태예요 (거리 또는 다른 활동 중)' });
    return true;
  }

  friendOut(m) {
    const id = m.id;
    const st = this.peerOf(id);
    switch (m.op) {
      case 'remove': this.pfriends.delete(id); if (st) this.push({ k: 'fr', to: st.label }); if (this.pcouple?.with === id) this.dropCouple(true); break;
      case 'block':
        this.pblocked.set(id, st?.nick || this.pfriends.get(id) || '?');
        this.pfriends.delete(id);
        if (this.pcouple?.with === id) this.dropCouple(true);
        if (this.phold && (this.phold.a === id || this.phold.b === id)) this.endHold('blocked', true);
        if (st?.shown) { st.shown = false; this.later('pleave', { t: 'pleave', id }); }
        break;
      case 'unblock': this.pblocked.delete(id); if (st) st.lastKey = null; break;
      case 'uncouple': if (this.pcouple?.with === id) this.dropCouple(true); break;
      default: return true;
    }
    this.emitSocial();
    return true;
  }

  // both sides call this with a = requester, b = accepter
  apply(kind, a, b, reqId, st) {
    const other = a === this.selfId ? b : a;
    const nick = st?.nick || '?';
    switch (kind) {
      case 'friend': this.pfriends.set(other, nick); this.emitSocial(); break;
      case 'couple':
        this.pcouple = { with: other, nick, since: Date.now() };
        this.presence({ cp: other.slice(2) });
        this.emitSelf(); this.emitSocial();
        this.later('couple', { t: 'couple', a, b });
        break;
      case 'holdHand': case 'walk':
        this.phold = { a, b, mode: kind === 'walk' ? 'walk' : 'hand' };
        this.presence({ bz: true });
        this.later('hold', { t: 'hold', ...this.phold });
        break;
      case 'hug': this.later('hug', { t: 'hug', a, b }); break;
      case 'duel': {
        const id = 'pd' + reqId;
        const now = performance.now();
        this.pduel = { id, a, b, hp: { [a]: DUEL.hp, [b]: DUEL.hp }, ends: now + (DUEL.countdown + DUEL.seconds) * 1000 };
        if (this.me) this.me.peerDuel = true; // NPCs keep their distance
        this.presence({ du: id, bz: true });
        this.later('duel', { t: 'duel', id, a, b, hp: this.pduel.hp, countdown: DUEL.countdown, seconds: DUEL.seconds });
        break;
      }
    }
  }

  dropCouple(tell) {
    const w = this.pcouple?.with;
    if (!w) return;
    if (tell) { const st = this.peerOf(w); if (st) this.push({ k: 'uc', to: st.label }); }
    this.pcouple = null;
    this.presence({ cp: null });
    this.emitSelf();
    this.later('couple', { t: 'couple', a: this.selfId, b: null });
  }

  endHold(reason, tell) {
    const h = this.phold;
    if (!h) return;
    this.phold = null;
    if (tell) this.push({ k: 'uh' });
    this.presence({ bz: this.busy() });
    this.later('unhold', { t: 'unhold', a: h.a, b: h.b, reason });
  }

  // deterministic WebRTC roles between two real players (both sides agree)
  voiceInitiator(id) { return this.isPeer(id) && this.myPeer ? this.myPeer < id.slice(2) : undefined; }

  opp() { const d = this.pduel; return d ? (d.a === this.selfId ? d.b : d.a) : null; }

  damage(victim) {
    const d = this.pduel;
    if (!d) return;
    d.hp[victim] = Math.max(0, d.hp[victim] - DUEL.damage);
    const by = victim === d.a ? d.b : d.a;
    this.later('dscore', { t: 'dscore', id: d.id, hp: { ...d.hp }, victim, by });
    if (d.hp[victim] <= 0) this.endPDuel(by, 'ko');
  }

  endPDuel(winner, reason, tell = false) {
    const d = this.pduel;
    if (!d) return;
    if (tell) this.push({ k: 'ff', du: d.id });
    this.pduel = null;
    if (this.me) this.me.peerDuel = false;
    const winnerNick = winner === this.selfId ? this.me?.user.nick : this.peerOf(winner)?.nick || null;
    this.later('duelEnd', { t: 'duelEnd', id: d.id, a: d.a, b: d.b, winner, reason, hp: { ...d.hp }, winnerNick });
    this.presence({ du: null, bz: this.busy() });
  }

  checkLinks() {
    const h = this.phold;
    if (h) {
      const st = this.peerOf(h.a === this.selfId ? h.b : h.a);
      if (!st?.present || st.region !== this.myRegion) this.endHold('leave', false);
      else if (this.dist(st) > HOLD_MAX_DISTANCE + 1) this.endHold('distance', true);
    }
    const d = this.pduel;
    if (d) {
      const st = this.peerOf(this.opp());
      if (!st?.present || st.region !== this.myRegion) this.endPDuel(this.selfId, 'left');
      else if (performance.now() > d.ends) {
        const me = d.hp[this.selfId], them = d.hp[this.opp()];
        this.endPDuel(me === them ? null : me > them ? this.selfId : this.opp(), 'time');
      }
    }
    for (const [k, r] of this.pendingOut) if (performance.now() - r.t > 35000) this.pendingOut.delete(k);
  }

  // ------------------------------------------------------------ the room
  onPeers(ch) {
    for (const p of ch.peers) if (p.sameTab) this.myPeer = p.peer;
    for (const p of ch.left) this.peerLeft(p.peer);
    for (const p of [...ch.joined, ...ch.updated]) {
      if (p.sameTab || p.kind !== 'viewer') continue;
      this.peerUpdate(p);
    }
  }

  peerLeft(label) {
    const st = this.peers.get(label);
    if (!st) return;
    st.present = false;
    if (st.shown) { st.shown = false; this.later('pleave', { t: 'pleave', id: this.pid(label) }); }
    if (this.pfriends.has(this.pid(label))) this.emitSocial();
  }

  peerUpdate(p) {
    const pr = p.presence || {};
    if (pr.v !== 1) return;
    const label = p.peer;
    const id = this.pid(label);
    let st = this.peers.get(label);
    const first = !st;
    if (!st) { st = { label, seen: 0, shown: false }; this.peers.set(label, st); }
    const wasPresent = st.present;
    st.present = true;
    st.nick = String(pr.n || '').replace(/[\u0000-\u001f]/g, '').slice(0, 12) || '눈사람';
    const appJson = JSON.stringify(pr.ap || {});
    const appChanged = st.appJson !== undefined && st.appJson !== appJson;
    st.appJson = appJson;
    st.app = sanitizeAppearance(pr.ap);
    st.adult = pr.ad === true;
    st.region = getRegion(pr.r) ? pr.r : null;
    st.x = num(pr.x); st.y = num(pr.y); st.z = num(pr.z); st.ry = num(pr.ry);
    st.anim = typeof pr.a === 'string' ? pr.a.slice(0, 12) : 'idle';
    st.cp = typeof pr.cp === 'string' ? pr.cp : null;
    st.bz = !!pr.bz;
    const vc = pr.vc && typeof pr.vc === 'object' ? { inVoice: !!pr.vc.i, mic: !!pr.vc.m, speaking: !!pr.vc.s } : { inVoice: false, mic: false, speaking: false };
    const vcChanged = JSON.stringify(vc) !== JSON.stringify(st.vc || {});
    st.vc = vc;
    const prevDu = st.du;
    st.du = typeof pr.du === 'string' ? pr.du.slice(0, 24) : null;
    const outbox = Array.isArray(pr.o) ? pr.o : [];
    // don't replay what happened before we met
    if (first) st.seen = outbox.reduce((m, e) => Math.max(m, num(e?.s)), 0);
    if (this.pblocked.has(id)) return;

    const show = st.region && st.region === this.myRegion;
    if (show && !st.shown) { st.shown = true; this.later('pjoin', { t: 'pjoin', p: this.view(st) }); }
    else if (!show && st.shown) { st.shown = false; this.later('pleave', { t: 'pleave', id }); }
    else if (st.shown) {
      this.later('snap', { t: 'snap', p: [[id, st.x, st.y, st.z, st.ry, st.anim]] });
      if (appChanged) this.later('look', { t: 'look', id, appearance: st.app });
    }
    if (!wasPresent && this.pfriends.has(id)) this.emitSocial();
    if (st.shown && vcChanged) this.later('voice', { t: 'voice', id, ...vc });
    // spectators see other people's duels (armed characters)
    const inMine = this.pduel && (this.pduel.a === id || this.pduel.b === id);
    if (st.shown && !inMine && st.du !== prevDu) {
      if (st.du) this.later('duel', { t: 'duel', id: st.du, a: id, b: id, hp: {}, countdown: 0, seconds: 0 });
      else if (prevDu) this.later('duelEnd', { t: 'duelEnd', id: prevDu, a: id, b: id, winner: null, reason: 'spectate' });
    }
    for (const e of outbox) {
      const s = num(e?.s);
      if (s <= st.seen) continue;
      st.seen = s;
      this.handleEvent(st, id, e);
    }
  }

  handleEvent(st, id, e) {
    const me = this.me;
    if (!me) return;
    const toMe = e.to && e.to === this.myPeer;
    const text = String(e.x || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, TEXT_MAX);
    switch (e.k) {
      case 'c': {
        if (!['all', 'region', 'nearby'].includes(e.ch) || !text) return;
        if (e.ch === 'region' && st.region !== this.myRegion) return;
        if (e.ch === 'nearby' && (!st.shown || this.dist(st) > NEARBY_CHAT_RADIUS)) return;
        this.later('chat', { t: 'chat', id: 'pc' + st.label + e.s, ch: e.ch, from: id, nick: st.nick, text, ts: Date.now() });
        return;
      }
      case 'w':
        if (toMe && text) this.later('chat', { t: 'chat', id: 'pw' + st.label + e.s, ch: 'whisper', from: id, nick: st.nick, to: this.selfId, toNick: me.user.nick, text, ts: Date.now() });
        return;
      case 'em': if (st.shown && EMOTES.includes(e.e)) this.later('emote', { t: 'emote', id, e: e.e }); return;
      case 'rq': {
        if (!toMe) return;
        const kinds = ['friend', 'couple', 'holdHand', 'walk', 'hug', 'duel'];
        if (!kinds.includes(e.kind)) return;
        const key = 'pr_' + st.label + '_' + String(e.rid).slice(0, 12);
        this.pendingIn.set(key, { label: st.label, rid: String(e.rid).slice(0, 12), kind: e.kind });
        this.later('req', { t: 'req', id: key, kind: e.kind, from: id, nick: st.nick, region: st.region });
        return;
      }
      case 'rs': {
        if (!toMe) return;
        const r = this.pendingOut.get(e.rid);
        if (!r || r.label !== st.label) return;
        this.pendingOut.delete(e.rid);
        if (e.ok) this.apply(r.kind, this.selfId, id, e.rid, st);
        this.later('reqResult', { t: 'reqResult', kind: r.kind, to: id, ok: !!e.ok, err: e.ok ? undefined : 'declined', final: true, nick: st.nick });
        return;
      }
      case 'uh': if (this.phold && (this.phold.a === id || this.phold.b === id)) this.endHold('cancel', false); return;
      case 'fr': if (toMe) { this.pfriends.delete(id); this.emitSocial(); } return;
      case 'uc': if (toMe && this.pcouple?.with === id) this.dropCouple(false); return;
      case 'sh': {
        if (!st.shown || !Array.isArray(e.o) || !Array.isArray(e.d) || e.o.length !== 3 || e.d.length !== 3) return;
        this.later('shot', { t: 'shot', sid: String(e.sid).slice(0, 16), by: id, duel: e.du, o: e.o.map(num), d: e.d.map(num) });
        return;
      }
      case 'dh': if (this.pduel && e.du === this.pduel.id && this.opp() === id) this.damage(id); return;
      case 'ff': if (this.pduel && e.du === this.pduel.id && this.opp() === id) this.endPDuel(this.selfId, 'forfeit'); return;
    }
  }
}
