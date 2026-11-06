import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../shared/constants.js';

export class TestClient {
  constructor(port) {
    this.port = port;
    this.inbox = [];
    this.waiters = [];
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}/ws`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        this.inbox.push(m);
        for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
      });
    });
  }

  send(m) { this.ws.send(JSON.stringify(m)); }

  wait(pred, ms = 2000) {
    if (typeof pred === 'string') { const t = pred; pred = (m) => m.t === t; }
    const found = this.inbox.find(pred);
    if (found) { this.inbox.splice(this.inbox.indexOf(found), 1); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve: (m) => { clearTimeout(timer); this.inbox.splice(this.inbox.indexOf(m), 1); resolve(m); } };
      const timer = setTimeout(() => { this.waiters.splice(this.waiters.indexOf(w), 1); reject(new Error('timeout waiting')); }, ms);
      this.waiters.push(w);
    });
  }

  // resolves true if no matching message arrives within ms
  async none(pred, ms = 400) {
    try { await this.wait(pred, ms); return false; } catch { return true; }
  }

  async login(nick, extra = {}) {
    await this.open();
    this.send({ t: 'hello', v: PROTOCOL_VERSION, nick, adult: true, ...extra });
    this.welcome = await this.wait('welcome');
    this.id = this.welcome.you.id;
    this.token = this.welcome.token;
    this.joined = await this.wait('joined');
    return this;
  }

  close() { this.ws?.close(); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
