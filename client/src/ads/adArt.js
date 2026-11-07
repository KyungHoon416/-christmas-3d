// Procedural Christmas test banners (Canvas 2D only, no external assets).
// Used for: TEST SLOT A/B/C art, the default "promo" banner shown when a slot is
// inactive/expired, and the generated client/public/test-assets/*.jpg files.

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function snowflake(g, x, y, r, a = 0.9) {
  g.save(); g.translate(x, y); g.strokeStyle = `rgba(255,248,235,${a})`; g.lineWidth = Math.max(1.5, r * 0.08); g.lineCap = 'round';
  g.shadowColor = 'rgba(255,230,190,0.9)'; g.shadowBlur = r * 0.4;
  for (let i = 0; i < 6; i++) {
    g.rotate(Math.PI / 3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r);
    g.moveTo(0, -r * 0.55); g.lineTo(-r * 0.22, -r * 0.75); g.moveTo(0, -r * 0.55); g.lineTo(r * 0.22, -r * 0.75);
    g.stroke();
  }
  g.restore();
}

function tree(g, x, y, h) {
  g.save();
  for (let k = 0; k < 4; k++) {
    const w = h * (0.42 - k * 0.08), yy = y - k * h * 0.22;
    g.fillStyle = k % 2 ? '#2d5a46' : '#244c3b';
    g.beginPath(); g.moveTo(x, yy - h * 0.38); g.lineTo(x - w, yy); g.lineTo(x + w, yy); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.moveTo(x, yy - h * 0.38); g.lineTo(x - w * 0.55, yy - h * 0.16); g.lineTo(x + w * 0.5, yy - h * 0.18); g.closePath(); g.fill();
  }
  g.fillStyle = '#ffe9a8'; g.shadowColor = '#ffd27a'; g.shadowBlur = 18;
  g.beginPath(); g.arc(x, y - h * 1.0, h * 0.05, 0, Math.PI * 2); g.fill();
  g.restore();
}

function deer(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = 'rgba(255,240,215,0.95)'; g.fillStyle = 'rgba(255,240,215,0.25)'; g.lineWidth = 2.2;
  g.shadowColor = '#ffd9a0'; g.shadowBlur = 10;
  g.beginPath(); g.ellipse(0, 0, 34, 15, 0, 0, Math.PI * 2); g.fill(); g.stroke(); // body
  for (const lx of [-24, -12, 14, 26]) { g.beginPath(); g.moveTo(lx, 10); g.lineTo(lx + (lx > 0 ? 2 : -2), 48); g.stroke(); }
  g.beginPath(); g.moveTo(28, -6); g.lineTo(40, -38); g.stroke(); // neck
  g.beginPath(); g.ellipse(46, -42, 10, 6, -0.3, 0, Math.PI * 2); g.fill(); g.stroke(); // head
  g.beginPath(); g.moveTo(42, -48); g.lineTo(34, -72); g.moveTo(37, -62); g.lineTo(26, -70); g.moveTo(46, -48); g.lineTo(54, -74); g.moveTo(51, -64); g.lineTo(62, -70); g.stroke();
  g.restore();
}

function gift(g, x, y, w, col) {
  g.save(); g.shadowColor = 'rgba(255,220,160,0.8)'; g.shadowBlur = 12;
  g.fillStyle = col; g.fillRect(x - w / 2, y - w, w, w);
  g.fillStyle = '#f3d58a'; g.fillRect(x - w * 0.07, y - w, w * 0.14, w); g.fillRect(x - w / 2, y - w * 0.58, w, w * 0.14);
  g.beginPath(); g.ellipse(x - w * 0.15, y - w * 1.05, w * 0.16, w * 0.1, -0.4, 0, Math.PI * 2); g.ellipse(x + w * 0.15, y - w * 1.05, w * 0.16, w * 0.1, 0.4, 0, Math.PI * 2); g.fill();
  g.restore();
}

function snowGround(g, w, h, y0) {
  const gr = g.createLinearGradient(0, y0, 0, h); gr.addColorStop(0, '#f4f2fb'); gr.addColorStop(1, '#cfcbe6');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, h);
  g.lineTo(0, y0 + h * 0.05);
  g.bezierCurveTo(w * 0.25, y0 - h * 0.06, w * 0.55, y0 + h * 0.08, w, y0 - h * 0.02);
  g.lineTo(w, h); g.closePath(); g.fill();
}

function sky(g, w, h, top, bottom, seed) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rnd(seed);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 2.2, 0, Math.PI * 2); g.fill(); }
}

function texts(g, w, h, title, sub1, sub2, x = w / 2, y = h * 0.42, scale = 1) {
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(255,220,180,0.9)'; g.shadowBlur = 18 * scale;
  g.fillStyle = '#ffffff';
  g.font = `600 ${Math.round(h * 0.15 * scale)}px "Noto Sans KR", "Helvetica Neue", Arial, sans-serif`;
  g.fillText(title, x, y);
  g.shadowBlur = 6 * scale;
  g.font = `500 ${Math.round(h * 0.055 * scale)}px "Noto Sans KR", Arial, sans-serif`;
  const sub = `—   ${sub1.split('').join(' ')}   —`;
  g.fillText(sub, x, y + h * 0.15 * scale);
  g.font = `500 ${Math.round(h * 0.036 * scale)}px "Noto Sans KR", Arial, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(sub2.split('').join(' '), x, y + h * 0.25 * scale);
  g.restore();
}

// kind: 'A' | 'B' | 'C' | 'promo'
export function drawAdArt(g, w, h, kind = 'A', { title, line1 = 'AD TEST AREA', line2 = 'SAMPLE BANNER' } = {}) {
  if (kind === 'B') {
    sky(g, w, h, '#4b4f8f', '#a99bd6', 22);
    snowGround(g, w, h, h * 0.72);
    deer(g, w * 0.18, h * 0.7, h / 260);
    for (const [x, s] of [[w * 0.84, 0.3], [w * 0.9, 0.38], [w * 0.96, 0.26]]) tree(g, x, h * 0.86, h * s);
    snowflake(g, w * 0.9, h * 0.16, h * 0.09);
    texts(g, w, h, title || 'TEST SLOT B', line1, line2, w * 0.56, h * 0.33, 0.92);
  } else if (kind === 'C') {
    sky(g, w, h, '#5a4a8c', '#b48fc4', 33);
    snowGround(g, w, h, h * 0.8);
    gift(g, w * 0.84, h * 0.88, h * 0.22, '#f2efe8'); gift(g, w * 0.74, h * 0.9, h * 0.13, '#efe3cf');
    const r = rnd(5);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,214,150,${0.4 + r() * 0.5})`; g.beginPath(); g.arc(w * (0.05 + r() * 0.4), h * (0.6 + r() * 0.25), 2 + r() * 5, 0, Math.PI * 2); g.fill(); }
    snowflake(g, w * 0.1, h * 0.2, h * 0.08);
    texts(g, w, h, title || 'TEST SLOT C', line1, line2, w * 0.5, h * 0.3, 0.92);
  } else if (kind === 'promo') {
    sky(g, w, h, '#1d2150', '#7a4b86', 77);
    snowGround(g, w, h, h * 0.78);
    tree(g, w * 0.14, h * 0.86, h * 0.55); tree(g, w * 0.86, h * 0.88, h * 0.45);
    snowflake(g, w * 0.3, h * 0.18, h * 0.07); snowflake(g, w * 0.72, h * 0.14, h * 0.06);
    texts(g, w, h, title || 'MERRY CHRISTMAS', 'CHRISTMAS WORLD SEOUL', 'SEOUL WINTER FESTIVAL', w / 2, h * 0.4, 0.8);
  } else {
    sky(g, w, h, '#5b5aa6', '#c4b4e2', 11);
    // light wave
    g.save(); g.strokeStyle = 'rgba(255,240,220,0.55)'; g.lineWidth = 2; g.shadowColor = '#fff1d6'; g.shadowBlur = 12;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(w * 0.35, h * (0.86 - k * 0.012)); g.bezierCurveTo(w * 0.6, h * (0.8 - k * 0.02), w * 0.75, h * (0.55 + k * 0.02), w, h * (0.6 - k * 0.03)); g.stroke(); }
    g.restore();
    snowGround(g, w, h, h * 0.8);
    tree(g, w * 0.13, h * 0.92, h * 0.48); tree(g, w * 0.27, h * 0.9, h * 0.28); tree(g, w * 0.34, h * 0.9, h * 0.2);
    snowflake(g, w * 0.09, h * 0.16, h * 0.08); snowflake(g, w * 0.9, h * 0.22, h * 0.07);
    texts(g, w, h, title || 'TEST SLOT A', line1, line2, w / 2, h * 0.38, 1);
  }
}

export function adArtCanvas(kind, w, h, opts) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  drawAdArt(c.getContext('2d'), w, h, kind, opts);
  return c;
}
