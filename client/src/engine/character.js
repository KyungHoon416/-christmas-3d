// Procedural winter-outfit humanoid with joint-based animation.
// Facing: +Z at rotation.y = 0.
import * as THREE from 'three';
import { APPEARANCE_DEFAULT } from '../../../shared/constants.js';

const matCache = new Map();
function mat(color, rough = 0.75, extra = {}) {
  const k = color + rough + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  return matCache.get(k);
}
const SHARED = {
  head: new THREE.SphereGeometry(0.115, 20, 16),
  eye: new THREE.SphereGeometry(0.014, 8, 6),
  upperArm: new THREE.CapsuleGeometry(0.055, 0.2, 4, 10),
  foreArm: new THREE.CapsuleGeometry(0.048, 0.2, 4, 10),
  hand: new THREE.SphereGeometry(0.045, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.07, 0.3, 4, 10),
  shin: new THREE.CapsuleGeometry(0.058, 0.3, 4, 10),
  boot: new THREE.BoxGeometry(0.11, 0.09, 0.22),
  muff: new THREE.SphereGeometry(0.055, 12, 10),
  pom: new THREE.SphereGeometry(0.045, 10, 8),
};

function coatGeometry() {
  // lathe profile: shoulders -> waist -> flared hem (knee-length winter coat)
  const pts = [
    [0.02, 0.62], [0.13, 0.6], [0.18, 0.55], [0.19, 0.4], [0.17, 0.22], [0.18, 0.08], [0.22, -0.18], [0.24, -0.3], [0.0, -0.3],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 24);
  g.scale(1, 1, 0.78);
  return g;
}
const COAT_GEO = coatGeometry();

function hairGeometry(long) {
  const g = new THREE.SphereGeometry(0.125, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  if (!long) return g;
  return g;
}

export class Character {
  constructor(appearance = APPEARANCE_DEFAULT, { seed = 0 } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // bobbing / leaning
    this.root.add(this.body);
    this.phase = 0;
    this.time = 0;
    this.anim = 'idle';
    this.animT = 0;
    this.holdSide = 0; // -1 left hand holds, 1 right hand holds
    this.seed = seed;
    this.longHair = seed % 2 === 0;
    this.build(appearance);
  }

  build(a) {
    this.appearance = { ...APPEARANCE_DEFAULT, ...a };
    const A = this.appearance;
    this.body.clear();
    const skin = mat(A.skin, 0.6), coat = mat(A.coat, 0.85), scarf = mat(A.scarf, 0.9), hair = mat(A.hair, 0.55), pants = mat(A.pants, 0.8), boot = mat('#2a1f1a', 0.6);
    // hips pivot at y=0.92
    this.hips = new THREE.Group(); this.hips.position.y = 0.92; this.body.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const coatMesh = new THREE.Mesh(COAT_GEO, coat); coatMesh.position.y = 0.0; this.torso.add(coatMesh);
    // buttons / toggles
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(SHARED.eye, mat('#3a2a20')); b.position.set(0, 0.42 - i * 0.14, 0.15); b.scale.setScalar(1.4); this.torso.add(b); }
    // neck + scarf
    this.neck = new THREE.Group(); this.neck.position.y = 0.62; this.torso.add(this.neck);
    const scarfRing = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.045, 10, 20), scarf); scarfRing.rotation.x = Math.PI / 2; scarfRing.position.y = 0.02; this.neck.add(scarfRing);
    this.scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.32, 0.03), scarf); this.scarfTail.position.set(0.05, -0.15, 0.12); this.neck.add(this.scarfTail);
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.16; this.neck.add(this.head);
    const headMesh = new THREE.Mesh(SHARED.head, skin); headMesh.scale.set(1, 1.12, 1); this.head.add(headMesh);
    for (const ex of [-0.04, 0.04]) { const e = new THREE.Mesh(SHARED.eye, mat('#1a1414', 0.3)); e.position.set(ex, 0.01, 0.104); this.head.add(e); }
    const blushM = mat('#f2a0a8', 0.9, { transparent: true, opacity: 0.5 });
    for (const ex of [-0.06, 0.06]) { const b = new THREE.Mesh(SHARED.eye, blushM); b.scale.set(1.8, 1, 0.6); b.position.set(ex, -0.03, 0.098); this.head.add(b); }
    const hairCap = new THREE.Mesh(hairGeometry(), hair); hairCap.rotation.x = -0.25; hairCap.position.set(0, 0.02, -0.01); this.head.add(hairCap);
    if (this.longHair) {
      const long = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.22, 4, 12), hair); long.scale.set(1.05, 1, 0.6); long.position.set(0, -0.15, -0.06); this.head.add(long);
    }
    if (A.hat === 'earmuff') {
      for (const ex of [-0.12, 0.12]) { const m = new THREE.Mesh(SHARED.muff, mat('#fbf6f0', 1)); m.position.set(ex, 0, 0); this.head.add(m); }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.012, 6, 20, Math.PI), mat('#fbf6f0', 1)); band.position.y = 0.0; this.head.add(band);
    } else if (A.hat === 'beanie') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), scarf); b.position.y = 0.03; this.head.add(b);
      const p = new THREE.Mesh(SHARED.pom, mat('#ffffff', 1)); p.position.y = 0.17; this.head.add(p);
    } else if (A.hat === 'santa') {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 16), mat('#c0182f', 0.8)); c.position.set(0, 0.2, -0.03); c.rotation.x = -0.35; this.head.add(c);
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.03, 8, 20), mat('#ffffff', 1)); brim.rotation.x = Math.PI / 2; brim.position.y = 0.08; this.head.add(brim);
      const p = new THREE.Mesh(SHARED.pom, mat('#ffffff', 1)); p.position.set(0, 0.31, -0.12); this.head.add(p);
    }
    // arms (shoulder pivots)
    const mkArm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.2 * side, 0.55, 0); this.torso.add(sh);
      const up = new THREE.Mesh(SHARED.upperArm, coat); up.position.y = -0.14; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      const fo = new THREE.Mesh(SHARED.foreArm, coat); fo.position.y = -0.12; el.add(fo);
      const mitten = new THREE.Mesh(SHARED.hand, mat(A.scarf, 0.95)); mitten.position.y = -0.27; el.add(mitten);
      return { sh, el, hand: mitten };
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    // legs (hip pivots)
    const mkLeg = (side) => {
      const hp = new THREE.Group(); hp.position.set(0.09 * side, -0.02, 0); this.hips.add(hp);
      const th = new THREE.Mesh(SHARED.thigh, pants); th.position.y = -0.2; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
      const sn = new THREE.Mesh(SHARED.shin, pants); sn.position.y = -0.18; kn.add(sn);
      const bt = new THREE.Mesh(SHARED.boot, boot); bt.position.set(0, -0.42, 0.04); kn.add(bt);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.06, 10), mat('#efe6dc', 1)); cuff.position.y = -0.3; kn.add(cuff);
      return { hp, kn };
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);
    // simple blob shadow (cheap contact shadow for low quality)
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  }

  setAppearance(a) { this.build(a); }

  play(anim) {
    if (anim !== this.anim) { this.anim = anim; this.animT = 0; }
  }

  // speed: horizontal m/s, grounded: bool
  update(dt, speed = 0, grounded = true) {
    this.time += dt;
    this.animT += dt;
    const A = this.anim;
    const L = this.legL, R = this.legR, aL = this.armL, aR = this.armR;
    // reset
    for (const j of [L.hp, L.kn, R.hp, R.kn, aL.sh, aL.el, aR.sh, aR.el, this.torso, this.head, this.hips, this.body]) j.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    const s = Math.min(speed, 7);
    const moving = s > 0.2;
    if (moving) this.phase += dt * (3.2 + s * 1.55);
    const ph = this.phase;
    if (!grounded || A === 'jump') {
      L.hp.rotation.x = -0.6; L.kn.rotation.x = 1.0; R.hp.rotation.x = -0.2; R.kn.rotation.x = 0.5;
      aL.sh.rotation.z = -0.7; aR.sh.rotation.z = 0.7;
    } else if (moving && A !== 'skate') {
      const run = s > 4.2;
      const amp = run ? 0.85 : 0.5;
      L.hp.rotation.x = Math.sin(ph) * amp;
      R.hp.rotation.x = -Math.sin(ph) * amp;
      L.kn.rotation.x = Math.max(0, -Math.cos(ph)) * (run ? 1.3 : 0.7);
      R.kn.rotation.x = Math.max(0, Math.cos(ph)) * (run ? 1.3 : 0.7);
      aL.sh.rotation.x = -Math.sin(ph) * amp * 0.9; aR.sh.rotation.x = Math.sin(ph) * amp * 0.9;
      aL.el.rotation.x = run ? -1.2 : -0.3; aR.el.rotation.x = run ? -1.2 : -0.3;
      aL.sh.rotation.z = -0.08; aR.sh.rotation.z = 0.08;
      this.body.position.y = Math.abs(Math.sin(ph)) * (run ? 0.07 : 0.035);
      this.torso.rotation.x = run ? 0.18 : 0.04;
      this.torso.rotation.y = Math.sin(ph) * 0.08;
    } else if (A === 'skate' && moving) {
      const g = Math.sin(this.time * 2.4);
      L.hp.rotation.z = Math.max(0, g) * -0.4; R.hp.rotation.z = Math.max(0, -g) * 0.4;
      this.torso.rotation.x = 0.35; aL.sh.rotation.z = -0.5 - g * 0.2; aR.sh.rotation.z = 0.5 - g * 0.2;
      this.body.rotation.z = g * 0.08;
    } else {
      // idle breathing + emotes
      const br = Math.sin(this.time * 1.6) * 0.012;
      this.torso.position.y = br;
      aL.sh.rotation.z = -0.1; aR.sh.rotation.z = 0.1;
      const t = this.animT;
      switch (A) {
        case 'wave': aR.sh.rotation.z = 2.6; aR.el.rotation.z = 0.4 + Math.sin(t * 9) * 0.45; break;
        case 'heart': aL.sh.rotation.z = -2.5; aR.sh.rotation.z = 2.5; aL.el.rotation.z = -1.4; aR.el.rotation.z = 1.4; break;
        case 'cheer': aL.sh.rotation.z = -2.7; aR.sh.rotation.z = 2.7; this.body.position.y = Math.abs(Math.sin(t * 7)) * 0.12; break;
        case 'bow': this.torso.rotation.x = Math.min(0.7, t * 2.5) * (t < 1.4 ? 1 : Math.max(0, 1 - (t - 1.4) * 3)); break;
        case 'dance': {
          const b = t * 6;
          this.body.rotation.y = Math.sin(b * 0.5) * 0.5; this.body.position.y = Math.abs(Math.sin(b)) * 0.08;
          this.hips.rotation.z = Math.sin(b) * 0.12;
          aL.sh.rotation.z = -1.4 - Math.sin(b) * 0.8; aR.sh.rotation.z = 1.4 - Math.sin(b) * 0.8;
          aL.el.rotation.z = -0.8; aR.el.rotation.z = 0.8;
          L.hp.rotation.x = Math.max(0, Math.sin(b)) * 0.4; R.hp.rotation.x = Math.max(0, -Math.sin(b)) * 0.4;
          break;
        }
        case 'sit':
          this.body.position.y = -0.45; L.hp.rotation.x = -1.5; R.hp.rotation.x = -1.5; L.kn.rotation.x = 1.4; R.kn.rotation.x = 1.4;
          aL.sh.rotation.x = -0.4; aR.sh.rotation.x = -0.4; break;
        case 'hug':
          aL.sh.rotation.x = -1.4; aR.sh.rotation.x = -1.4; aL.sh.rotation.y = 0.5; aR.sh.rotation.y = -0.5;
          aL.el.rotation.x = -0.6; aR.el.rotation.x = -0.6; this.torso.rotation.x = 0.1; break;
        case 'throw': aR.sh.rotation.x = t < 0.25 ? -2.6 : -0.6; break;
        default: this.head.rotation.y = Math.sin(this.time * 0.4 + this.seed) * 0.25;
      }
    }
    // hand-holding arm pose overrides one arm
    if (this.holdSide) {
      const arm = this.holdSide > 0 ? aR : aL;
      arm.sh.rotation.x = -0.15;
      arm.sh.rotation.z = 0.45 * this.holdSide;
      arm.el.rotation.x = -0.1;
    }
    // scarf tail sways with movement/wind
    this.scarfTail.rotation.x = 0.2 + (moving ? 0.5 + Math.sin(ph * 2) * 0.15 : Math.sin(this.time * 2) * 0.08);
  }

  handWorldPosition(side, out = new THREE.Vector3()) {
    const arm = side > 0 ? this.armR : this.armL;
    return arm.hand.getWorldPosition(out);
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && !Object.values(SHARED).includes(o.geometry) && o.geometry !== COAT_GEO) o.geometry.dispose(); });
    this.root.removeFromParent();
  }
}
