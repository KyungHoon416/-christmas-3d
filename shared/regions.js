// Seoul region layouts. Single source of truth for:
//  - client 3D geometry generation (client/src/regions/*)
//  - server movement validation (colliders, surfaces, bounds)
//  - minimap landmarks
//
// Coordinates: world metres, -Z = north, +X = east.
// Layouts are hand-authored approximations of the real street relationships
// (axis, which side each landmark sits, relative order), compressed by `scale`
// (real metres per world metre) so a region is walkable in a few minutes.
// They are NOT survey-accurate; see docs/WORLD_MAP_SPEC.md.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLES = ['glass', 'office', 'stone', 'brick', 'modern', 'glass', 'office'];

// Generate a row of buildings along Z (side: 1 = facing +X/east, -1 = facing west)
// or along X (axis 'x'). Gaps between buildings become walkable alleys.
function buildingRow(rng, { axis = 'z', fixed, from, to, depth, face, hMin = 14, hMax = 50, styles = STYLES, wMin = 12, wMax = 24, gapMin = 3, gapMax = 6, kind }) {
  const out = [];
  let p = from;
  while (p < to - wMin * 0.6) {
    const w = Math.min(to - p, wMin + rng() * (wMax - wMin));
    const h = hMin + Math.pow(rng(), 1.6) * (hMax - hMin);
    const style = styles[Math.floor(rng() * styles.length)];
    const d = depth * (0.75 + rng() * 0.25);
    const c = p + w / 2;
    const b = axis === 'z'
      ? { x: fixed + (face > 0 ? -d / 2 : d / 2), z: c, w: d, d: w, h, style, face: face > 0 ? 'east' : 'west', kind }
      : { x: c, z: fixed + (face > 0 ? -d / 2 : d / 2), w, d, h, style, face: face > 0 ? 'south' : 'north', kind };
    b.seed = Math.floor(rng() * 1e9);
    out.push(b);
    p += w + gapMin + rng() * (gapMax - gapMin);
  }
  return out;
}

function lampsAlong(axis, fixed, from, to, step) {
  const out = [];
  for (let p = from; p <= to; p += step) out.push(axis === 'z' ? { x: fixed, z: p } : { x: p, z: fixed });
  return out;
}

// ---------------------------------------------------------------- Gwanghwamun
function gwanghwamun() {
  const rng = mulberry32(1001);
  const buildings = [
    // Sejong Center for the Performing Arts (west side of the plaza)
    { x: -40, z: 8, w: 26, d: 52, h: 22, style: 'sejong', face: 'east', name: '세종문화회관', seed: 11 },
    ...buildingRow(rng, { fixed: -27, from: -70, to: -24, depth: 22, face: 1, hMin: 16, hMax: 40 }),
    ...buildingRow(rng, { fixed: -27, from: 40, to: 92, depth: 22, face: 1, hMin: 18, hMax: 55 }),
    ...buildingRow(rng, { fixed: 52, from: -70, to: 92, depth: 24, face: -1, hMin: 20, hMax: 70 }),
  ];

  const lamps = [
    ...lampsAlong('z', -21, -64, 88, 12),
    ...lampsAlong('z', 3.5, -64, 88, 12),
    ...lampsAlong('z', 23, -64, 88, 14),
    ...lampsAlong('z', 48, -64, 88, 14),
  ];
  const stalls = [];
  for (let i = 0; i < 7; i++) stalls.push({ x: -17.5, z: 34 + i * 6.5, rot: Math.PI / 2, seed: 300 + i });
  const decoTrees = [];
  for (let z = -60; z <= 88; z += 9) { decoTrees.push({ x: -23.5, z: z + 4 }); }
  for (let z = -60; z <= 88; z += 9) { decoTrees.push({ x: 25.5, z }); }

  const landmarks = {
    gate: { x: 0, z: -82, w: 34, d: 12 },
    sejong: { x: -8, z: -22 },
    yisunsin: { x: -8, z: 66 },
    tree: { x: -8, z: 18, r: 4.6, h: 22 },
    fountain: { x: -8, z: 50 },
    subway: [{ x: -16, z: -4, rot: 0 }, { x: 24.5, z: 40, rot: Math.PI }],
    photo: { x: 0, z: 30 },
  };
  const colliders = [
    { t: 'box', x: 0, z: -82, hw: 17, hd: 6 }, // gate base
    { t: 'box', x: -50, z: -88, hw: 32, hd: 2.5 }, { t: 'box', x: 50, z: -88, hw: 32, hd: 2.5 }, // palace walls
    { t: 'box', x: -8, z: -22, hw: 3.2, hd: 4.5 }, // Sejong statue base
    { t: 'box', x: -8, z: 66, hw: 2.2, hd: 2.2 }, // Yi Sun-sin column
    { t: 'circle', x: -8, z: 18, r: 4.6 }, // christmas tree
    ...landmarks.subway.map((s) => ({ t: 'box', x: s.x, z: s.z, hw: 1.8, hd: 3, rot: s.rot })),
  ];
  return {
    id: 'gwanghwamun', name: '광화문광장', en: 'Gwanghwamun Square', scale: 2.4,
    desc: '광화문과 세종대왕상, 메인 크리스마스 트리와 겨울 마켓',
    highlights: ['메인 트리', '겨울 마켓', '세종대왕상'],
    bounds: { minX: -70, maxX: 72, minZ: -78, maxZ: 92 },
    spawn: { x: -8, z: 34, rot: Math.PI },
    ground: { plaza: { x: -8.5, z: 6, hw: 12.5, hd: 86 }, road: { x: 13, z: 6, hw: 9, hd: 86 }, sidewalkE: { x: 25.5, z: 6, hw: 3.5, hd: 86 } },
    buildings, lamps, stalls, decoTrees, landmarks, colliders, surfaces: [],
    map: [
      { x: 0, z: -82, label: '광화문', icon: 'gate' },
      { x: -8, z: -22, label: '세종대왕상', icon: 'statue' },
      { x: -8, z: 18, label: '메인 트리', icon: 'tree' },
      { x: -40, z: 8, label: '세종문화회관', icon: 'building' },
      { x: -8, z: 66, label: '이순신장군상', icon: 'statue' },
      { x: -17, z: 52, label: '겨울 마켓', icon: 'market' },
    ],
  };
}

// ---------------------------------------------------------------- Seoul Plaza
function seoulPlaza() {
  const rng = mulberry32(2002);
  const buildings = [
    { x: 0, z: -62, w: 64, d: 22, h: 26, style: 'cityhall', face: 'south', name: '서울시청', seed: 21 },
    { x: 0, z: -40, w: 34, d: 14, h: 15, style: 'oldcityhall', face: 'south', name: '서울도서관', seed: 22 },
    ...buildingRow(rng, { fixed: 46, from: -60, to: 68, depth: 22, face: -1, hMin: 18, hMax: 60 }),
    ...buildingRow(rng, { axis: 'x', fixed: 52, from: -40, to: 44, depth: 22, face: -1, hMin: 20, hMax: 45 }),
  ];
  for (const b of buildings) {
    if (b.face === 'west') b.x = 46 + b.w / 2;
    if (b.face === 'north') b.z = 52 + b.d / 2;
  }
  const lamps = [
    ...lampsAlong('x', -27, -38, 38, 10), ...lampsAlong('x', 32, -38, 38, 10),
    ...lampsAlong('z', -38, -22, 30, 10), ...lampsAlong('z', 38, -22, 30, 10),
  ];
  const decoTrees = [];
  for (let x = -34; x <= 34; x += 8.5) { decoTrees.push({ x, z: -31 }); decoTrees.push({ x, z: 36 }); }
  const landmarks = {
    rink: { x: 0, z: 4, hw: 22, hd: 15 },
    tree: { x: 0, z: -22, r: 4, h: 18 },
    daehanmun: { x: -52, z: 14 },
    photo: { x: 28, z: 24 },
    subway: [{ x: -34, z: 44, rot: 0 }, { x: 40, z: -30, rot: Math.PI / 2 }],
  };
  const colliders = [
    { t: 'circle', x: 0, z: -22, r: 4 },
    // rink boards (with 4 gaps as entrances)
    { t: 'box', x: -12, z: -11.2, hw: 9.5, hd: 0.25 }, { t: 'box', x: 12, z: -11.2, hw: 9.5, hd: 0.25 },
    { t: 'box', x: -12, z: 19.2, hw: 9.5, hd: 0.25 }, { t: 'box', x: 12, z: 19.2, hw: 9.5, hd: 0.25 },
    { t: 'box', x: -22.2, z: -4, hw: 0.25, hd: 7 }, { t: 'box', x: -22.2, z: 13, hw: 0.25, hd: 6 },
    { t: 'box', x: 22.2, z: -4, hw: 0.25, hd: 7 }, { t: 'box', x: 22.2, z: 13, hw: 0.25, hd: 6 },
    { t: 'box', x: -52, z: 14, hw: 9, hd: 4 }, // Daehanmun gate
    ...landmarks.subway.map((s) => ({ t: 'box', x: s.x, z: s.z, hw: 1.8, hd: 3, rot: s.rot })),
  ];
  return {
    id: 'seoulplaza', name: '서울광장·시청', en: 'Seoul Plaza & City Hall', scale: 2.0,
    desc: '서울시청 앞 겨울 스케이트장과 포토존',
    highlights: ['스케이트장', '서울시청', '포토존'],
    bounds: { minX: -72, maxX: 72, minZ: -48, maxZ: 70 },
    spawn: { x: 0, z: 30, rot: Math.PI },
    buildings, lamps, stalls: [], decoTrees, landmarks, colliders, surfaces: [],
    ice: [{ x: 0, z: 4, hw: 22, hd: 15 }],
    map: [
      { x: 0, z: -62, label: '서울시청', icon: 'building' },
      { x: 0, z: -40, label: '서울도서관', icon: 'building' },
      { x: 0, z: 4, label: '스케이트장', icon: 'rink' },
      { x: 0, z: -22, label: '트리', icon: 'tree' },
      { x: -52, z: 14, label: '대한문', icon: 'gate' },
      { x: 28, z: 24, label: '포토존', icon: 'photo' },
    ],
  };
}

// ---------------------------------------------------------------- Cheonggyecheon
function cheonggyecheon() {
  const rng = mulberry32(3003);
  const LOW = -4;
  const buildings = [
    ...buildingRow(rng, { axis: 'x', fixed: -24, from: -92, to: 92, depth: 22, face: 1, hMin: 14, hMax: 48 }),
    ...buildingRow(rng, { axis: 'x', fixed: 24, from: -92, to: 92, depth: 22, face: -1, hMin: 14, hMax: 48 }),
  ];
  for (const b of buildings) {
    if (b.face === 'south') b.z = -24 - b.d / 2;
    if (b.face === 'north') b.z = 24 + b.d / 2;
  }
  const bridges = [{ x: -20, hw: 5 }, { x: 34, hw: 4.5 }];
  const surfaces = [
    { x: 0, z: 0, hw: 70, hd: 8, y: LOW }, // channel floor (walkways + water bed)
    { x: -76, z: 0, hw: 6, hd: 8, y0: 0, y1: LOW, axis: 'x' }, // west stairs from Cheonggye Plaza
    { x: 76, z: -5.25, hw: 6, hd: 2.75, y0: LOW, y1: 0, axis: 'x' }, // east ramps
    { x: 76, z: 5.25, hw: 6, hd: 2.75, y0: LOW, y1: 0, axis: 'x' },
    ...bridges.map((b) => ({ x: b.x, z: 0, hw: b.hw, hd: 9, y: 0 })),
  ];
  const colliders = [];
  // Street-level railings along the channel edge, with gaps for bridges.
  const rail = (z) => {
    const segs = [[-70, -25], [-15, 29.5], [38.5, 70]];
    for (const [a, b] of segs) colliders.push({ t: 'box', x: (a + b) / 2, z, hw: (b - a) / 2, hd: 0.2, y0: -0.6, y1: 1.2 });
  };
  rail(-8.2); rail(8.2);
  // Water: blocks lower-level walkers only. Stepping stones leave gaps.
  const stones = [-48, 8, 56];
  let prev = -70;
  for (const s of [...stones, 70]) {
    const a = prev, b = s === 70 ? 70 : s - 1.2;
    colliders.push({ t: 'box', x: (a + b) / 2, z: 0, hw: (b - a) / 2, hd: 2.4, y0: LOW - 1, y1: LOW + 0.3 });
    prev = s + 1.2;
  }
  // Bridge side rails (only for walkers on the bridge deck)
  for (const b of bridges) {
    colliders.push({ t: 'box', x: b.x - b.hw - 0.2, z: 0, hw: 0.2, hd: 8.2, y0: -0.6, y1: 1.2 });
    colliders.push({ t: 'box', x: b.x + b.hw + 0.2, z: 0, hw: 0.2, hd: 8.2, y0: -0.6, y1: 1.2 });
    // piers under the bridge
    colliders.push({ t: 'box', x: b.x, z: -5.5, hw: 0.8, hd: 0.8, y0: LOW - 1, y1: -0.6 });
    colliders.push({ t: 'box', x: b.x, z: 5.5, hw: 0.8, hd: 0.8, y0: LOW - 1, y1: -0.6 });
  }
  // Retaining walls on east ramps (between the ramp and water) and channel ends
  colliders.push({ t: 'box', x: 76, z: 0, hw: 6, hd: 2.4, y0: LOW - 1, y1: 1 });
  colliders.push({ t: 'circle', x: -84, z: -12, r: 2.2 }); // "Spring" sculpture
  // lower walkway: lamps, benches and planters along the stream (away from bridges)
  const nearBridge = (x) => bridges.some((b) => Math.abs(x - b.x) < b.hw + 2.5);
  const lowerLamps = [];
  for (let x = -64; x <= 66; x += 13) if (!nearBridge(x)) for (const z of [-6.9, 6.9]) lowerLamps.push({ x, z, y: LOW });
  const benches = [], planters = [];
  for (let x = -57.5; x <= 64; x += 13) {
    if (nearBridge(x)) continue;
    for (const side of [-1, 1]) {
      if ((Math.round(x) + side * 3) % 2 === 0) benches.push({ x, z: side * 7.55, ry: side > 0 ? Math.PI : 0 });
      else planters.push({ x, z: side * 7.4 });
    }
  }
  for (const b of benches) colliders.push({ t: 'box', x: b.x, z: b.z, hw: 0.95, hd: 0.32, y0: LOW - 1, y1: LOW + 1.2 });
  for (const p of planters) colliders.push({ t: 'circle', x: p.x, z: p.z, r: 0.55, y0: LOW - 1, y1: LOW + 2.5 });
  const lamps = [...lampsAlong('x', -10, -66, 66, 11), ...lampsAlong('x', 10, -66, 66, 11), ...lampsAlong('x', -20, -88, 88, 16), ...lampsAlong('x', 20, -88, 88, 16), ...lowerLamps];
  return {
    id: 'cheonggyecheon', benches, planters,
    // camera-only: keep the third-person camera out of bridge decks when walking underneath
    cameraColliders: bridges.map((b) => ({ t: 'box', x: b.x, z: 0, hw: b.hw + 0.4, hd: 9, y0: -0.75, y1: 0.25 })), name: '청계천', en: 'Cheonggyecheon Stream', scale: 3.0,
    desc: '물길을 따라 이어지는 빛의 산책로',
    highlights: ['빛 터널', '징검다리', '커플 산책길'],
    bounds: { minX: -92, maxX: 92, minZ: -24, maxZ: 24 },
    spawn: { x: -84, z: 14, rot: Math.PI / 2 },
    low: LOW, bridges, stones,
    buildings, lamps: lamps.map((l) => ({ ...l, y: Math.abs(l.z) < 9 ? LOW : 0 })), stalls: [], decoTrees: [],
    landmarks: { spring: { x: -84, z: -12 }, tunnel: { from: -60, to: -28 }, subway: [{ x: 60, z: -16, rot: Math.PI / 2 }] },
    colliders: [...colliders, { t: 'box', x: 60, z: -16, hw: 1.8, hd: 3, rot: Math.PI / 2 }],
    surfaces,
    map: [
      { x: -84, z: -12, label: '스프링', icon: 'statue' },
      { x: -44, z: 0, label: '빛 터널', icon: 'light' },
      { x: -20, z: 0, label: '광통교', icon: 'bridge' },
      { x: 34, z: 0, label: '수표교', icon: 'bridge' },
      { x: 8, z: 0, label: '징검다리', icon: 'stone' },
    ],
  };
}

// ---------------------------------------------------------------- Myeongdong
function myeongdong() {
  const rng = mulberry32(4004);
  // Street grid: main street along X at z=0 (w 10), cross streets along Z.
  const crossX = [-44, -4, 32];
  const buildings = [];
  const blocks = [];
  const xs = [-80, ...crossX.flatMap((x) => [x - 3.5, x + 3.5]), 80];
  for (let i = 0; i < xs.length; i += 2) blocks.push([xs[i], xs[i + 1]]);
  const SHOPS = ['겨울상점', '눈꽃베이커리', '루돌프 카페', '별빛 코스메틱', '산타 잡화', '포근 니트', '호호 떡볶이', '은하수 서점', '크림 디저트', '스노우 슈즈', '반짝 액세서리', '포토 스튜디오', '따끈 군고구마', '설레임 향수'];
  let n = 0;
  for (const [a, b] of blocks) {
    // north side of main street (faces south) and south side (faces north)
    for (const [fixed, face] of [[-5, 1], [5, -1]]) {
      const row = buildingRow(rng, { axis: 'x', fixed, from: a, to: b, depth: 18, face, hMin: 9, hMax: 26, wMin: 7, wMax: 13, gapMin: 0, gapMax: 0.01, styles: ['shop'], kind: 'shop' });
      for (const r of row) {
        r.z = face > 0 ? -5 - r.d / 2 : 5 + r.d / 2;
        r.sign = SHOPS[n++ % SHOPS.length];
        buildings.push(r);
      }
    }
  }
  // Back rows (beyond a 3.5m back alley)
  for (const [a, b] of blocks) {
    for (const [z0, face] of [[-26.5, 1], [26.5, -1]]) {
      const row = buildingRow(rng, { axis: 'x', fixed: z0, from: a, to: b, depth: 20, face, hMin: 14, hMax: 40, wMin: 9, wMax: 16, gapMin: 0, gapMax: 2 });
      for (const r of row) { r.z = face > 0 ? z0 - r.d / 2 : z0 + r.d / 2; buildings.push(r); }
    }
  }
  // Cathedral sits on the north-east, cut out its block.
  const cath = { x: 58, z: -52 };
  const filtered = buildings.filter((b) => !(b.x > 36 && b.z < -27));
  filtered.push({ x: cath.x, z: cath.z, w: 18, d: 34, h: 18, style: 'cathedral', face: 'south', name: '명동성당', seed: 44 });
  const lamps = [...lampsAlong('x', -4, -76, 76, 9), ...lampsAlong('x', 4, -76, 76, 9)];
  const stalls = [];
  for (let x = -70; x <= 70; x += 11) stalls.push({ x, z: (Math.round(x / 11) % 2) ? -2.2 : 2.2, rot: 0, seed: 400 + x });
  const colliders = stalls.map((s) => ({ t: 'box', x: s.x, z: s.z, hw: 1.3, hd: 0.8 }));
  colliders.push({ t: 'circle', x: 12.5, z: 0, r: 2.4 }); // street tree
  colliders.push({ t: 'box', x: -77.5, z: -2, hw: 1.8, hd: 3 }); // subway exit
  return {
    id: 'myeongdong', name: '명동', en: 'Myeongdong', scale: 2.0,
    desc: '반짝이는 간판과 노점, 명동성당까지 이어지는 쇼핑 거리',
    highlights: ['쇼핑 거리', '길거리 음식', '명동성당'],
    bounds: { minX: -80, maxX: 80, minZ: -75, maxZ: 48 },
    spawn: { x: -70, z: 0, rot: Math.PI / 2 },
    crossX, cath,
    buildings: filtered, lamps, stalls, decoTrees: [], landmarks: { tree: { x: 12.5, z: 0, r: 2.4, h: 10 }, subway: [{ x: -77.5, z: -2, rot: 0 }] },
    colliders, surfaces: [],
    map: [
      { x: 58, z: -52, label: '명동성당', icon: 'church' },
      { x: 12.5, z: 0, label: '거리 트리', icon: 'tree' },
      { x: -77.5, z: -2, label: '명동역', icon: 'subway' },
      { x: 0, z: 0, label: '명동길', icon: 'shop' },
    ],
  };
}

// ---------------------------------------------------------------- DDP
// The shell's footprint is an ellipse with a flowing "wobble"; the same function
// shapes the 3D shell (client) and the wall colliders (client + server).
export const DDP = { x: -4, z: -26, rx: 46, rz: 20, inner: 0.84, doorHalf: 4.3, doorH: 4.6 };
export function ddpWob(a) { return 1 + 0.07 * Math.sin(a * 3 + 0.6) + 0.04 * Math.sin(a * 5); }
export function ddpRim(a, k = 1) { const w = ddpWob(a) * k; return [DDP.x + Math.cos(a) * DDP.rx * w, DDP.z + Math.sin(a) * DDP.rz * w]; }
export function insideDDP(x, z, k = DDP.inner) {
  const a = Math.atan2((z - DDP.z) / DDP.rz, (x - DDP.x) / DDP.rx);
  const w = ddpWob(a) * k;
  return ((x - DDP.x) / (DDP.rx * w)) ** 2 + ((z - DDP.z) / (DDP.rz * w)) ** 2 < 1;
}

function ddpWalls() {
  // outer ring at the shell rim + inner ring (the interior wall); both open at the
  // south door, joined by a short corridor
  const out = [];
  const N = 112;
  for (const [k, thick] of [[1, 0.6], [DDP.inner, 0.35]]) {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const [x0, z0] = ddpRim(a0, k), [x1, z1] = ddpRim(a1, k);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.abs(mx - DDP.x) < DDP.doorHalf && mz > DDP.z) continue; // door
      const dx = x1 - x0, dz = z1 - z0;
      out.push({ t: 'box', x: mx, z: mz, hw: Math.hypot(dx, dz) / 2 + 0.05, hd: thick, rot: Math.atan2(-dz, dx), cam: true });
    }
  }
  const zo = ddpRim(Math.PI / 2, 1)[1], zi = ddpRim(Math.PI / 2, DDP.inner)[1];
  for (const sx of [-1, 1]) out.push({ t: 'box', x: DDP.x + sx * (DDP.doorHalf + 0.3), z: (zo + zi) / 2, hw: 0.3, hd: (zo - zi) / 2 + 0.4, cam: true });
  return out;
}

function ddp() {
  const rng = mulberry32(5005);
  const buildings = [
    ...buildingRow(rng, { fixed: 74, from: -70, to: 70, depth: 26, face: -1, hMin: 30, hMax: 80, styles: ['glass', 'modern', 'office'] }),
    ...buildingRow(rng, { axis: 'x', fixed: -66, from: -70, to: 70, depth: 20, face: 1, hMin: 14, hMax: 34 }),
  ];
  for (const b of buildings) {
    if (b.face === 'west') b.x = 74 + b.w / 2;
    if (b.face === 'south') b.z = -66 - b.d / 2;
  }
  const lamps = [...lampsAlong('x', 18, -60, 60, 12), ...lampsAlong('z', -58, -50, 60, 12), ...lampsAlong('z', 60, -50, 60, 12)];
  const landmarks = {
    ddp: { x: -4, z: -26, rx: 46, rz: 20 },
    roses: { x: 0, z: 36, hw: 34, hd: 12 },
    photo: { x: 42, z: 14 },
    tree: { x: 30, z: 0, r: 3.4, h: 15 },
    media: { x: -4, z: -5 },
    subway: [{ x: -62, z: 50, rot: 0 }],
  };
  // interior exhibition: "DDP 크리스마스 디자인 마켓"
  const interior = {
    sculpture: { x: DDP.x, z: DDP.z + 1, r: 2.6 },
    lightTree: { x: DDP.x + 20, z: DDP.z - 1, r: 2.2, h: 8 },
    booths: [
      { x: DDP.x - 24, z: DDP.z - 4, ry: 0.35, title: 'SEOUL DESIGN', sub: '서울 디자인 굿즈' },
      { x: DDP.x - 13, z: DDP.z - 9, ry: 0.15, title: 'WINTER LIGHT', sub: '빛 공예 전시' },
      { x: DDP.x - 2, z: DDP.z - 11, ry: 0, title: 'K-CRAFT', sub: '전통 공예 오너먼트' },
      { x: DDP.x + 9, z: DDP.z - 10, ry: -0.1, title: 'SNOW GLOBE', sub: '스노우볼 만들기' },
      { x: DDP.x - 27, z: DDP.z + 6, ry: 2.6, title: 'HANBOK WINTER', sub: '겨울 한복 컬렉션' },
      { x: DDP.x + 28, z: DDP.z + 6, ry: -2.6, title: 'CAROL LAB', sub: '캐럴 작곡 체험' },
    ],
    benches: [
      { x: DDP.x - 6, z: DDP.z + 6, ry: 0 }, { x: DDP.x + 6, z: DDP.z + 6, ry: 0 },
      { x: DDP.x - 15, z: DDP.z + 3, ry: 0.3 }, { x: DDP.x + 14, z: DDP.z + 7, ry: -0.2 },
    ],
  };
  const colliders = [
    ...ddpWalls(),
    { t: 'circle', x: interior.sculpture.x, z: interior.sculpture.z, r: interior.sculpture.r },
    { t: 'circle', x: interior.lightTree.x, z: interior.lightTree.z, r: interior.lightTree.r },
    ...interior.booths.map((b) => ({ t: 'box', x: b.x, z: b.z, hw: 2.1, hd: 1.5, rot: b.ry })),
    ...interior.benches.map((b) => ({ t: 'box', x: b.x, z: b.z, hw: 1, hd: 0.35, rot: b.ry })),
    { t: 'circle', x: 30, z: 0, r: 3.4 },
    { t: 'box', x: -62, z: 50, hw: 1.8, hd: 3 },
    { t: 'box', x: 42, z: 14, hw: 3.5, hd: 0.5 },
  ];
  return {
    id: 'ddp', name: 'DDP', en: 'Dongdaemun Design Plaza', scale: 2.2,
    desc: '곡면 건축물 안 크리스마스 디자인 마켓, LED 장미정원, 미디어아트',
    highlights: ['실내 디자인 마켓', 'LED 장미정원', '미디어아트'],
    bounds: { minX: -70, maxX: 74, minZ: -66, maxZ: 62 },
    spawn: { x: 0, z: 54, rot: Math.PI },
    buildings, lamps, stalls: [], decoTrees: [], landmarks, colliders, surfaces: [], interior,
    indoor: { ...DDP },
    map: [
      { x: -4, z: -26, label: 'DDP 디자인 마켓 (실내)', icon: 'building' },
      { x: DDP.x, z: ddpRim(Math.PI / 2)[1] + 1.5, label: '입구', icon: 'gate' },
      { x: 0, z: 36, label: 'LED 장미정원', icon: 'flower' },
      { x: 42, z: 14, label: '포토존', icon: 'photo' },
      { x: 30, z: 0, label: '트리', icon: 'tree' },
    ],
  };
}

// ---------------------------------------------------------------- Namsan
function namsan() {
  const landmarks = {
    tower: { x: 0, z: -6, r: 9 },
    locks: { z: 30 },
    photo: { x: -22, z: 22 },
    tree: { x: 20, z: 18, r: 3, h: 12 },
    pavilion: { x: -26, z: -18 },
    beacon: { x: 24, z: -24 },
  };
  const colliders = [
    { t: 'circle', x: 0, z: -6, r: 9 },
    { t: 'circle', x: 20, z: 18, r: 3 },
    { t: 'box', x: -26, z: -18, hw: 4, hd: 4 },
    { t: 'box', x: 24, z: -24, hw: 3, hd: 3 },
  ];
  const lamps = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    lamps.push({ x: Math.cos(a) * 40, z: Math.sin(a) * 40 });
  }
  return {
    id: 'namsan', name: '남산서울타워', en: 'N Seoul Tower', scale: 1.5,
    desc: '서울 야경이 내려다보이는 전망대와 사랑의 자물쇠',
    highlights: ['서울 야경', '사랑의 자물쇠', '커플 포토존'],
    bounds: { circle: true, x: 0, z: 0, r: 43 },
    spawn: { x: 0, z: 34, rot: Math.PI },
    buildings: [], lamps, stalls: [], decoTrees: [], landmarks, colliders, surfaces: [],
    map: [
      { x: 0, z: -6, label: 'N서울타워', icon: 'tower' },
      { x: 0, z: 40, label: '사랑의 자물쇠', icon: 'heart' },
      { x: -22, z: 22, label: '커플 포토존', icon: 'photo' },
      { x: 24, z: -24, label: '봉수대', icon: 'statue' },
    ],
  };
}

// Building footprints become colliders automatically.
function finalize(r) {
  const colliders = [...r.colliders];
  for (const b of r.buildings) colliders.push({ t: 'box', x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, rot: b.rot || 0 });
  for (const l of r.lamps) colliders.push({ t: 'circle', x: l.x, z: l.z, r: 0.18, y0: (l.y ?? 0) - 1, y1: (l.y ?? 0) + 5 });
  for (const t of r.decoTrees) colliders.push({ t: 'circle', x: t.x, z: t.z, r: 0.6 });
  for (const s of r.stalls) if (r.id !== 'myeongdong') colliders.push({ t: 'box', x: s.x, z: s.z, hw: 1.6, hd: 1.2, rot: s.rot || 0 });
  return { ...r, colliders };
}

export const REGIONS = [gwanghwamun(), seoulPlaza(), cheonggyecheon(), myeongdong(), ddp(), namsan()].map(finalize);
export const REGION_IDS = REGIONS.map((r) => r.id);
export const DEFAULT_REGION = 'gwanghwamun';
export function getRegion(id) { return REGIONS.find((r) => r.id === id); }
