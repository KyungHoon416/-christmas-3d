# 3D ad banner — implementation report

## Done
* 3D billboard structure at Gwanghwamun (frame, snow, LED, title, base, collision) with TEST SLOT A / B / C.
* Live slot content from Firebase RTDB; default test slots when the DB is empty or offline (artifact / local server).
* Slot states (active / inactive / scheduled / expired) → default Christmas banner when not active.
* E-key / touch interaction, disclosure panel, explicit confirmation before opening an advertiser link.
* Admin page `/admin` (`admin.html`): Google sign-in, admin check, location list + on/off, slot table, edit form
  (name, advertiser, description, link, image URL/upload, dates, priority, active), disable/enable,
  restore test banner, seed test data, live 2D preview, statistics.
* Security rules for ads/admins/stats; stats as daily counters.
* AdSense site-verification hook (off until a publisher id is set).
* Docs: audit, spec, data model, this report, QA report. Screenshots: `docs/screenshots/ads/`.

## Files
New: `shared/ads.js`, `client/src/ads/{adArt,adBanner3D,adService,adInteract}.js`, `client/src/admin/admin.js`,
`admin.html`, `client/public/test-assets/ad-slot-{a,b,c}.jpg`, `scripts/gen-ad-assets.mjs`, `tests/ads.test.js`,
`tests/e2e/ads-firebase-e2e.mjs`, `docs/AD_*.md`.
Changed: `shared/regions.js` (banner colliders), `client/src/engine/regionBuilder.js` (build banners),
`client/src/ui/app.js` (service, controller, E key), `client/src/ui/styles.css`, `database.rules.json`,
`firebase.json` (`/admin` rewrite, noindex), `vite.config.js` (admin entry, es2022 target, AdSense plugin).

## Owner actions needed (cannot be done from the code)
1. Firebase console → Authentication → Sign-in method → enable **Google** (admin login).
2. Open `https://christmas-3d.web.app/admin`, sign in, copy the UID shown, then Realtime Database → add `admins/<UID> = true`.
3. Optional: enable **Firebase Storage** (may require the Blaze plan). Until then uploads are compressed into the database automatically.
4. Optional AdSense verification: put the `ca-pub-…` id into `ADSENSE_CLIENT` (shared/ads.js) and redeploy.

## Not done / limits
* Firebase Storage upload is implemented but untested against a real bucket (bucket does not exist) → BLOCKED.
* Firebase Analytics (GA4) not wired (no measurementId); counters in RTDB instead.
* FPS impact not measured on real devices (software renderer only).
* Board geometry/positions are code-defined; the DB can only switch a board on/off.
