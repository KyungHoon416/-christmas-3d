// Procedural city buildings with varied silhouettes (setbacks, crowns, rooftop
// equipment, storefronts) — footprints come from shared/regions.js.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/regions.js';
import { tiledPlane, matrix } from './batch.js';
import { FACADE } from './textures.js';
import { facadeMat, mats } from './materials.js';
import { signTexture } from './textures.js';

const SPECIAL = new Set(['sejong', 'cityhall', 'oldcityhall', 'cathedral']);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function facadeSides(batch, mat, w, d, h, y0, rng, parent) {
  const ru = (len) => len / (FACADE.bayW * FACADE.bays);
  const rv = h / (FACADE.floorH * FACADE.floors);
  const ou = () => Math.floor(rng() * FACADE.bays) / FACADE.bays;
  const ov = () => Math.floor(rng() * FACADE.floors) / FACADE.floors;
  const sides = [
    [w, 0, d / 2, 0], [w, 0, -d / 2, Math.PI], [d, w / 2, 0, Math.PI / 2], [d, -w / 2, 0, -Math.PI / 2],
  ];
  for (const [len, x, z, ry] of sides) {
    batch.add(mat, tiledPlane(len, h, ru(len), rv, ou(), ov()), matrix(x, y0 + h / 2, z, 0, ry), parent);
  }
}

export function buildBuilding(b, batch, extras) {
  if (SPECIAL.has(b.style)) return; // handled by landmarks
  const rng = mulberry32(b.seed || 1);
  const variant = Math.floor(rng() * 3);
  const mat = facadeMat(b.style, variant);
  const faceRot = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 }[b.face] ?? 0;
  const parent = matrix(b.x, 0, b.z, 0, b.rot || 0);
  let w = b.w, d = b.d, y = 0;
  const groundH = b.style === 'shop' || b.style === 'brick' ? 4.2 : 0;
  // street-facing local direction (for storefronts / signs)
  const fx = Math.round(Math.sin(faceRot)), fz = Math.round(Math.cos(faceRot));

  if (groundH) {
    // storefront band: dark frame + glowing glass on the street side, plain on others
    batch.add(mats.darkStone(), box(w, groundH, d), matrix(0, groundH / 2, 0), parent);
    const frontLen = fx ? d : w;
    const sf = new THREE.PlaneGeometry(frontLen * 0.86, groundH * 0.72);
    batch.add(mats.shopfront(), sf, matrix(fx * (w / 2 + 0.02), groundH * 0.42, fz * (d / 2 + 0.02), 0, faceRot), parent);
    // awning
    if (rng() < 0.7) {
      const aw = new THREE.BoxGeometry(frontLen * 0.9, 0.12, 1.4);
      batch.add(rng() < 0.5 ? mats.awning() : mats.canvasWhite(), aw, matrix(fx * (w / 2 + 0.7), groundH - 0.3, fz * (d / 2 + 0.7), 0.25 * (fz || 1) * 0, faceRot), parent);
      batch.add(mats.snowCap(), new THREE.BoxGeometry(frontLen * 0.9, 0.1, 1.3), matrix(fx * (w / 2 + 0.7), groundH - 0.18, fz * (d / 2 + 0.7), 0, faceRot), parent);
    }
    y = groundH;
  }

  const tall = b.h > 34 && ['glass', 'modern', 'office'].includes(b.style);
  const tiers = tall && rng() < 0.65 ? 2 : 1;
  let remaining = b.h - y;
  for (let t = 0; t < tiers; t++) {
    const th = tiers === 2 && t === 0 ? remaining * (0.55 + rng() * 0.15) : remaining;
    facadeSides(batch, mat, w, d, th, y, rng, parent);
    // snow-covered roof slab + parapet
    batch.add(mats.darkStone(), box(w + 0.4, 0.5, d + 0.4), matrix(0, y + th + 0.25, 0), parent);
    batch.add(mats.snowCap(), box(w + 0.3, 0.22, d + 0.3), matrix(0, y + th + 0.6, 0), parent);
    // horizontal snow ledges every few floors (snow accumulates on window sills)
    if (b.style !== 'glass') {
      for (let ly = y + 7.2; ly < y + th - 1; ly += 7.2) {
        batch.add(mats.snowCap(), box(w + 0.18, 0.08, d + 0.18), matrix(0, ly, 0), parent);
      }
    }
    y += th;
    remaining -= th;
    if (t === 0 && tiers === 2) { w *= 0.72 + rng() * 0.12; d *= 0.72 + rng() * 0.12; y += 0.5; }
  }
  const top = y + 0.7;
  // rooftop equipment
  const nEq = Math.floor(rng() * 4);
  for (let i = 0; i < nEq; i++) {
    const ew = 1.5 + rng() * 3, ed = 1.5 + rng() * 3, eh = 1 + rng() * 2;
    const ex = (rng() - 0.5) * (w - ew - 1), ez = (rng() - 0.5) * (d - ed - 1);
    batch.add(mats.metal(), box(ew, eh, ed), matrix(ex, top + eh / 2, ez), parent);
    batch.add(mats.snowCap(), box(ew + 0.1, 0.15, ed + 0.1), matrix(ex, top + eh + 0.07, ez), parent);
  }
  if (rng() < 0.3 && b.style !== 'glass') {
    const r = 1.2 + rng();
    batch.add(mats.metal(), new THREE.CylinderGeometry(r, r, 2.6, 12), matrix(w * 0.2, top + 1.3 + 1.5, -d * 0.2), parent);
    batch.add(mats.snowCap(), new THREE.CylinderGeometry(r * 0.98, r, 0.25, 12), matrix(w * 0.2, top + 2.75 + 1.5, -d * 0.2), parent);
  }
  if (b.h > 40) {
    // antenna + red aviation light (pulsed globally)
    batch.add(mats.metal(), new THREE.CylinderGeometry(0.08, 0.12, 6, 6), matrix(0, top + 3, 0), parent);
    extras.aviation.push(new THREE.Vector3(b.x, top + 6.2, b.z));
  }
  if (tall && rng() < 0.6) {
    // crown light band
    const cm = rng() < 0.5 ? mats.pinkGlow() : mats.warmGlow();
    for (const [len, x, z, ry] of [[w, 0, d / 2 + 0.05, 0], [w, 0, -d / 2 - 0.05, Math.PI], [d, w / 2 + 0.05, 0, Math.PI / 2], [d, -w / 2 - 0.05, 0, -Math.PI / 2]]) {
      batch.add(cm, new THREE.PlaneGeometry(len, 0.35), matrix(x, y - 1.2, z, 0, ry), parent);
    }
  }
  // signage for shops
  if (b.sign) extras.signs.push({ b, faceRot, fx, fz });
  // window-ledge snow on lower buildings: fill handled above.
}

export function buildSigns(group, signs, rng) {
  const palette = [['#2a0f1f', '#ff7ac8'], ['#0d1a2c', '#7fd1ff'], ['#1f1408', '#ffd27a'], ['#16091f', '#c99bff'], ['#0b1f14', '#8dffb8'], ['#2a0a0a', '#ff8a7a']];
  for (const s of signs) {
    const { b, faceRot, fx, fz } = s;
    const [bg, fg] = palette[Math.floor(rng() * palette.length)];
    const frontLen = fx ? b.d : b.w;
    // horizontal fascia sign
    const t = signTexture(s.b.sign, { bg, fg });
    const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    const sw = Math.min(frontLen * 0.8, 9);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), m);
    mesh.position.set(b.x + fx * (b.w / 2 + 0.06), 5.1, b.z + fz * (b.d / 2 + 0.06));
    mesh.rotation.y = faceRot;
    group.add(mesh);
    // vertical blade sign (very typical for Seoul streets)
    if (rng() < 0.55 && b.h > 10) {
      const vt = signTexture(s.b.sign.slice(0, 5), { bg, fg, w: 128, h: 512, vertical: true });
      const vm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 1.5), [
        new THREE.MeshBasicMaterial({ map: vt, toneMapped: false }), new THREE.MeshBasicMaterial({ map: vt, toneMapped: false }),
        new THREE.MeshBasicMaterial({ color: bg }), new THREE.MeshBasicMaterial({ color: bg }),
        new THREE.MeshBasicMaterial({ color: bg }), new THREE.MeshBasicMaterial({ color: bg }),
      ]);
      const along = (rng() - 0.5) * frontLen * 0.6;
      vm.position.set(b.x + fx * (b.w / 2 + 0.9) + (fz ? along : 0), 9 + rng() * 2, b.z + fz * (b.d / 2 + 0.9) + (fx ? along : 0));
      vm.rotation.y = faceRot;
      group.add(vm);
    }
  }
}
