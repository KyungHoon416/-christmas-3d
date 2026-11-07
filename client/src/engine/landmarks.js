// Hand-modelled (procedural) Seoul landmarks. Approximations built from
// primitives — proportions and placement follow the real sites; detail is stylised.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/regions.js';
import { buildDDPBuilding } from './ddpBuilder.js';
import { matrix, tiledBox } from './batch.js';
import { mats, facadeMat } from './materials.js';
import { radialTexture, signTexture, facadeTextures } from './textures.js';

// ---------------------------------------------------------------- Korean roof
// Hip-and-gable roof with concave slope and up-turned eaves (cheoma).
export function hanokRoofGeometry(w, d, h, { ridge = 0.45, upturn = 0.9, seg = 28 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, seg, Math.ceil(seg / 2));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const rl = (w / 2) * ridge;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const dx = Math.min(1, Math.max(0, Math.abs(x) - rl) / (w / 2 - rl));
    const dz = Math.min(1, Math.abs(z) / (d / 2));
    const t = Math.max(dx, dz);
    let y = h * Math.pow(1 - t, 1.35);
    y += upturn * Math.pow(t, 8) * (0.4 + 0.6 * Math.pow(Math.min(dx, dz) + 0.0001, 0.5) * 1.6);
    p.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}

function addHanokRoof(batch, parent, w, d, h, y, opts) {
  const roof = hanokRoofGeometry(w, d, h, opts);
  batch.add(mats.roofTile(), roof, matrix(0, y, 0), parent);
  // painted rafters underneath (dancheong) — slightly lower copy
  batch.add(mats.dancheong(), hanokRoofGeometry(w * 0.97, d * 0.95, h, opts), matrix(0, y - 0.18, 0), parent);
  // ridge
  const rl = (w / 2) * (opts?.ridge ?? 0.45);
  batch.add(mats.darkStone(), new THREE.BoxGeometry(rl * 2 + 0.6, 0.45, 0.5), matrix(0, y + h + 0.1, 0), parent);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(rl * 2 + 0.5, 0.12, 0.55), matrix(0, y + h + 0.36, 0), parent);
}

function columns(batch, parent, w, d, h, y, n, mat = mats.redWood(), r = 0.32) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * i) / (n - 1);
    for (const z of [-d / 2, d / 2]) batch.add(mat, new THREE.CylinderGeometry(r, r * 1.05, h, 10), matrix(x, y + h / 2, z), parent);
  }
}

// ---------------------------------------------------------------- Gwanghwamun
export function buildGwanghwamunGate(group, batch, { x, z, w, d }) {
  const parent = matrix(x, 0, z);
  const baseH = 7.5;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2 - 0.6, baseH); shape.lineTo(-w / 2 + 0.6, baseH); shape.closePath();
  for (const [cx, aw] of [[-8.2, 3.6], [0, 4.6], [8.2, 3.6]]) {
    const hole = new THREE.Path();
    const ah = aw === 4.6 ? 5.2 : 4.4;
    hole.moveTo(cx - aw / 2, 0); hole.lineTo(cx - aw / 2, ah - aw / 2);
    hole.absarc(cx, ah - aw / 2, aw / 2, Math.PI, 0, true);
    hole.lineTo(cx + aw / 2, 0); hole.closePath();
    shape.holes.push(hole);
  }
  const base = new THREE.ExtrudeGeometry(shape, { depth: d * 0.85, bevelEnabled: false });
  base.translate(0, 0, -d * 0.425);
  const uv = base.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6, uv.getY(i) / 6);
  batch.add(mats.stoneWall(), base, null, parent);
  // closed wooden doors inside arches (gate is closed at night)
  for (const [cx, aw] of [[-8.2, 3.6], [0, 4.6], [8.2, 3.6]]) {
    batch.add(mats.redWood(), new THREE.BoxGeometry(aw, aw === 4.6 ? 5.2 : 4.4, 0.3), matrix(cx, (aw === 4.6 ? 5.2 : 4.4) / 2, 0), parent);
  }
  batch.add(mats.snowCap(), new THREE.BoxGeometry(w - 1, 0.25, d * 0.85), matrix(0, baseH + 0.12, 0), parent);
  // pavilion level 1
  const y1 = baseH + 0.25;
  columns(batch, parent, w * 0.62, d * 0.55, 3.4, y1, 7);
  batch.add(mats.redWood(), new THREE.BoxGeometry(w * 0.6, 3.0, d * 0.5), matrix(0, y1 + 1.6, 0), parent);
  batch.add(mats.dancheong(), new THREE.BoxGeometry(w * 0.64, 0.6, d * 0.58), matrix(0, y1 + 3.4, 0), parent);
  addHanokRoof(batch, parent, w * 0.92, d * 1.05, 2.2, y1 + 3.6, { ridge: 0.5, upturn: 0.9 });
  // level 2
  const y2 = y1 + 5.6;
  columns(batch, parent, w * 0.52, d * 0.45, 2.8, y2, 6);
  batch.add(mats.redWood(), new THREE.BoxGeometry(w * 0.5, 2.6, d * 0.4), matrix(0, y2 + 1.4, 0), parent);
  batch.add(mats.dancheong(), new THREE.BoxGeometry(w * 0.54, 0.5, d * 0.48), matrix(0, y2 + 2.9, 0), parent);
  addHanokRoof(batch, parent, w * 0.84, d * 0.92, 3.4, y2 + 3.1, { ridge: 0.42, upturn: 1.1 });
  // signboard 광화문 (hyeonpan)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.5), new THREE.MeshBasicMaterial({ map: signTexture('광화문', { bg: '#1a1410', fg: '#f0d58a', w: 384, h: 128 }), toneMapped: false }));
  sign.position.set(x, y2 + 1.6, z + d * 0.2 + 0.05);
  group.add(sign);
  // flood lights on the gate
  for (const sx of [-12, 12]) {
    const sl = new THREE.SpotLight(0xffd7a0, 220, 50, 0.65, 0.5, 1.5);
    sl.position.set(x + sx, 1, z + 18);
    sl.target.position.set(x + sx * 0.4, 9, z);
    group.add(sl, sl.target);
  }
  // palace walls
  for (const sx of [-1, 1]) {
    const wp = matrix(x + sx * 50, 0, z - 6);
    batch.add(mats.stoneWall(), tiledBox(64, 4.5, 3, 4), matrix(0, 2.25, 0), wp);
    batch.add(mats.roofTile(), hanokRoofGeometry(65, 4.2, 0.9, { ridge: 0.97, upturn: 0.2, seg: 12 }), matrix(0, 4.5, 0), wp);
  }
}

export function buildSejongStatue(group, batch, { x, z }) {
  const p = matrix(x, 0, z, 0, 0);
  batch.add(mats.stone(), new THREE.BoxGeometry(6.4, 0.8, 9), matrix(0, 0.4, 0), p);
  batch.add(mats.stone(), new THREE.BoxGeometry(5.4, 2.6, 7.6), matrix(0, 2.1, 0), p);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(5.5, 0.15, 7.7), matrix(0, 3.45, 0), p);
  // throne
  batch.add(mats.bronze(), new THREE.BoxGeometry(4.2, 2.2, 3.2), matrix(0, 4.5, -0.6), p);
  batch.add(mats.bronze(), new THREE.BoxGeometry(4.4, 3.4, 0.5), matrix(0, 6.6, -2.0), p);
  // seated king: robe, torso, head, crown
  batch.add(mats.bronze(), new THREE.CylinderGeometry(1.2, 1.9, 2.8, 16), matrix(0, 5.6, 0.2), p);
  batch.add(mats.bronze(), new THREE.BoxGeometry(3.2, 0.9, 2.4), matrix(0, 5.0, 1.0), p); // lap
  batch.add(mats.bronze(), new THREE.SphereGeometry(0.75, 16, 12), matrix(0, 7.6, 0.2), p);
  batch.add(mats.bronze(), new THREE.CylinderGeometry(0.62, 0.7, 0.8, 12), matrix(0, 8.3, 0.05), p);
  batch.add(mats.bronze(), new THREE.BoxGeometry(1.5, 0.15, 0.4), matrix(0, 8.55, -0.35), p);
  batch.add(mats.bronze(), new THREE.BoxGeometry(1.4, 0.15, 1.0), matrix(0, 5.55, 1.6, -0.4), p); // book
  batch.add(mats.snowCap(), new THREE.SphereGeometry(0.72, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), matrix(0, 8.7, 0.05), p);
  const l = new THREE.SpotLight(0xffe2b5, 120, 25, 0.5, 0.6, 1.5);
  l.position.set(x, 0.5, z + 9); l.target.position.set(x, 6, z);
  group.add(l, l.target);
}

export function buildYiSunSinStatue(group, batch, { x, z }) {
  const p = matrix(x, 0, z);
  batch.add(mats.stone(), new THREE.BoxGeometry(4.4, 1, 4.4), matrix(0, 0.5, 0), p);
  batch.add(mats.stone(), new THREE.CylinderGeometry(1.4, 1.7, 10, 8), matrix(0, 6, 0), p);
  batch.add(mats.stone(), new THREE.BoxGeometry(3.4, 0.8, 3.4), matrix(0, 11.4, 0), p);
  batch.add(mats.bronze(), new THREE.CylinderGeometry(0.8, 1.2, 3.4, 12), matrix(0, 13.5, 0), p);
  batch.add(mats.bronze(), new THREE.CylinderGeometry(0.7, 0.8, 1.8, 12), matrix(0, 16, 0), p);
  batch.add(mats.bronze(), new THREE.SphereGeometry(0.5, 12, 10), matrix(0, 17.3, 0), p);
  batch.add(mats.bronze(), new THREE.ConeGeometry(0.55, 0.7, 12), matrix(0, 17.8, 0), p);
  batch.add(mats.bronze(), new THREE.BoxGeometry(0.12, 3.2, 0.25), matrix(0.75, 15.2, 0.4, 0.15), p); // sword
  batch.add(mats.snowCap(), new THREE.CylinderGeometry(1.7, 1.7, 0.15, 12), matrix(0, 11.85, 0), p);
  const l = new THREE.SpotLight(0xffe2b5, 160, 30, 0.35, 0.6, 1.5);
  l.position.set(x, 0.5, z + 10); l.target.position.set(x, 15, z);
  group.add(l, l.target);
}

export function buildSejongCenter(batch, b) {
  const p = matrix(b.x, 0, b.z);
  // body
  const mat = facadeMat('stone', 1);
  batch.add(mat, tiledBox(b.w, b.h, b.d, 3.2 * 8), matrix(0, b.h / 2, 0), p);
  // colonnade on the plaza (east) side
  for (let i = 0; i < 12; i++) {
    const z = -b.d / 2 + 3 + (i * (b.d - 6)) / 11;
    batch.add(mats.stone(), new THREE.BoxGeometry(1.0, b.h - 2, 1.0), matrix(b.w / 2 + 3, (b.h - 2) / 2, z), p);
  }
  batch.add(mats.shopfront(), new THREE.PlaneGeometry(b.d - 4, 8), matrix(b.w / 2 + 0.05, 4, 0, 0, Math.PI / 2), p);
  // wide flat traditional-style eave
  batch.add(mats.darkStone(), new THREE.BoxGeometry(b.w + 9, 1.2, b.d + 6), matrix(1.5, b.h + 0.6, 0), p);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(b.w + 8.8, 0.25, b.d + 5.8), matrix(1.5, b.h + 1.3, 0), p);
  batch.add(mats.pinkGlow(), new THREE.BoxGeometry(0.2, 0.25, b.d + 5), matrix(b.w / 2 + 6, b.h - 0.1, 0), p);
}

// ---------------------------------------------------------------- Seoul Plaza
export function buildCityHall(batch, b) {
  const p = matrix(b.x, 0, b.z);
  const mat = facadeMat('glass', 2);
  batch.add(mat, tiledBox(b.w, b.h, b.d, 3.2 * 8), matrix(0, b.h / 2, 0), p);
  // the forward-curving glass "wave" canopy
  const W = b.w, H = b.h * 1.2, segU = 40, segV = 24;
  const geo = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const bulge = Math.sin(v * Math.PI * 0.95) * 9 * (0.55 + 0.45 * Math.sin(u * Math.PI));
    pos.setXYZ(i, (u - 0.5) * W, v * H, b.d / 2 + bulge * (v > 0.05 ? 1 : v * 20));
    uv.setXY(i, u * 10, v * 6);
  }
  geo.computeVertexNormals();
  batch.add(mat, geo, null, p);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(W, 0.3, b.d + 4), matrix(0, b.h + 0.2, 0), p);
}

export function buildOldCityHall(batch, b) {
  const p = matrix(b.x, 0, b.z);
  batch.add(facadeMat('stone', 0), tiledBox(b.w, b.h, b.d, 3.2 * 8), matrix(0, b.h / 2, 0), p);
  batch.add(mats.darkStone(), new THREE.BoxGeometry(b.w + 0.8, 0.6, b.d + 0.8), matrix(0, b.h + 0.3, 0), p);
  batch.add(mats.snowCap(), new THREE.BoxGeometry(b.w + 0.7, 0.2, b.d + 0.7), matrix(0, b.h + 0.65, 0), p);
  // central clock tower + dome
  batch.add(mats.stone(), new THREE.BoxGeometry(6, 8, 6), matrix(0, b.h + 4, b.d / 2 - 3), p);
  batch.add(new THREE.MeshStandardMaterial({ color: 0x4f7f6a, roughness: 0.5, metalness: 0.6 }), new THREE.SphereGeometry(3.4, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), matrix(0, b.h + 8, b.d / 2 - 3), p);
  batch.add(mats.snowCap(), new THREE.SphereGeometry(3.45, 20, 6, 0, Math.PI * 2, 0, Math.PI / 5), matrix(0, b.h + 8, b.d / 2 - 3), p);
  batch.add(mats.warmGlow(), new THREE.CircleGeometry(1.4, 24), matrix(0, b.h + 5, b.d / 2 + 0.02), p);
  // portico
  for (let i = 0; i < 6; i++) batch.add(mats.stone(), new THREE.CylinderGeometry(0.4, 0.45, 7, 12), matrix(-6 + i * 2.4, 3.5, b.d / 2 + 2), p);
  batch.add(mats.stone(), new THREE.BoxGeometry(15, 1, 4), matrix(0, 7.5, b.d / 2 + 2), p);
}

export function buildDaehanmun(batch, { x, z }) {
  const p = matrix(x, 0, z, 0, Math.PI / 2);
  batch.add(mats.stone(), new THREE.BoxGeometry(18, 0.8, 8), matrix(0, 0.4, 0), p);
  columns(batch, p, 14, 5, 5, 0.8, 4);
  batch.add(mats.redWood(), new THREE.BoxGeometry(4, 4.4, 0.25), matrix(-4.6, 3, 0), p);
  batch.add(mats.redWood(), new THREE.BoxGeometry(4, 4.4, 0.25), matrix(4.6, 3, 0), p);
  batch.add(mats.dancheong(), new THREE.BoxGeometry(15, 0.7, 6), matrix(0, 6.1, 0), p);
  addHanokRoof(batch, p, 21, 10, 2.8, 6.4, { ridge: 0.4, upturn: 0.8 });
}

export function buildRink(group, batch, rink) {
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(rink.hw * 2, rink.hd * 2), mats.ice());
  ice.rotation.x = -Math.PI / 2;
  ice.position.set(rink.x, 0.04, rink.z);
  ice.receiveShadow = true;
  group.add(ice);
  // boards
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f6, roughness: 0.4 });
  const segs = [[-12, -11.2, 19, 0.3], [12, -11.2, 19, 0.3], [-12, 19.2, 19, 0.3], [12, 19.2, 19, 0.3]];
  for (const [bx, bz, w, d] of segs) batch.add(boardMat, new THREE.BoxGeometry(w, 1.1, d), matrix(bx, 0.55, bz));
  for (const [bz, len] of [[-4, 14], [13, 12]]) for (const sx of [-22.2, 22.2]) batch.add(boardMat, new THREE.BoxGeometry(0.3, 1.1, len), matrix(sx, 0.55, bz));
  // light arches over the rink
  for (let i = 0; i < 4; i++) {
    const zz = rink.z - rink.hd + 4 + i * ((rink.hd * 2 - 8) / 3);
    const pts = [];
    for (let k = 0; k <= 30; k++) { const a = (k / 30) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * rink.hw, Math.sin(a) * 7, zz)); }
    const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.09, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7ac8 : 0xbfe3ff, toneMapped: false }));
    group.add(arch);
  }
}

// ---------------------------------------------------------------- Cheonggyecheon
const WATER_VERT = `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const WATER_FRAG = `uniform float uTime; varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 p=vW.xz*0.6+vec2(uTime*0.6,0.);
  float r=n(p*1.3)*0.6+n(p*3.1-uTime*0.4)*0.4;
  vec3 deep=vec3(0.02,0.06,0.11), hi=vec3(0.25,0.35,0.55);
  vec3 c=mix(deep,hi,pow(r,3.));
  // reflected festival lights: pink/gold glints
  float g=pow(n(vec2(vW.x*0.35-uTime*0.8, vW.z*3.)),18.)*3.;
  c+=g*mix(vec3(1.,.45,.75),vec3(1.,.8,.4),step(.5,fract(vW.x*.05)));
  gl_FragColor=vec4(c,0.94);
}`;

export function buildCheonggyecheon(group, batch, r, updaters) {
  const LOW = r.low;
  // channel floor walkways (stone) and water
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 16), mats.paving());
  floor.material = floor.material.clone();
  floor.material.map = floor.material.map.clone(); floor.material.map.repeat.set(14, 1.6); floor.material.map.needsUpdate = true;
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, LOW + 0.01, 0); floor.receiveShadow = true;
  group.add(floor);
  const waterMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(140, 4.8, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, LOW + 0.12, 0);
  group.add(water);
  updaters.push((dt, t) => { waterMat.uniforms.uTime.value = t; });
  // retaining walls + railings
  for (const sz of [-1, 1]) {
    batch.add(mats.stoneWall(), tiledBox(140, -LOW, 0.8, 3), matrix(0, LOW / 2, sz * 8.4));
    batch.add(mats.snowCap(), new THREE.BoxGeometry(140, 0.12, 0.9), matrix(0, 0.06, sz * 8.4));
    // wall wash lights
    batch.add(mats.warmGlow(), new THREE.BoxGeometry(140, 0.12, 0.05), matrix(0, LOW + 0.4, sz * 7.98));
    // railing
    const segs = [[-70, -25], [-15, 29.5], [38.5, 70]];
    for (const [a, b] of segs) {
      batch.add(mats.metal(), new THREE.BoxGeometry(b - a, 0.08, 0.08), matrix((a + b) / 2, 1.1, sz * 8.2));
      for (let x = a; x <= b; x += 2.5) batch.add(mats.metal(), new THREE.BoxGeometry(0.06, 1.1, 0.06), matrix(x, 0.55, sz * 8.2));
    }
  }
  // stone edging of the water
  for (const sz of [-1, 1]) batch.add(mats.stone(), new THREE.BoxGeometry(140, 0.3, 0.5), matrix(0, LOW + 0.15, sz * 2.6));
  // stepping stones (jinggeom-dari)
  for (const sx of r.stones) for (let k = 0; k < 5; k++) {
    batch.add(mats.stone(), new THREE.CylinderGeometry(0.55, 0.6, 0.45, 8), matrix(sx + (k % 2) * 0.3, LOW + 0.2, -2 + k), null);
    batch.add(mats.snowCap(), new THREE.CylinderGeometry(0.5, 0.55, 0.08, 8), matrix(sx + (k % 2) * 0.3, LOW + 0.46, -2 + k));
  }
  // bridges (stone arch decks)
  for (const b of r.bridges) {
    const p = matrix(b.x, 0, 0);
    batch.add(mats.stone(), new THREE.BoxGeometry(b.hw * 2, 0.6, 18), matrix(0, -0.3, 0), p);
    batch.add(mats.paving(), new THREE.BoxGeometry(b.hw * 2 - 0.2, 0.05, 17.8), matrix(0, 0.01, 0), p);
    for (const sx of [-1, 1]) {
      batch.add(mats.stone(), new THREE.BoxGeometry(0.4, 1.0, 17), matrix(sx * (b.hw + 0.2), 0.5, 0), p);
      batch.add(mats.snowCap(), new THREE.BoxGeometry(0.45, 0.12, 17), matrix(sx * (b.hw + 0.2), 1.06, 0), p);
    }
    for (const pz of [-5.5, 5.5]) batch.add(mats.stone(), new THREE.BoxGeometry(1.6, -LOW - 0.6, 1.6), matrix(0, (LOW - 0.6) / 2, pz), p);
    // lanterns along the bridge
    for (let k = -3; k <= 3; k++) for (const sx of [-1, 1]) batch.add(mats.warmGlow(), new THREE.SphereGeometry(0.16, 8, 6), matrix(sx * (b.hw + 0.2), 1.35, k * 2.4), p);
  }
  // west stairs from Cheonggye Plaza
  for (let i = 0; i < 16; i++) {
    const x0 = -82 + i * 0.75, y = -(i + 1) * (4 / 16);
    batch.add(mats.stone(), new THREE.BoxGeometry(0.75, 0.25, 16), matrix(x0 + 0.375, y + 0.125, 0));
    batch.add(mats.snowCap(), new THREE.BoxGeometry(0.7, 0.04, 15.8), matrix(x0 + 0.375, y + 0.27, 0));
  }
  // east ramps
  for (const sz of [-5.25, 5.25]) {
    const len = Math.hypot(12, 4);
    batch.add(mats.paving(), new THREE.BoxGeometry(len, 0.2, 5.5), matrix(76, -2.1, sz, 0, 0, Math.atan2(4, 12)));
  }
  batch.add(mats.stoneWall(), tiledBox(12, 4, 4.8, 3), matrix(76, -2, 0));
  // waterfall at the source
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.6), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.55 }));
  fall.rotation.y = Math.PI / 2; fall.position.set(-69.7, LOW + 1.8, 0);
  group.add(fall);
  // "Spring" sculpture (spiral tower)
  const pts = [];
  for (let i = 0; i <= 200; i++) { const t = i / 200, a = t * Math.PI * 7; const rr = 1.8 * (1 - t * 0.8); pts.push(new THREE.Vector3(Math.cos(a) * rr, t * 14, Math.sin(a) * rr)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const spA = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xc8243c, roughness: 0.35, metalness: 0.4, emissive: 0x330008 }));
  const spB = new THREE.Mesh(new THREE.TubeGeometry(curve, 300, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x2457c8, roughness: 0.35, metalness: 0.4 }));
  spB.rotation.y = Math.PI;
  for (const m of [spA, spB]) { m.position.set(r.landmarks.spring.x, 0, r.landmarks.spring.z); m.castShadow = true; group.add(m); }
  // light tunnel: arches over the channel with colourful bulbs
  const { from, to } = r.landmarks.tunnel;
  const nA = Math.floor((to - from) / 2);
  const perArch = 40;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 5, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), nA * perArch);
  const tunnelCols = [0x6fb8ff, 0xff7ac8, 0xffd27a, 0xb08cff];
  const col = new THREE.Color();
  for (let a = 0; a < nA; a++) {
    const ax = from + a * 2;
    for (let k = 0; k < perArch; k++) {
      const ang = (k / (perArch - 1)) * Math.PI;
      bulbs.setMatrixAt(a * perArch + k, matrix(ax, LOW + Math.sin(ang) * 6.2, Math.cos(ang) * 7.6));
      bulbs.setColorAt(a * perArch + k, col.setHex(tunnelCols[a % 4]).multiplyScalar(2.2));
    }
  }
  group.add(bulbs);
  let acc = 0, phase = 0;
  updaters.push((dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0; phase++;
    for (let a = 0; a < nA; a++) {
      const c = col.setHex(tunnelCols[(a + phase) % 4]).multiplyScalar(2.2);
      for (let k = 0; k < perArch; k++) bulbs.setColorAt(a * perArch + k, c);
    }
    bulbs.instanceColor.needsUpdate = true;
  });
  // side walls along the stairs and the east ramps (no gaps into the void)
  for (const sz of [-1, 1]) {
    for (const [x0, x1] of [[-82, -70], [70, 82]]) {
      batch.add(mats.stoneWall(), tiledBox(x1 - x0, -LOW, 0.8, 3), matrix((x0 + x1) / 2, LOW / 2, sz * 8.4));
      batch.add(mats.snowCap(), new THREE.BoxGeometry(x1 - x0, 0.12, 0.9), matrix((x0 + x1) / 2, 0.06, sz * 8.4));
    }
  }
  // stair handrails
  for (const sz of [-1, 1]) {
    const pts = [new THREE.Vector3(-82, 1.0, sz * 7.7), new THREE.Vector3(-70, LOW + 1.0, sz * 7.7)];
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.05, 6), mats.metal()));
  }
  // lower walkway: benches, planters with small lit trees, warm wall niches
  for (const bn of r.benches || []) {
    const p = matrix(bn.x, LOW, bn.z, 0, bn.ry);
    batch.add(mats.wood(), new THREE.BoxGeometry(1.8, 0.08, 0.5), matrix(0, 0.45, 0), p);
    batch.add(mats.wood(), new THREE.BoxGeometry(1.8, 0.45, 0.06), matrix(0, 0.72, -0.24), p);
    batch.add(mats.snowCap(), new THREE.BoxGeometry(1.75, 0.05, 0.45), matrix(0, 0.51, 0), p);
    for (const sx of [-0.8, 0.8]) batch.add(mats.metal(), new THREE.BoxGeometry(0.06, 0.45, 0.45), matrix(sx, 0.22, 0), p);
  }
  for (const pl of r.planters || []) {
    batch.add(mats.darkStone(), new THREE.CylinderGeometry(0.55, 0.48, 0.6, 12), matrix(pl.x, LOW + 0.3, pl.z));
    batch.add(mats.treeGreen(), new THREE.ConeGeometry(0.6, 1.9, 10), matrix(pl.x, LOW + 1.5, pl.z));
    batch.add(mats.snowCap(), new THREE.ConeGeometry(0.42, 0.8, 10, 1, true), matrix(pl.x, LOW + 2.05, pl.z));
  }
  const nicheCount = 46;
  const niches = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc98a).multiplyScalar(1.3), toneMapped: false }), nicheCount * 2);
  let ni = 0;
  for (let k = 0; k < nicheCount; k++) {
    const x = -66 + k * 3;
    niches.setMatrixAt(ni++, matrix(x, LOW + 1.3, -7.97, 0, 0));
    niches.setMatrixAt(ni++, matrix(x, LOW + 1.3, 7.97, 0, Math.PI));
  }
  group.add(niches);
  // twinkling string lights along both street railings (seen from below too)
  for (const sz of [-1, 1]) for (const [a, b] of [[-70, -25], [-15, 29.5], [38.5, 70]]) {
    const n = Math.round((b - a) * 1.2);
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = a + ((b - a) * i) / (n - 1);
      m.setMatrixAt(i, matrix(x, 1.12 - Math.abs(Math.sin(i * 0.9)) * 0.12, sz * 8.2));
      m.setColorAt(i, c.setHex([0xffe2a6, 0xff8fcf, 0x9fdcff][i % 3]).multiplyScalar(2));
    }
    group.add(m);
  }
  // floating lantern sculptures on the water
  const lanternCols = [0xffb36b, 0xff6f91, 0x8fd3ff, 0xffe28a];
  for (let i = 0; i < 9; i++) {
    const lx = -40 + i * 12;
    if (r.stones.some((s) => Math.abs(s - lx) < 3)) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(lanternCols[i % 4]).multiplyScalar(1.6), toneMapped: false }));
    m.position.set(lx, LOW + 0.9, 0);
    group.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,200,150,0.8)', 'rgba(255,200,150,0)'), color: lanternCols[i % 4], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.set(5, 5, 1); glow.position.copy(m.position);
    group.add(glow);
  }
  // street level: roads both sides
  for (const sz of [-1, 1]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(184, 8), mats.road());
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, sz * 16); road.receiveShadow = true;
    group.add(road);
  }
}

// ---------------------------------------------------------------- Myeongdong
export function buildCathedral(group, batch, b) {
  const p = matrix(b.x, 0, b.z);
  const brick = facadeMat('brick', 2);
  batch.add(brick, tiledBox(b.w, b.h, b.d, 3.2 * 8), matrix(0, b.h / 2, 0), p);
  // pitched roof
  const roof = new THREE.CylinderGeometry(0.01, b.w * 0.75, 7, 4, 1, false);
  batch.add(mats.darkStone(), roof, matrix(0, b.h + 3.2, 0, 0, Math.PI / 4, 0, 1, 1, (b.d / b.w) * 1.0), p);
  batch.add(mats.snowCap(), new THREE.CylinderGeometry(0.01, b.w * 0.72, 6.6, 4, 1, false), matrix(0, b.h + 3.5, 0, 0, Math.PI / 4, 0, 1, 1, (b.d / b.w) * 0.98), p);
  // bell tower + spire facing south
  const tz = b.d / 2 + 2;
  batch.add(brick, tiledBox(7, 30, 7, 3.2 * 8), matrix(0, 15, tz), p);
  batch.add(mats.darkStone(), new THREE.ConeGeometry(4.2, 18, 8), matrix(0, 39, tz), p);
  batch.add(mats.snowCap(), new THREE.ConeGeometry(4.25, 4, 8, 1, true), matrix(0, 32, tz), p);
  batch.add(mats.gold(), new THREE.BoxGeometry(0.25, 3, 0.25), matrix(0, 49.5, tz), p);
  batch.add(mats.gold(), new THREE.BoxGeometry(1.6, 0.25, 0.25), matrix(0, 50.3, tz), p);
  // rose window + doors
  const rose = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a6a).multiplyScalar(1.4), toneMapped: false }));
  rose.position.set(b.x, 18, b.z + tz + 3.55);
  group.add(rose);
  batch.add(mats.shopfront(), new THREE.PlaneGeometry(2.6, 4.5), matrix(0, 2.25, tz + 3.53), p);
  const sl = new THREE.SpotLight(0xffd2a0, 300, 70, 0.4, 0.6, 1.4);
  sl.position.set(b.x, 1, b.z + tz + 22); sl.target.position.set(b.x, 25, b.z + tz);
  group.add(sl, sl.target);
}

// ---------------------------------------------------------------- DDP
// The building itself (shell + connected interior) lives in ddpBuilder.js.
export function buildDDP(group, r, updaters, quality) {
  const L = r.landmarks;
  buildDDPBuilding(group, r, updaters, quality);

  // LED rose garden
  const R = L.roses;
  const rng = mulberry32(55);
  const n = quality === 'low' ? 900 : 2200;
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 3), mats.metal(), n);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const hp = [];
  for (let i = 0; i < n; i++) {
    const px = R.x + (rng() * 2 - 1) * R.hw, pz = R.z + (rng() * 2 - 1) * R.hd;
    // keep two walking paths free
    if (Math.abs(px - R.x) < 1.6 || Math.abs(pz - R.z) < 1.6) { i--; continue; }
    const h = 0.6 + rng() * 0.5;
    stems.setMatrixAt(i, matrix(px, h / 2, pz, 0, 0, 0, 1, h / 0.9, 1));
    heads.setMatrixAt(i, matrix(px, h, pz));
    hp.push([px, pz]);
  }
  group.add(stems, heads);
  const col = new THREE.Color();
  let acc = 0;
  const roseUpdate = (dt, t) => {
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;
    for (let i = 0; i < n; i++) {
      const [px, pz] = hp[i];
      const w = Math.sin(px * 0.25 - t * 1.6) * 0.5 + Math.sin(pz * 0.4 + t) * 0.5;
      col.setHSL(0.92 + w * 0.06, 0.65, 0.55 + w * 0.2).multiplyScalar(1.8);
      heads.setColorAt(i, col);
    }
    heads.instanceColor.needsUpdate = true;
  };
  roseUpdate(1, 0);
  updaters.push(roseUpdate);
}

// ---------------------------------------------------------------- Namsan
export function buildNamsan(group, batch, r, updaters, quality) {
  const L = r.landmarks;
  // tower base building
  const t = L.tower;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r + 0.5, 8, 32), facadeMat('glass', 0));
  base.position.set(t.x, 4, t.z); base.castShadow = true;
  group.add(base);
  batch.add(mats.snowCap(), new THREE.CylinderGeometry(t.r + 0.2, t.r + 0.2, 0.3, 32), matrix(t.x, 8.15, t.z));
  // shaft
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xe9ecf2, roughness: 0.45, metalness: 0.2, emissive: 0x6a2c8f, emissiveIntensity: 0.32 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.2, 56, 24), towerMat);
  shaft.position.set(t.x, 8 + 28, t.z);
  group.add(shaft);
  // observation decks
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 5.6, 4, 32), facadeMat('glass', 1));
  deck.position.set(t.x, 66, t.z);
  const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.0, 3, 32), facadeMat('modern', 1));
  deck2.position.set(t.x, 70, t.z);
  const deck3 = new THREE.Mesh(new THREE.CylinderGeometry(5, 7.2, 3, 32), towerMat);
  deck3.position.set(t.x, 73, t.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffd9f0, toneMapped: false }));
  ring.rotation.x = Math.PI / 2; ring.position.set(t.x, 68.2, t.z);
  group.add(deck, deck2, deck3, ring);
  // antenna with stripes
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - i * 0.12, 1.0 - i * 0.12, 6, 12), i % 2 ? mats.white() : mats.red());
    s.position.set(t.x, 77.5 + i * 6, t.z);
    group.add(s);
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), mats.redLight());
  tip.position.set(t.x, 113, t.z);
  group.add(tip);
  const towerLight = new THREE.PointLight(0xc77dff, 120, 60, 1.5);
  towerLight.position.set(t.x, 30, t.z + 8);
  group.add(towerLight);
  const towerCol = new THREE.Color();
  updaters.push((dt, time) => {
    towerCol.setHSL((0.78 + Math.sin(time * 0.15) * 0.12 + 1) % 1, 0.8, 0.45);
    towerMat.emissive.copy(towerCol);
    towerLight.color.copy(towerCol);
    tip.visible = Math.sin(time * 3) > 0;
  });
  // love-lock fences along the southern rim
  const rng = mulberry32(77);
  const nLocks = quality === 'low' ? 1400 : 3600;
  const locks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), nLocks);
  const lockCols = [0xff4d6d, 0xffc2d1, 0xffd166, 0x8ecae6, 0xc77dff, 0xff7f50, 0xf1f1f1];
  const col = new THREE.Color();
  const a0 = Math.PI * 0.12, a1 = Math.PI * 0.88, R0 = 41.5;
  for (let i = 0; i < 70; i++) {
    const a = a0 + ((a1 - a0) * i) / 70, a2 = a0 + ((a1 - a0) * (i + 1)) / 70;
    const p1 = [Math.cos(a) * R0, Math.sin(a) * R0], p2 = [Math.cos(a2) * R0, Math.sin(a2) * R0];
    const mx = (p1[0] + p2[0]) / 2, mz = (p1[1] + p2[1]) / 2, len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const ry = -Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    for (const h of [0.4, 0.8, 1.2]) batch.add(mats.lightMetal(), new THREE.BoxGeometry(len, 0.04, 0.04), matrix(mx, h, mz, 0, ry));
    batch.add(mats.lightMetal(), new THREE.BoxGeometry(0.06, 1.25, 0.06), matrix(p1[0], 0.62, p1[1]));
  }
  for (let i = 0; i < nLocks; i++) {
    const a = a0 + rng() * (a1 - a0);
    const h = 0.3 + rng() * 0.95;
    locks.setMatrixAt(i, matrix(Math.cos(a) * (R0 - 0.06), h, Math.sin(a) * (R0 - 0.06), (rng() - 0.5) * 0.6, -a + Math.PI / 2, (rng() - 0.5) * 0.6));
    locks.setColorAt(i, col.setHex(lockCols[Math.floor(rng() * lockCols.length)]));
  }
  group.add(locks);
  // love-lock "tree" sculpture
  const lt = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.18, 0.06), locks.material, 800);
  for (let i = 0; i < 800; i++) {
    const h = rng() * 5, a = rng() * Math.PI * 2, rr = (1 - h / 5) * 1.6 + 0.1;
    lt.setMatrixAt(i, matrix(-10 + Math.cos(a) * rr, h + 0.2, 30 + Math.sin(a) * rr, 0, a));
    lt.setColorAt(i, col.setHex(lockCols[i % lockCols.length]));
  }
  group.add(lt);
  // perimeter rail on the rest of the rim
  for (let i = 0; i < 56; i++) {
    const a = a1 + ((Math.PI * 2 - (a1 - a0)) * i) / 56, a2 = a1 + ((Math.PI * 2 - (a1 - a0)) * (i + 1)) / 56;
    const p1 = [Math.cos(a) * 42.6, Math.sin(a) * 42.6], p2 = [Math.cos(a2) * 42.6, Math.sin(a2) * 42.6];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    batch.add(mats.stone(), new THREE.BoxGeometry(len + 0.1, 0.9, 0.4), matrix((p1[0] + p2[0]) / 2, 0.45, (p1[1] + p2[1]) / 2, 0, -Math.atan2(p2[1] - p1[1], p2[0] - p1[0])));
  }
  // Palgakjeong pavilion
  const pp = matrix(L.pavilion.x, 0, L.pavilion.z);
  batch.add(mats.stone(), new THREE.CylinderGeometry(4.6, 4.8, 0.8, 8), matrix(0, 0.4, 0), pp);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; batch.add(mats.redWood(), new THREE.CylinderGeometry(0.22, 0.24, 3.2, 8), matrix(Math.cos(a) * 3.6, 2.4, Math.sin(a) * 3.6), pp); }
  batch.add(mats.dancheong(), new THREE.CylinderGeometry(4, 4, 0.5, 8), matrix(0, 4.1, 0), pp);
  batch.add(mats.roofTile(), hanokRoofGeometry(10, 10, 2.6, { ridge: 0.05, upturn: 0.9, seg: 16 }), matrix(0, 4.3, 0), pp);
  // beacon mounds (Bongsudae)
  const bp = matrix(L.beacon.x, 0, L.beacon.z);
  batch.add(mats.stone(), new THREE.BoxGeometry(6, 0.6, 6), matrix(0, 0.3, 0), bp);
  batch.add(mats.stoneWall(), new THREE.CylinderGeometry(1.4, 1.8, 3, 12), matrix(0, 2.1, 0), bp);
  batch.add(mats.darkStone(), new THREE.CylinderGeometry(0.6, 1.4, 1.2, 12), matrix(0, 4.2, 0), bp);
  // panorama: hillside + city lights far below
  const hill = new THREE.Mesh(new THREE.CylinderGeometry(44, 380, 160, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 1 }));
  hill.position.y = -80;
  group.add(hill);
  const nTrees = 500;
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 7, 6), new THREE.MeshStandardMaterial({ color: 0x223a2c, roughness: 1 }), nTrees);
  const pineSnow = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3, 6), mats.snowCap(), nTrees);
  for (let i = 0; i < nTrees; i++) {
    const a = rng() * Math.PI * 2, d = 50 + rng() * 140;
    const y = -((d - 44) / (380 - 44)) * 160;
    pines.setMatrixAt(i, matrix(Math.cos(a) * d, y + 3, Math.sin(a) * d));
    pineSnow.setMatrixAt(i, matrix(Math.cos(a) * d, y + 5.5, Math.sin(a) * d));
  }
  group.add(pines, pineSnow);
  buildCityLights(group, quality, -170, 300, 2600);
}

export function buildCityLights(group, quality, y, r0, r1) {
  const rng = mulberry32(2024);
  const n = quality === 'low' ? 14000 : 42000;
  const pos = new Float32Array(n * 3), colArr = new Float32Array(n * 3);
  const c = new THREE.Color();
  const warm = [0xffd38a, 0xffe6bf, 0xfff3e0, 0xbfe0ff, 0xff9ec9];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const d = r0 + Math.pow(rng(), 0.7) * (r1 - r0);
    let px = Math.cos(a) * d, pz = Math.sin(a) * d;
    // Han river runs south of Namsan (dark band with bridge light lines)
    const riverZ = 1100 + Math.sin(px * 0.0015) * 120;
    if (Math.abs(pz - riverZ) < 110) {
      if (rng() < 0.85) { pz = riverZ + (pz < riverZ ? -120 : 120) - (rng() * 60); }
      else { px = Math.round(px / 260) * 260; }
    }
    pos.set([px, y + rng() * 6, pz], i * 3);
    c.setHex(warm[Math.floor(rng() * warm.length)]).multiplyScalar(0.6 + rng() * 0.9);
    colArr.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.5, vertexColors: true, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  group.add(pts);
  // a few lit skyscraper clusters
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: facadeTextures('glass', 0).emissive, color: 0xffffff, fog: false }), 160);
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2, d = 500 + rng() * 1800, h = 40 + rng() * 160;
    towers.setMatrixAt(i, matrix(Math.cos(a) * d, y + h / 2, Math.sin(a) * d, 0, rng() * 3, 0, 18 + rng() * 20, h, 18 + rng() * 20));
  }
  group.add(towers);
}

// Distant skyline ring + mountains so the horizon never looks empty.
export function buildSkyline(group, quality, { mountains = true, r0 = 230, r1 = 520, seed = 1 } = {}) {
  const rng = mulberry32(seed * 101);
  const n = quality === 'low' ? 120 : 260;
  const tex = facadeTextures('glass', 1).emissive.clone();
  tex.repeat.set(2, 6); tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ color: 0x0f1420, emissiveMap: tex, emissive: 0xffe2b8, emissiveIntensity: 0.9, roughness: 0.9 });
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = r0 + rng() * (r1 - r0), h = 25 + Math.pow(rng(), 2) * 140;
    m.setMatrixAt(i, matrix(Math.cos(a) * d, h / 2, Math.sin(a) * d, 0, rng() * 3, 0, 18 + rng() * 26, h, 18 + rng() * 26));
  }
  group.add(m);
  // aviation lights on top of skyline towers
  if (mountains) {
    const mt = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const d = 900 + rng() * 300;
      const h = 160 + rng() * 220;
      const geo = new THREE.ConeGeometry(320 + rng() * 200, h, 7, 3);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.85 + rng() * 0.3), p.getY(k), p.getZ(k) * (0.85 + rng() * 0.3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a3446, roughness: 1, flatShading: true }));
      mesh.position.set(Math.cos(a) * d, h / 2 - 20, Math.sin(a) * d);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(110, h * 0.32, 7), new THREE.MeshStandardMaterial({ color: 0xdfe7f5, roughness: 1, flatShading: true }));
      cap.position.set(mesh.position.x, h - 20 - h * 0.16, mesh.position.z);
      mt.add(mesh, cap);
    }
    group.add(mt);
  }
}
