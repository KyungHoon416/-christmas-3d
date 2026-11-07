// Ad slot data source.
// - Firebase build: live subscription to RTDB /ads/slots + /ads/images (public read),
//   stats as daily counters in /adStats/{slotId}/{event}/{yyyymmdd} (+1 only, see rules).
// - Other builds (Claude artifact, local server): DEFAULT_SLOTS, stats kept in memory.
import { getApps } from 'firebase/app';
import { getDatabase, ref, onValue, runTransaction } from 'firebase/database';
import { DEFAULT_SLOTS, AD_EVENTS } from '../../../shared/ads.js';

const day = (t = new Date()) => `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;

export class AdService {
  constructor({ firebase = false } = {}) {
    this.dbSlots = null;
    this.images = {};
    this.locations = {}; // locationId -> { isActive }
    this.source = 'default';
    this.listeners = new Set();
    this.local = {}; // event counters for this session (also used for QA)
    this.version = 0;
    if (firebase) this.attachFirebase();
    // re-evaluate schedules (start/end dates) periodically
    this.timer = setInterval(() => this.emit(), 30000);
  }

  get slots() { return { ...DEFAULT_SLOTS, ...(this.dbSlots || {}) }; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version++; for (const fn of this.listeners) fn(this.slots, this.images); }

  async attachFirebase() {
    // the game creates the Firebase app (with emulator settings) — wait for it
    for (let i = 0; i < 240 && !getApps().length; i++) await new Promise((r) => setTimeout(r, 500));
    const app = getApps()[0];
    if (!app) { this.error = 'firebase app not available'; return; }
    this.db = getDatabase(app);
    onValue(ref(this.db, 'ads/slots'), (snap) => {
      const v = snap.val();
      this.dbSlots = v && typeof v === 'object' ? v : null;
      this.source = this.dbSlots ? 'firebase' : 'default (firebase empty)';
      this.emit();
    }, (e) => { this.error = e.message; });
    onValue(ref(this.db, 'ads/locations'), (snap) => { this.locations = snap.val() || {}; this.emit(); }, () => {});
    onValue(ref(this.db, 'ads/images'), (snap) => { this.images = snap.val() || {}; this.emit(); }, () => {});
  }

  // Analytics: never called automatically for clicks — only from explicit user actions.
  log(event, { slotId, locationId, region, device } = {}) {
    if (!AD_EVENTS.includes(event) || !slotId) return;
    const k = `${slotId}:${event}`;
    this.local[k] = (this.local[k] || 0) + 1;
    window.dispatchEvent(new CustomEvent('cw-ad', { detail: { event, slotId, locationId, region, device, t: Date.now() } }));
    if (this.db && /^[a-z0-9-]{1,40}$/.test(slotId)) {
      runTransaction(ref(this.db, `adStats/${slotId}/${event}/${day()}`), (v) => (v || 0) + 1).catch(() => {});
    }
  }
}
