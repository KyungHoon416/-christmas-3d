// Minimal JSON-file persistence. Good enough for a single server instance;
// swap for a real database (see docs/ARCHITECTURE.md) before horizontal scaling.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { users: {}, reports: [] };
    this.timer = null;
    if (file && fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('[db] corrupt db, starting fresh', e.message); }
    }
    this.data.users ||= {};
    this.data.reports ||= [];
  }

  static hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

  save() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  createUser({ nick, adult, appearance }) {
    const id = 'u_' + crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(24).toString('base64url');
    const user = {
      id, nick, adult: !!adult, appearance, tokenHash: Store.hash(token),
      friends: [], incoming: [], blocked: [], couple: null, shareLocation: false,
      lastRegion: null, lastPos: null, created: Date.now(),
    };
    this.data.users[id] = user;
    this.save();
    return { user, token };
  }

  byToken(token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const h = Store.hash(token);
    return Object.values(this.data.users).find((u) => u.tokenHash === h) || null;
  }

  byNick(nick) {
    const n = nick.toLowerCase();
    return Object.values(this.data.users).find((u) => u.nick.toLowerCase() === n) || null;
  }

  get(id) { return this.data.users[id] || null; }

  report(entry) { this.data.reports.push({ ...entry, ts: Date.now() }); this.save(); }
}
