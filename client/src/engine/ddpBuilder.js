// DDP (Dongdaemun Design Plaza) — procedural 3D building, exterior + connected interior.
// Everything here is generated from shared/ddp.js (the same data the collision and the
// server use), so what you see is what you can walk on. No external models are used:
// see docs/DDP_ASSET_MANIFEST.md.
import * as THREE from 'three';
import { mats } from './materials.js';
import { matrix, Batch } from './batch.js';
import { panelTexture } from './textures.js';
import { buildChristmasTree } from './props.js';
import {
  DDP, L, ddpWob, ddpRim, insideDDP, ddpShellY, OPENINGS, LOOP_PATH, LOOP_WIDTH, HALL, hallRowY, SEAT_BLOCKS, CEILINGS,
} from '../../../shared/ddp.js';

const F2 = DDP.F2;
const TAU = Math.PI * 2;
const lw = (lx, lz) => L(lx, lz); // local -> world [x,z]

// ---------------------------------------------------------------- small helpers
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}

export function textPanel(lines, { w = 512, h = 256, bg = '#141a33', fg = '#ffffff', accent = '#ff6fae', border = true } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = accent; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([text, size, color], i) => {
      g.font = `bold ${size}px "Noto Sans KR", sans-serif`;
      g.fillStyle = color || fg;
      g.shadowColor = accent; g.shadowBlur = i === 0 ? 14 : 0;
      g.fillText(text, w / 2, h * ((i + 1) / (lines.length + 1)));
    });
  });
}

const glow = (hex, k = 1.6) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

function concreteTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#b9b5ae'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.strokeStyle = 'rgba(90,86,80,0.35)'; g.lineWidth = 2;
    for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let x = 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    g.fillStyle = 'rgba(80,76,70,0.5)';
    for (let y = 32; y < 256; y += 64) for (let x = 32; x < 256; x += 64) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); } // form-tie holes
  }, { repeat: [1, 1] });
}

// geometry of a box between two local points (a wall/rail segment)
function segBox(ax, az, bx, bz, y0, y1, thick) {
  const [wx0, wz0] = lw(ax, az), [wx1, wz1] = lw(bx, bz);
  const len = Math.hypot(wx1 - wx0, wz1 - wz0);
  const g = new THREE.BoxGeometry(len, y1 - y0, thick);
  return { g, m: matrix((wx0 + wx1) / 2, (y0 + y1) / 2, (wz0 + wz1) / 2, 0, Math.atan2(-(wz1 - wz0), wx1 - wx0), 0) };
}

// k (outline scale) where the shell surface is at height y for angle a
function shellK(a, y) {
  let lo = 0.3, hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    const [x, z] = ddpRim(a, m);
    if (ddpShellY(x, z) > y) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// a band that follows the building outline. kf(a, y) gives the outline scale per vertex,
// y0/y1 can be numbers or functions of (x, z, a). keep(mx, mz) filters segments.
function ringStrip({ kf, y0, y1, keep = () => true, rows = 1, N = 280, uLen = 4, vScale = 1 }) {
  const pos = [], uv = [], idx = [];
  const val = (v, x, z, a) => (typeof v === 'function' ? v(x, z, a) : v);
  let len = 0, prev = null, vi = 0, open = false;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const [bx, bz] = ddpRim(a, 0.88);
    const ya = val(y0, bx, bz, a), yb = val(y1, bx, bz, a);
    if (prev) len += Math.hypot(bx - prev[0], bz - prev[1]);
    prev = [bx, bz];
    for (let r = 0; r <= rows; r++) {
      const y = ya + ((yb - ya) * r) / rows;
      const [px, pz] = ddpRim(a, kf(a, y));
      pos.push(px, y, pz);
      uv.push(len / uLen, ((y - ya) / Math.max(0.01, yb - ya)) * vScale);
    }
    if (i > 0) {
      const [mx, mz] = ddpRim(((i - 0.5) / N) * TAU, 0.95);
      if (keep(mx, mz)) {
        const s = vi - (rows + 1);
        for (let r = 0; r < rows; r++) idx.push(s + r, s + r + 1, vi + r, s + r + 1, vi + r + 1, vi + r);
      }
    }
    vi += rows + 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// polygon = rect ∩ (inner outline), as a THREE.Shape in (x, -z) space (for rotateX(-PI/2))
function clippedRectShape(lx0, lx1, lz0, lz1, k = 0.875) {
  const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
  const pts = [];
  const edge = (ax, az, bx, bz) => { const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 1)); for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n]); };
  edge(lx0, lz0, lx1, lz0); edge(lx1, lz0, lx1, lz1); edge(lx1, lz1, lx0, lz1); edge(lx0, lz1, lx0, lz0);
  const shape = new THREE.Shape();
  pts.forEach(([px, pz], i) => {
    let [wx, wz] = lw(px, pz);
    if (!insideDDP(wx, wz, k)) { // pull towards the rect centre until inside
      const [cxw, czw] = lw(cx, cz);
      let lo = 0, hi = 1;
      for (let j = 0; j < 18; j++) { const m = (lo + hi) / 2; insideDDP(cxw + (wx - cxw) * m, czw + (wz - czw) * m, k) ? (lo = m) : (hi = m); }
      wx = cxw + (wx - cxw) * lo; wz = czw + (wz - czw) * lo;
    }
    i ? shape.lineTo(wx - DDP.x, -(wz - DDP.z)) : shape.moveTo(wx - DDP.x, -(wz - DDP.z));
  });
  return shape;
}
function slabGeo(shape, thick) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

// world-space cut-outs in the shell (entrance arch, store windows, loop windows)
function openingGLSL() {
  const E = OPENINGS.entrance, S = OPENINGS.storeWindows, W = OPENINGS.loopWindows;
  const f = (v) => v.toFixed(2);
  return `bool ddpCut(vec3 p){
    float dx = abs(p.x - ${f(E.x)});
    if (p.z > ${f(E.zMin)} && dx < ${f(E.half)} && p.y < ${f(E.spring)} + ${f(E.rise)} * sqrt(max(${f(E.half * E.half)} - dx*dx, 0.0))) return true;
    if (p.z > ${f(S.zMin)} && p.x > ${f(S.x0)} && p.x < ${f(S.x1)} && p.y > ${f(S.y0)} && p.y < ${f(S.y1)}) return true;
    if (p.z < ${f(W.zMax)} && p.x > ${f(W.x0)} && p.x < ${f(W.x1)} && p.y > ${f(W.y0)} && p.y < ${f(W.y1)}) return true;
    return false; }`;
}
function withCuts(mat, key) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDdpW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDdpW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vDdpW;\n${openingGLSL()}`)
      .replace('void main() {', 'void main() {\n if (ddpCut(vDdpW)) discard;');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const archY = (dx) => OPENINGS.entrance.spring + OPENINGS.entrance.rise * Math.sqrt(Math.max(0, DDP.doorHalf ** 2 - dx * dx));
const inStoreWin = (x, z) => z > OPENINGS.storeWindows.zMin && x > OPENINGS.storeWindows.x0 && x < OPENINGS.storeWindows.x1;
const inLoopWin = (x, z) => z < OPENINGS.loopWindows.zMax && x > OPENINGS.loopWindows.x0 && x < OPENINGS.loopWindows.x1;
const inDoor = (x, z) => Math.abs(x - DDP.x) < DDP.doorHalf && z > DDP.z;

const MEDIA_FRAG = `uniform float uTime; uniform float uMode; varying vec2 vUv;
vec3 pal(float t){ return 0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+t)); }
void main(){
  float w=sin(vUv.x*26.+uTime*1.3)*0.5+0.5;
  float v=sin(vUv.y*6.-uTime*0.7+vUv.x*4.)*0.5+0.5;
  vec3 c=pal(vUv.x*1.4+vUv.y*0.3+uTime*0.06+uMode*0.3)*mix(0.12,1.0,w*v);
  vec2 g=fract(vec2(vUv.x*60., vUv.y*14.+uTime*0.8))-0.5;
  c+=smoothstep(0.12,0.0,length(g))*0.9;
  gl_FragColor=vec4(c*0.85,1.);
}`;
function mediaMaterial(mode = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMode: { value: mode } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: MEDIA_FRAG, toneMapped: false, side: THREE.DoubleSide,
  });
}

// procedural "artwork" canvases (test content, not real works)
export function artworkTexture(i, title) {
  return canvasTex(512, 640, (g, w, h) => {
    const hues = [[200, 320], [240, 30], [20, 200], [330, 120], [45, 260], [180, 0]][i % 6];
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, `hsl(${hues[0]},60%,22%)`); grd.addColorStop(1, `hsl(${hues[1]},65%,45%)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.85;
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `hsla(${(hues[0] + k * 25) % 360},90%,75%,0.8)`; g.lineWidth = 3 + (k % 3) * 3;
      g.beginPath();
      if (i % 2) g.arc(w / 2, h * 0.42, 40 + k * 22, k * 0.4, k * 0.4 + 4.2);
      else { g.moveTo(0, 80 + k * 50); g.bezierCurveTo(w * 0.3, k * 60, w * 0.7, h - k * 40, w, 120 + k * 45); }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, h - 110, w, 110);
    g.fillStyle = '#fff'; g.font = 'bold 34px "Noto Sans KR", sans-serif'; g.textAlign = 'left'; g.fillText(title, 24, h - 62);
    g.fillStyle = '#ffd1e6'; g.font = '22px "Noto Sans KR", sans-serif'; g.fillText('테스트용 콘텐츠 · E 키로 보기', 24, h - 26);
  });
}

// ---------------------------------------------------------------- main
export function buildDDPBuilding(group, r, updaters, quality) {
  const D = r.ddp;
  const batch = new Batch();
  const { x: X, z: Z, rx, rz } = DDP;
  const lights = { low: 2, medium: 4, high: 6 }[quality] ?? 4;

  // materials (DDP-local, disposed with the region)
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0xdedad2, roughness: 0.92 });
  const whiteWall = new THREE.MeshStandardMaterial({ color: 0xe9e6ef, roughness: 0.75, emissive: 0x15121a });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xd9d6de, roughness: 0.6, emissive: 0x0d0b10 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x8b8a96, roughness: 0.28, metalness: 0.25 });
  const woodMat = mats.wood();
  const darkPanel = new THREE.MeshStandardMaterial({ color: 0x24202c, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8c8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  glassMat.userData.noShadow = true;
  const windowGlass = new THREE.MeshStandardMaterial({ color: 0x86a6d8, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false });
  windowGlass.userData.noShadow = true;
  const ledWarm = glow(0xffd9a8, 1.8), ledPink = glow(0xff7ac8, 1.6), ledCool = glow(0x9fdcff, 1.6), ledPurple = glow(0xa070ff, 1.5);

  // ============================================================ exterior shell
  const geo = new THREE.SphereGeometry(1, 160, 56, 0, TAU, 0, Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const wob = ddpWob(a);
    const ex = px * rx * wob, ez = pz * rz * wob;
    let yy = Math.pow(Math.max(py, 0), 0.45) * DDP.H;
    yy *= 1 - 0.28 * Math.exp(-Math.pow(ex / (rx * 0.22), 2)) * Math.pow(Math.max(py, 0), 0.3);
    yy *= 0.82 + 0.18 * Math.cos((ex / rx) * 1.4);
    pos.setXYZ(i, ex, yy, ez);
    uv.setXY(i, uv.getX(i) * 70, uv.getY(i) * 14);
  }
  geo.computeVertexNormals();
  const shellMat = withCuts(new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.36, metalness: 0.65, color: 0xd6dbe4, emissive: 0x141a2a }), 'ddp-shell');
  const shell = new THREE.Mesh(geo, shellMat);
  shell.position.set(X, 0, Z);
  shell.castShadow = true; shell.receiveShadow = true;
  group.add(shell);
  // interior face of the roof: warm white with ribs (seen from the atrium)
  const ribTex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#ece8f2'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#cdc7da'; for (let i = 0; i < 256; i += 32) g.fillRect(i, 0, 3, 64);
    g.fillStyle = 'rgba(255,214,170,0.6)'; g.fillRect(0, 30, 256, 3);
  }, { repeat: [1, 1] });
  const ceilMat = withCuts(new THREE.MeshStandardMaterial({ map: ribTex, side: THREE.BackSide, roughness: 0.9, color: 0x8a8598, emissive: 0x2a2232, emissiveIntensity: 1 }), 'ddp-ceil');
  const ceil = new THREE.Mesh(geo, ceilMat);
  ceil.position.set(X, -0.02, Z);
  ceil.scale.setScalar(0.995);
  group.add(ceil);

  // glazed base band with warm windows (gaps at the door and at the store windows)
  const bandTex = canvasTex(256, 64, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 256; i += 32) { g.fillStyle = 'rgba(255,190,120,0.85)'; g.fillRect(i + 3, 6, 26, 52); }
  }, { repeat: [1, 1] });
  const band = new THREE.Mesh(ringStrip({ kf: (a, y) => shellK(a, y) + 0.004, y0: 0, y1: 0.4, rows: 1, keep: (x, z) => !inDoor(x, z) && !inStoreWin(x, z) }),
    new THREE.MeshStandardMaterial({ color: 0x141a28, roughness: 0.12, metalness: 0.7, emissive: 0xffc58a, emissiveMap: bandTex, emissiveIntensity: 0.35, side: THREE.DoubleSide }));
  group.add(band);
  // glass in the window cut-outs, following the shell curvature exactly
  const storeGlass = ringStrip({ kf: (a, y) => shellK(a, y) - 0.0015, y0: OPENINGS.storeWindows.y0, y1: OPENINGS.storeWindows.y1, rows: 4, keep: inStoreWin, N: 420 });
  const loopGlass = ringStrip({ kf: (a, y) => shellK(a, y) - 0.0015, y0: OPENINGS.loopWindows.y0, y1: OPENINGS.loopWindows.y1, rows: 4, keep: inLoopWin, N: 420 });
  group.add(new THREE.Mesh(storeGlass, windowGlass), new THREE.Mesh(loopGlass, windowGlass));
  // diagonal mullions in the openings (reference: slanted glazing bars)
  for (const [W, zSide] of [[OPENINGS.storeWindows, 1], [OPENINGS.loopWindows, -1]]) {
    let n = 0;
    for (let x = W.x0 + 1.5; x < W.x1 - 0.5; x += 2.6, n++) {
      const lx = x - X, lz = zSide * rz * Math.sqrt(Math.max(0, 1 - (lx / rx) ** 2));
      const a = Math.atan2(lz / rz, lx / rx);
      const ym = (W.y0 + W.y1) / 2, k = shellK(a, ym);
      const [px, pz] = ddpRim(a, k);
      const h = W.y1 - W.y0;
      batch.add(mats.lightMetal(), new THREE.BoxGeometry(0.14, h * 1.12, 0.14), matrix(px, ym, pz, 0, -a + Math.PI / 2, (n % 2 ? 1 : -1) * 0.38, 1, 1, 1));
      batch.add(mats.lightMetal(), new THREE.BoxGeometry(2.6, 0.1, 0.1), matrix(px, W.y1 - 0.05, pz, 0, -a + Math.PI / 2, 0));
    }
  }
  // media facade above the entrance (follows the shell)
  const facadeMat = mediaMaterial(0);
  const facade = new THREE.Mesh(ringStrip({ kf: (a, y) => shellK(a, y) + 0.008, y0: 7.4, y1: 12.2, rows: 6, keep: (x, z) => z > Z + 14 && Math.abs(x - X) < 30, N: 360, uLen: 60, vScale: 1 }), facadeMat);
  group.add(facade);
  updaters.push((dt, t) => { facadeMat.uniforms.uTime.value = t; });

  // ============================================================ entrance (arched tunnel through the shell)
  const zo = ddpRim(Math.PI / 2, 1)[1], zi = ddpRim(Math.PI / 2, DDP.inner)[1];
  {
    const n = 24, pts = [], idx = [], uvs = [];
    for (let i = 0; i <= n; i++) {
      const dx = -DDP.doorHalf + (2 * DDP.doorHalf * i) / n;
      pts.push(X + dx, archY(dx), zi - 0.5, X + dx, archY(dx), zo + 0.3);
      uvs.push(i / n * 4, 0, i / n * 4, 3);
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    ag.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ag.setIndex(idx); ag.computeVertexNormals();
    group.add(new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ map: ribTex, color: 0xfaf3ea, emissive: 0x3a2a1a, side: THREE.DoubleSide, roughness: 0.7 })));
    for (const sx of [-1, 1]) batch.add(whiteWall, new THREE.BoxGeometry(0.3, OPENINGS.entrance.spring, zo - zi + 0.8), matrix(X + sx * (DDP.doorHalf + 0.15), OPENINGS.entrance.spring / 2, (zo + zi) / 2));
    // LED arch line along the tunnel ceiling
    for (const zz of [zi, (zi + zo) / 2, zo]) {
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => { const dx = -DDP.doorHalf + (2 * DDP.doorHalf * i) / 12; return new THREE.Vector3(X + dx, archY(dx) - 0.06, zz); }));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 6), ledWarm));
    }
    // portal frame
    const fr = [new THREE.Vector3(-DDP.doorHalf, 0, 0)];
    for (let i = 0; i <= 16; i++) { const dx = -DDP.doorHalf + (2 * DDP.doorHalf * i) / 16; fr.push(new THREE.Vector3(dx, archY(dx), 0)); }
    fr.push(new THREE.Vector3(DDP.doorHalf, 0, 0));
    const frame = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fr, false, 'catmullrom', 0.05), 80, 0.16, 8), glow(0xffd6ea, 1.6));
    frame.position.set(X, 0, zo + 0.35);
    group.add(frame);
    // sign + floating marker + light beam so the door can be found from anywhere
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.7), new THREE.MeshBasicMaterial({ map: textPanel([['DDP CHRISTMAS DESIGN MARKET', 44, '#ffffff'], ['동대문디자인플라자 · 입구', 30, '#ffd1e6']], { w: 1024, h: 180 }), toneMapped: false }));
    sign.position.set(X, archY(0) + 1.0, zo + 0.9);
    group.add(sign);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7ac8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.set(X, 32, zo + 4);
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: textPanel([['입구 ENTRANCE', 64, '#ffffff'], ['DDP 실내로 들어가기', 34, '#ffd1e6']], { w: 768, h: 260, bg: '#e4407f', accent: '#ffffff' }), depthTest: false, toneMapped: false }));
    marker.scale.set(11, 3.7, 1);
    marker.renderOrder = 5;
    group.add(beam, marker);
    updaters.push((dt, t) => { marker.position.set(X, 31 + Math.sin(t * 1.4) * 0.6, zo + 4); beam.material.opacity = 0.12 + Math.sin(t * 2) * 0.05; });
    // open glass doors, carpet, flanking trees
    for (const sx of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, 0.06), glassMat);
      d.position.set(X + sx * (DDP.doorHalf - 0.9), 1.25, zi + 0.6);
      d.rotation.y = sx * 1.25;
      group.add(d);
    }
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, zo - zi + 10), new THREE.MeshStandardMaterial({ color: 0x8e1430, roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(X, 0.045, (zo + zi) / 2 - 2); carpet.receiveShadow = true;
    group.add(carpet);
    for (const sx of [-1, 1]) buildMiniTree(group, X + sx * (DDP.doorHalf + 1.7), zo + 1.6);
    if (lights > 0) { const wl = new THREE.PointLight(0xffc0de, 16, 14, 1.8); wl.position.set(X, 3, zo + 2); group.add(wl); }
  }

  // ============================================================ inner wall ring (k = 0.88)
  const topY = (x, z) => ddpShellY(x, z) + 0.4;
  const K = DDP.inner;
  const kIn = () => K;
  const plain = (x, z) => !inDoor(x, z) && !inStoreWin(x, z) && !inLoopWin(x, z);
  const innerWallMat = new THREE.MeshStandardMaterial({ color: 0xe6e2ea, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x17131c, map: canvasTex(512, 64, (g) => {
    g.fillStyle = '#efecf3'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#d9d4e2'; for (let i = 0; i < 512; i += 64) g.fillRect(i, 0, 2, 64);
  }, { repeat: [1, 1] }) });
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: 0, y1: topY, keep: plain, uLen: 8, vScale: 2 }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: (x) => archY(x - X), y1: topY, keep: inDoor, N: 600 }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: 0, y1: 0.3, keep: inStoreWin }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: 5.2, y1: topY, keep: inStoreWin }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: 0.3, y1: 5.2, keep: inStoreWin }), glassMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: 0, y1: F2 + 0.4, keep: inLoopWin }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: F2 + 4.8, y1: topY, keep: inLoopWin }), innerWallMat));
  group.add(new THREE.Mesh(ringStrip({ kf: kIn, y0: F2 + 0.4, y1: F2 + 4.8, keep: inLoopWin }), glassMat));
  // close the gap between the inner wall and the shell at the store windows (sill + head)
  for (const [y, keep] of [[0.3, inStoreWin], [5.2, inStoreWin], [F2 + 0.4, inLoopWin], [F2 + 4.8, inLoopWin]]) {
    const W = keep === inStoreWin ? OPENINGS.storeWindows : OPENINGS.loopWindows;
    const yy = y < 1 ? W.y0 : y > 5 && y < 6 ? W.y1 : y;
    group.add(new THREE.Mesh(ringStrip({ kf: (a, h) => (h === y ? K : shellK(a, yy)), y0: y, y1: y + 1e-3, keep, rows: 1 }), innerWallMat));
  }

  // ============================================================ floors
  const fshape = new THREE.Shape();
  for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU, [px, pz] = ddpRim(a, K + 0.01); i ? fshape.lineTo(px - X, -(pz - Z)) : fshape.moveTo(px - X, -(pz - Z)); }
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(fshape, 2), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(X, 0.03, Z); floor.receiveShadow = true;
  group.add(floor);
  // 2F slabs (gallery, bridge, hall foyer, design loop) straight from the walkable surfaces
  const inHallRect = (s) => s.x - s.hw >= X + HALL.lx0 - 0.01 && s.x + s.hw <= X + HALL.rowTop + 0.01 && s.z - s.hd >= Z + HALL.lz0 - 0.01 && s.z + s.hd <= Z + HALL.lz1 + 0.01;
  for (const s of r.surfaces) {
    if (s.y !== F2 || inHallRect(s)) continue;
    const g = slabGeo(clippedRectShape(s.x - s.hw - X, s.x + s.hw - X, s.z - s.hd - Z, s.z + s.hd - Z), 0.35);
    batch.add(slabMat, g, matrix(X, F2 - 0.35, Z));
  }
  // design-loop LED edge line on the floor (pink, as a guide)
  {
    const pts = LOOP_PATH.map(([lx, lz]) => { const [x, z] = lw(lx, lz + LOOP_WIDTH / 2 - 0.3); return new THREE.Vector3(x, F2 + 0.03, z); });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.05, 4), ledPink));
    const pts2 = LOOP_PATH.map(([lx, lz]) => { const [x, z] = lw(lx, lz); return new THREE.Vector3(x, F2 - 0.4, z); });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 160, 0.06, 4), ledCool)); // underside glow
  }

  // ============================================================ walls, rails and stairs from the collision data
  for (const c of D.colliders) {
    if (c.t !== 'box' || c.y0 === undefined || c.vis === 'none' || c.cam === false) continue;
    const y0 = Math.max(0, c.y0), y1 = Math.min(14, c.y1);
    if (c.vis === 'rail') {
      const rot = c.rot || 0, len = 2 * (c.hd > c.hw ? c.hd : c.hw), along = c.hd > c.hw ? Math.PI / 2 : 0;
      const ry = rot + along;
      batch.add(glassMat, new THREE.BoxGeometry(len, 1.05, 0.04), matrix(c.x, F2 + 0.55, c.z, 0, ry, 0));
      batch.add(mats.lightMetal(), new THREE.BoxGeometry(len, 0.06, 0.1), matrix(c.x, F2 + 1.1, c.z, 0, ry, 0));
      batch.add(ledWarm, new THREE.BoxGeometry(len, 0.04, 0.05), matrix(c.x, F2 + 0.02, c.z, 0, ry, 0));
      continue;
    }
    if (c.vis === 'stair') continue; // drawn with the stairs
    // walls: clip the long axis to the inner outline
    const alongX = c.hw >= c.hd;
    let a0 = alongX ? c.x - c.hw : c.z - c.hd, a1 = alongX ? c.x + c.hw : c.z + c.hd;
    const at = (v) => (alongX ? [v, c.z] : [c.x, v]);
    const shrink = (from, to) => { let lo = from, hi = to; if (insideDDP(...at(from), 0.885)) return from; for (let j = 0; j < 20; j++) { const m = (lo + hi) / 2; insideDDP(...at(m), 0.885) ? (hi = m) : (lo = m); } return hi; };
    const mid = (a0 + a1) / 2;
    if (!insideDDP(...at(mid), 0.885)) continue;
    a0 = shrink(a0, mid); a1 = shrink(a1, mid);
    const len = a1 - a0, cen = (a0 + a1) / 2;
    const [cx, cz] = at(cen);
    const h = y1 - y0;
    if (len < 0.05 || h < 0.05) continue;
    const thick = alongX ? 2 * c.hd : 2 * c.hw;
    const g = alongX ? new THREE.BoxGeometry(len, h, thick) : new THREE.BoxGeometry(thick, h, len);
    batch.add(whiteWall, g, matrix(cx, y0 + h / 2, cz));
  }
  // lintels above the door openings (walls are open to full height in the collision data)
  for (const [ax, az, bx, bz, y0] of [[31, 1, 34, 1, 3], [37.2, 3, 37.2, 8, 3], [13, 6, 13, 12, 3.6], [-13, 6.5, -13, 12.2, 5.65], [13, -11, 13, -6, F2 + 2.7]]) {
    const { g, m } = segBox(ax, az, bx, bz, y0, 14, 0.4);
    batch.add(whiteWall, g, m);
  }
  // stairs & ramps (every sloped surface becomes real steps)
  for (const s of r.surfaces) {
    if (s.y !== undefined) continue;
    const rise = Math.abs(s.y1 - s.y0);
    const n = Math.max(3, Math.round(rise / 0.28));
    const alongZ = s.axis === 'z';
    const len = 2 * (alongZ ? s.hd : s.hw), wid = 2 * (alongZ ? s.hw : s.hd);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const hTop = s.y0 + (s.y1 - s.y0) * ((t0 + t1) / 2) + rise / n / 2;
      const c = (alongZ ? s.z - s.hd : s.x - s.hw) + len * ((t0 + t1) / 2);
      const depth = len / n;
      const mx = alongZ ? s.x : c, mz = alongZ ? c : s.z;
      const g = alongZ ? new THREE.BoxGeometry(wid, hTop, depth) : new THREE.BoxGeometry(depth, hTop, wid);
      batch.add(rise > 2 ? woodMat : whiteWall, g, matrix(mx, hTop / 2, mz));
      if (rise > 2) { // LED nosing on every step (reference: lit wooden stairs)
        const down = s.y1 > s.y0 ? -1 : 1; // the lower edge of the tread
        const nz = alongZ ? mz + (down * depth) / 2 : mz, nx = alongZ ? mx : mx + (down * depth) / 2;
        batch.add(ledWarm, alongZ ? new THREE.BoxGeometry(wid, 0.03, 0.05) : new THREE.BoxGeometry(0.05, 0.03, wid), matrix(nx, hTop + 0.01, nz));
      }
    }
  }
  // grand stairs balustrade: sloped glass on the lobby side
  {
    const [x0, z0] = lw(-9, -8), [, z1] = lw(-9, 6);
    const len = Math.hypot(z1 - z0, F2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, len), glassMat);
    m.position.set(x0, F2 / 2 + 0.55, (z0 + z1) / 2); m.rotation.x = Math.atan2(F2, z1 - z0);
    const hr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, len), mats.lightMetal());
    hr.position.set(x0, F2 / 2 + 1.1, (z0 + z1) / 2); hr.rotation.x = m.rotation.x;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, len), ledWarm);
    led.position.set(x0, F2 / 2 + 0.05, (z0 + z1) / 2); led.rotation.x = m.rotation.x;
    group.add(m, hr, led);
  }

  // ============================================================ main lobby
  const Lb = D.lobby;
  // gallery parapet media strip facing the lobby
  {
    const mm = mediaMaterial(0.5);
    const [mx, mz] = lw(0, -7.78);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 0.9), mm);
    strip.position.set(mx, F2 - 0.75, mz);
    group.add(strip);
    updaters.push((dt, t) => { mm.uniforms.uTime.value = t * 0.9; });
  }
  // welcome screen on the west wall above the corridor opening
  addPanel(group, -12.75, 9.4, 6.8, Math.PI / 2, 6, 1.6, [['DDP Exhibition →', 54, '#ffffff'], ['전시 공간 · Exhibition Corridor', 30, '#d8c8ff']], { bg: '#1b1435', accent: '#a070ff' });
  addPanel(group, 12.75, 9, 4.6, -Math.PI / 2, 6, 1.6, [['DESIGN STORE →', 54, '#ffffff'], ['디자인 스토어', 30, '#ffd1e6']], { bg: '#2a1720', accent: '#ff7ac8' });
  addPanel(group, -11, 6.8, 3, 0, 3.2, 1.1, [['2F 디자인 둘레길 ↑', 40, '#ffffff'], ['Design Loop · 아트홀 브리지', 24, '#ffe2a6']], { bg: '#20263d', accent: '#ffd9a8' });
  addPanel(group, 0, -7.6, F2 + 2.6, 0, 7, 1.4, [['MAIN LOBBY · 메인 로비', 50, '#ffffff'], ['Merry Christmas from DDP', 28, '#ffd1e6']], { bg: '#141a33', accent: '#ff6fae' });
  // centre: floating red ornament on a lit stand
  {
    const [ox, oz] = lw(...Lb.ornament);
    batch.add(mats.lightMetal(), new THREE.CylinderGeometry(2.4, 2.6, 0.7, 40), matrix(ox, 0.35, oz));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.06, 6, 64), glow(0xffd6ea, 2));
    ring.rotation.x = Math.PI / 2; ring.position.set(ox, 0.72, oz); group.add(ring);
    const orn = new THREE.Group();
    orn.add(new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 28), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.15, metalness: 0.85, emissive: 0x2a0008 })));
    for (const yb of [-0.9, 0, 0.9]) { const b = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(4.41 - yb * yb) + 0.02, 0.08, 8, 64), mats.gold()); b.rotation.x = Math.PI / 2; b.position.y = yb; orn.add(b); }
    const capm = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 16), mats.gold()); capm.position.y = 2.25; orn.add(capm);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.05, 6, 80), glow(0x9fdcff, 2)); orbit.rotation.x = 1.2; orn.add(orbit);
    orn.position.set(ox, 4.6, oz);
    group.add(orn);
    updaters.push((dt, t) => { orn.rotation.y = t * 0.3; orn.position.y = 4.6 + Math.sin(t * 0.9) * 0.25; orbit.rotation.z = t * 0.8; });
  }
  // lobby Christmas tree
  { const [tx, tz] = lw(...Lb.tree); const tr = buildChristmasTree(group, { x: tx, z: tz, r: 1.7, h: 7 }, quality, 0); updaters.push(tr.update); }
  // red ribbon sculpture
  {
    const [sx, sz] = lw(...Lb.sculpture);
    const sc = new THREE.Mesh(new THREE.TorusKnotGeometry(1.0, 0.22, 120, 12, 2, 3), new THREE.MeshStandardMaterial({ color: 0xd0142e, roughness: 0.2, metalness: 0.5, emissive: 0x300008 }));
    sc.position.set(sx, 2.2, sz); sc.castShadow = true; group.add(sc);
    batch.add(whiteWall, new THREE.CylinderGeometry(1.1, 1.1, 0.6, 32), matrix(sx, 0.3, sz));
    updaters.push((dt, t) => { sc.rotation.y = t * 0.2; });
  }
  for (const [bx, bz] of Lb.benches) { const [x, z] = lw(bx, bz); batch.add(mats.white(), new THREE.BoxGeometry(2, 0.45, 0.7), matrix(x, 0.23, z)); }
  // information desk next to the entrance
  { const [x, z] = lw(7.5, 18); batch.add(whiteWall, new THREE.CylinderGeometry(1.6, 1.6, 1.05, 32, 1, false, 0, Math.PI), matrix(x, 0.53, z, 0, Math.PI, 0)); addPanel(group, 7.5, 19.75, 1.9, 0, 2.6, 0.7, [['INFORMATION · 안내', 40, '#ffffff']], { bg: '#20263d', accent: '#9fdcff' }); }
  // ceiling LED curves under the dome (reference: flowing light lines)
  for (const k of [0.32, 0.5, 0.66]) {
    const pts = [];
    for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU, [px, pz] = ddpRim(a, k); pts.push(new THREE.Vector3(px, ddpShellY(px, pz) - 0.7, pz)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.09, 5, true), k === 0.5 ? ledPink : ledWarm));
  }

  // ============================================================ exhibition corridor (barrel vault)
  {
    const lx0 = -40, lx1 = -13, zN = 6.5, zS = 12.2, cz = (zN + zS) / 2, R = (zS - zN) / 2, spring = 5.6 - R;
    const vault = new THREE.CylinderGeometry(R, R, lx1 - lx0, 32, 1, true, 0, Math.PI);
    vault.rotateZ(Math.PI / 2); // axis along x, half towards +y
    const [vx, vz] = lw((lx0 + lx1) / 2, cz);
    const vm = new THREE.Mesh(vault, new THREE.MeshStandardMaterial({ map: concreteTexture(), color: 0xcfcac2, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x15110d }));
    vm.material.map.repeat.set(1, 6);
    vm.position.set(vx, spring, vz);
    vm.rotation.x = 0;
    group.add(vm);
    // concrete lining on the corridor walls (below the vault)
    for (const zz of [zN + 0.02, zS - 0.02]) batch.add(concrete, new THREE.BoxGeometry(lx1 - lx0, spring, 0.04), matrix(lw((lx0 + lx1) / 2, zz)[0], spring / 2, lw(0, zz)[1]));
    // landing + ramp area ceiling
    { const [x, z] = lw(-43, 7); batch.add(concrete, new THREE.BoxGeometry(6.2, 0.3, 11), matrix(x, 5.75, z)); }
    // LED floor line + purple glow at the end (reference image 3)
    const [ax, az] = lw(lx0, cz), [bx] = lw(lx1, cz);
    const line = new THREE.Mesh(new THREE.BoxGeometry(bx - ax, 0.02, 0.12), ledCool);
    line.position.set((ax + bx) / 2, 0.05, az); group.add(line);
    const endGlow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.4), new THREE.MeshBasicMaterial({ color: 0x8a4dff, transparent: true, opacity: 0.55, toneMapped: false }));
    endGlow.position.set(lw(-39.7, 0)[0], 2.6, az); endGlow.rotation.y = Math.PI / 2; group.add(endGlow);
    addPanel(group, -39.6, cz, 3.3, Math.PI / 2, 4.6, 1.2, [['DDP Exhibition', 52, '#ffffff'], ['겨울 디자인 기획전 (테스트 전시)', 28, '#d8c8ff']], { bg: '#1b1435', accent: '#a070ff' });
    // track lights along the crown
    for (let lx = lx0 + 2; lx < lx1; lx += 3) {
      const [tx, tz] = lw(lx, cz - 0.9);
      batch.add(mats.metal(), new THREE.CylinderGeometry(0.08, 0.12, 0.3, 8), matrix(tx, 5.25, tz, 0.5, 0, 0));
      batch.add(ledWarm, new THREE.CircleGeometry(0.1, 10), matrix(tx, 5.09, tz - 0.08, Math.PI / 2 + 0.5, 0, 0));
    }
    // artworks (interactive, test content)
    D.artworks.forEach((art, i) => {
      const [x, z] = lw(art.lx, art.lz + 0.02);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 0.08), mats.metal());
      frame.position.set(x, art.y, z); group.add(frame);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.25), new THREE.MeshBasicMaterial({ map: artworkTexture(i, art.title), toneMapped: false }));
      pic.position.set(x, art.y, z + 0.05); group.add(pic);
      const spot = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshBasicMaterial({ map: radialGlowTex(), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      spot.position.set(x, art.y + 0.2, z + 0.03); group.add(spot);
    });
    if (lights > 1) { const pl = new THREE.PointLight(0xc9b8ff, 12, 24, 1.6); pl.position.set(...[lw(-27, 9.4)].map(([x, z]) => [x, 4.2, z])[0]); group.add(pl); }
    // landing posters
    addPanel(group, -45.8, 7, 2.6, Math.PI / 2, 3.2, 1.0, [['2F 디자인 둘레길 ↑', 40, '#ffffff'], ['경사로를 따라 올라가세요', 24, '#d8c8ff']], { bg: '#1b1435', accent: '#a070ff' });
  }

  // ============================================================ design store
  {
    const C = CEILINGS.find((c) => c.id === 'store');
    const st = D.store;
    // ceiling with light panels
    batch.add(slabMat, slabGeo(clippedRectShape(C.lx0, C.lx1, C.lz0, C.lz1), 0.3), matrix(X, C.y, Z));
    for (let lx = 16; lx < 36; lx += 4) for (let lz = 3; lz < 19; lz += 4) {
      const [x, z] = lw(lx, lz);
      if (!insideDDP(x, z, 0.85)) continue;
      batch.add(ledWarm, new THREE.BoxGeometry(2.4, 0.04, 0.25), matrix(x, C.y - 0.03, z));
    }
    // concrete text wall (reference image 4) on the hall/store wall, facing south
    const [wx, wz] = lw(25, 1.25);
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.2), new THREE.MeshStandardMaterial({ map: canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#b9b5ae'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.4)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#3a3836'; g.font = 'bold 92px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.fillText('DDP DESIGN STORE', w / 2, 120);
      g.font = '40px "Noto Sans KR", sans-serif'; g.fillText('디자인 스토어 · 전시 소품 (판매하지 않음)', w / 2, 190);
    }), roughness: 0.9 }));
    tw.position.set(wx, 3, wz); group.add(tw);
    // tables + products
    st.tables.forEach(([tx, tz]) => {
      const [x, z] = lw(tx, tz);
      batch.add(woodMat, new THREE.BoxGeometry(2.6, 0.08, 1.6), matrix(x, 1.0, z));
      for (const [sx, sz] of [[-1.15, -0.65], [1.15, -0.65], [-1.15, 0.65], [1.15, 0.65]]) batch.add(mats.metal(), new THREE.BoxGeometry(0.06, 1, 0.06), matrix(x + sx, 0.5, z + sz));
      batch.add(whiteWall, new THREE.BoxGeometry(2.3, 0.6, 1.3), matrix(x, 0.3, z)); // display plinth under the table
    });
    D.products.forEach((p) => {
      const [x, z] = lw(p.lx, p.lz);
      const obj = productMesh(p.shape);
      obj.position.set(x, 1.04, z);
      group.add(obj);
      updaters.push((dt, t) => { obj.rotation.y = t * 0.5; });
    });
    // shelves along the west wall
    st.shelves.forEach(([sx, sz]) => {
      const [x, z] = lw(sx, sz);
      batch.add(whiteWall, new THREE.BoxGeometry(0.9, 2.4, 3.2), matrix(x, 1.2, z));
      for (const y of [0.6, 1.2, 1.8]) for (let k = 0; k < 5; k++) {
        const col = [0xc8102e, 0xd9b45b, 0x2f7d4f, 0x7fd1ff, 0xff8fcf][(k + Math.round(y * 3)) % 5];
        batch.add(new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }), new THREE.BoxGeometry(0.3, 0.32, 0.4), matrix(x + 0.46, y + 0.16, z - 1.2 + k * 0.6));
      }
    });
    // counter + plants
    const [cx, cz] = lw(...st.counter);
    batch.add(woodMat, new THREE.BoxGeometry(4, 1.15, 1), matrix(cx, 0.58, cz));
    addPanel(group, st.counter[0], st.counter[1] - 0.52, 0.75, Math.PI, 3.2, 0.45, [['안내 데스크 · 구매 기능 없음', 30, '#ffffff']], { bg: '#2a1720', accent: '#ff7ac8', w: 640, h: 96 });
    for (const [px, pz] of [[16, 18.5], [35.5, 4], [35.5, 14]]) {
      const [x, z] = lw(px, pz);
      batch.add(mats.darkStone(), new THREE.CylinderGeometry(0.35, 0.3, 0.6, 12), matrix(x, 0.3, z));
      batch.add(mats.treeGreen(), new THREE.SphereGeometry(0.6, 10, 8), matrix(x, 1.2, z, 0, 0, 0, 1, 1.4, 1));
    }
    addPanel(group, 37.45, 5.5, 3.7, Math.PI / 2, 3, 0.9, [['DESIGN STORE', 44, '#ffffff'], ['디자인 스토어 입구', 26, '#ffd1e6']], { bg: '#2a1720', accent: '#ff7ac8' });
    if (lights > 2) { const pl = new THREE.PointLight(0xffe0b8, 14, 26, 1.5); const [x, z] = lw(25, 10); pl.position.set(x, 6, z); group.add(pl); }
  }

  // ============================================================ art hall
  {
    const H = HALL;
    const C = CEILINGS.find((c) => c.id === 'hall');
    // dark acoustic lining on the inside of the hall walls
    const lining = (ax, az, bx, bz) => { const { g, m } = segBox(ax, az, bx, bz, 0, C.y, 0.05); batch.add(darkPanel, g, m); };
    lining(H.lx0, H.lz0 + 0.25, H.lx1 + 0.2, H.lz0 + 0.25);
    lining(H.lx0, H.lz1 - 0.25, H.lx1 + 0.2, H.lz1 - 0.25);
    lining(H.lx1 + 0.0, H.lz0, H.lx1 + 0.0, H.lz1);
    batch.add(darkPanel, new THREE.BoxGeometry(H.lx1 + 0.4 - H.lx0, 0.3, H.lz1 - H.lz0 + 0.4), matrix(lw((H.lx0 + H.lx1) / 2, 0)[0], C.y, lw(0, (H.lz0 + H.lz1) / 2)[1]));
    // raked tiers (solid risers)
    for (let i = 0; i < H.rows; i++) {
      const x0 = H.rowTop + (H.rows - 1 - i) * H.rowDepth;
      const y = hallRowY(i);
      const [x, z] = lw(x0 + H.rowDepth / 2, (H.lz0 + H.lz1) / 2);
      batch.add(darkPanel, new THREE.BoxGeometry(H.rowDepth, y, H.lz1 - H.lz0), matrix(x, y / 2, z));
      batch.add(ledPurple, new THREE.BoxGeometry(0.04, 0.03, 1), matrix(x + H.rowDepth / 2, y - 0.2, lw(0, -5)[1])); // aisle step lights
      batch.add(ledPurple, new THREE.BoxGeometry(0.04, 0.03, 1), matrix(x + H.rowDepth / 2, y - 0.2, lw(0, 0.5)[1]));
    }
    { const [x, z] = lw((H.lx0 + H.rowTop) / 2, (H.lz0 + H.lz1) / 2); batch.add(darkPanel, new THREE.BoxGeometry(H.rowTop - H.lx0, F2, H.lz1 - H.lz0), matrix(x, F2 / 2, z)); }
    // stage + LED screen
    { const [x, z] = lw((H.stageX + H.lx1) / 2, (H.lz0 + H.lz1) / 2); batch.add(woodMat, new THREE.BoxGeometry(H.lx1 - H.stageX, H.stageY, H.lz1 - H.lz0 - 0.4), matrix(x, H.stageY / 2, z)); }
    const sm = mediaMaterial(0.2);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 4.6), sm);
    { const [x, z] = lw(H.lx1 - 0.1, (H.lz0 + H.lz1) / 2); screen.position.set(x, 4.6, z); screen.rotation.y = -Math.PI / 2; }
    group.add(screen);
    updaters.push((dt, t) => { sm.uniforms.uTime.value = t * 0.7; });
    addPanel(group, H.lx1 - 0.12, (H.lz0 + H.lz1) / 2, 7.6, -Math.PI / 2, 6, 0.9, [['DDP ART HALL · 아트홀', 46, '#ffffff']], { bg: '#120e1e', accent: '#a070ff', w: 768, h: 128 });
    // seats (instanced red chairs)
    const seatGeo = (() => {
      const a = new THREE.BoxGeometry(0.56, 0.12, 0.5); a.translate(0, 0.45, 0.04);
      const b = new THREE.BoxGeometry(0.56, 0.62, 0.1); b.translate(0, 0.78, -0.24);
      const c = new THREE.BoxGeometry(0.06, 0.45, 0.4); c.translate(-0.3, 0.22, 0);
      const d = c.clone(); d.translate(0.6, 0, 0);
      const parts = [a, b, c, d].map((g) => g.toNonIndexed());
      const merged = new THREE.BufferGeometry();
      const cat = (k) => { const arrs = parts.map((p) => p.attributes[k].array); const out = new Float32Array(arrs.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of arrs) { out.set(x, o); o += x.length; } return out; };
      merged.setAttribute('position', new THREE.BufferAttribute(cat('position'), 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(cat('normal'), 3));
      return merged;
    })();
    const seats = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ color: 0xa3122a, roughness: 0.75, emissive: 0x1a0204 }), r.seats.length);
    r.seats.forEach((s, i) => seats.setMatrixAt(i, matrix(s.x, s.y, s.z, 0, s.ry, 0)));
    seats.castShadow = false; seats.receiveShadow = true;
    group.add(seats);
    // truss, speakers, exit signs
    { const [x0, z0] = lw(H.lx0 + 3, H.lz0 + 1), [x1, z1] = lw(H.lx1 - 1, H.lz1 - 1);
      for (const zz of [z0, z1]) batch.add(mats.metal(), new THREE.BoxGeometry(x1 - x0, 0.35, 0.35), matrix((x0 + x1) / 2, C.y - 1.2, zz));
      for (let k = 0; k < 6; k++) batch.add(mats.metal(), new THREE.BoxGeometry(0.3, 0.3, z1 - z0), matrix(x0 + ((x1 - x0) * k) / 5, C.y - 1.2, (z0 + z1) / 2));
      for (const zz of [z0, z1]) { batch.add(mats.metal(), new THREE.BoxGeometry(0.8, 1.6, 0.8), matrix(x1 - 0.8, 4.5, zz)); batch.add(glow(0x3a3a46, 1), new THREE.CircleGeometry(0.25, 12), matrix(x1 - 1.21, 4.7, zz, 0, -Math.PI / 2, 0)); }
    }
    for (const [lx, lz, ry] of [[32.5, 0.7, Math.PI], [15, -10.7, 0], [33.8, -10.7, 0]]) addPanel(group, lx, lz, 2.6, ry, 0.9, 0.35, [['EXIT 비상구', 40, '#ffffff']], { bg: '#0b7a3b', accent: '#0b7a3b', w: 256, h: 96, border: false });
    addPanel(group, 32.5, 1.3, 3.6, 0, 3, 0.8, [['ART HALL 아트홀', 44, '#ffffff'], ['좌석에서 E: 앉기', 24, '#d8c8ff']], { bg: '#120e1e', accent: '#a070ff' });
    if (lights > 3) { const pl = new THREE.PointLight(0xb9a0ff, 14, 26, 1.5); const [x, z] = lw(27, -5); pl.position.set(x, 8.5, z); group.add(pl); }
  }

  // ============================================================ east foyer & wayfinding
  addPanel(group, 40.5, 0.3, 2.4, 0, 3, 0.8, [['2F 디자인 둘레길 ↑', 38, '#ffffff'], ['Design Loop', 24, '#ffe2a6']], { bg: '#20263d', accent: '#ffd9a8' });
  addPanel(group, -25, -16.2, F2 + 2.6, 0, 5, 1.0, [['DESIGN LOOP · 디자인 둘레길', 40, '#ffffff'], ['창밖으로 눈 내리는 서울', 24, '#9fdcff']], { bg: '#141a33', accent: '#9fdcff' });

  // ============================================================ interior lights (warm)
  if (lights > 0) { const [x, z] = lw(0, 2); const pl = new THREE.PointLight(0xffd2a8, 30, 40, 1.4); pl.position.set(x, 9, z); group.add(pl); }
  if (lights > 4) { const [x, z] = lw(0, -15); const pl = new THREE.PointLight(0xffd2a8, 16, 30, 1.5); pl.position.set(x, F2 + 4, z); group.add(pl); }

  // ============================================================ exterior: curved planters, signposts
  for (const p of D.planters) {
    const pts = [];
    for (let a = p.a0; a <= p.a1 + 1e-6; a += 0.05) pts.push(new THREE.Vector2(Math.cos(a) * p.r, Math.sin(a) * p.r));
    const sh = new THREE.Shape();
    pts.forEach((v, i) => (i ? sh.lineTo(v.x, -v.y) : sh.moveTo(v.x, -v.y)));
    for (let i = pts.length - 1; i >= 0; i--) { const v = pts[i], k = (p.r - 1.4) / p.r; sh.lineTo(v.x * k, -v.y * k); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    batch.add(mats.white(), g, matrix(p.cx, 0, p.cz));
    if (p.sign) {
      const am = (p.a0 + p.a1) / 2;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshBasicMaterial({ map: textPanel([[p.sign, 90, '#e8e8f0']], { w: 512, h: 160, bg: '#2a2d36', accent: '#2a2d36', border: false }), toneMapped: false }));
      s.position.set(p.cx + Math.cos(am) * (p.r + 0.02), 0.55, p.cz + Math.sin(am) * (p.r + 0.02));
      s.rotation.y = Math.atan2(Math.cos(am), Math.sin(am));
      s.scale.set(1, 0.6, 1);
      group.add(s);
    }
  }
  for (const sg of D.signs) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), mats.metal()); post.position.y = 1.3; g.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.75), new THREE.MeshBasicMaterial({ map: textPanel([['🚪 DDP 입구 (남쪽 정면)', 44, '#ffffff'], ['LED 장미정원 쪽으로', 32, '#ffd1e6']], { w: 768, h: 220 }), toneMapped: false, side: THREE.DoubleSide }));
    board.position.y = 2.45; g.add(board);
    g.position.set(sg.x, 0, sg.z);
    g.rotation.y = Math.atan2(sg.x - X, sg.z - Z);
    group.add(g);
  }

  batch.build(group);
}

// ---------------------------------------------------------------- pieces
let _rg = null;
function radialGlowTex() {
  if (_rg) return _rg;
  _rg = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 40, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,236,200,0.9)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  return _rg;
}

// a text board in LOCAL coords; ry = 0 faces south (+z)
function addPanel(group, lx, lz, y, ry, w, h, lines, opts = {}) {
  const [x, z] = L(lx, lz);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textPanel(lines, { w: opts.w || 768, h: opts.h || Math.round(768 * h / w), ...opts }), toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  group.add(m);
  return m;
}

export function productMesh(shape) {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.2, ...o });
  if (shape === 'card') {
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.01, 0.3), M([0xf1e9dc, 0x9fc4ff, 0xffc6dd][i])); c.position.set((i - 1) * 0.08, 0.01 + i * 0.012, (i - 1) * 0.04); c.rotation.y = (i - 1) * 0.25; g.add(c); }
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.03), M(0xe9e6ef)); st.position.set(0, 0.2, -0.2); st.rotation.x = -0.25; g.add(st);
  } else if (shape === 'ornament') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), M(0xc8102e, { metalness: 0.8, roughness: 0.15 })); b.position.y = 0.32; g.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 10), mats.gold()); cap.position.y = 0.5; g.add(cap);
    const stand = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24), mats.gold()); stand.position.y = 0.13; stand.rotation.x = Math.PI / 2; g.add(stand);
  } else if (shape === 'globe') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.12, 20), mats.wood()); base.position.y = 0.06; g.add(base);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.35, roughness: 0.05 })); gl.position.y = 0.28; g.add(gl);
    const tw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.24, 6), M(0xffffff, { emissive: 0x5577aa })); tw.position.y = 0.3; g.add(tw);
  } else if (shape === 'lamp') {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.32, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffc27a, emissiveIntensity: 0.9, side: THREE.DoubleSide })); sh.position.y = 0.2; g.add(sh);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 16), mats.wood()); b.position.y = 0.02; g.add(b);
  } else if (shape === 'box') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.22), mats.wood()); b.position.y = 0.09; g.add(b);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.22), M(0xc8102e)); lid.position.set(0, 0.24, -0.08); lid.rotation.x = -0.9; g.add(lid);
    const key = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), mats.gold()); key.position.set(0.17, 0.1, 0); key.rotation.y = Math.PI / 2; g.add(key);
  } else { // rose
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 5), M(0x2f7d4f)); stem.position.y = 0.15; g.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7ac8).multiplyScalar(1.6), toneMapped: false })); head.position.y = 0.32; g.add(head);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 16), M(0xe9e6ef)); base.position.y = 0.025; g.add(base);
  }
  return g;
}

function buildMiniTree(group, x, z) {
  const t = new THREE.Group();
  t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.5, 12), mats.darkStone()).translateY(0.25));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 12), mats.treeGreen()); cone.position.y = 1.8; t.add(cone);
  const snow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1, 12, 1, true), mats.snowCap()); snow.position.y = 2.6; t.add(snow);
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), 26);
  const c = new THREE.Color();
  for (let k = 0; k < 26; k++) { const f = k / 26, a = f * Math.PI * 10, rr = 0.85 * (1 - f * 0.85); lights.setMatrixAt(k, matrix(Math.cos(a) * rr, 0.8 + f * 2.2, Math.sin(a) * rr)); lights.setColorAt(k, c.setHex(k % 2 ? 0xffe2a6 : 0xff8fcf).multiplyScalar(2)); }
  t.add(lights);
  t.position.set(x, 0, z);
  group.add(t);
}
