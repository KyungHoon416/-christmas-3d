// AdBanner3D — a real 3D billboard structure (rounded silver frame, snow cap, warm LED
// trim, title plaque, base) with replaceable ad slots. Placement and slot layout come from
// shared/ads.js; slot content is applied with setSlots() (Firebase or defaults).
import * as THREE from 'three';
import { AD_TYPES, slotStatus, SLOT_STATUS } from '../../../shared/ads.js';
import { adArtCanvas } from './adArt.js';

const glow = (hex, k = 1.7) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });

// rounded rectangle path with per-corner radii [tl, tr, br, bl]; centre (cx, cy)
function roundRect(path, cx, cy, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  path.moveTo(x0 + bl, y0);
  path.lineTo(x1 - br, y0); path.quadraticCurveTo(x1, y0, x1, y0 + br);
  path.lineTo(x1, y1 - tr); path.quadraticCurveTo(x1, y1, x1 - tr, y1);
  path.lineTo(x0 + tl, y1); path.quadraticCurveTo(x0, y1, x0, y1 - tl);
  path.lineTo(x0, y0 + bl); path.quadraticCurveTo(x0, y0, x0 + bl, y0);
  return path;
}
const rrPoints = (cx, cy, w, h, r, n = 12) => roundRect(new THREE.Path(), cx, cy, w, h, r).getSpacedPoints(n * 8);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function titleTexture(text) {
  return canvasTex(1024, 140, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4a3e33'); gr.addColorStop(1, '#2b231e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ffcf8a'; g.shadowBlur = 22; g.fillStyle = '#fff1d8';
    g.font = '600 64px "Noto Sans KR", "Helvetica Neue", Arial, sans-serif';
    g.fillText(text.split('').join(' '), w / 2, h / 2 + 4);
    g.font = '58px sans-serif'; g.fillText('❄', 70, h / 2 + 2); g.fillText('❄', w - 70, h / 2 + 2);
  });
}

function adChipTexture() {
  return canvasTex(160, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,16,36,0.78)'; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 14); g.fill();
    g.fillStyle = '#ffd9a8'; g.font = 'bold 30px "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AD · 광고', w / 2, h / 2 + 2);
  });
}

// cover-fit a texture into a slot of aspect `slotAspect`
function coverFit(tex, slotAspect) {
  const img = tex.image; if (!img || !img.width) return;
  const a = img.width / img.height;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (a > slotAspect) { const k = slotAspect / a; tex.repeat.set(k, 1); tex.offset.set((1 - k) / 2, 0); }
  else { const k = a / slotAspect; tex.repeat.set(1, k); tex.offset.set(0, (1 - k) / 2); }
  tex.needsUpdate = true;
}

export class AdBanner3D {
  constructor(location, { quality = 'medium' } = {}) {
    this.location = location;
    this.type = AD_TYPES[location.type];
    this.group = new THREE.Group();
    this.slots = new Map(); // key -> { mesh, mat, rect, slotId, data, status, url }
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.build(quality);
    const P = location.position, R = location.rotation, S = location.scale;
    this.group.position.set(P.x, P.y || 0, P.z);
    this.group.rotation.set(R.x || 0, R.y || 0, R.z || 0);
    this.group.scale.set(S.x, S.y, S.z);
    this.group.userData.adBanner = this;
  }

  build(quality) {
    const T = this.type, g = this.group;
    const W = T.width, H = T.height, D = T.depth, B = T.baseH;
    const silver = new THREE.MeshStandardMaterial({ color: 0xd9d4de, metalness: 0.75, roughness: 0.32, emissive: 0x1d1820 });
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6f7fc, roughness: 0.85, emissive: 0x23252f });
    const backMat = new THREE.MeshStandardMaterial({ color: 0x3a3542, metalness: 0.5, roughness: 0.5 });
    const warm = glow(0xffd29a, 1.9);

    // frame: outer rounded shape (big sweep on the left, like the reference) with slot holes
    const fh = H - B, fcy = B + fh / 2;
    const radii = [1.7, 0.45, 0.45, 1.1];
    const outer = roundRect(new THREE.Shape(), 0, fcy, W, fh, radii);
    for (const s of T.slots) outer.holes.push(roundRect(new THREE.Path(), s.x, s.y, s.w + 0.04, s.h + 0.04, 0.22));
    const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: D, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 16 });
    frameGeo.translate(0, 0, -D / 2);
    const frame = new THREE.Mesh(frameGeo, silver);
    frame.castShadow = quality !== 'low'; frame.receiveShadow = true;
    g.add(frame);
    // closed back plate behind the slots
    const backGeo = new THREE.ShapeGeometry(roundRect(new THREE.Shape(), 0, fcy, W - 0.2, fh - 0.2, radii.map((r) => r * 0.9)), 16);
    const back = new THREE.Mesh(backGeo, backMat); back.position.z = -D / 2 + 0.08; back.rotation.y = 0;
    const backOut = back.clone(); backOut.rotation.y = Math.PI; backOut.position.z = -D / 2 - 0.07;
    g.add(back, backOut);

    // slots (planes recessed into the frame) + warm rim lights + AD chip
    const chipTex = adChipTexture();
    for (const s of T.slots) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xdedede, toneMapped: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
      mesh.position.set(s.x, s.y, D / 2 - 0.1);
      mesh.userData.adSlotKey = s.key;
      g.add(mesh);
      const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rrPoints(s.x, s.y, s.w + 0.12, s.h + 0.12, 0.26).map((p) => new THREE.Vector3(p.x, p.y, D / 2 + 0.07)), true), 160, 0.035, 6, true), warm);
      g.add(rim);
      const chip = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.25), new THREE.MeshBasicMaterial({ map: chipTex, transparent: true, toneMapped: false }));
      chip.position.set(s.x - s.w / 2 + 0.42, s.y + s.h / 2 - 0.2, D / 2 - 0.08);
      g.add(chip);
      this.slots.set(s.key, { mesh, mat, rect: s, slotId: this.location.slots[s.key], data: null, status: null, url: null });
    }

    // outer LED trim along the frame face
    const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rrPoints(0, fcy, W + 0.1, fh + 0.1, radii).map((p) => new THREE.Vector3(p.x, p.y, D / 2 + 0.08)), true), 260, 0.045, 6, true), warm);
    g.add(trim);
    // sparkle dots on the left sweep
    const n = quality === 'low' ? 24 : 48;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 4), glow(0xfff1d6, 2.2), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = -W / 2 + 0.18 + Math.random() * 0.32 + Math.max(0, 0.3 - t) * 3.2; // follows the left sweep
      const y = fcy + fh / 2 - 0.25 - t * (fh - 0.6);
      m4.makeTranslation(x, y, D / 2 + 0.07);
      dots.setMatrixAt(i, m4);
    }
    g.add(dots);

    // title plaque
    const t = T.title;
    const plaque = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), t.x, t.y, t.w, t.h, 0.24), { depth: 0.12, bevelEnabled: false, curveSegments: 10 }), new THREE.MeshStandardMaterial({ color: 0x4a3c30, metalness: 0.6, roughness: 0.4 }));
    plaque.position.z = D / 2 + 0.02;
    g.add(plaque);
    const ttl = new THREE.Mesh(new THREE.PlaneGeometry(t.w - 0.3, t.h - 0.14), new THREE.MeshBasicMaterial({ map: titleTexture(this.location.title || 'CHRISTMAS WORLD SEOUL'), toneMapped: false }));
    ttl.position.set(t.x, t.y, D / 2 + 0.15);
    g.add(ttl);
    const ttlRim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rrPoints(t.x, t.y, t.w + 0.06, t.h + 0.06, 0.26).map((p) => new THREE.Vector3(p.x, p.y, D / 2 + 0.15)), true), 100, 0.025, 5, true), warm);
    g.add(ttlRim);

    // snow cap on top (soft, slightly drooping)
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, W - 1.9, 6, 16), snowMat);
    cap.rotation.z = Math.PI / 2; cap.scale.set(0.55, 1, 1.25);
    cap.position.set(0.55, H + 0.1, 0);
    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), snowMat);
    cap2.scale.set(1.3, 0.4, 0.75); cap2.position.set(-W / 2 + 1.1, H - 0.18, 0);
    g.add(cap, cap2);

    // base plinth with LED edge + a little snow
    const baseShape = roundRect(new THREE.Shape(), 0, 0, W + 0.8, D + 1.0, 0.45);
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(baseShape, { depth: B, bevelEnabled: false, curveSegments: 12 }), silver);
    base.rotation.x = -Math.PI / 2; base.receiveShadow = true;
    g.add(base);
    const baseLed = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rrPoints(0, 0, W + 0.82, D + 1.02, 0.46).map((p) => new THREE.Vector3(p.x, 0.1, -p.y)), true), 200, 0.03, 5, true), warm);
    g.add(baseLed);
    const drift = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), 0, 0, W + 0.5, D + 0.7, 0.35), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.1, bevelSegments: 2 }), snowMat);
    drift.rotation.x = -Math.PI / 2; drift.position.y = B;
    g.add(drift);
  }

  // slots: { slotId: data } ; images: { slotId: dataUrl } (RTDB fallback store)
  setSlots(slots, images = {}, now = Date.now()) {
    for (const [key, s] of this.slots) {
      const data = slots[s.slotId] || null;
      const status = slotStatus(data, now);
      let url = null;
      if (status === SLOT_STATUS.ACTIVE && data?.imageUrl) url = data.imageUrl.startsWith('rtdb:') ? images[s.slotId] || null : resolveUrl(data.imageUrl);
      s.data = data; s.status = status;
      const sig = `${status}|${url}|${data?.slotName}`;
      if (s.sig === sig) continue;
      s.sig = sig; s.url = url;
      if (status !== SLOT_STATUS.ACTIVE) { this.applyCanvas(s, 'promo', {}); continue; }
      const kind = key; // fallback art per slot
      if (!url) { this.applyCanvas(s, kind, { title: data?.slotName }); continue; }
      const want = sig;
      this.loader.load(url, (tex) => {
        if (s.sig !== want) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        coverFit(tex, s.rect.w / s.rect.h);
        this.swap(s, tex);
        s.loaded = url;
      }, undefined, () => { if (s.sig === want) { s.loaded = 'error'; this.applyCanvas(s, kind, { title: data?.slotName }); } });
    }
  }

  applyCanvas(s, kind, opts) {
    const r = s.rect, px = 220;
    const tex = new THREE.CanvasTexture(adArtCanvas(kind, Math.round(r.w * px), Math.round(r.h * px), opts));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.swap(s, tex);
    s.loaded = 'canvas:' + kind;
  }

  swap(s, tex) {
    const old = s.mat.map;
    s.mat.map = tex; s.mat.needsUpdate = true;
    if (old) old.dispose();
  }

  slotList() {
    return [...this.slots.entries()].map(([key, s]) => ({ key, slotId: s.slotId, status: s.status, data: s.data, loaded: s.loaded }));
  }
}

function resolveUrl(u) {
  // test assets ship with the app; resolve against the page so they also work under a sub-path
  if (u.startsWith('/test-assets/')) return new URL(u.slice(1), document.baseURI).href;
  return u;
}
