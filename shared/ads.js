// 3D ad banner system — shared definitions (client + server).
// Banner LOCATIONS live in code (so collision is identical on server and client);
// slot CONTENT (image, link, dates, on/off) lives in Firebase RTDB under /ads and can be
// changed from admin.html. Without Firebase (artifact / local server) DEFAULT_SLOTS are used.
//
// NOTE: Google AdSense code is never rendered into the 3D world. Banners show direct-sold
// or test images only (see docs/AD_BANNER_SPEC.md).

// Banner types: dimensions (metres) and slot rectangles in the banner's local frame
// (x right, y up, origin = centre of the base on the ground, front faces local +z).
export const AD_TYPES = {
  triple: {
    width: 9.2, height: 5.0, depth: 0.7, baseH: 0.35,
    title: { x: 0, y: 4.5, w: 4.6, h: 0.62 },
    slots: [
      { key: 'A', x: -1.75, y: 2.35, w: 5.0, h: 3.1 }, // main slot (left)
      { key: 'B', x: 2.95, y: 3.13, w: 2.6, h: 1.5 }, // right top
      { key: 'C', x: 2.95, y: 1.55, w: 2.6, h: 1.5 }, // right bottom
    ],
  },
};

export const AD_LOCATIONS = [
  {
    locationId: 'gwanghwamun-main-banner-01',
    region: 'gwanghwamun',
    placeName: '광화문광장 메인 트리 근처 (스폰 지점 앞, 겨울 마켓 입구)',
    type: 'triple',
    title: 'CHRISTMAS WORLD SEOUL',
    position: { x: -14, y: 0, z: 26.5 },
    rotation: { x: 0, y: 0.7, z: 0 }, // faces the spawn point / plaza centre
    scale: { x: 1, y: 1, z: 1 },
    slots: { A: 'test-slot-a', B: 'test-slot-b', C: 'test-slot-c' },
    isActive: true,
  },
  // Future: copy an entry with another region/position (DDP plaza, Myeongdong entrance, …).
];

export const adLocationsFor = (regionId) => AD_LOCATIONS.filter((l) => l.region === regionId && l.isActive);

// Seed / fallback content (TEST slots).
export const DEFAULT_SLOTS = {
  'test-slot-a': { slotId: 'test-slot-a', locationId: 'gwanghwamun-main-banner-01', slotName: 'TEST SLOT A', advertiserName: 'TEST ADVERTISER A', imageUrl: '/test-assets/ad-slot-a.jpg', targetUrl: 'https://example.com/a', description: 'Test banner slot A', isActive: true, priority: 1, startDate: '2026-11-01T00:00:00.000Z', endDate: '2027-01-31T23:59:59.000Z' },
  'test-slot-b': { slotId: 'test-slot-b', locationId: 'gwanghwamun-main-banner-01', slotName: 'TEST SLOT B', advertiserName: 'TEST ADVERTISER B', imageUrl: '/test-assets/ad-slot-b.jpg', targetUrl: 'https://example.com/b', description: 'Test banner slot B', isActive: true, priority: 2, startDate: '2026-11-01T00:00:00.000Z', endDate: '2027-01-31T23:59:59.000Z' },
  'test-slot-c': { slotId: 'test-slot-c', locationId: 'gwanghwamun-main-banner-01', slotName: 'TEST SLOT C', advertiserName: 'TEST ADVERTISER C', imageUrl: '/test-assets/ad-slot-c.jpg', targetUrl: 'https://example.com/c', description: 'Test banner slot C', isActive: true, priority: 3, startDate: '2026-11-01T00:00:00.000Z', endDate: '2027-01-31T23:59:59.000Z' },
};

export const SLOT_STATUS = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', SCHEDULED: 'SCHEDULED', EXPIRED: 'EXPIRED' };

export function slotStatus(slot, now = Date.now()) {
  if (!slot || slot.isActive === false) return SLOT_STATUS.INACTIVE;
  const s = slot.startDate ? Date.parse(slot.startDate) : NaN, e = slot.endDate ? Date.parse(slot.endDate) : NaN;
  if (Number.isFinite(s) && now < s) return SLOT_STATUS.SCHEDULED;
  if (Number.isFinite(e) && now > e) return SLOT_STATUS.EXPIRED;
  return SLOT_STATUS.ACTIVE;
}

// Only http(s) links may be opened from a banner.
export function safeTargetUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}

// Collision boxes for the banners of a region (frame + base, so players walk around it).
export function adColliders(regionId) {
  return adLocationsFor(regionId).map((l) => {
    const T = AD_TYPES[l.type];
    return { t: 'box', x: l.position.x, z: l.position.z, hw: (T.width / 2 + 0.25) * l.scale.x, hd: (T.depth / 2 + 0.35) * l.scale.z, rot: l.rotation.y, cam: true, ad: l.locationId };
  });
}

export const AD_EVENTS = ['ad_banner_view', 'ad_slot_visible', 'ad_slot_interaction', 'ad_slot_click', 'ad_external_link_open'];

// Google AdSense publisher id for the normal (2D) web page only, e.g. 'ca-pub-1234567890123456'.
// Used for site verification (<head> script + ads.txt). Empty = disabled.
export const ADSENSE_CLIENT = '';
