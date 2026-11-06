import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';
import { TestClient, sleep } from './helpers.js';

let srv;
const clients = [];
async function client(nick, extra) {
  const c = new TestClient(srv.port);
  clients.push(c);
  return c.login(nick, extra);
}
// Move a client to (x,z) with legal step sizes.
async function walkTo(c, x, z, y = 0) {
  let p = { ...c.joined.pos };
  for (let i = 0; i < 200; i++) {
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.01) break;
    const step = Math.min(d, 0.6);
    p = { x: p.x + (dx / d) * step, y, z: p.z + (dz / d) * step };
    c.send({ t: 'pose', x: p.x, y: p.y, z: p.z, ry: 0, anim: 'walk' });
    await sleep(110);
  }
  c.joined.pos = p;
}

before(async () => { srv = await createServer({ port: 0, dbFile: null, staticDir: null, quiet: true }); });
after(async () => { for (const c of clients) c.close(); await srv.close(); });

test('login rejects bad nickname, then succeeds', async () => {
  const c = new TestClient(srv.port);
  clients.push(c);
  await c.open();
  c.send({ t: 'hello', v: 4, nick: 'x' });
  const e = await c.wait('error');
  assert.equal(e.code, 'nick');
  const ok = await client('루돌프');
  assert.ok(ok.token && ok.id);
  assert.equal(ok.joined.region, 'gwanghwamun');
});

test('presence + movement sync between two players (QA-07)', async () => {
  const a = await client('플레이어A');
  const b = await client('플레이어B');
  const pj = await a.wait((m) => m.t === 'pjoin' && m.p.id === b.id);
  assert.equal(pj.p.nick, '플레이어B');
  await walkTo(b, -8, 40);
  const snap = await a.wait((m) => m.t === 'snap' && m.p.some((r) => r[0] === b.id && Math.abs(r[3] - 40) < 0.2), 3000);
  assert.ok(snap);
  b.close();
  await a.wait((m) => m.t === 'pleave' && m.id === b.id);
});

test('server rejects wall clipping and speed hacks (QA-04 / QA-17)', async () => {
  const c = await client('벽뚫기');
  const p = c.joined.pos;
  // teleport far away
  c.send({ t: 'pose', x: p.x + 40, y: 0, z: p.z, ry: 0, anim: 'run' });
  let corr = await c.wait('correct');
  assert.equal(corr.reason, 'speed');
  // walk into the main Christmas tree (circle r=4.6 at -8,18)
  await walkTo(c, -8, 23.2);
  c.send({ t: 'pose', x: -8, y: 0, z: 22.6, ry: 0, anim: 'walk' });
  corr = await c.wait('correct');
  assert.equal(corr.reason, 'collision');
});

test('global chat reaches everyone; whisper only reaches the pair (QA-08 / QA-09)', async () => {
  const a = await client('철수');
  const b = await client('영희');
  const c = await client('민수');
  a.send({ t: 'chat', ch: 'all', text: '메리 크리스마스!', cid: 1 });
  for (const x of [a, b, c]) {
    const m = await x.wait((m) => m.t === 'chat' && m.ch === 'all' && m.text === '메리 크리스마스!');
    assert.equal(m.nick, '철수');
  }
  a.send({ t: 'chat', ch: 'whisper', to: b.id, text: '비밀이야', cid: 2 });
  const got = await b.wait((m) => m.t === 'chat' && m.ch === 'whisper');
  assert.equal(got.text, '비밀이야');
  assert.equal(got.from, a.id);
  const echo = await a.wait((m) => m.t === 'chat' && m.ch === 'whisper');
  assert.equal(echo.to, b.id);
  assert.ok(await c.none((m) => m.t === 'chat' && m.ch === 'whisper', 500), 'third party must not receive whisper');
  // whisper to offline user fails with ack
  a.send({ t: 'chat', ch: 'whisper', to: 'u_nobody', text: 'hi', cid: 3 });
  const ack = await a.wait((m) => m.t === 'chatAck' && m.cid === 3);
  assert.equal(ack.ok, false);
  assert.equal(ack.err, 'offline');
});

test('whisper survives region change', async () => {
  const a = await client('여행자');
  const b = await client('친구야');
  b.send({ t: 'join', region: 'namsan' });
  await b.wait((m) => m.t === 'joined' && m.region === 'namsan');
  a.send({ t: 'chat', ch: 'whisper', to: b.id, text: '남산 어때?', cid: 9 });
  const m = await b.wait((m) => m.t === 'chat' && m.ch === 'whisper');
  assert.equal(m.text, '남산 어때?');
});

test('friend request / accept / remove; block stops whispers (QA-11 / QA-17)', async () => {
  const a = await client('친구A');
  const b = await client('친구B');
  a.send({ t: 'req', kind: 'friend', to: b.id });
  await a.wait((m) => m.t === 'reqResult' && m.ok);
  const soc = await b.wait((m) => m.t === 'social' && m.incoming.some((i) => i.id === a.id));
  assert.ok(soc);
  b.send({ t: 'friend', op: 'accept', id: a.id });
  const sa = await a.wait((m) => m.t === 'social' && m.friends.some((f) => f.id === b.id && f.online));
  assert.ok(sa);
  b.send({ t: 'friend', op: 'block', id: a.id });
  await b.wait((m) => m.t === 'social' && m.blocked.some((x) => x.id === a.id));
  a.send({ t: 'chat', ch: 'whisper', to: b.id, text: 'hello?', cid: 5 });
  const ack = await a.wait((m) => m.t === 'chatAck' && m.cid === 5);
  assert.equal(ack.err, 'blocked');
  a.send({ t: 'chat', ch: 'all', text: '전체 메시지', cid: 6 });
  assert.ok(await b.none((m) => m.t === 'chat' && m.text === '전체 메시지', 500), 'blocked user global chat hidden');
});

test('couple requires friendship + adult + explicit consent; dissolve (QA-13)', async () => {
  const a = await client('연인A');
  const b = await client('연인B');
  const minor = await client('미성년', { adult: false });
  a.send({ t: 'req', kind: 'couple', to: b.id });
  let r = await a.wait((m) => m.t === 'reqResult' && m.kind === 'couple');
  assert.equal(r.err, 'notfriend');
  a.send({ t: 'req', kind: 'couple', to: minor.id });
  r = await a.wait((m) => m.t === 'reqResult' && m.kind === 'couple');
  assert.equal(r.err, 'adult');
  a.send({ t: 'req', kind: 'friend', to: b.id });
  await b.wait((m) => m.t === 'social' && m.incoming.length);
  b.send({ t: 'friend', op: 'accept', id: a.id });
  await a.wait((m) => m.t === 'social' && m.friends.length);
  a.send({ t: 'req', kind: 'couple', to: b.id });
  const req = await b.wait((m) => m.t === 'req' && m.kind === 'couple');
  b.send({ t: 'resp', id: req.id, accept: true });
  const self = await a.wait((m) => m.t === 'self' && m.you.couple);
  assert.equal(self.you.couple.with, b.id);
  b.send({ t: 'friend', op: 'uncouple', id: a.id });
  const after = await a.wait((m) => m.t === 'self' && m.you.couple === null);
  assert.equal(after.you.couple, null);
});

test('hand-hold: decline does nothing; accept links; disconnect releases (QA-12)', async () => {
  const a = await client('손A');
  const b = await client('손B');
  await walkTo(a, -12, 40); await walkTo(b, -11, 40);
  a.send({ t: 'req', kind: 'holdHand', to: b.id });
  let req = await b.wait((m) => m.t === 'req' && m.kind === 'holdHand');
  b.send({ t: 'resp', id: req.id, accept: false });
  const dec = await a.wait((m) => m.t === 'reqResult' && m.final);
  assert.equal(dec.ok, false);
  assert.ok(await a.none((m) => m.t === 'hold', 300));
  a.send({ t: 'req', kind: 'holdHand', to: b.id });
  req = await b.wait((m) => m.t === 'req' && m.kind === 'holdHand');
  b.send({ t: 'resp', id: req.id, accept: true });
  const hold = await a.wait((m) => m.t === 'hold');
  assert.equal(hold.a, a.id);
  assert.equal(hold.b, b.id);
  b.close();
  const un = await a.wait((m) => m.t === 'unhold');
  assert.equal(un.a, a.id);
});

test('hand-hold rejected when too far apart', async () => {
  const a = await client('멀리A');
  const b = await client('멀리B');
  await walkTo(a, -15, 50); await walkTo(b, -2, 50);
  a.send({ t: 'req', kind: 'holdHand', to: b.id });
  const r = await a.wait((m) => m.t === 'reqResult');
  assert.equal(r.err, 'far');
});

test('rtc signalling only relayed between in-voice peers in range', async () => {
  const a = await client('목소리A');
  const b = await client('목소리B');
  const c = await client('목소리C');
  a.send({ t: 'rtc', to: b.id, data: { sdp: 'x' } });
  assert.ok(await b.none('rtc', 300), 'not relayed before joining voice');
  a.send({ t: 'voice', inVoice: true, mic: true });
  b.send({ t: 'voice', inVoice: true, mic: false });
  await sleep(100);
  a.send({ t: 'rtc', to: b.id, data: { sdp: 'offer' } });
  const m = await b.wait('rtc');
  assert.equal(m.from, a.id);
  assert.deepEqual(m.data, { sdp: 'offer' });
  a.send({ t: 'rtc', to: c.id, data: { sdp: 'offer' } });
  assert.ok(await c.none('rtc', 300), 'c not in voice');
});

test('reconnect with token restores identity and replaces old socket', async () => {
  const a = await client('재접속');
  const again = new TestClient(srv.port);
  clients.push(again);
  await again.open();
  again.send({ t: 'hello', v: 4, token: a.token });
  const w = await again.wait('welcome');
  assert.equal(w.you.id, a.id);
  const e = await a.wait('error');
  assert.equal(e.code, 'replaced');
});

test('party chat only reaches party members', async () => {
  const a = await client('파티장');
  const b = await client('파티원');
  const c = await client('외부인');
  a.send({ t: 'req', kind: 'party', to: b.id });
  const req = await b.wait((m) => m.t === 'req' && m.kind === 'party');
  b.send({ t: 'resp', id: req.id, accept: true });
  await a.wait((m) => m.t === 'social' && m.party?.length === 2);
  a.send({ t: 'chat', ch: 'party', text: '청계천 가자', cid: 1 });
  await b.wait((m) => m.t === 'chat' && m.ch === 'party');
  assert.ok(await c.none((m) => m.t === 'chat' && m.ch === 'party', 400));
});

test('metrics endpoint', async () => {
  const res = await fetch(`http://localhost:${srv.port}/api/metrics`);
  const j = await res.json();
  assert.ok(j.online >= 1);
  assert.equal(j.rooms.length, 6);
});

test('1:1 snowball-gun duel: consent, shots relayed, victim-reported hits, KO ends duel', async () => {
  const a = await client('총잡이A');
  const b = await client('총잡이B');
  await walkTo(a, -12, 45); await walkTo(b, -4, 45);
  a.send({ t: 'req', kind: 'duel', to: b.id });
  const req = await b.wait((m) => m.t === 'req' && m.kind === 'duel');
  b.send({ t: 'resp', id: req.id, accept: true });
  const start = await a.wait('duel');
  assert.equal(start.a, a.id);
  assert.equal(start.hp[b.id], 100);
  await sleep(3100); // countdown
  // a shot from far away from the shooter's body is rejected
  a.send({ t: 'shot', sid: 'bad', o: [0, 1, 0], d: [1, 0, 0] });
  assert.ok(await b.none((m) => m.t === 'shot' && m.sid === 'bad', 300));
  // a hit reported without a matching shot is ignored
  b.send({ t: 'dhit', duel: start.id, sid: 'nope' });
  assert.ok(await a.none('dscore', 300));
  let end;
  for (let i = 0; i < 5; i++) {
    const sid = 's' + i;
    a.send({ t: 'shot', sid, o: [a.joined.pos.x, 1.3, a.joined.pos.z], d: [1, 0, 0] });
    await b.wait((m) => m.t === 'shot' && m.sid === sid);
    b.send({ t: 'dhit', duel: start.id, sid });
    const sc = await a.wait('dscore');
    assert.equal(sc.hp[b.id], 100 - 20 * (i + 1));
    await sleep(220);
  }
  end = await a.wait('duelEnd');
  assert.equal(end.winner, a.id);
  assert.equal(end.reason, 'ko');
});

test('duel ends with a win for the opponent when a player leaves', async () => {
  const a = await client('도망A');
  const b = await client('도망B');
  a.send({ t: 'req', kind: 'duel', to: b.id });
  const req = await b.wait((m) => m.t === 'req' && m.kind === 'duel');
  b.send({ t: 'resp', id: req.id, accept: true });
  await a.wait('duel');
  b.close();
  const end = await a.wait('duelEnd');
  assert.equal(end.winner, a.id);
  assert.equal(end.reason, 'left');
});
