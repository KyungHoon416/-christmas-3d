// Renderer, lighting, post-processing, quality management and frame loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createSky, Snow, Footprints } from './weather.js';
import { setAnisotropy } from './textures.js';
import { buildRegion } from './regionBuilder.js';

export const QUALITY = {
  low: { pr: 0.85, shadows: false, shadowSize: 0, bloom: false, lights: 2, fog: 0.016, antialias: false },
  medium: { pr: 1.25, shadows: true, shadowSize: 1024, bloom: true, lights: 4, fog: 0.012, antialias: true },
  high: { pr: 2, shadows: true, shadowSize: 2048, bloom: true, lights: 6, fog: 0.0105, antialias: true },
};

export class Engine {
  constructor(container, { quality = 'medium', preserveDrawingBuffer = false } = {}) {
    this.container = container;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: QUALITY[quality].antialias, powerPreference: 'high-performance', preserveDrawingBuffer });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false; // count all passes per frame (stats overlay)
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141833);
    this.scene.fog = new THREE.FogExp2(0x2a2647, QUALITY[quality].fog);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 6000);
    this.scene.add(createSky());
    this.scene.environment = this.buildEnvironment();
    this.scene.environmentIntensity = 0.45;

    this.hemi = new THREE.HemisphereLight(0x7d8fc9, 0x2e2638, 0.6);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xb7c3ff, 0.55);
    this.moon.position.set(-30, 60, -20);
    this.moon.shadow.camera.left = -40; this.moon.shadow.camera.right = 40;
    this.moon.shadow.camera.top = 40; this.moon.shadow.camera.bottom = -40;
    this.moon.shadow.camera.far = 200;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    this.scene.add(this.moon, this.moon.target);
    this.fill = new THREE.AmbientLight(0x8a6f8f, 0.25);
    this.scene.add(this.fill);
    // pooled point lights re-assigned to the street lamps nearest the player
    this.lampLights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffc58a, 0, 16, 1.6);
      this.lampLights.push(l);
      this.scene.add(l);
    }

    this.snow = new Snow(this.scene);
    this.footprints = new Footprints(this.scene);
    this.region = null;
    this.updaters = [];
    this.clock = new THREE.Clock();
    this.time = 0;
    this.fps = 60;
    this.frameMs = 16;
    this.onFrame = null;
    this.autoQuality = true;
    this.lowFpsTime = 0;
    this.applyQuality(quality);
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', () => setTimeout(this._onResize, 250));
    // pause rendering in background tabs; protects battery on mobile
    document.addEventListener('visibilitychange', () => { this.clock.getDelta(); });
  }

  // Night-city image-based lighting so metal/glass have something to reflect.
  buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float y=vP.y; vec3 top=vec3(0.05,0.07,0.18), hor=vec3(0.55,0.35,0.55), gnd=vec3(0.35,0.36,0.45); vec3 c = y>0. ? mix(hor,top,smoothstep(0.,0.5,y)) : mix(hor,gnd,smoothstep(0.,0.3,-y)); gl_FragColor=vec4(c,1.); }',
    }));
    env.add(sky);
    // warm "city light" panels around the horizon
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(3) });
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.4, 0.7).multiplyScalar(2.5) });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 3 + (i % 3) * 2), i % 4 === 0 ? pink : warm);
      m.position.set(Math.cos(a) * 40, 2 + (i % 3), Math.sin(a) * 40);
      m.lookAt(0, 2, 0);
      env.add(m);
    }
    const tex = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    return tex;
  }

  applyQuality(q) {
    this.quality = q;
    const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    this.renderer.shadowMap.enabled = Q.shadows;
    this.moon.castShadow = Q.shadows;
    if (Q.shadows) { this.moon.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); this.moon.shadow.map?.dispose(); this.moon.shadow.map = null; }
    this.scene.fog.density = this.regionFog ?? Q.fog;
    this.lampLights.forEach((l, i) => { l.visible = i < Q.lights; });
    this.snow.setQuality(q);
    if (Q.bloom) {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.78);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
    } else if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    // force material recompilation for shadow changes
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // wider FOV in portrait so the world isn't claustrophobic
    this.camera.fov = w < h ? 70 : 58;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.bloom?.resolution.set(w / 2, h / 2);
    }
  }

  loadRegion(regionData) {
    if (this.region) {
      // free GPU memory of the previous region
      this.region.dispose();
      this.region = null;
      this.renderer.renderLists.dispose();
    }
    this.footprints.clear();
    const built = buildRegion(regionData, this.quality);
    this.scene.add(built.group);
    this.region = built;
    this.updaters = built.updaters;
    this.regionFog = regionData.id === 'namsan' ? 0.0042 : null;
    const I = regionData.indoor;
    this.snow.roof = I ? { v: new THREE.Vector4(I.x, I.z, I.rx * 1.08, I.rz * 1.08), h: 30 } : null;
    this.scene.fog.density = this.regionFog ?? QUALITY[this.quality].fog;
    this.camera.far = regionData.id === 'namsan' ? 6000 : 3000;
    this.camera.updateProjectionMatrix();
    return built;
  }

  // Follow target: shadows + lamp light pool track the player.
  focus(p) {
    this.moon.position.set(p.x - 30, p.y + 60, p.z - 20);
    this.moon.target.position.set(p.x, p.y, p.z);
    const lamps = this.region?.lamps || [];
    if (!lamps.length) return;
    const sorted = [...lamps].sort((a, b) => a.distanceToSquared(p) - b.distanceToSquared(p));
    this.lampLights.forEach((l, i) => {
      const lp = sorted[i];
      if (!lp || !l.visible) { l.intensity = 0; return; }
      l.position.copy(lp);
      l.intensity = 14;
    });
  }

  start() {
    const minFrame = this.maxFps ? 1 / this.maxFps : 0;
    let acc = 0;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      // optional frame cap (?maxfps=) — used by automated multi-client tests on CPU rendering
      if (minFrame) { acc += this.clock.getDelta(); if (acc < minFrame) return; }
      const dt = Math.min(minFrame ? 0.15 : 0.05, minFrame ? acc : this.clock.getDelta());
      acc = 0;
      this.time += dt;
      const t0 = performance.now();
      this.renderer.info.reset();
      this.onFrame?.(dt, this.time);
      for (const u of this.updaters) u(dt, this.time);
      this.snow.update(dt, this.time, this.camera, this.region?.lamps || [], this.renderer.getPixelRatio());
      this.footprints.update(dt);
      const t1 = performance.now();
      if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
      const t2 = performance.now();
      this.updateMs = (this.updateMs || 0) * 0.95 + (t1 - t0) * 0.05;
      this.renderMs = (this.renderMs || 0) * 0.95 + (t2 - t1) * 0.05;
      this.frameMs = this.frameMs * 0.95 + (t2 - t0) * 0.05;
      const now = performance.now();
      if (this.lastFrameAt) this.fps = this.fps * 0.95 + (1000 / Math.max(now - this.lastFrameAt, 1)) * 0.05;
      this.lastFrameAt = now;
      this.adapt(dt);
    };
    loop();
  }

  // Adaptive quality: drop particle density/shadows/bloom first when FPS sags.
  adapt(dt) {
    if (!this.autoQuality) return;
    const target = this.isMobile ? 28 : 45;
    if (this.fps < target) this.lowFpsTime += dt; else this.lowFpsTime = Math.max(0, this.lowFpsTime - dt * 0.5);
    if (this.lowFpsTime > 6) {
      this.lowFpsTime = 0;
      const next = this.quality === 'high' ? 'medium' : this.quality === 'medium' ? 'low' : null;
      if (next) { this.applyQuality(next); this.onQualityChange?.(next, 'auto'); }
    }
  }

  stats() {
    const info = this.renderer.info;
    return { fps: Math.round(this.fps), frameMs: +this.frameMs.toFixed(2), updateMs: +(this.updateMs || 0).toFixed(2), renderMs: +(this.renderMs || 0).toFixed(2), calls: info.render.calls, tris: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, quality: this.quality };
  }

  screenshot() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }
}
