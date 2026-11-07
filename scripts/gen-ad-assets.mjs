// Renders the procedural TEST SLOT banners (client/src/ads/adArt.js) into JPEG files:
//   node scripts/gen-ad-assets.mjs  ->  client/public/test-assets/ad-slot-{a,b,c}.jpg
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const src = fs.readFileSync(new URL('../client/src/ads/adArt.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const out = new URL('../client/public/test-assets/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: src });
for (const [k, w, h] of [['a', 1280, 794], ['b', 1040, 600], ['c', 1040, 600]]) {
  const data = await page.evaluate(([k, w, h]) => adArtCanvas(k.toUpperCase(), w, h).toDataURL('image/jpeg', 0.88), [k, w, h]);
  fs.writeFileSync(new URL(`ad-slot-${k}.jpg`, out), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', `ad-slot-${k}.jpg`);
}
await browser.close();
