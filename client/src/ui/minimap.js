// Canvas minimap (player-centred, north-up) and full region map renderer.
const ICON = { gate: '⛩', statue: '🗿', tree: '🎄', building: '🏛', market: '🛍', rink: '⛸', photo: '📸', light: '✨', bridge: '🌉', stone: '🪨', church: '⛪', subway: 'Ⓜ', shop: '🛍', flower: '🌹', tower: '🗼', heart: '💗' };

export function drawRegion(ctx, region, { cx, cz, scale, w, h, players = [], me = null, labels = false, friendIds = new Set(), coupleId = null }) {
  const X = (x) => w / 2 + (x - cx) * scale;
  const Z = (z) => h / 2 + (z - cz) * scale;
  ctx.fillStyle = '#121a33';
  ctx.fillRect(0, 0, w, h);
  // walkable area
  const b = region.bounds;
  ctx.fillStyle = '#26314f';
  if (b.circle) { ctx.beginPath(); ctx.arc(X(b.x), Z(b.z), b.r * scale, 0, Math.PI * 2); ctx.fill(); }
  else ctx.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  // special ground
  const g = region.ground;
  if (g) {
    ctx.fillStyle = '#39456a';
    ctx.fillRect(X(g.plaza.x - g.plaza.hw), Z(g.plaza.z - g.plaza.hd), g.plaza.hw * 2 * scale, g.plaza.hd * 2 * scale);
    ctx.fillStyle = '#1b2036';
    ctx.fillRect(X(g.road.x - g.road.hw), Z(g.road.z - g.road.hd), g.road.hw * 2 * scale, g.road.hd * 2 * scale);
  }
  if (region.id === 'cheonggyecheon') {
    ctx.fillStyle = '#2f3d5e'; ctx.fillRect(X(-70), Z(-8), 140 * scale, 16 * scale);
    ctx.fillStyle = '#2b6aa8'; ctx.fillRect(X(-70), Z(-2.5), 140 * scale, 5 * scale);
    ctx.fillStyle = '#5a6584';
    for (const br of region.bridges) ctx.fillRect(X(br.x - br.hw), Z(-9), br.hw * 2 * scale, 18 * scale);
  }
  for (const ice of region.ice || []) { ctx.fillStyle = '#7fb6e6'; ctx.fillRect(X(ice.x - ice.hw), Z(ice.z - ice.hd), ice.hw * 2 * scale, ice.hd * 2 * scale); }
  // colliders (buildings & structures)
  for (const c of region.colliders) {
    if (c.y1 !== undefined && c.y1 < 0) continue;
    if (c.t === 'circle' && c.r < 1) continue;
    ctx.fillStyle = c.t === 'circle' ? '#3d6b4f' : '#56607f';
    if (c.t === 'box') {
      ctx.save(); ctx.translate(X(c.x), Z(c.z)); ctx.rotate(-(c.rot || 0));
      ctx.fillRect(-c.hw * scale, -c.hd * scale, c.hw * 2 * scale, c.hd * 2 * scale);
      ctx.restore();
    } else if (c.t === 'circle') { ctx.beginPath(); ctx.arc(X(c.x), Z(c.z), c.r * scale, 0, Math.PI * 2); ctx.fill(); }
    else if (c.t === 'ellipse') { ctx.fillStyle = '#8b93ad'; ctx.beginPath(); ctx.ellipse(X(c.x), Z(c.z), c.rx * scale, c.rz * scale, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // landmarks
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const m of region.map) {
    const px = X(m.x), pz = Z(m.z);
    if (px < -20 || pz < -20 || px > w + 20 || pz > h + 20) continue;
    ctx.font = `${labels ? 18 : 12}px sans-serif`;
    ctx.fillText(ICON[m.icon] || '•', px, pz);
    if (labels) { ctx.font = 'bold 12px "Noto Sans KR", sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(m.label, px, pz + 16); }
  }
  // players
  for (const p of players) {
    const isF = friendIds.has(p.id), isC = p.id === coupleId;
    ctx.fillStyle = isC ? '#ff5fa2' : isF ? '#57e39a' : 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(X(p.pos.x), Z(p.pos.z), isF || isC ? 3.6 : 2.4, 0, Math.PI * 2); ctx.fill();
    if (labels && (isF || isC)) { ctx.font = '11px sans-serif'; ctx.fillText(p.nick, X(p.pos.x), Z(p.pos.z) - 10); }
  }
  if (me) {
    ctx.save();
    ctx.translate(X(me.x), Z(me.z));
    // ry: 0 faces +Z (south on the map) -> canvas rotation
    ctx.rotate(-me.ry + Math.PI);
    ctx.fillStyle = '#ff5fa2';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

export class Minimap {
  constructor(canvas, world, app) {
    this.canvas = canvas;
    this.world = world;
    this.app = app;
    this.zoom = 1.6;
    this.ctx = canvas.getContext('2d');
    this.acc = 0;
  }

  setZoom(d) { this.zoom = Math.max(0.6, Math.min(4, this.zoom * (d > 0 ? 1.25 : 0.8))); }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.1 || !this.world.region || !this.world.me) return;
    this.acc = 0;
    const c = this.canvas, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth * dpr, h = c.clientHeight * dpr;
    if (c.width !== w) { c.width = w; c.height = h; }
    const me = this.world.me;
    drawRegion(this.ctx, this.world.region, {
      cx: me.pos.x, cz: me.pos.z, scale: this.zoom * dpr, w, h,
      players: [...this.world.remotes.values()], me: { x: me.pos.x, z: me.pos.z, ry: me.ry },
      friendIds: this.app.friendIds(), coupleId: this.app.self?.couple?.with,
    });
  }
}
