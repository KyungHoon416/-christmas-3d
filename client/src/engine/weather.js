// Night sky, GPU snowfall (world-anchored, wraps around the camera so flakes never
// pop when the camera moves/rotates), wind gusts and footprints in the snow.
import * as THREE from 'three';
import { radialTexture, footprintTexture } from './textures.js';
import { matrix } from './batch.js';

// ---------------------------------------------------------------- sky
export function createSky() {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color(0x05081a) }, uMid: { value: new THREE.Color(0x1a1f45) }, uHorizon: { value: new THREE.Color(0x5a3b6b) } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uTop,uMid,uHorizon; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){ float y=max(vP.y,0.);
        vec3 c=mix(uHorizon,uMid,smoothstep(0.,0.25,y)); c=mix(c,uTop,smoothstep(0.2,0.8,y));
        vec3 q=floor(vP*420.); float s=step(0.9975,h(q))*smoothstep(0.15,0.5,y)*0.35;
        gl_FragColor=vec4(c+s,1.); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(235,240,255,1)', 'rgba(180,190,255,0)'), fog: false, depthWrite: false, transparent: true }));
  moon.scale.set(260, 260, 1);
  moon.position.set(-1200, 1500, -2200);
  const g = new THREE.Group();
  g.add(sky, moon);
  return g;
}

// ---------------------------------------------------------------- snow
const SNOW_VS = `
attribute vec3 aOffset; attribute float aSeed;
uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind; uniform float uFall; uniform float uTime;
uniform float uSize; uniform float uPR; uniform vec3 uLamps[8]; uniform vec4 uRoof; uniform float uRoofH;
varying float vAlpha; varying float vWarm;
void main(){
  vec3 p = aOffset * uBox;
  p.y -= uFall * (0.75 + aSeed * 0.5);
  p.xz += uWind * (0.85 + aSeed * 0.3);
  p.x += sin(uTime * (0.6 + aSeed) + aSeed * 40.0) * 0.6;
  p.z += cos(uTime * (0.5 + aSeed * 0.7) + aSeed * 23.0) * 0.6;
  vec3 center = uCam + vec3(0.0, uBox.y * 0.15, 0.0);
  vec3 rel = mod(p - center + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = center + rel;
  vec3 e = abs(rel) / uBox;
  vAlpha = 1.0 - smoothstep(0.36, 0.5, max(max(e.x, e.y), e.z));
  // no snow under a roof (e.g. inside the DDP hall)
  vec2 rq = (world.xz - uRoof.xy) / uRoof.zw;
  if (uRoof.z > 0.0 && dot(rq, rq) < 1.0 && world.y < uRoofH) vAlpha = 0.0;
  float warm = 0.0;
  for (int i = 0; i < 8; i++) { vec3 d = world - uLamps[i]; warm += 1.0 / (1.0 + dot(d, d) * 0.12); }
  vWarm = clamp(warm, 0.0, 1.5);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha *= smoothstep(0.6, 2.0, -mv.z); // flakes right at the lens fade out instead of filling the screen
  gl_PointSize = min(uSize * (0.55 + aSeed * 0.9) * uPR * (24.0 / -mv.z), 11.0 * uPR);
}`;
const SNOW_FS = `
varying float vAlpha; varying float vWarm; uniform float uOpacity;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = smoothstep(0.5, 0.1, d) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.86, 0.9, 1.0), vec3(1.0, 0.86, 0.66), min(vWarm, 1.0)) * (0.85 + vWarm * 0.6);
  gl_FragColor = vec4(col, a);
}`;

class SnowLayer {
  constructor(count, box, size, fallSpeed, opacity) {
    const off = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { off.set([Math.random(), Math.random(), Math.random()], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = {
      uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uWind: { value: new THREE.Vector2() },
      uFall: { value: 0 }, uTime: { value: 0 }, uSize: { value: size }, uPR: { value: 1 }, uOpacity: { value: opacity },
      uLamps: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, -999, 0)) },
      uRoof: { value: new THREE.Vector4(0, 0, 0, 0) }, uRoofH: { value: 0 },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.fallSpeed = fallSpeed;
  }
}

export class Snow {
  constructor(scene) {
    this.scene = scene;
    this.layers = [];
    this.wind = new THREE.Vector2(0.6, 0.2);
    this.windOffset = new THREE.Vector2();
    this.fall = 0;
    this.intensity = 1; // 1 = heavy snow
  }

  setQuality(q) {
    for (const l of this.layers) { this.scene.remove(l.points); l.points.geometry.dispose(); l.points.material.dispose(); }
    const k = { low: 0.3, medium: 0.65, high: 1 }[q] ?? 0.65;
    this.layers = [
      new SnowLayer(Math.floor(9000 * k), [36, 26, 36], 2.6, 1.6, 0.95), // near: big flakes
      new SnowLayer(Math.floor(16000 * k), [130, 60, 130], 1.7, 1.25, 0.7), // far: dense small flakes
    ];
    for (const l of this.layers) this.scene.add(l.points);
  }

  update(dt, t, camera, lamps, pixelRatio) {
    // gusty wind: smoothly varying vector, integrated so flakes never jump
    const gust = 0.6 + Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.73 + 1.3) * 0.35;
    this.wind.set(Math.cos(t * 0.05) * 1.4 * gust, Math.sin(t * 0.04) * 0.8 * gust);
    this.windOffset.addScaledVector(this.wind, dt);
    this.fall += dt;
    // nearest 8 lamps to the camera for warm glints
    const near = lamps.length > 8 ? [...lamps].sort((a, b) => a.distanceToSquared(camera.position) - b.distanceToSquared(camera.position)).slice(0, 8) : lamps;
    for (const l of this.layers) {
      const u = l.uniforms;
      if (this.roof) { u.uRoof.value.copy(this.roof.v); u.uRoofH.value = this.roof.h; } else u.uRoof.value.set(0, 0, 0, 0);
      u.uCam.value.copy(camera.position);
      u.uWind.value.copy(this.windOffset);
      u.uFall.value = this.fall * l.fallSpeed;
      u.uTime.value = t;
      u.uPR.value = pixelRatio;
      for (let i = 0; i < 8; i++) u.uLamps.value[i].copy(near[i] || new THREE.Vector3(0, -999, 0));
    }
  }
}

// ---------------------------------------------------------------- footprints
export class Footprints {
  constructor(scene, max = 500) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.42), new THREE.MeshBasicMaterial({ map: footprintTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), max);
    this.mesh.frustumCulled = false;
    this.items = [];
    this.i = 0;
    for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, matrix(0, -999, 0, 0, 0, 0, 0, 0, 0));
    scene.add(this.mesh);
    this.acc = 0;
  }

  add(x, y, z, ry, side) {
    const k = this.i++ % this.max;
    const ox = Math.cos(ry) * 0.12 * side, oz = -Math.sin(ry) * 0.12 * side;
    this.items[k] = { x: x + ox, y: y + 0.03, z: z + oz, ry, born: performance.now() };
    this.mesh.setMatrixAt(k, matrix(x + ox, y + 0.03, z + oz, -Math.PI / 2, 0, ry));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const now = performance.now();
    let dirty = false;
    // fresh snow slowly fills prints back in (shrinks them over ~45s)
    this.items.forEach((it, k) => {
      if (!it) return;
      const age = (now - it.born) / 1000;
      if (age < 30) return;
      const s = Math.max(0, 1 - (age - 30) / 15);
      this.mesh.setMatrixAt(k, matrix(it.x, it.y, it.z, -Math.PI / 2, 0, it.ry, s, s, s));
      if (s === 0) this.items[k] = null;
      dirty = true;
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items = [];
    for (let k = 0; k < this.max; k++) this.mesh.setMatrixAt(k, matrix(0, -999, 0, 0, 0, 0, 0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
