# 3D ad banner — QA report

Environments: `npm test` (Node 22); Playwright + Chromium (SwiftShader) on the offline build (desktop 1280×720 and
Pixel 7 emulation); Firebase build against the Firebase emulators (RTDB + Auth, production rules) via
`tests/e2e/ads-firebase-e2e.mjs` → `docs/qa-ads-firebase-results.json` (19/20, the 1 non-pass is Storage = BLOCKED).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | One banner visible in the world | PASS | screenshots `ad-d-1-view`, `ad-game-live`; AD-01 |
| 2 | Rendered as a real 3D structure | PASS | extruded frame/base/snow meshes, collision; screenshots |
| 3 | TEST SLOT A / B / C shown | PASS | AD-01 (names + ACTIVE), screenshots |
| 4 | DB change updates slot content live | PASS | AD-04 (slot B name + image swapped without reload); AD-A2 (admin edit) |
| 5 | Firebase Storage image shown | BLOCKED | bucket not provisioned (404); upload falls back to RTDB image (AD-A2 shows that image in game) |
| 6 | Expired → default banner | PASS | AD-06 (EXPIRED → `canvas:promo`), AD-06b (inactive), screenshot `ad-d-5-expired` |
| 7 | Interaction near the banner | PASS | prompt `E 광고 보기`, panel opens (desktop E, mobile tap) |
| 8 | Explicit confirmation before link | PASS | AD-08: nothing opened before confirm, cancel opens nothing, confirm opens exactly the URL |
| 9 | PC browser | PASS | desktop run, 0 errors |
| 10 | Mobile browser | PASS (emulated) | Pixel 7 emulation run, screenshots `ad-m-*`; not tested on a physical phone |
| 11 | Landscape/portrait switch | PASS (code) / not re-tested | panel uses the existing responsive modal + media query; no rotation test this round |
| 12 | Banner does not block movement | PASS | `tests/ads.test.js` (spawn, front, back, walkway free; banner solid) |
| 13 | Multiplayer/chat/voice unaffected | PASS | full `npm test` (incl. server multiplayer tests) 30/30; ad code only adds a collider, a mesh group and UI |
| 14 | FPS impact acceptable | PARTIAL | no extra lights, ~20 meshes + 1 instanced mesh; real-device FPS not measured |
| 15 | Report written | PASS | this file |

Security (emulator, production rules): public read ✔, non-admin write ✘, self-admin ✘, javascript: URL ✘ even for admins,
stats +1 ✔ / +5 ✘, stats read non-admin ✘ (AD-R1…R8 all PASS).
