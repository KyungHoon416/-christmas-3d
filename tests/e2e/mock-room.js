// Test double for the Claude artifact `room` capability (presence arm only), shared
// between pages of one browser context through BroadcastChannel. Injected with
// page.addInitScript by tests/e2e/room-e2e.mjs.
(() => {
  const label = Math.random().toString(36).slice(2, 12);
  const bc = new BroadcastChannel('cw-mock-room');
  const peers = new Map();
  let mine = {};
  const listeners = [];
  const mk = (peer, presence) => Object.freeze({ peer, by: null, isMe: peer === label, sameTab: peer === label, kind: 'viewer', guest: false, presence: Object.freeze({ ...presence }), updatedAt: Date.now() });
  const fire = (joined, updated, left) => {
    const list = Object.freeze([...peers.values()]);
    for (const fn of listeners) fn({ peers: list, joined, updated, left });
  };
  peers.set(label, mk(label, {}));
  bc.onmessage = (e) => {
    const m = e.data;
    if (m.label === label) return;
    if (m.bye) { const p = peers.get(m.label); if (p) { peers.delete(m.label); fire([], [], [p]); } return; }
    if (m.hello) bc.postMessage({ label, presence: mine });
    if (!m.presence) return;
    const had = peers.has(m.label);
    const p = mk(m.label, m.presence);
    peers.set(m.label, p);
    fire(had ? [] : [p], had ? [p] : [], []);
  };
  addEventListener('pagehide', () => bc.postMessage({ label, bye: true }));
  setInterval(() => bc.postMessage({ label, presence: mine }), 1000);
  const room = Object.freeze({
    presence(patch) {
      for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
      if (JSON.stringify(mine).length > 4096) return Promise.reject({ code: 'invalid_argument', message: 'too big' });
      const p = mk(label, mine);
      peers.set(label, p);
      bc.postMessage({ label, presence: mine });
      fire([], [p], []);
      return Promise.resolve();
    },
    onPeers(fn) { listeners.push(fn); setTimeout(() => fn({ peers: [...peers.values()], joined: [...peers.values()], updated: [], left: [] }), 0); return () => {}; },
    peers: () => [...peers.values()],
    connected: () => true,
  });
  bc.postMessage({ label, hello: true });
  window.claude = Object.freeze({ use: async (name) => (name === 'room' ? room : null) });
})();
