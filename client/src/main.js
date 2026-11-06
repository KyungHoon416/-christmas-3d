import { App } from './ui/app.js';
import { Engine } from './engine/engine.js';
import { getRegion } from '../../shared/regions.js';

// ?thumb=<regionId> renders a static establishing shot of a region (used by
// scripts/thumbs.mjs to generate the world-map card thumbnails from the real 3D scene).
const params = new URLSearchParams(location.search);
const thumb = params.get('thumb');
const VIEWS = {
  gwanghwamun: { pos: [6, 7, 62], look: [-6, 9, -40] },
  seoulplaza: { pos: [18, 8, 40], look: [-2, 4, -24] },
  cheonggyecheon: { pos: [-67, -2.2, 3], look: [-30, -1.5, -1] },
  myeongdong: { pos: [-64, 3.2, 2], look: [30, 6, -2] },
  ddp: { pos: [34, 5, 58], look: [-6, 7, -18] },
  namsan: { pos: [-20, 3, 37], look: [2, 24, -6] },
};

if (thumb && getRegion(thumb)) {
  const engine = new Engine(document.getElementById('game'), { quality: params.get('q') || 'high', preserveDrawingBuffer: true });
  engine.autoQuality = false;
  engine.loadRegion(getRegion(thumb));
  const v = VIEWS[thumb];
  engine.camera.position.set(...v.pos);
  engine.camera.lookAt(...v.look);
  engine.focus(engine.camera.position.clone());
  let frames = 0;
  engine.onFrame = () => { if (++frames === 40) window.__thumbReady = true; };
  engine.start();
} else {
  new App();
}
