// DDP (Dongdaemun Design Plaza) — single source of truth for the building layout.
// Used by the client (procedural meshes) and the server (collision/validation).
//
// IMPORTANT: this is a GAME layout (v1). Room sizes, floor heights and how the zones
// connect are estimates inspired by reference images, NOT survey data of the real DDP.
// See docs/DDP_MODELING_SPEC.md (estimated values are marked there).
//
// Local coordinates: lx along the building's long axis (east +), lz south +,
// centred on DDP.x/DDP.z. 1 unit = 1 game metre.

export const DDP = { x: -4, z: -26, rx: 60, rz: 26, H: 28, inner: 0.88, doorHalf: 4.3, F2: 5.6 };
export const L = (lx, lz) => [DDP.x + lx, DDP.z + lz];

export function ddpWob(a) { return 1 + 0.03 * Math.sin(a * 3 + 0.6) + 0.02 * Math.sin(a * 5); }
export function ddpRim(a, k = 1) { const w = ddpWob(a) * k; return [DDP.x + Math.cos(a) * DDP.rx * w, DDP.z + Math.sin(a) * DDP.rz * w]; }
export function insideDDP(x, z, k = DDP.inner) {
  const a = Math.atan2((z - DDP.z) / DDP.rz, (x - DDP.x) / DDP.rx);
  const w = ddpWob(a) * k;
  return ((x - DDP.x) / (DDP.rx * w)) ** 2 + ((z - DDP.z) / (DDP.rz * w)) ** 2 < 1;
}

// shell cut-outs (world-space), shared by the shell shader and documentation
export const OPENINGS = {
  entrance: { x: DDP.x, half: DDP.doorHalf, spring: 2.6, rise: 0.8, zMin: DDP.z + 10 }, // arch: y < spring + rise*sqrt(half²-dx²)
  storeWindows: { x0: DDP.x + 15, x1: DDP.x + 36, y0: 0.4, y1: 4.6, zMin: DDP.z + 8 },
  loopWindows: { x0: DDP.x - 38, x1: DDP.x + 34, y0: 6.3, y1: 10.6, zMax: DDP.z - 8 },
};

const F2 = DDP.F2;
// rect helper in LOCAL coords -> world collider / surface
const rectBox = (lx0, lx1, lz0, lz1, extra = {}) => {
  const [x0, z0] = L(lx0, lz0), [x1, z1] = L(lx1, lz1);
  return { t: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, cam: true, ...extra };
};
const rectSurf = (lx0, lx1, lz0, lz1, y) => { const b = rectBox(lx0, lx1, lz0, lz1); return { x: b.x, z: b.z, hw: b.hw, hd: b.hd, y }; };
const wallX = (lx, lz0, lz1, y0 = -1, y1 = 14) => rectBox(lx - 0.2, lx + 0.2, lz0, lz1, { y0, y1 });
const wallZ = (lz, lx0, lx1, y0 = -1, y1 = 14) => rectBox(lx0, lx1, lz - 0.2, lz + 0.2, { y0, y1 });

// ---------------------------------------------------------------- 2F design loop path (local)
export const LOOP_PATH = [[-43.5, -9.5], [-38, -13.5], [-30, -16.5], [-20, -18.5], [-13, -19], [0, -19.2], [13, -19], [20, -18.5], [30, -16.5], [37, -14.5], [40.5, -13]];
export const LOOP_WIDTH = 5;
function samplePath(path, step) {
  const out = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, Math.atan2(bz - az, bx - ax)]);
  }
  out.push([...path[path.length - 1], 0]);
  return out;
}
export const LOOP_SAMPLES = samplePath(LOOP_PATH, 2);

// ---------------------------------------------------------------- shell height (matches the client mesh)
export function ddpShellY(x, z) {
  const lx = x - DDP.x, lz = z - DDP.z;
  const a = Math.atan2(lz / DDP.rz, lx / DDP.rx);
  const w = ddpWob(a);
  const rho = Math.min(1, Math.hypot(lx / (DDP.rx * w), lz / (DDP.rz * w)));
  const py = Math.sqrt(1 - rho * rho);
  let y = Math.pow(py, 0.45) * DDP.H;
  y *= 1 - 0.28 * Math.exp(-((lx / (DDP.rx * 0.22)) ** 2)) * Math.pow(py, 0.3);
  y *= 0.82 + 0.18 * Math.cos((lx / DDP.rx) * 1.4);
  return y;
}
// interior ceilings (local rects) used for rendering and to keep the camera inside
export const CEILINGS = [
  { id: 'corridor', lx0: -46, lx1: -13, lz0: 1.5, lz1: 12.4, y: 5.6 },
  { id: 'store', lx0: 13, lx1: 37.2, lz0: 1, lz1: 28, y: 7 },
  { id: 'hall', lx0: 13, lx1: 37.2, lz0: -11, lz1: 1, y: 11 },
];
export function ddpCeiling(x, z) {
  const lx = x - DDP.x, lz = z - DDP.z;
  for (const c of CEILINGS) if (lx > c.lx0 && lx < c.lx1 && lz > c.lz0 && lz < c.lz1) return c.y;
  return ddpShellY(x, z);
}

// ---------------------------------------------------------------- art hall seating
export const HALL = { lx0: 13, lx1: 37, lz0: -11, lz1: 1, rows: 14, rowDepth: 1, rowTop: 17, stageX: 35, stageY: 1 };
export const hallRowY = (i) => ((i + 1) * F2) / HALL.rows; // i=0 front (near stage) ... rows-1 back (=2F)
export const SEAT_BLOCKS = [[-10, -5.6], [-4.4, 0]]; // lz ranges with seats (aisles at -11..-10, -5.6..-4.4, 0..1)

export function buildDDPLayout() {
  const surfaces = [];
  const colliders = [];
  const camColliders = [];

  // ground floor everywhere under the roof (so upper floors don't hide it)
  surfaces.push(rectSurf(-62, 62, -28, 28, 0));

  // --- main lobby (lx -13..13): atrium with west stairs and a 2F gallery on the north
  surfaces.push(rectSurf(-13, 13, -22, -8, F2)); // gallery
  surfaces.push(rectSurf(9, 13, -8, -6, F2)); // gallery spur to the art-hall bridge
  surfaces.push({ ...rectSurf(-13, -9, -8, 6, 0), y: undefined, y0: F2, y1: 0, axis: 'z' }); // grand stairs (top at north)
  colliders.push({ ...wallX(-9, -8, 6, -1, 7.4), vis: 'stair' }); // stair east side (balustrade)
  colliders.push(wallX(-13, -22, 6.5, -1, F2 - 0.3)); // lobby west wall (behind stairs), ground floor part ...
  colliders.push(wallX(-13, -16.2, 6.5, F2 - 0.3, 14)); // ... upper part; 2F loop passes north of lz -16.2
  colliders.push(wallX(-13, 12.2, 28)); // ... opening lz 6.5..12.2 to the exhibition corridor
  colliders.push(wallX(13, -22, 1, -1, F2 - 0.3)); // lobby/hall wall, ground floor part
  colliders.push(wallX(13, -6, 1, F2 - 0.3, 14)); // upper part (2F open north of lz -10: loop + bridge)
  colliders.push(wallX(13, 1, 6, -1, 14), wallX(13, 12, 28, -1, 14)); // lobby/store wall, door lz 6..12
  // gallery balustrade (2F only)
  for (const c of [wallZ(-8, -9, 9, F2 - 0.6, F2 + 1.4), wallX(9, -8, -6, F2 - 0.6, F2 + 1.4), wallZ(-6, 9, 13, F2 - 0.6, F2 + 1.4)]) colliders.push({ ...c, vis: 'rail' });

  // --- exhibition corridor (1F, lx -40..-13, lz 6.5..12.2) + west landing + ramp up to the loop
  colliders.push(wallZ(6.3, -40, -13), wallZ(12.4, -46, -13));
  colliders.push(wallX(-40, 1.5, 6.3)); // landing east side
  surfaces.push({ ...rectSurf(-46, -41, -9.5, 2, 0), y: undefined, y0: F2, y1: 0, axis: 'z' }); // west ramp
  colliders.push(wallX(-41, -9.5, 1.5, -1, 7.4), wallX(-46, -9.5, 1.5, -1, 7.4));
  colliders.push(wallZ(1.5, -41, -40)); // close the gap next to the ramp foot

  // --- 2F design loop (north): walkway squares + inner glass railing
  for (const [lx, lz] of LOOP_SAMPLES) {
    surfaces.push(rectSurf(lx - 2.6, lx + 2.6, lz - 2.6, lz + 2.6, F2));
    camColliders.push(rectBox(lx - 2.6, lx + 2.6, lz - 2.6, lz + 2.6, { y0: F2 - 0.55, y1: F2 + 0.05 }));
  }
  // inner (south) railing of the loop where there is a drop: west part and east end
  const railSeg = (a, b) => {
    const [ax, az] = L(...a), [bx, bz] = L(...b);
    const dx = bx - ax, dz = bz - az;
    return { t: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, hw: Math.hypot(dx, dz) / 2 + 0.05, hd: 0.15, rot: Math.atan2(-dz, dx), y0: F2 - 0.6, y1: F2 + 1.4, cam: true, vis: 'rail' };
  };
  const inner = (p, q) => { // offset of the path towards the building centre (south) by half the width
    const [ax, az] = p, [bx, bz] = q, d = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / d, nz = (bx - ax) / d; // left normal; path runs west->east so left is north
    return [[ax - nx * LOOP_WIDTH / 2, az - nz * LOOP_WIDTH / 2], [bx - nx * LOOP_WIDTH / 2, bz - nz * LOOP_WIDTH / 2]];
  };
  for (let i = 0; i < LOOP_PATH.length - 1; i++) {
    const [p, q] = [LOOP_PATH[i], LOOP_PATH[i + 1]];
    if (p[0] >= -13 && q[0] <= 13) continue; // lobby gallery has its own balustrade
    if (p[0] >= 13 && q[0] <= 37) continue; // art hall's north wall bounds the loop here
    if (p[0] < -41 && q[0] < -40) continue; // ramp top
    const [a, b] = inner(p, q);
    colliders.push(railSeg(a, b));
  }
  colliders.push(railSeg([-41, -9.5], [-41, -11.5]));
  colliders.push(railSeg([37, -11.6], [38, -11.6]), railSeg([43, -11.6], [44, -11.6]));

  // --- art hall (lx 13..37, lz -11..1): raked rows rising west to the 2F level
  colliders.push(wallZ(HALL.lz0, 13, 38), wallX(37.2, HALL.lz0, HALL.lz1));
  colliders.push(wallZ(HALL.lz1, 13, 31), wallZ(HALL.lz1, 34, 38)); // hall/store wall, door lx 31..34
  surfaces.push(rectSurf(13, HALL.rowTop, HALL.lz0, HALL.lz1, F2)); // top platform -> bridge to gallery
  surfaces.push(rectSurf(11, 13.6, -10, -6, F2)); // the bridge
  surfaces.push(rectSurf(13, 38, -23, -11, F2)); // 2F slab over the hall foyer (loop widens here)
  const seats = [];
  for (let i = 0; i < HALL.rows; i++) {
    const x0 = HALL.rowTop + (HALL.rows - 1 - i) * HALL.rowDepth;
    surfaces.push(rectSurf(x0, x0 + HALL.rowDepth, HALL.lz0, HALL.lz1, hallRowY(i)));
    for (const [z0, z1] of SEAT_BLOCKS) {
      // seat backs (players can't walk along a row; aisles only)
      colliders.push(rectBox(x0 + 0.08, x0 + 0.32, z0, z1, { y0: hallRowY(i) - 0.5, y1: hallRowY(i) + 1.1, cam: false }));
      for (let z = z0 + 0.35; z < z1; z += 0.7) seats.push({ id: `h${i}_${Math.round((z + 20) * 10)}`, lx: x0 + 0.62, lz: z, y: hallRowY(i), ry: Math.PI / 2, row: i });
    }
  }
  // stage + front steps
  surfaces.push({ ...rectSurf(HALL.stageX - 1, HALL.stageX, HALL.lz0 + 2, HALL.lz1 - 2, 0), y: undefined, y0: 0, y1: HALL.stageY, axis: 'x' });
  surfaces.push(rectSurf(HALL.stageX, 37, HALL.lz0 + 0.2, HALL.lz1 - 0.2, HALL.stageY));
  colliders.push(rectBox(HALL.stageX - 1, HALL.stageX, HALL.lz0, HALL.lz0 + 2, { y0: -1, y1: 0.9, vis: 'none' }), rectBox(HALL.stageX - 1, HALL.stageX, HALL.lz1 - 2, HALL.lz1, { y0: -1, y1: 0.9, vis: 'none' }));

  // --- design store (lx 13..37, lz 1..ring) door east -> foyer
  colliders.push(wallX(37.2, 1, 3), wallX(37.2, 8, 28));
  const store = {
    tables: [[18, 8], [23, 6], [23, 12], [28, 9], [33, 6], [33, 12]],
    shelves: [[14.6, 4, 0], [14.6, 9, 0], [14.6, 14, 0]],
    counter: [30, 16.5],
  };
  for (const [tx, tz] of store.tables) colliders.push(rectBox(tx - 1.3, tx + 1.3, tz - 0.8, tz + 0.8, { y0: -1, y1: 1.3, cam: false }));
  for (const [sx, sz] of store.shelves) colliders.push(rectBox(sx - 0.5, sx + 0.5, sz - 1.6, sz + 1.6, { y0: -1, y1: 2.4, cam: false }));
  colliders.push(rectBox(store.counter[0] - 2, store.counter[0] + 2, store.counter[1] - 0.5, store.counter[1] + 0.5, { y0: -1, y1: 1.2, cam: false }));

  // --- east foyer + stairs down from the loop
  surfaces.push({ ...rectSurf(38, 43, -12, 0, 0), y: undefined, y0: F2, y1: 0, axis: 'z' });
  colliders.push(wallX(38, -12, 0, -1, 7.4), wallX(43, -12, 0, -1, 7.4));
  colliders.push(wallZ(-12.2, 37, 38, -1, F2 - 0.3), wallZ(-12.2, 43, 46, -1, F2 - 0.3));

  // --- lobby centrepiece, exhibits and benches (1F)
  const lobby = { ornament: [0, 4], tree: [6, 14], sculpture: [-5, -14], benches: [[-3, 16], [3, 16]] };
  colliders.push({ t: 'circle', x: L(...lobby.ornament)[0], z: L(...lobby.ornament)[1], r: 2.6 });
  colliders.push({ t: 'circle', x: L(...lobby.tree)[0], z: L(...lobby.tree)[1], r: 1.8 });
  colliders.push({ t: 'circle', x: L(...lobby.sculpture)[0], z: L(...lobby.sculpture)[1], r: 1.1 });
  for (const [bx, bz] of lobby.benches) colliders.push(rectBox(bx - 1, bx + 1, bz - 0.35, bz + 0.35, { y0: -1, y1: 0.9, cam: false }));

  // --- outer/inner shell rings (open at the entrance)
  const N = 140;
  for (const [k, thick] of [[1, 0.6], [DDP.inner, 0.35]]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const [x0, z0] = ddpRim(a0, k), [x1, z1] = ddpRim(a1, k);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.abs(mx - DDP.x) < DDP.doorHalf && mz > DDP.z) continue;
      const dx = x1 - x0, dz = z1 - z0;
      colliders.push({ t: 'box', x: mx, z: mz, hw: Math.hypot(dx, dz) / 2 + 0.05, hd: thick, rot: Math.atan2(-dz, dx), cam: true });
    }
  }
  const zo = ddpRim(Math.PI / 2, 1)[1], zi = ddpRim(Math.PI / 2, DDP.inner)[1];
  for (const sx of [-1, 1]) colliders.push({ t: 'box', x: DDP.x + sx * (DDP.doorHalf + 0.3), z: (zo + zi) / 2, hw: 0.3, hd: (zo - zi) / 2 + 0.5, cam: true });

  // --- interactables
  const artworks = [
    { id: 'art1', title: '눈의 궤적 (Snow Orbit)', desc: '눈송이가 떨어지는 궤적을 원으로 표현한 그래픽 작업.' },
    { id: 'art2', title: '서울의 밤 #12', desc: '겨울 서울 야경의 색을 그라데이션으로 담은 포스터.' },
    { id: 'art3', title: '곡선 연구', desc: 'DDP의 곡면에서 영감을 받은 선 드로잉.' },
    { id: 'art4', title: '빛의 정원', desc: 'LED 장미정원의 빛을 추상화한 작업.' },
    { id: 'art5', title: '캐럴 스코어', desc: '크리스마스 캐럴 악보를 시각화한 타이포그래피.' },
    { id: 'art6', title: '겨울 패턴', desc: '전통 문양과 눈 결정의 대칭을 결합한 패턴.' },
  ].map((a, i) => ({ ...a, lx: -17 - i * 3.9, lz: 6.55, y: 1.6, face: 'south' }));
  const products = [
    { id: 'p1', name: 'DDP 곡면 엽서 세트', desc: 'DDP 외관 곡선을 담은 엽서 (전시 소품)', shape: 'card', table: 0 },
    { id: 'p2', name: '눈꽃 오너먼트', desc: '전통 매듭에서 영감을 받은 오너먼트 (전시 소품)', shape: 'ornament', table: 1 },
    { id: 'p3', name: '스노우볼 서울', desc: '남산타워가 들어간 스노우볼 (전시 소품)', shape: 'globe', table: 2 },
    { id: 'p4', name: '한지 무드등', desc: '한지로 만든 작은 조명 (전시 소품)', shape: 'lamp', table: 3 },
    { id: 'p5', name: '캐럴 오르골', desc: '태엽을 감으면 캐럴이 흐르는 오르골 (전시 소품)', shape: 'box', table: 4 },
    { id: 'p6', name: 'LED 장미 미니어처', desc: 'DDP 장미정원 미니어처 (전시 소품)', shape: 'rose', table: 5 },
  ].map((p) => ({ ...p, lx: store.tables[p.table][0], lz: store.tables[p.table][1], y: 1.25 }));

  return { surfaces, colliders, camColliders, seats, store, lobby, artworks, products };
}

// ---------------------------------------------------------------- zones (names, warps, map)
export const ZONES = [
  { id: 'plaza', name: '외부 광장', warp: [0, 34, 0] },
  { id: 'lobby', name: '메인 로비', warp: [0, 14, 0] },
  { id: 'exhibition', name: '전시 공간', warp: [-27, 9.4, 0] },
  { id: 'store', name: '디자인 스토어', warp: [24, 15, 0] },
  { id: 'hall', name: '아트홀', warp: [32.5, -5, 0] },
  { id: 'loop', name: '디자인 둘레길', warp: [-25, -17.5, F2] },
];

export function ddpZoneOf(x, y, z) {
  if (!insideDDP(x, z, 0.92)) return 'plaza';
  const lx = x - DDP.x, lz = z - DDP.z;
  if (lx >= 13 && lx <= 37.5 && lz >= HALL.lz0 && lz <= HALL.lz1) return 'hall';
  if (lx >= 13 && lx <= 37.5 && lz > HALL.lz1) return 'store';
  if (y > 3) return lx > -13 && lx < 13 && lz > -22 ? 'lobby' : 'loop';
  if (lx <= -13 && lz > 1) return 'exhibition';
  if (lx >= 37.5) return 'loop';
  if (lx < -40) return 'exhibition';
  return 'lobby';
}

// Voice: extra attenuation between floors / rooms (multiplies the 3D distance falloff).
// Same zone & floor = 1. Different floor (|dy| > 3 m) = 0.15. Other room = 0.35.
// Indoors <-> outdoor plaza = 0.2 (walls & glass).
export function ddpVoiceFactor(a, b) {
  const za = ddpZoneOf(a.x, a.y || 0, a.z), zb = ddpZoneOf(b.x, b.y || 0, b.z);
  if (za === zb && Math.abs((a.y || 0) - (b.y || 0)) <= 3) return 1;
  if ((za === 'plaza') !== (zb === 'plaza')) return 0.2;
  if (Math.abs((a.y || 0) - (b.y || 0)) > 3) return 0.15;
  return 0.35;
}
