// 2.5D collision shared by client (prediction) and server (validation).
// Colliders live on the XZ plane with an optional vertical range [y0, y1].
//   { t:'box', x, z, hw, hd, rot?, y0?, y1? }   oriented box (rot = radians around Y)
//   { t:'circle', x, z, r, y0?, y1? }
//   { t:'ellipse', x, z, rx, rz, y0?, y1? }
// Walkable surfaces define ground height:
//   { x, z, hw, hd, y }                         flat
//   { x, z, hw, hd, y0, y1, axis:'x'|'z' }      ramp rising from min->max edge
import { PLAYER_RADIUS } from './constants.js';

const PLAYER_HEIGHT = 1.7;
const STEP = 0.7;
const CELL = 16;

function colliderAABB(c) {
  if (c.t === 'circle') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  if (c.t === 'ellipse') return [c.x - c.rx, c.z - c.rz, c.x + c.rx, c.z + c.rz];
  const rot = c.rot || 0;
  const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
  const ex = c.hw * cos + c.hd * sin;
  const ez = c.hw * sin + c.hd * cos;
  return [c.x - ex, c.z - ez, c.x + ex, c.z + ez];
}

export class CollisionWorld {
  constructor(colliders, surfaces = [], bounds = null, defaultGround = 0) {
    this.colliders = colliders;
    this.surfaces = surfaces;
    this.bounds = bounds;
    this.defaultGround = defaultGround;
    this.grid = new Map();
    colliders.forEach((c, i) => {
      const [x0, z0, x1, z1] = colliderAABB(c);
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
        for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
          const k = gx + ',' + gz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
      }
    });
  }

  nearby(x, z, r) {
    const out = new Set();
    for (let gx = Math.floor((x - r) / CELL); gx <= Math.floor((x + r) / CELL); gx++) {
      for (let gz = Math.floor((z - r) / CELL); gz <= Math.floor((z + r) / CELL); gz++) {
        const l = this.grid.get(gx + ',' + gz);
        if (l) for (const i of l) out.add(i);
      }
    }
    return out;
  }

  // Returns push-out vector [dx, dz] or null when not penetrating.
  static penetration(c, x, z, r) {
    if (c.t === 'circle') {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d >= min) return null;
      if (d < 1e-6) return [min, 0];
      return [(dx / d) * (min - d), (dz / d) * (min - d)];
    }
    if (c.t === 'ellipse') {
      // Scale space so the ellipse becomes a unit circle, then approximate.
      const nx = (x - c.x) / (c.rx + r), nz = (z - c.z) / (c.rz + r);
      const d = Math.hypot(nx, nz);
      if (d >= 1) return null;
      if (d < 1e-6) return [c.rx + r, 0];
      const tx = c.x + (nx / d) * (c.rx + r), tz = c.z + (nz / d) * (c.rz + r);
      return [tx - x, tz - z];
    }
    const rot = c.rot || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // world -> local
    const wx = x - c.x, wz = z - c.z;
    const lx = wx * cos - wz * sin;
    const lz = wx * sin + wz * cos;
    const cx = Math.max(-c.hw, Math.min(c.hw, lx));
    const cz = Math.max(-c.hd, Math.min(c.hd, lz));
    let px, pz;
    const dx = lx - cx, dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      if (d >= r) return null;
      px = (dx / d) * (r - d);
      pz = (dz / d) * (r - d);
    } else {
      // centre inside the box: push out along the shallowest axis
      const ox = c.hw - Math.abs(lx) + r, oz = c.hd - Math.abs(lz) + r;
      if (ox < oz) { px = Math.sign(lx || 1) * ox; pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * oz; }
    }
    // local -> world (inverse rotation)
    return [px * cos + pz * sin, -px * sin + pz * cos];
  }

  static yOverlap(c, y) {
    const y0 = c.y0 ?? -1e9, y1 = c.y1 ?? 1e9;
    return y + PLAYER_HEIGHT > y0 && y < y1;
  }

  blocked(x, z, y = 0, r = PLAYER_RADIUS) {
    if (!this.inBounds(x, z, r)) return true;
    for (const i of this.nearby(x, z, r + 1)) {
      const c = this.colliders[i];
      if (!CollisionWorld.yOverlap(c, y)) continue;
      if (CollisionWorld.penetration(c, x, z, r - 0.02)) return true;
    }
    return false;
  }

  inBounds(x, z, r = 0) {
    const b = this.bounds;
    if (!b) return true;
    if (b.circle) return Math.hypot(x - b.x, z - b.z) <= b.r - r;
    return x >= b.minX + r && x <= b.maxX - r && z >= b.minZ + r && z <= b.maxZ - r;
  }

  clampBounds(p, r) {
    const b = this.bounds;
    if (!b) return;
    if (b.circle) {
      const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), m = b.r - r;
      if (d > m) { p.x = b.x + (dx / d) * m; p.z = b.z + (dz / d) * m; }
      return;
    }
    p.x = Math.max(b.minX + r, Math.min(b.maxX - r, p.x));
    p.z = Math.max(b.minZ + r, Math.min(b.maxZ - r, p.z));
  }

  // Iteratively push a circle out of all overlapping colliders. Mutates p {x,z,y}.
  resolve(p, r = PLAYER_RADIUS) {
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const i of this.nearby(p.x, p.z, r + 1)) {
        const c = this.colliders[i];
        if (!CollisionWorld.yOverlap(c, p.y ?? 0)) continue;
        const pen = CollisionWorld.penetration(c, p.x, p.z, r);
        if (pen) { p.x += pen[0]; p.z += pen[1]; moved = true; }
      }
      this.clampBounds(p, r);
      if (!moved) break;
    }
    return p;
  }

  surfaceHeight(s, x, z) {
    if (Math.abs(x - s.x) > s.hw || Math.abs(z - s.z) > s.hd) return null;
    if (s.y !== undefined) return s.y;
    const t = s.axis === 'x' ? (x - (s.x - s.hw)) / (2 * s.hw) : (z - (s.z - s.hd)) / (2 * s.hd);
    return s.y0 + (s.y1 - s.y0) * Math.max(0, Math.min(1, t));
  }

  // Highest walkable surface at (x,z) that is reachable from footY (step-up limit).
  groundAt(x, z, footY = 0) {
    let best = null, any = false;
    for (const s of this.surfaces) {
      const h = this.surfaceHeight(s, x, z);
      if (h === null) continue;
      any = true;
      if (h <= footY + STEP && (best === null || h > best)) best = h;
    }
    if (!any) return this.defaultGround;
    if (best === null) {
      // only surfaces above reach: treat as a wall-less climb (lowest one)
      for (const s of this.surfaces) {
        const h = this.surfaceHeight(s, x, z);
        if (h !== null && (best === null || h < best)) best = h;
      }
    }
    return best;
  }

  // Can a player at footY step onto (x,z)? Prevents walking "into" a raised ledge.
  canStep(x, z, footY) {
    let reachable = false, any = false;
    for (const s of this.surfaces) {
      const h = this.surfaceHeight(s, x, z);
      if (h === null) continue;
      any = true;
      if (h <= footY + STEP) reachable = true;
    }
    if (!any) return this.defaultGround <= footY + STEP;
    return reachable;
  }
}
