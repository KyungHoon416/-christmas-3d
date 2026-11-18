// Responsive HUD audit: overlap + off-screen checks over many viewports, plus a contact sheet.
const { chromium } = require('playwright');
const fs = require('fs');

// usage: node tests/e2e/responsive-audit.cjs   (BASE=http://localhost:8765/artifact-test.html, OUT=dir)
const OUT = process.env.OUT || require('path').join(process.cwd(), 'responsive-audit');
const BASE = process.env.BASE || 'http://localhost:8765/artifact-test.html';
fs.mkdirSync(OUT, { recursive: true });
const TOUCH = [
  ['iPhone SE 1', 320, 568], ['Galaxy Fold cover', 344, 882], ['iPhone SE 3', 375, 667], ['iPhone 13 mini', 375, 812],
  ['Pixel 7', 412, 915], ['iPhone 15 Pro Max', 430, 932], ['Fold open', 673, 841], ['iPad mini', 768, 1024],
  ['iPad Pro 11', 834, 1194], ['Tab S9', 800, 1280], ['iPad 12.9', 1024, 1366],
  ['SE 1 land', 568, 320], ['SE 3 land', 667, 375], ['13 mini land', 812, 375], ['Pixel 7 land', 915, 412],
  ['15 Pro Max land', 932, 430], ['Fold open land', 841, 673], ['iPad mini land', 1024, 768], ['iPad Pro land', 1194, 834], ['Tab S9 land', 1280, 800],
];
const DESK = process.env.DESK_ONLY ? [['Laptop 1280x720', 1280, 720], ['Desktop 1920x1080', 1920, 1080], ['Small window 920x620', 920, 620]] : [['Desktop 1024x700', 1024, 700], ['Laptop 1280x720', 1280, 720], ['Laptop 1366x768', 1366, 768], ['Desktop 1440x900', 1440, 900], ['Desktop 1920x1080', 1920, 1080], ['Small window 920x620', 920, 620]];
const HUD = ['.topnav', '.profile', '.mtopbtns', '.minimap', '.minimap-label', '.sidebtns', '.actions', '.mctl', '.joystick', '.chat', '.friends', '.worlds', '.carol', '.look-hint'];
const audit = () => {
  const W = innerWidth, H = innerHeight;
  const vis = (e) => { if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
  const items = [];
  for (const s of window.__HUD) for (const e of document.querySelectorAll(s)) { const r = vis(e); if (r) items.push({ s, r }); }
  const issues = [];
  for (const { s, r } of items) if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) issues.push(`OFF ${s} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i].r, b = items[j].r;
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 4 && oy > 4) issues.push(`OVERLAP ${items[i].s} × ${items[j].s} (${Math.round(ox)}x${Math.round(oy)})`);
  }
  return { W, H, cls: document.body.className, issues };
};
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  for (const [kind, list] of (process.env.DESK_ONLY ? [['desk', DESK]] : [['touch', TOUCH], ['desk', DESK]])) {
    const ctx = await browser.newContext(kind === 'touch' ? { viewport: { width: list[0][1], height: list[0][2] }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + '?quality=low&maxfps=8', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-nick]');
    // login screen check on every size
    for (const [name, w, h] of list) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
      const r = await page.evaluate(() => { const b = document.querySelector('[data-go]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const c = document.querySelector('.login-card').getBoundingClientRect(); return { btnVisible: r.bottom <= innerHeight && r.top >= 0, cardW: c.width, W: innerWidth }; });
      results.push({ name, w, h, stage: 'login', issues: [...(r.btnVisible ? [] : ['LOGIN button unreachable']), ...(r.cardW > r.W ? ['LOGIN card wider than screen'] : [])] });
    }
    await page.setViewportSize({ width: list[0][1], height: list[0][2] });
    await page.fill('[data-nick]', '감사봇'); await page.evaluate(() => document.querySelector('[data-go]').click());
    await page.waitForFunction(() => window.__cw?.world?.region && !document.querySelector('.loading'), null, { timeout: 180000 });
    await page.waitForTimeout(2000);
    await page.evaluate((h) => { window.__HUD = h; document.querySelectorAll('.modal-bg').forEach((m) => m.close?.()); try { localStorage.setItem('cw.mhelp', '1'); } catch {} }, HUD);
    for (const [name, w, h] of list) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(1200);
      await page.evaluate(() => { document.querySelectorAll('.modal-bg').forEach((m) => m.close?.()); document.querySelectorAll('.toast').forEach((t) => t.remove()); });
      await page.waitForTimeout(300);
      const a = await page.evaluate(audit);
      const file = `${name.replace(/[^a-z0-9]+/gi, '_')}.jpg`;
      await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 60 });
      results.push({ name, w, h, stage: 'hud', cls: a.cls, issues: a.issues, file });
      console.log(`${name} ${w}x${h} [${a.cls}] ${a.issues.length ? a.issues.join(' | ') : 'OK'}`);
    }
    if (errs.length) console.log('errors', errs.slice(0, 3));
    await ctx.close();
  }
  for (const r of results.filter((r) => r.stage === 'login' && r.issues.length)) console.log('LOGIN', r.name, r.issues.join(','));
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  // contact sheet
  const shots = results.filter((r) => r.file);
  const html = `<body style="margin:0;background:#111;color:#fff;font:12px sans-serif;display:flex;flex-wrap:wrap;gap:8px;padding:8px">${shots.map((r) => `<div style="width:${r.w > r.h ? 420 : 210}px"><div>${r.name} ${r.w}x${r.h}${r.issues.length ? ' ⚠' + r.issues.length : ''}</div><img src="file://${OUT}/${r.file}" style="width:100%"></div>`).join('')}</body>`;
  fs.writeFileSync(`${OUT}/sheet.html`, html);
  const p = await (await browser.newContext({ viewport: { width: 1800, height: 800 } })).newPage();
  await p.goto(`file://${OUT}/sheet.html`); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/sheet.jpg`, type: 'jpeg', quality: 70, fullPage: true });
  await browser.close();
})();
