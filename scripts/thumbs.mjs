// Renders a thumbnail of every region from the actual 3D scene (?thumb=<id>) and
// writes client/public/thumbs/<id>.jpg. Requires a running server with a built client:
//   npm run build && PORT=3100 npm start &   then   BASE=http://localhost:3100 npm run thumbs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { REGIONS } from '../shared/regions.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.resolve('client/public/thumbs');
const full = process.argv.includes('--full'); // also save large screenshots to OUT/../../../docs/screenshots

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const r of REGIONS) {
  const page = await browser.newPage({ viewport: full ? { width: 1280, height: 720 } : { width: 480, height: 300 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?thumb=${r.id}`);
  await page.waitForFunction(() => window.__thumbReady === true, null, { timeout: 120000 });
  const file = full ? path.resolve('docs/screenshots', `region-${r.id}.jpg`) : path.join(OUT, `${r.id}.jpg`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, type: 'jpeg', quality: full ? 85 : 78, timeout: 180000 });
  console.log('wrote', file);
  await page.close();
}
await browser.close();
