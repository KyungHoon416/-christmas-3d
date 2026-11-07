// DDP interior: walk the whole visitor route with the real collision/surface physics
// (same rules as client/src/game/world.js: canStep -> resolve -> groundAt + gravity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../shared/collision.js';
import { getRegion } from '../shared/regions.js';
import { DDP, L, ZONES, ddpZoneOf, ddpCeiling, insideDDP } from '../shared/ddp.js';

const r = getRegion('ddp');
const world = () => new CollisionWorld(r.colliders, r.surfaces, r.bounds);

// walk towards each local waypoint; returns the trace of {x,y,z,zone}
function walk(w, start, waypoints) {
  const p = { ...start };
  const trace = [];
  const dt = 1 / 30, speed = 4.2;
  for (const [lx, lz] of waypoints) {
    const [tx, tz] = L(lx, lz);
    let steps = 0;
    while (Math.hypot(tx - p.x, tz - p.z) > 0.35) {
      if (++steps > 30 * 40) throw new Error(`stuck before (${lx},${lz}) at local (${(p.x - DDP.x).toFixed(1)},${(p.z - DDP.z).toFixed(1)}) y=${p.y.toFixed(2)}`);
      const d = Math.hypot(tx - p.x, tz - p.z);
      const nx = p.x + ((tx - p.x) / d) * speed * dt, nz = p.z + ((tz - p.z) / d) * speed * dt;
      const q = { x: p.x, y: p.y, z: p.z };
      if (w.canStep(nx, nz, p.y)) { q.x = nx; q.z = nz; }
      else if (w.canStep(nx, p.z, p.y)) q.x = nx;
      else if (w.canStep(p.x, nz, p.y)) q.z = nz;
      w.resolve(q);
      p.x = q.x; p.z = q.z;
      const g = w.groundAt(p.x, p.z, p.y);
      p.y = Math.max(g, p.y - 9.8 * dt * 0.5); // fall gently, never below ground
      if (p.y < g) p.y = g;
      trace.push({ x: p.x, y: p.y, z: p.z, zone: ddpZoneOf(p.x, p.y, p.z) });
    }
  }
  return { p, trace };
}

test('DDP: plaza -> entrance -> lobby -> corridor -> 2F loop -> store -> art hall -> gallery -> plaza (DDP-02..08)', () => {
  const w = world();
  const start = { x: DDP.x, y: 0, z: DDP.z + 34 };
  const route = [
    [0, 30], [0, 22], [0, 12], // plaza -> entrance tunnel -> lobby
    [-10, 9.4], [-27, 9.4], [-39, 9.4], // exhibition corridor
    [-43.5, 6], [-43.5, 1], [-43.5, -9], // west ramp up to 2F
    [-38, -13.5], [-20, -18.5], [0, -19], [20, -18.5], [37, -14.5], [40.5, -13], // design loop (2F)
    [40.5, -11], [40.5, 1], [40.5, 5.5], // east stairs down -> foyer
    [35, 5.5], [24, 4], // store via its east door
    [32.5, 2], [32.5, -0.5], [32.5, -4.9], // art hall door -> front of hall
    [26, -4.9], [17.5, -4.9], [15, -8], // up the aisle to the top platform
    [12.5, -8], [11, -7], [0, -10], [-11, -10], // bridge -> 2F gallery
    [-11, -7], [-11, 5], [-6, 8], [0, 14], [0, 24], [0, 34], // grand stairs down -> lobby -> plaza
  ];
  const { p, trace } = walk(w, start, route);
  const seen = new Set(trace.map((t) => t.zone));
  for (const z of ['plaza', 'lobby', 'exhibition', 'loop', 'store', 'hall']) assert.ok(seen.has(z), 'visited ' + z);
  const maxY = Math.max(...trace.map((t) => t.y));
  assert.ok(Math.abs(maxY - DDP.F2) < 0.05, 'reached the 2F level');
  assert.ok(Math.abs(p.y) < 0.01, 'back on the ground at the plaza');
  // never ends up below the ground or inside a wall
  for (const t of trace) assert.ok(t.y >= -0.01 && !w.blocked(t.x, t.z, t.y, 0.3), 'valid position');
});

test('DDP: outer shell and walls are solid, entrance is open (DDP-02/18)', () => {
  const w = world();
  const [ex, ez] = L(0, 25);
  assert.equal(w.blocked(ex, ez, 0), false, 'entrance passage');
  const [sx, sz] = L(20, 24.5);
  assert.equal(w.blocked(sx, sz, 0), true, 'shell next to the entrance');
  const [wx, wz] = L(-13, -2);
  assert.equal(w.blocked(wx, wz, 0), true, 'lobby west wall');
  const [hx, hz] = L(25, 1);
  assert.equal(w.blocked(hx, hz, 0), true, 'hall/store wall');
});

test('DDP: warps land on walkable, unblocked spots in the right zone (DDP-14)', () => {
  const w = world();
  for (const zn of ZONES) {
    const p = r.warps[zn.id];
    assert.equal(w.blocked(p.x, p.z, p.y), false, zn.id + ' blocked');
    assert.ok(Math.abs(w.groundAt(p.x, p.z, p.y + 0.2) - p.y) < 0.05, zn.id + ' ground');
    assert.equal(ddpZoneOf(p.x, p.y, p.z), zn.id, zn.id + ' zone');
  }
});

test('DDP: seats sit on their row and are unique (DDP-09)', () => {
  const w = world();
  const ids = new Set();
  for (const s of r.seats) {
    assert.ok(!ids.has(s.id)); ids.add(s.id);
    assert.ok(Math.abs(w.groundAt(s.x, s.z, s.y + 0.1) - s.y) < 0.01, s.id);
    assert.equal(ddpZoneOf(s.x, s.y, s.z), 'hall');
  }
  assert.ok(r.seats.length >= 100);
});

test('DDP: interior ceilings and indoor test', () => {
  assert.equal(ddpCeiling(...L(-27, 9)), 5.6);
  assert.ok(ddpCeiling(...L(0, 0)) > 15, 'lobby atrium is tall');
  assert.equal(insideDDP(...L(0, 0), 0.9), true);
  assert.equal(insideDDP(...L(0, 34), 0.9), false);
});
