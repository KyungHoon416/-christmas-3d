// Browser stand-in for the few `node:crypto` calls server/game.js makes,
// so the real game server can run in-page for the offline demo build.
function bytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return {
    toString(enc) {
      if (enc === 'hex') return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
      let s = '';
      for (const b of a) s += String.fromCharCode(b);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
  };
}
export default { randomBytes: bytes };
export const randomBytes = bytes;
