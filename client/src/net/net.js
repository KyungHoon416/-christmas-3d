// WebSocket client with automatic reconnect (exponential backoff) and token resume.
import { PROTOCOL_VERSION } from '../../../shared/constants.js';

export class Net {
  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.queue = [];
    this.state = 'idle'; // idle | connecting | open | closed
    this.retry = 0;
    this.rtt = 0;
    this.helloPayload = null;
    this.manualClose = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) || []) fn(msg);
    for (const fn of this.handlers.get('*') || []) fn(msg);
  }

  connect(hello) {
    this.helloPayload = hello;
    this.manualClose = false;
    this.open();
  }

  open() {
    this.state = 'connecting';
    this.emit('status', { t: 'status', state: 'connecting', retry: this.retry });
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'open';
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, ...this.helloPayload() }));
      this.emit('status', { t: 'status', state: 'open' });
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 5000);
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'pong') { this.rtt = Math.round(performance.now() - m.c); this.emit('rtt', { rtt: this.rtt }); return; }
      if (m.t === 'welcome') { for (const q of this.queue.splice(0)) this.send(q); }
      this.emit(m.t, m);
    };
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      this.state = 'closed';
      if (this.manualClose || ev.code === 4000) { this.emit('status', { t: 'status', state: 'closed', final: true, code: ev.code }); return; }
      const delay = Math.min(15000, 500 * 2 ** this.retry++) * (0.8 + Math.random() * 0.4);
      this.emit('status', { t: 'status', state: 'reconnecting', in: Math.round(delay) });
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => {};
  }

  send(msg) {
    if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(msg)); return true; }
    if (msg.t !== 'pose' && msg.t !== 'ping' && msg.t !== 'rtc') this.queue.push(msg);
    return false;
  }

  close() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
