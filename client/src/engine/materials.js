import * as THREE from 'three';
import { facadeTextures, snowTexture, pavingTexture, roofTileTexture, dancheongTexture, stoneWallTexture, panelTexture } from './textures.js';

const M = new Map();
function get(key, fn) {
  if (!M.has(key)) { const m = fn(); m.userData.shared = true; M.set(key, m); }
  return M.get(key);
}

export function facadeMat(style, variant) {
  return get(`facade:${style}:${variant}`, () => {
    const { map, emissive } = facadeTextures(style, variant);
    const glassy = style === 'glass' || style === 'modern';
    return new THREE.MeshStandardMaterial({
      map, emissiveMap: emissive, emissive: new THREE.Color(1, 0.95, 0.88), emissiveIntensity: 1.25,
      roughness: glassy ? 0.25 : 0.82, metalness: glassy ? 0.55 : 0.05,
    });
  });
}

export const mats = {
  snow: () => get('snow', () => {
    const t = snowTexture(); t.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.78, metalness: 0, color: 0xf2f5fb });
  }),
  snowCap: () => get('snowCap', () => new THREE.MeshStandardMaterial({ color: 0xf4f7fd, roughness: 0.85 })),
  paving: () => get('paving', () => new THREE.MeshStandardMaterial({ map: pavingTexture('stone'), roughness: 0.55, metalness: 0.05 })),
  road: () => get('road', () => new THREE.MeshStandardMaterial({ map: pavingTexture('road'), roughness: 0.45, metalness: 0.1 })),
  wood: () => get('wood', () => new THREE.MeshStandardMaterial({ map: pavingTexture('wood'), roughness: 0.8 })),
  roofTile: () => get('rooftile', () => new THREE.MeshStandardMaterial({ map: roofTileTexture(), roughness: 0.75, side: THREE.DoubleSide })),
  dancheong: () => get('dancheong', () => new THREE.MeshStandardMaterial({ map: dancheongTexture(), roughness: 0.7, side: THREE.DoubleSide })),
  stoneWall: () => get('stonewall', () => new THREE.MeshStandardMaterial({ map: stoneWallTexture(), roughness: 0.9 })),
  stone: () => get('stone', () => new THREE.MeshStandardMaterial({ color: 0x9b958c, roughness: 0.85 })),
  darkStone: () => get('darkStone', () => new THREE.MeshStandardMaterial({ color: 0x45424a, roughness: 0.85 })),
  redWood: () => get('redWood', () => new THREE.MeshStandardMaterial({ color: 0x8e2a22, roughness: 0.7 })),
  bronze: () => get('bronze', () => new THREE.MeshStandardMaterial({ color: 0x8f6a3c, roughness: 0.38, metalness: 0.85 })),
  gold: () => get('gold', () => new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.3, metalness: 1, emissive: 0x3a2a00 })),
  metal: () => get('metal', () => new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.45, metalness: 0.8 })),
  lightMetal: () => get('lightMetal', () => new THREE.MeshStandardMaterial({ color: 0x9aa1ad, roughness: 0.35, metalness: 0.8 })),
  panel: () => get('panel', () => new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.38, metalness: 0.6, color: 0xd8dde6, emissive: 0x141a2a })),
  glass: () => get('glass', () => new THREE.MeshStandardMaterial({ color: 0x223049, roughness: 0.08, metalness: 0.9, emissive: 0x0a1222 })),
  ice: () => get('ice', () => new THREE.MeshStandardMaterial({ color: 0xbcd6ef, roughness: 0.06, metalness: 0.25, emissive: 0x0d1a2a })),
  water: () => get('water', () => new THREE.MeshStandardMaterial({ color: 0x0c1c2c, roughness: 0.05, metalness: 0.6, emissive: 0x02060c })),
  treeGreen: () => get('treeGreen', () => new THREE.MeshStandardMaterial({ color: 0x1d4a2c, roughness: 0.9 })),
  trunk: () => get('trunk', () => new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.9 })),
  white: () => get('white', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })),
  red: () => get('red', () => new THREE.MeshStandardMaterial({ color: 0xb3122a, roughness: 0.45 })),
  green: () => get('green', () => new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.55 })),
  awning: () => get('awning', () => new THREE.MeshStandardMaterial({ color: 0xa3223a, roughness: 0.7, side: THREE.DoubleSide })),
  canvasWhite: () => get('canvasWhite', () => new THREE.MeshStandardMaterial({ color: 0xece4d6, roughness: 0.8, side: THREE.DoubleSide })),
  warmGlow: () => get('warmGlow', () => new THREE.MeshBasicMaterial({ color: 0xffd9a0 })),
  bulb: () => get('bulb', () => new THREE.MeshBasicMaterial({ color: 0xfff1cf })),
  pinkGlow: () => get('pinkGlow', () => new THREE.MeshBasicMaterial({ color: 0xff6fb5 })),
  redLight: () => get('redLight', () => new THREE.MeshBasicMaterial({ color: 0xff2a2a })),
  shopfront: () => get('shopfront', () => new THREE.MeshStandardMaterial({ color: 0x2a1f18, emissive: 0xffb877, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3 })),
};

export function disposeAllMaterials() {
  // Materials are shared across regions and intentionally kept (cheap); geometry is disposed per region.
}
