import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotStatus, safeTargetUrl, DEFAULT_SLOTS, AD_LOCATIONS, AD_TYPES, adColliders } from '../shared/ads.js';
import { getRegion } from '../shared/regions.js';
import { CollisionWorld } from '../shared/collision.js';

test('ads: slot status ACTIVE / INACTIVE / SCHEDULED / EXPIRED', () => {
  const t = Date.parse('2026-12-01T00:00:00Z');
  const base = { isActive: true, startDate: '2026-11-01T00:00:00Z', endDate: '2027-01-31T23:59:59Z' };
  assert.equal(slotStatus(base, t), 'ACTIVE');
  assert.equal(slotStatus({ ...base, isActive: false }, t), 'INACTIVE');
  assert.equal(slotStatus({ ...base, startDate: '2026-12-24T00:00:00Z' }, t), 'SCHEDULED');
  assert.equal(slotStatus({ ...base, endDate: '2026-11-30T00:00:00Z' }, t), 'EXPIRED');
  assert.equal(slotStatus(null, t), 'INACTIVE');
  assert.equal(slotStatus({ isActive: true }, t), 'ACTIVE', 'no dates = always on');
});

test('ads: only http(s) links can be opened', () => {
  assert.equal(safeTargetUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeTargetUrl('javascript:alert(1)'), null);
  assert.equal(safeTargetUrl('data:text/html,hi'), null);
  assert.equal(safeTargetUrl('not a url'), null);
});

test('ads: default TEST SLOT A/B/C belong to the Gwanghwamun banner', () => {
  const loc = AD_LOCATIONS.find((l) => l.locationId === 'gwanghwamun-main-banner-01');
  assert.ok(loc && AD_TYPES[loc.type]);
  assert.deepEqual(Object.values(loc.slots), ['test-slot-a', 'test-slot-b', 'test-slot-c']);
  for (const id of Object.values(loc.slots)) assert.equal(DEFAULT_SLOTS[id].locationId, loc.locationId);
});

test('ads: banner is solid but does not block the plaza, spawn, tree or walkway (AD-12)', () => {
  const r = getRegion('gwanghwamun');
  const w = new CollisionWorld(r.colliders, r.surfaces, r.bounds);
  const [c] = adColliders('gwanghwamun');
  assert.ok(r.colliders.includes(r.colliders.find((x) => x.ad === c.ad)), 'collider registered in region');
  assert.equal(w.blocked(c.x, c.z, 0), true, 'banner centre is solid');
  assert.equal(w.blocked(r.spawn.x, r.spawn.z, 0), false, 'spawn free');
  // a player can walk in front of the banner (where the prompt appears) and around it
  const nx = Math.sin(c.rot), nz = Math.cos(c.rot); // banner normal (front)
  assert.equal(w.blocked(c.x + nx * 3, c.z + nz * 3, 0), false, '3 m in front is free');
  assert.equal(w.blocked(c.x - nx * 3, c.z - nz * 3, 0), false, 'behind is free');
  assert.equal(w.blocked(-8, 26, 0), false, 'path between tree and photo zone');
});
