// Geometry batching: collect transformed geometries per material and merge them
// into a handful of meshes per region (keeps draw calls low on mobile).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function matrix(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export class Batch {
  constructor() { this.groups = new Map(); }

  add(material, geometry, m = null, parent = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    // normalize attributes so mergeGeometries succeeds
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) {
      _m.copy(m);
      if (parent) _m.premultiply(parent);
      g.applyMatrix4(_m);
    } else if (parent) g.applyMatrix4(parent);
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return this;
  }

  build(target, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.groups) {
      // split into chunks to keep per-mesh vertex counts reasonable + better culling
      for (let i = 0; i < list.length; i += 400) {
        const merged = mergeGeometries(list.slice(i, i + 400), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow && !mat.transparent && !mat.userData.noShadow;
        mesh.receiveShadow = receiveShadow;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        target.add(mesh);
        meshes.push(mesh);
      }
      for (const g of list) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

// UV-scaled plane for tiling facades
export function tiledPlane(w, h, ru, rv, ou = 0, ov = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru + ou, uv.getY(i) * rv + ov);
  return g;
}

export function tiledBox(w, h, d, scale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const su = nx > 0.5 ? d : w, sv = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * su) / scale, (uv.getY(i) * sv) / scale);
  }
  return g;
}
