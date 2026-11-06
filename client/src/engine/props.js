// Street furniture and Christmas decorations.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/regions.js';
import { matrix } from './batch.js';
import { mats } from './materials.js';
import { radialTexture } from './textures.js';

const BULB_COLORS = [0xffe7b0, 0xff3b4e, 0xffcf4a, 0xff7ac8, 0x9fdcff, 0xfff6e0];

// ---------------------------------------------------------------- street lamps
export function buildLamps(group, lamps, quality) {
  const n = lamps.length;
  if (!n) return { positions: [] };
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 4.6, 8), mats.metal(), n);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 0.9), mats.metal(), n);
  const head = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.18, 0.4, 8), mats.metal(), n);
  const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8), mats.snowCap(), n);
  const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), mats.bulb(), n);
  const wreath = new THREE.InstancedMesh(new THREE.TorusGeometry(0.32, 0.09, 6, 14), mats.green(), n);
  const bow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 6), mats.red(), n);
  const positions = [];
  lamps.forEach((l, i) => {
    const y = l.y ?? 0;
    pole.setMatrixAt(i, matrix(l.x, y + 2.3, l.z));
    arm.setMatrixAt(i, matrix(l.x, y + 4.5, l.z + 0.35));
    head.setMatrixAt(i, matrix(l.x, y + 4.45, l.z + 0.75));
    cap.setMatrixAt(i, matrix(l.x, y + 4.68, l.z + 0.75));
    bulb.setMatrixAt(i, matrix(l.x, y + 4.22, l.z + 0.75));
    wreath.setMatrixAt(i, matrix(l.x, y + 3.3, l.z + 0.13));
    bow.setMatrixAt(i, matrix(l.x, y + 3.05, l.z + 0.2));
    positions.push(new THREE.Vector3(l.x, y + 4.2, l.z + 0.75));
  });
  for (const m of [pole, arm, head, cap, bulb, wreath, bow]) { m.castShadow = m !== bulb; group.add(m); }
  // glow halos (one Points draw call)
  const haloGeo = new THREE.BufferGeometry().setFromPoints(positions);
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({ size: 3.2, map: radialTexture('rgba(255,214,160,0.9)', 'rgba(255,200,140,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  group.add(halo);
  // warm light pools on the snow
  const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,120,0.55)', 'rgba(255,180,110,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }), n);
  lamps.forEach((l, i) => pool.setMatrixAt(i, matrix(l.x, (l.y ?? 0) + 0.04, l.z + 0.6, -Math.PI / 2)));
  group.add(pool);
  return { positions };
}

// ---------------------------------------------------------------- christmas tree
export function buildChristmasTree(group, { x, z, r, h }, quality, y0 = 0) {
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  const rng = mulberry32(Math.floor(x * 31 + z * 17 + 99));
  const tiers = 9;
  const greenMat = mats.treeGreen();
  const trunkH = h * 0.08;
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.16, trunkH, 10), mats.trunk()).translateY(trunkH / 2));
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rr = r * (1 - t * 0.88);
    const th = (h * 0.95) / tiers * 1.7;
    const cy = trunkH + (h * 0.9) * t + th / 2;
    const geo = new THREE.ConeGeometry(rr, th, 28, 3, true);
    // jagged branch tips
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k), pz = p.getZ(k), py = p.getY(k);
      const a = Math.atan2(pz, px);
      const j = 1 + 0.12 * Math.sin(a * 9 + i) + (rng() - 0.5) * 0.06;
      p.setXYZ(k, px * j, py + (py < 0 ? Math.sin(a * 14) * 0.12 * th * 0.3 : 0), pz * j);
    }
    geo.computeVertexNormals();
    const cone = new THREE.Mesh(geo, greenMat);
    cone.position.y = cy;
    cone.castShadow = true;
    g.add(cone);
    // snow on branches
    const sgeo = new THREE.ConeGeometry(rr * 0.82, th * 0.42, 28, 1, true);
    const snow = new THREE.Mesh(sgeo, mats.snowCap());
    snow.position.y = cy + th * 0.3;
    g.add(snow);
  }
  // lights along a spiral + ornaments
  const nb = quality === 'low' ? 260 : 620;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(Math.max(0.07, r * 0.025), 6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), nb);
  const col = new THREE.Color();
  const baseColors = [];
  for (let i = 0; i < nb; i++) {
    const t = i / nb;
    const yy = trunkH + h * 0.9 * t;
    const rr = r * (1 - t * 0.88) * 0.9 + 0.1;
    const a = t * Math.PI * 2 * 11 + rng() * 0.6;
    bulbs.setMatrixAt(i, matrix(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    col.setHex(BULB_COLORS[i % BULB_COLORS.length]).multiplyScalar(2.2);
    bulbs.setColorAt(i, col);
    baseColors.push(col.clone());
  }
  g.add(bulbs);
  const no = Math.floor(r * 28);
  const orn = new THREE.InstancedMesh(new THREE.SphereGeometry(r * 0.06, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.9 }), no);
  const ornCols = [0xc8102e, 0xd9b45b, 0xe8e8f0, 0xc8102e, 0x2a5bd7];
  for (let i = 0; i < no; i++) {
    const t = 0.05 + rng() * 0.85, a = rng() * Math.PI * 2;
    const rr = r * (1 - t * 0.88) * 0.95;
    orn.setMatrixAt(i, matrix(Math.cos(a) * rr, trunkH + h * 0.9 * t - 0.2, Math.sin(a) * rr));
    orn.setColorAt(i, col.setHex(ornCols[i % ornCols.length]));
  }
  orn.castShadow = true;
  g.add(orn);
  // red ribbon spiral
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const t = 0.04 + (i / 200) * 0.82;
    const a = t * Math.PI * 2 * 3.2;
    const rr = r * (1 - t * 0.88) * 1.0 + 0.15;
    pts.push(new THREE.Vector3(Math.cos(a) * rr, trunkH + h * 0.9 * t, Math.sin(a) * rr));
  }
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, r * 0.035, 6), new THREE.MeshStandardMaterial({ color: 0xc0102a, roughness: 0.35, metalness: 0.2, emissive: 0x2a0008 }));
  g.add(ribbon);
  // star
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rad = i % 2 ? r * 0.11 : r * 0.26;
    i ? shape.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : shape.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: r * 0.06, bevelEnabled: true, bevelSize: r * 0.02, bevelThickness: r * 0.02, bevelSegments: 1 }), new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }));
  star.position.y = trunkH + h * 0.95;
  g.add(star);
  const starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,236,180,1)', 'rgba(255,220,150,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  starGlow.scale.set(r * 2.6, r * 2.6, 1);
  starGlow.position.y = star.position.y;
  g.add(starGlow);
  const light = new THREE.PointLight(0xffc98a, quality === 'low' ? 30 : 60, r * 7, 1.6);
  light.position.y = h * 0.45;
  g.add(light);
  // gifts at the base
  const giftCols = [0xc8102e, 0x1f6b3a, 0xd9b45b, 0xf4f1ea, 0x8b1f4f];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.3, d = r * (1.02 + rng() * 0.28);
    const s = 0.5 + rng() * 0.7;
    const gift = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.7 + rng() * 0.5), s), new THREE.MeshStandardMaterial({ color: giftCols[i % 5], roughness: 0.5 }));
    gift.position.set(Math.cos(a) * d, s * 0.4, Math.sin(a) * d);
    gift.rotation.y = rng() * 3;
    gift.castShadow = true;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 1.1, s * 0.15), mats.gold());
    rib.position.copy(gift.position); rib.rotation.y = gift.rotation.y;
    g.add(gift, rib);
  }
  group.add(g);
  let acc = 0;
  return {
    object: g,
    update(dt, t) {
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      for (let k = 0; k < nb / 12; k++) {
        const i = Math.floor(Math.random() * nb);
        const f = 0.35 + Math.random() * 0.9;
        bulbs.setColorAt(i, col.copy(baseColors[i]).multiplyScalar(f));
      }
      bulbs.instanceColor.needsUpdate = true;
      starGlow.material.opacity = 0.75 + Math.sin(t * 2.2) * 0.25;
    },
  };
}

// small decorated street trees (instanced)
export function buildDecoTrees(group, trees) {
  if (!trees.length) return;
  const n = trees.length;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), mats.trunk(), n);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 3.4, 10), mats.treeGreen(), n);
  const snow = new THREE.InstancedMesh(new THREE.ConeGeometry(0.85, 1.6, 10, 1, true), mats.snowCap(), n);
  const planter = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 0.7, 0.6, 12), mats.darkStone(), n);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 4, 3), new THREE.MeshBasicMaterial({ toneMapped: false }), n * 30);
  const col = new THREE.Color();
  trees.forEach((t, i) => {
    trunk.setMatrixAt(i, matrix(t.x, 0.9, t.z));
    leaves.setMatrixAt(i, matrix(t.x, 3.0, t.z));
    snow.setMatrixAt(i, matrix(t.x, 3.8, t.z));
    planter.setMatrixAt(i, matrix(t.x, 0.3, t.z));
    for (let k = 0; k < 30; k++) {
      const f = k / 30, a = f * Math.PI * 12;
      const rr = 1.05 * (1 - f * 0.85);
      lights.setMatrixAt(i * 30 + k, matrix(t.x + Math.cos(a) * rr, 1.4 + f * 3.2, t.z + Math.sin(a) * rr));
      lights.setColorAt(i * 30 + k, col.setHex(i % 2 ? 0xffe2a6 : 0xff8fcf).multiplyScalar(2));
    }
  });
  for (const m of [trunk, leaves, snow, planter, lights]) { m.castShadow = m !== lights; group.add(m); }
}

// ---------------------------------------------------------------- market stalls
export function buildStalls(group, stalls, batch) {
  const goods = [0xc8102e, 0xd9b45b, 0x2f7d4f, 0xf2efe8, 0x8b1f4f];
  for (const s of stalls) {
    const rng = mulberry32(s.seed || 7);
    const parent = matrix(s.x, 0, s.z, 0, s.rot || 0);
    batch.add(mats.wood(), new THREE.BoxGeometry(2.8, 1.0, 1.6), matrix(0, 0.5, 0), parent);
    for (const sx of [-1.35, 1.35]) for (const sz of [-0.75, 0.75]) batch.add(mats.wood(), new THREE.BoxGeometry(0.1, 2.6, 0.1), matrix(sx, 1.3, sz), parent);
    // pitched roof
    const roof = new THREE.CylinderGeometry(0.01, 2.0, 1.0, 4, 1);
    batch.add(rng() < 0.5 ? mats.awning() : mats.canvasWhite(), roof, matrix(0, 3.0, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.65), parent);
    batch.add(mats.snowCap(), new THREE.CylinderGeometry(0.01, 1.9, 0.6, 4, 1), matrix(0, 3.3, 0, 0, Math.PI / 4, 0, 1.0, 1, 0.6), parent);
    for (let i = 0; i < 6; i++) {
      const gm = new THREE.MeshStandardMaterial({ color: goods[Math.floor(rng() * goods.length)], roughness: 0.5 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), gm);
      m.position.set(-1 + i * 0.4, 1.12, 0.3);
      m.applyMatrix4(parent);
      group.add(m);
    }
    // warm string light under the roof
    const bulbG = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.06), mats.warmGlow());
    bulbG.position.set(0, 2.45, 0.78);
    bulbG.applyMatrix4(parent);
    group.add(bulbG);
  }
}

// ---------------------------------------------------------------- misc
export function buildSubwayEntrance(batch, s) {
  const parent = matrix(s.x, 0, s.z, 0, s.rot || 0);
  batch.add(mats.glass(), new THREE.BoxGeometry(3.6, 2.6, 0.08), matrix(0, 1.3, -3), parent);
  batch.add(mats.glass(), new THREE.BoxGeometry(0.08, 2.6, 6), matrix(-1.8, 1.3, 0), parent);
  batch.add(mats.glass(), new THREE.BoxGeometry(0.08, 2.6, 6), matrix(1.8, 1.3, 0), parent);
  batch.add(mats.metal(), new THREE.BoxGeometry(3.8, 0.2, 6.2), matrix(0, 2.7, 0), parent);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(3.8, 0.15, 6.2), matrix(0, 2.85, 0), parent);
  batch.add(mats.darkStone(), new THREE.BoxGeometry(3.4, 0.1, 5.8), matrix(0, 0.05, 0), parent);
}

export function buildSubwaySign(group, s, label = '지하철') {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1f5fbf'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  const p = new THREE.Vector3(0, 3.5, 2.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot || 0);
  m.position.set(s.x + p.x, p.y, s.z + p.z);
  m.rotation.y = s.rot || 0;
  group.add(m);
}

export function buildSnowman(group, x, z, ry = 0, s = 1) {
  const g = new THREE.Group();
  const white = mats.snowCap();
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.75 * s, 16, 12), white); b1.position.y = 0.6 * s;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.52 * s, 16, 12), white); b2.position.y = 1.55 * s;
  const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 16, 12), white); b3.position.y = 2.2 * s;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.35 * s, 8), new THREE.MeshStandardMaterial({ color: 0xe66a1f }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.2 * s, 0.4 * s);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.24 * s, 0.4 * s, 14), mats.red()); hat.position.y = 2.6 * s;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * s, 0.36 * s, 0.05 * s, 14), mats.red()); brim.position.y = 2.42 * s;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.42 * s, 0.09 * s, 8, 18), mats.red()); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.9 * s;
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const ex of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04 * s, 6, 6), eyeMat); e.position.set(ex * s, 2.3 * s, 0.32 * s); g.add(e); }
  g.add(b1, b2, b3, nose, hat, brim, scarf);
  g.position.set(x, 0, z); g.rotation.y = ry;
  g.traverse((o) => { o.castShadow = true; });
  group.add(g);
  return g;
}

// catenary string lights between two points
export function stringLights(group, a, b, n = 24, sag = 0.8, colors = BULB_COLORS) {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 5, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    m.setMatrixAt(i, matrix(p.x, p.y, p.z));
    m.setColorAt(i, col.setHex(colors[i % colors.length]).multiplyScalar(2.2));
  }
  group.add(m);
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag; pts.push(p); }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })));
}

export function buildBench(batch, x, z, ry) {
  const p = matrix(x, 0, z, 0, ry);
  batch.add(mats.wood(), new THREE.BoxGeometry(1.8, 0.08, 0.5), matrix(0, 0.45, 0), p);
  batch.add(mats.wood(), new THREE.BoxGeometry(1.8, 0.4, 0.06), matrix(0, 0.7, -0.24), p);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(1.75, 0.06, 0.45), matrix(0, 0.52, 0), p);
  for (const sx of [-0.8, 0.8]) batch.add(mats.metal(), new THREE.BoxGeometry(0.06, 0.45, 0.45), matrix(sx, 0.22, 0), p);
}

export function buildPhotoZone(group, x, z, ry = 0, label = 'MERRY CHRISTMAS') {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  // heart outline frame
  const S = 1.6;
  shape.moveTo(0, -1.6 * S);
  shape.bezierCurveTo(-2.2 * S, -0.2 * S, -1.6 * S, 1.4 * S, 0, 0.7 * S);
  shape.bezierCurveTo(1.6 * S, 1.4 * S, 2.2 * S, -0.2 * S, 0, -1.6 * S);
  const pts = shape.getSpacedPoints(80).slice(0, -1).map((p) => new THREE.Vector3(p.x, p.y, 0)); // drop duplicate end point (closed curve)
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.12, 8, true), new THREE.MeshBasicMaterial({ color: 0xff5fae, toneMapped: false }));
  tube.position.y = 3.4;
  g.add(tube);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe7f4).multiplyScalar(2), toneMapped: false }), 50);
  for (let i = 0; i < 50; i++) { const p = pts[Math.floor((i / 50) * pts.length)]; bulbs.setMatrixAt(i, matrix(p.x, p.y + 3.4, 0.12)); }
  g.add(bulbs);
  for (const sx of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), mats.metal());
    post.position.set(sx, 0.8, 0);
    g.add(post);
  }
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const cg = c.getContext('2d');
  cg.fillStyle = 'rgba(0,0,0,0)'; cg.fillRect(0, 0, 512, 96);
  cg.font = 'bold 54px Georgia, serif'; cg.fillStyle = '#ffe6f3'; cg.shadowColor = '#ff5fae'; cg.shadowBlur = 16; cg.textAlign = 'center'; cg.fillText(label, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.86), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
  sign.position.set(0, 6.4, 0);
  g.add(sign);
  const pl = new THREE.PointLight(0xff6fb5, 12, 10, 2);
  pl.position.set(0, 3.2, 1.2);
  g.add(pl);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  group.add(g);
  return g;
}
