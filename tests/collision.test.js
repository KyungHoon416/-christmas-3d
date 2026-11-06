import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../shared/collision.js';
import { REGIONS, getRegion } from '../shared/regions.js';
import { voiceGain } from '../shared/constants.js';

test('six regions exist with valid, unblocked spawns', () => {
  assert.equal(REGIONS.length, 6);
  for (const r of REGIONS) {
    const w = new CollisionWorld(r.colliders, r.surfaces, r.bounds);
    assert.equal(w.blocked(r.spawn.x, r.spawn.z, 0), false, r.id);
  }
});

test('rotated box push-out keeps player outside', () => {
  const w = new CollisionWorld([{ t: 'box', x: 0, z: 0, hw: 2, hd: 1, rot: Math.PI / 4 }]);
  const p = { x: 0.2, z: 0.1, y: 0 };
  w.resolve(p);
  assert.equal(w.blocked(p.x, p.z, 0, 0.34), false);
});

test('buildings are solid but alleys between them are walkable (QA-04)', () => {
  const r = getRegion('gwanghwamun');
  const w = new CollisionWorld(r.colliders, r.surfaces, r.bounds);
  const east = r.buildings.filter((b) => b.face === 'west').sort((a, b) => a.z - b.z);
  const b0 = east[0], b1 = east[1];
  assert.equal(w.blocked(b0.x, b0.z, 0), true, 'inside building');
  const gapZ = (b0.z + b0.d / 2 + b1.z - b1.d / 2) / 2;
  assert.equal(w.blocked(b0.x, gapZ, 0), false, 'alley between buildings');
});

test('cheonggyecheon: bridge deck vs. under-bridge walkway, water blocks', () => {
  const r = getRegion('cheonggyecheon');
  const w = new CollisionWorld(r.colliders, r.surfaces, r.bounds);
  assert.equal(w.groundAt(-20, 0, 0), 0, 'on bridge');
  assert.equal(w.groundAt(-20, 5, -4), -4, 'under bridge');
  assert.equal(w.blocked(-30, 0, -4), true, 'water at lower level');
  assert.equal(w.blocked(8, 0, -4), false, 'stepping stones');
  assert.equal(w.blocked(-30, 8.2, 0), true, 'street railing');
  assert.equal(w.groundAt(-76, 0, 0) < 0, true, 'west stairs descend');
});

test('voice attenuation curve', () => {
  assert.equal(voiceGain(0), 1);
  assert.equal(voiceGain(3), 1);
  assert.ok(voiceGain(6) > 0 && voiceGain(6) < 1);
  assert.equal(voiceGain(10), 0);
  assert.equal(voiceGain(25), 0);
});
