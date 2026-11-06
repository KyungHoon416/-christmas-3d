// Shared constants used by both the browser client and the Node server.
// UNIT: 1 world unit = 1 metre of in-game space.
// Real-world distances are compressed per region (see shared/regions.js `scale`),
// but all gameplay rules (movement speed, voice range, chat range) use world metres.

export const PROTOCOL_VERSION = 4;

export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 3.2; // m/s
export const RUN_SPEED = 6.5; // m/s
export const JUMP_VELOCITY = 5.2;
export const GRAVITY = 14;
// Server tolerance on top of RUN_SPEED (network jitter, frame bunching).
export const MAX_SPEED_TOLERANCE = 1.6;

export const NET_SEND_HZ = 15; // client -> server pose updates
export const NET_TICK_HZ = 12; // server -> client snapshots
export const DETAIL_RADIUS = 45; // players beyond this are sent every FAR_EVERY ticks
export const FAR_EVERY = 4;

// Proximity voice (world metres)
export const VOICE_FULL = 3; // 0~3m: full volume
export const VOICE_FADE_END = 10; // 3~10m: attenuation, >10m muted
export const VOICE_CONNECT = 18; // open a peer connection under this distance
export const VOICE_DISCONNECT = 26; // close it above this distance (hysteresis)

export const NEARBY_CHAT_RADIUS = 20;
export const INTERACT_RADIUS = 4; // hand-hold / hug request range
export const HOLD_MAX_DISTANCE = 6; // hand-hold auto-release distance
export const HOLD_SIDE_OFFSET = 0.75;

export const CHAT_MAX_LEN = 200;

// 1:1 snowball-gun duel
export const DUEL = {
  hp: 100, damage: 20, seconds: 120, countdown: 3,
  range: 40, // max distance to challenge (m)
  shotSpeed: 34, shotGravity: 4, shotLife: 1.3, hitRadius: 0.55,
  mag: 6, reload: 1.4, fireInterval: 0.28, maxShotsPerSec: 5,
};
export const CHAT_RATE = { burst: 6, perSec: 1.5 };
export const NICK_RE = /^[\p{L}\p{N}_\-♡☆♥ ]{2,12}$/u;

export const CHANNELS = ['all', 'region', 'nearby', 'whisper', 'party'];
export const EMOTES = ['wave', 'heart', 'dance', 'cheer', 'bow', 'sit'];
export const CONSENT_ACTIONS = ['holdHand', 'hug'];

export const APPEARANCE_DEFAULT = {
  coat: '#f1e6d8',
  scarf: '#c0182f',
  hair: '#3b2418',
  hat: 'earmuff', // earmuff | beanie | santa | none
  skin: '#f2d2bd',
  pants: '#2b2b38',
};
export const APPEARANCE_OPTIONS = {
  coat: ['#f1e6d8', '#2f2f3a', '#7a1f2b', '#3c4f74', '#6b5243', '#e7c6cf', '#1f4b3f'],
  scarf: ['#c0182f', '#f4f1ea', '#1e5a3c', '#d77fa1', '#e0b04a', '#2c3e8f'],
  hair: ['#3b2418', '#141010', '#8a5a2b', '#c9a26b', '#6e2a2a'],
  hat: ['earmuff', 'beanie', 'santa', 'none'],
  skin: ['#f2d2bd', '#e5b896', '#c98e6a', '#8d5a3f'],
  pants: ['#2b2b38', '#4a3b30', '#1d2433', '#5a5a64'],
};

export function voiceGain(distance) {
  if (distance <= VOICE_FULL) return 1;
  if (distance >= VOICE_FADE_END) return 0;
  const t = (distance - VOICE_FULL) / (VOICE_FADE_END - VOICE_FULL);
  // Smooth (inverse-square-ish) curve rather than a hard linear ramp.
  return Math.pow(1 - t, 2);
}

export function sanitizeAppearance(a) {
  const out = { ...APPEARANCE_DEFAULT };
  if (!a || typeof a !== 'object') return out;
  for (const k of Object.keys(APPEARANCE_OPTIONS)) {
    if (APPEARANCE_OPTIONS[k].includes(a[k])) out[k] = a[k];
  }
  return out;
}
