// Firebase Realtime Database adapter that offers the same small "room" interface the
// artifact `room` capability has (presence + onPeers), plus a WebRTC signalling mailbox.
// RoomNet runs on top of it unchanged, so the deployed site has the same multiplayer
// as the artifact, and voice chat works because Firebase Hosting is HTTPS.
//
// Database layout (see database.rules.json — each player may only write their own uid):
//   rooms/main/peers/{uid}  presence: nickname, look, region, flags, outbox
//   rooms/main/pose/{uid}   x, y, z, ry, a  (high-rate, kept separate to save bandwidth)
//   rooms/main/rtc/{toUid}/{pushId}  { from, data(JSON), ts }  signalling mailbox
import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import {
  getDatabase, ref, update, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, push, remove,
  serverTimestamp, connectDatabaseEmulator, onValue,
} from 'firebase/database';

const POSE_KEYS = new Set(['x', 'y', 'z', 'ry', 'a']);
const BASE = 'rooms/main';

export async function loadFirebaseConfig() {
  // Firebase Hosting serves the project's web config here automatically.
  const params = new URLSearchParams(location.search);
  if (window.CW_FIREBASE_CONFIG) return window.CW_FIREBASE_CONFIG;
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error('firebase config unavailable');
  const cfg = await res.json();
  if (!cfg.databaseURL) cfg.databaseURL = `https://${cfg.projectId}-default-rtdb.${params.get('dbregion') || 'asia-southeast1'}.firebasedatabase.app`;
  return cfg;
}

export async function createFirebaseRoom(config, { emulator = null } = {}) {
  const app = initializeApp(config);
  // in-memory auth: every tab is its own player (and gets its own uid)
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getDatabase(app);
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.auth}`, { disableWarnings: true });
    const [h, p] = emulator.db.split(':');
    connectDatabaseEmulator(db, h, +p);
  }
  const cred = await signInAnonymously(auth);
  const me = cred.user.uid;

  const meta = new Map(); // uid -> presence (non-pose)
  const pose = new Map(); // uid -> pose
  const listeners = new Set();
  const frozen = new Map();
  let connected = false;

  const peerObj = (uid) => Object.freeze({ peer: uid, by: uid, isMe: uid === me, sameTab: uid === me, kind: 'viewer', guest: false, presence: Object.freeze({ ...(meta.get(uid) || {}), ...(pose.get(uid) || {}) }), updatedAt: Date.now() });
  const all = () => [...meta.keys()].map((u) => frozen.get(u) || peerObj(u));
  const fire = (joined, updated, left) => {
    const peers = all();
    for (const fn of listeners) fn({ peers, joined, updated, left });
  };
  const touch = (uid, kind) => {
    const p = peerObj(uid);
    frozen.set(uid, p);
    fire(kind === 'joined' ? [p] : [], kind === 'updated' ? [p] : [], []);
  };

  const peersRef = ref(db, `${BASE}/peers`);
  const poseRef = ref(db, `${BASE}/pose`);
  onChildAdded(peersRef, (s) => { meta.set(s.key, s.val() || {}); touch(s.key, 'joined'); });
  onChildChanged(peersRef, (s) => { meta.set(s.key, s.val() || {}); touch(s.key, 'updated'); });
  onChildRemoved(peersRef, (s) => {
    const p = frozen.get(s.key) || peerObj(s.key);
    meta.delete(s.key); pose.delete(s.key); frozen.delete(s.key);
    fire([], [], [p]);
  });
  const onPose = (s) => { pose.set(s.key, s.val() || {}); if (meta.has(s.key)) touch(s.key, 'updated'); };
  onChildAdded(poseRef, onPose);
  onChildChanged(poseRef, onPose);
  onValue(ref(db, '.info/connected'), (s) => { connected = !!s.val(); });

  // leave cleanly when the tab closes or the connection drops
  const myPeer = ref(db, `${BASE}/peers/${me}`);
  const myPose = ref(db, `${BASE}/pose/${me}`);
  const myBox = ref(db, `${BASE}/rtc/${me}`);
  await Promise.all([onDisconnect(myPeer).remove(), onDisconnect(myPose).remove(), onDisconnect(myBox).remove()]);

  const rtcHandlers = new Set();
  onChildAdded(myBox, (s) => {
    const v = s.val();
    remove(s.ref).catch(() => {});
    if (!v || typeof v.from !== 'string') return;
    let data;
    try { data = JSON.parse(v.data); } catch { return; }
    for (const fn of rtcHandlers) fn(v.from, data);
  });

  let first = true;
  return Object.freeze({
    uid: me,
    presence(patch) {
      const p = {}, m = {};
      for (const [k, v] of Object.entries(patch)) (POSE_KEYS.has(k) ? p : m)[k] = v === undefined ? null : v;
      const jobs = [];
      if (first || Object.keys(m).length) { if (first) m.ts = serverTimestamp(); first = false; jobs.push(update(myPeer, m)); }
      if (Object.keys(p).length) jobs.push(update(myPose, p));
      return Promise.all(jobs).then(() => {});
    },
    onPeers(fn) {
      listeners.add(fn);
      setTimeout(() => fn({ peers: all(), joined: all(), updated: [], left: [] }), 0);
      return () => listeners.delete(fn);
    },
    peers: all,
    connected: () => connected,
    sendRtc(to, data) {
      return push(ref(db, `${BASE}/rtc/${to}`), { from: me, data: JSON.stringify(data), ts: serverTimestamp() });
    },
    onRtc(fn) { rtcHandlers.add(fn); return () => rtcHandlers.delete(fn); },
    // used by the E2E test to prove the security rules: writing someone else's node must fail
    debugWriteOther(uid) { return update(ref(db, `${BASE}/peers/${uid}`), { n: 'hacked' }).then(() => 'allowed', () => 'denied'); },
  });
}
