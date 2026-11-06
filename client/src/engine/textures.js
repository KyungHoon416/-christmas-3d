// Procedural canvas textures (no external image assets needed).
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/regions.js';

const cache = new Map();
let maxAniso = 4;
export function setAnisotropy(a) { maxAniso = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  return t;
}

function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function noise(ctx, w, h, amt, rng, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- facades
// Each facade texture covers BAYS x FLOORS window cells. Returns { map, emissive }.
export const FACADE = { bays: 8, floors: 8, bayW: 3.2, floorH: 3.6 };

const FACADE_STYLES = {
  glass: { wall: '#1b2638', frame: '#3a4a63', glassA: '#22324a', glassB: '#2c3f5e', lit: ['#ffe2a8', '#d9ecff', '#fff3d6'], litP: 0.42, win: [0.04, 0.06, 0.96, 0.9] },
  office: { wall: '#8a8b90', frame: '#5c5f66', glassA: '#1e2533', glassB: '#2a3141', lit: ['#ffd89a', '#fff0c8'], litP: 0.38, win: [0.18, 0.2, 0.82, 0.78] },
  stone: { wall: '#b7a588', frame: '#8b7a60', glassA: '#211c1d', glassB: '#2e2627', lit: ['#ffcf86', '#ffe0a8'], litP: 0.45, win: [0.28, 0.22, 0.72, 0.8], arch: true },
  brick: { wall: '#7d4434', frame: '#5a2f24', glassA: '#1f1b1d', glassB: '#2b2426', lit: ['#ffc77a', '#ffdca0'], litP: 0.5, win: [0.22, 0.25, 0.78, 0.78], brick: true },
  modern: { wall: '#2e2c33', frame: '#4b4853', glassA: '#1a1d26', glassB: '#232838', lit: ['#bfe1ff', '#ffe6b8', '#ffd6e8'], litP: 0.4, win: [0.02, 0.3, 0.98, 0.85] },
  shop: { wall: '#d8cfc2', frame: '#a99d8c', glassA: '#1f2026', glassB: '#2b2c33', lit: ['#ffd99c', '#ffeec9', '#ffc4d8'], litP: 0.55, win: [0.2, 0.25, 0.8, 0.8] },
};

export function facadeTextures(style, variant = 0) {
  return memo(`facade:${style}:${variant}`, () => {
    const S = FACADE_STYLES[style] || FACADE_STYLES.office;
    const W = 512, H = 512, cw = W / FACADE.bays, ch = H / FACADE.floors;
    const [c, g] = canvas(W, H);
    const [e, ge] = canvas(W, H);
    const rng = mulberry32(9000 + variant * 31 + style.length * 7);
    g.fillStyle = S.wall; g.fillRect(0, 0, W, H);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    if (S.brick) {
      for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 7; x < W; x += 14) {
        g.fillStyle = `rgba(${90 + rng() * 40},${45 + rng() * 20},${35 + rng() * 15},0.55)`;
        g.fillRect(x, y, 13, 5);
      }
    }
    noise(g, W, H, 22, rng);
    for (let fy = 0; fy < FACADE.floors; fy++) {
      // floor slab line
      g.fillStyle = S.frame; g.fillRect(0, fy * ch, W, 3);
      for (let bx = 0; bx < FACADE.bays; bx++) {
        const [x0, y0, x1, y1] = S.win;
        const x = bx * cw + x0 * cw, y = fy * ch + (1 - y1) * ch, w = (x1 - x0) * cw, h = (y1 - y0) * ch;
        const lit = rng() < S.litP;
        g.fillStyle = rng() < 0.5 ? S.glassA : S.glassB;
        if (S.arch) {
          g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill();
        } else g.fillRect(x, y, w, h);
        g.strokeStyle = S.frame; g.lineWidth = 2; g.strokeRect(x, y, w, h);
        if (style === 'glass') { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, y, w * 0.4, h); }
        if (lit) {
          const col = S.lit[Math.floor(rng() * S.lit.length)];
          const b = 0.55 + rng() * 0.45;
          ge.globalAlpha = b; ge.fillStyle = col;
          if (S.arch) { ge.beginPath(); ge.moveTo(x, y + h); ge.lineTo(x, y + w / 2); ge.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ge.lineTo(x + w, y + h); ge.fill(); } else ge.fillRect(x + 1, y + 1, w - 2, h - 2);
          // curtains / blinds variation
          if (rng() < 0.4) { ge.globalAlpha = 0.35; ge.fillStyle = '#000'; ge.fillRect(x, y, w, h * (0.2 + rng() * 0.5)); }
          ge.globalAlpha = 1;
          g.fillStyle = col; g.globalAlpha = 0.35; g.fillRect(x, y, w, h); g.globalAlpha = 1;
        }
      }
    }
    if (style === 'glass' || style === 'modern') {
      // vertical mullions
      g.fillStyle = S.frame;
      for (let bx = 0; bx <= FACADE.bays; bx++) g.fillRect(bx * cw - 1, 0, 2, H);
    }
    return { map: tex(c), emissive: tex(e) };
  });
}

// ---------------------------------------------------------------- ground
export function snowTexture() {
  return memo('snow', () => {
    const [c, g] = canvas(512, 512);
    const rng = mulberry32(77);
    g.fillStyle = '#e9eef7'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * 512, y = rng() * 512, r = 2 + rng() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const v = rng() < 0.5 ? '210,220,238' : '250,252,255';
      grd.addColorStop(0, `rgba(${v},0.25)`); grd.addColorStop(1, `rgba(${v},0)`);
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    noise(g, 512, 512, 14, rng);
    return tex(c);
  });
}

export function pavingTexture(kind = 'stone') {
  return memo('pave:' + kind, () => {
    const [c, g] = canvas(512, 512);
    const rng = mulberry32(kind.length * 13);
    const base = kind === 'road' ? '#2a2b31' : kind === 'wood' ? '#5b4636' : '#7d7a7e';
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    if (kind === 'stone') {
      for (let y = 0; y < 512; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < 512; x += 64) {
        const v = 100 + rng() * 40;
        g.fillStyle = `rgb(${v},${v - 3},${v + 2})`; g.fillRect(x + 1, y + 1, 62, 30);
      }
    } else if (kind === 'road') {
      noise(g, 512, 512, 30, rng);
      // tyre tracks
      g.fillStyle = 'rgba(20,20,26,0.6)';
      g.fillRect(120, 0, 40, 512); g.fillRect(350, 0, 40, 512);
    } else if (kind === 'wood') {
      for (let y = 0; y < 512; y += 24) { g.fillStyle = `rgb(${80 + rng() * 30},${60 + rng() * 20},${45 + rng() * 10})`; g.fillRect(0, y + 1, 512, 22); }
    }
    // snow dusting (more in the joints, tyre tracks stay darker)
    for (let i = 0; i < 9000; i++) {
      const x = rng() * 512, y = rng() * 512;
      if (kind === 'road' && ((x > 115 && x < 165) || (x > 345 && x < 395)) && rng() < 0.85) continue;
      g.fillStyle = `rgba(235,240,250,${0.25 + rng() * 0.5})`;
      g.fillRect(x, y, 1 + rng() * 3, 1 + rng() * 3);
    }
    noise(g, 512, 512, 18, rng);
    return tex(c);
  });
}

export function roofTileTexture() {
  return memo('rooftile', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      const grd = g.createLinearGradient(x, 0, x + 16, 0);
      grd.addColorStop(0, '#23262c'); grd.addColorStop(0.5, '#4a4f58'); grd.addColorStop(1, '#23262c');
      g.fillStyle = grd; g.fillRect(x, 0, 16, 256);
    }
    // snow on tiles
    const rng = mulberry32(5);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(240,244,252,${0.4 + rng() * 0.5})`; g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 5, 1 + rng() * 3); }
    return tex(c);
  });
}

export function dancheongTexture() {
  return memo('dancheong', () => {
    const [c, g] = canvas(256, 64);
    g.fillStyle = '#1f6b5a'; g.fillRect(0, 0, 256, 64);
    const cols = ['#c23b2c', '#e8c36a', '#2c5aa0', '#f1efe6', '#1f6b5a'];
    for (let x = 0; x < 256; x += 32) {
      for (let i = 0; i < cols.length; i++) {
        g.fillStyle = cols[i];
        g.beginPath(); g.arc(x + 16, 32, 14 - i * 2.6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#c23b2c'; g.fillRect(x, 0, 32, 6); g.fillRect(x, 58, 32, 6);
    }
    return tex(c);
  });
}

export function signTexture(text, { bg = '#1a1020', fg = '#ff9ad5', w = 512, h = 128, glow = true, vertical = false } = {}) {
  return memo(`sign:${text}:${bg}:${fg}:${w}:${h}:${vertical}`, () => {
    const [c, g] = canvas(w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    if (glow) { g.shadowColor = fg; g.shadowBlur = 18; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) {
      const chars = [...text];
      const fs = Math.min(w * 0.7, (h - 30) / chars.length);
      g.font = `bold ${fs}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
      chars.forEach((ch, i) => g.fillText(ch, w / 2, 20 + fs / 2 + i * fs));
    } else {
      let fs = h * 0.55;
      g.font = `bold ${fs}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
      while (g.measureText(text).width > w * 0.88 && fs > 10) { fs -= 2; g.font = `bold ${fs}px "Noto Sans KR", sans-serif`; }
      g.fillText(text, w / 2, h / 2 + 2);
    }
    const t = tex(c, { repeat: false });
    return t;
  });
}

export function radialTexture(inner = 'rgba(255,220,170,1)', outer = 'rgba(255,200,150,0)', size = 128) {
  return memo(`radial:${inner}:${outer}`, () => {
    const [c, g] = canvas(size, size);
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)')); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return tex(c, { repeat: false });
  });
}

export function footprintTexture() {
  return memo('foot', () => {
    const [c, g] = canvas(64, 128);
    g.clearRect(0, 0, 64, 128);
    const shoe = (x, y) => {
      g.fillStyle = 'rgba(120,135,165,0.55)';
      g.beginPath(); g.ellipse(x, y, 9, 18, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x, y + 26, 7, 9, 0, 0, Math.PI * 2); g.fill();
    };
    shoe(32, 40);
    return tex(c, { repeat: false });
  });
}

export function stoneWallTexture() {
  return memo('stonewall', () => {
    const [c, g] = canvas(256, 256);
    const rng = mulberry32(31);
    g.fillStyle = '#6f6a63'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 28) for (let x = (y / 28) % 2 ? -20 : 0; x < 256; x += 44) {
      const v = 120 + rng() * 50;
      g.fillStyle = `rgb(${v},${v - 6},${v - 12})`; g.fillRect(x + 2, y + 2, 40, 24);
    }
    noise(g, 256, 256, 26, rng);
    return tex(c);
  });
}

export function panelTexture() {
  return memo('panel', () => {
    const [c, g] = canvas(256, 256);
    const rng = mulberry32(12);
    for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 32) {
      const v = 150 + rng() * 40;
      g.fillStyle = `rgb(${v},${v + 3},${v + 8})`; g.fillRect(x, y, 32, 16);
      g.strokeStyle = 'rgba(40,40,50,0.6)'; g.strokeRect(x + 0.5, y + 0.5, 31, 15);
    }
    return tex(c);
  });
}
