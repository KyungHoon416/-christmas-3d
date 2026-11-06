// Assemble one region's 3D world from shared/regions.js data.
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/regions.js';
import { Batch, matrix, tiledPlane } from './batch.js';
import { mats } from './materials.js';
import { buildBuilding, buildSigns } from './buildings.js';
import { buildLamps, buildChristmasTree, buildDecoTrees, buildStalls, buildSubwayEntrance, buildSubwaySign, buildSnowman, stringLights, buildBench, buildPhotoZone } from './props.js';
import {
  buildGwanghwamunGate, buildSejongStatue, buildYiSunSinStatue, buildSejongCenter, buildCityHall, buildOldCityHall,
  buildDaehanmun, buildRink, buildCheonggyecheon, buildCathedral, buildDDP, buildNamsan, buildSkyline,
} from './landmarks.js';

function groundPlane(group, mat, x, z, w, d, y = 0, tile = 8) {
  const m = new THREE.Mesh(tiledPlane(w, d, w / tile, d / tile), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.matrixAutoUpdate = false; m.updateMatrix();
  group.add(m);
  return m;
}

function snowPiles(group, r, rng) {
  const spots = [];
  for (const b of r.buildings) {
    const n = Math.floor(b.w / 6) + 1;
    for (let i = 0; i < n; i++) {
      const side = Math.floor(rng() * 4);
      const hx = b.w / 2 + 0.3, hz = b.d / 2 + 0.3;
      const t = (rng() - 0.5) * 2;
      const [px, pz] = side === 0 ? [t * b.w / 2, hz] : side === 1 ? [t * b.w / 2, -hz] : side === 2 ? [hx, t * b.d / 2] : [-hx, t * b.d / 2];
      spots.push([b.x + px, b.z + pz, 0.6 + rng() * 1.2]);
    }
  }
  for (const l of r.lamps) if (rng() < 0.6) spots.push([l.x + (rng() - 0.5), l.z + (rng() - 0.5), 0.4 + rng() * 0.4, l.y || 0]);
  if (!spots.length) return;
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.snowCap(), spots.length);
  spots.forEach(([x, z, s, y = 0], i) => m.setMatrixAt(i, matrix(x, y, z, 0, rng() * 3, 0, s * 1.6, s * 0.45, s)));
  m.receiveShadow = true;
  group.add(m);
}

export function buildRegion(r, quality) {
  const group = new THREE.Group();
  group.name = 'region:' + r.id;
  const batch = new Batch();
  const updaters = [];
  const extras = { aviation: [], signs: [] };
  const rng = mulberry32(r.id.length * 997);
  const b = r.bounds;

  // ---- ground
  if (r.id === 'namsan') {
    const plateau = new THREE.Mesh(new THREE.CircleGeometry(44, 64), mats.snow());
    plateau.rotation.x = -Math.PI / 2; plateau.receiveShadow = true;
    const uv = plateau.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8);
    group.add(plateau);
    const path = new THREE.Mesh(new THREE.RingGeometry(26, 34, 64), mats.paving());
    path.rotation.x = -Math.PI / 2; path.position.y = 0.02; path.receiveShadow = true;
    const puv = path.geometry.attributes.uv;
    for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * 10, puv.getY(i) * 10);
    group.add(path);
  } else {
    const W = b.maxX - b.minX + 400, D = b.maxZ - b.minZ + 400;
    groundPlane(group, mats.snow(), (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, W, D, -0.02, 10);
  }
  if (r.id === 'gwanghwamun') {
    const g = r.ground;
    groundPlane(group, mats.paving(), g.plaza.x, g.plaza.z, g.plaza.hw * 2, g.plaza.hd * 2, 0.01, 6);
    groundPlane(group, mats.road(), g.road.x, g.road.z, g.road.hw * 2, g.road.hd * 2, 0.01, 9);
    groundPlane(group, mats.paving(), g.sidewalkE.x, g.sidewalkE.z, g.sidewalkE.hw * 2, g.sidewalkE.hd * 2, 0.012, 6);
    groundPlane(group, mats.paving(), 0, -76, 50, 14, 0.012, 6);
    // lane markings
    for (let zz = -60; zz < 90; zz += 8) groundPlane(group, mats.white(), 13, zz, 0.15, 3.5, 0.02, 1);
  } else if (r.id === 'seoulplaza') {
    groundPlane(group, mats.paving(), 0, 4, 80, 76, 0.01, 6);
    for (const [x, z, w, d] of [[0, 49, 150, 12], [0, -34, 150, 6], [-44, 4, 10, 80], [42, 4, 8, 80]]) groundPlane(group, mats.road(), x, z, w, d, 0.012, 9);
  } else if (r.id === 'myeongdong') {
    groundPlane(group, mats.paving(), 0, 0, 160, 10, 0.01, 5);
    for (const cx of r.crossX) groundPlane(group, mats.paving(), cx, -12, 7, 125, 0.012, 5);
  } else if (r.id === 'ddp') {
    groundPlane(group, mats.paving(), 0, 0, 140, 125, 0.01, 7);
  } else if (r.id === 'cheonggyecheon') {
    for (const sz of [-1, 1]) groundPlane(group, mats.paving(), 0, sz * 10, 184, 4, 0.011, 5);
    groundPlane(group, mats.paving(), -86, 0, 12, 22, 0.012, 5);
  }

  // ---- buildings
  for (const bd of r.buildings) {
    if (bd.style === 'sejong') buildSejongCenter(batch, bd);
    else if (bd.style === 'cityhall') buildCityHall(batch, bd);
    else if (bd.style === 'oldcityhall') buildOldCityHall(batch, bd);
    else if (bd.style === 'cathedral') buildCathedral(group, batch, bd);
    else buildBuilding(bd, batch, extras);
  }
  buildSigns(group, extras.signs, rng);

  // ---- landmarks & decorations
  const L = r.landmarks || {};
  if (r.id === 'gwanghwamun') {
    buildGwanghwamunGate(group, batch, L.gate);
    buildSejongStatue(group, batch, L.sejong);
    buildYiSunSinStatue(group, batch, L.yisunsin);
    buildSnowman(group, -1, 22, -0.6, 1.1);
    buildSnowman(group, -15, 12, 0.5, 0.8);
    buildPhotoZone(group, L.photo.x, L.photo.z, -Math.PI / 2);
    // fountain basin
    batch.add(mats.stone(), new THREE.TorusGeometry(3.4, 0.35, 8, 32), matrix(L.fountain.x, 0.35, L.fountain.z, Math.PI / 2));
    batch.add(mats.ice(), new THREE.CircleGeometry(3.3, 32), matrix(L.fountain.x, 0.2, L.fountain.z, -Math.PI / 2));
    // string lights over the market
    for (let i = 0; i < 6; i++) stringLights(group, new THREE.Vector3(-21, 4.4, 34 + i * 8), new THREE.Vector3(2, 4.4, 30 + i * 8), 34, 0.9);
    for (let i = 0; i < 6; i++) for (const sx of [-12, -4]) buildBench(batch, sx, -40 + i * 7, sx < -8 ? Math.PI / 2 : -Math.PI / 2);
  } else if (r.id === 'seoulplaza') {
    buildRink(group, batch, L.rink);
    buildDaehanmun(batch, L.daehanmun);
    buildPhotoZone(group, L.photo.x, L.photo.z, -Math.PI / 4, 'SEOUL ♡ WINTER');
    buildSnowman(group, -26, 26, 0.4);
    for (let i = 0; i < 5; i++) stringLights(group, new THREE.Vector3(-30, 6, -28 + i * 14), new THREE.Vector3(30, 6, -28 + i * 14), 44, 1.2);
  } else if (r.id === 'cheonggyecheon') {
    buildCheonggyecheon(group, batch, r, updaters);
  } else if (r.id === 'myeongdong') {
    // string lights criss-crossing the main street (very Myeongdong)
    for (let x = -72; x < 74; x += 7) stringLights(group, new THREE.Vector3(x, 7.5, -4.9), new THREE.Vector3(x + 5, 7.5, 4.9), 20, 0.6);
    for (const cx of r.crossX) for (let z = -60; z < 40; z += 9) stringLights(group, new THREE.Vector3(cx - 3.4, 7, z), new THREE.Vector3(cx + 3.4, 7, z + 4), 12, 0.4);
    buildSnowman(group, -60, 3.6, Math.PI, 0.7);
  } else if (r.id === 'ddp') {
    buildDDP(group, r, updaters, quality);
    buildPhotoZone(group, L.photo.x, L.photo.z, -Math.PI / 2, 'DDP CHRISTMAS');
    buildSnowman(group, 36, 26, -0.8);
  } else if (r.id === 'namsan') {
    buildNamsan(group, batch, r, updaters, quality);
    buildPhotoZone(group, L.photo.x, L.photo.z, Math.PI / 5, 'LOVE IN SEOUL');
    for (let i = 0; i < 8; i++) { const a = Math.PI * 0.2 + i * 0.32; buildBench(batch, Math.cos(a) * 36, Math.sin(a) * 36, -a - Math.PI / 2); }
  }
  if (L.tree) {
    const tree = buildChristmasTree(group, L.tree, quality, 0);
    updaters.push(tree.update);
  }
  for (const s of L.subway || []) { buildSubwayEntrance(batch, s); buildSubwaySign(group, s); }
  buildStalls(group, r.stalls, batch);
  buildDecoTrees(group, r.decoTrees);
  const lampInfo = buildLamps(group, r.lamps, quality);
  snowPiles(group, r, rng);
  if (r.id !== 'namsan') buildSkyline(group, quality, { seed: r.id.length, mountains: true, r0: r.id === 'cheonggyecheon' ? 140 : 200 });

  // aviation lights
  if (extras.aviation.length) {
    const av = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 5), mats.redLight(), extras.aviation.length);
    extras.aviation.forEach((p, i) => av.setMatrixAt(i, matrix(p.x, p.y, p.z)));
    group.add(av);
    updaters.push((dt, t) => { av.visible = Math.sin(t * 2.4) > -0.2; });
  }

  batch.build(group);
  return {
    group,
    updaters,
    lamps: lampInfo.positions,
    dispose() {
      group.traverse((o) => {
        if (o.isInstancedMesh) o.dispose(); // frees per-instance GPU buffers
        if (o.geometry) o.geometry.dispose();
        const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of list) {
          if (m.userData?.shared) continue;
          for (const k of ['map', 'emissiveMap']) if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
      group.removeFromParent();
    },
  };
}
