# Responsive QA (all device classes)

Automated audit `tests/e2e/responsive-audit.cjs` (Playwright): for every viewport it checks that the login
button is reachable and that no HUD element is off-screen or overlapping another HUD element
(top bar, profile, side buttons, minimap, action bar, joystick, jump/fire buttons, chat, friends, map strip, carol player).
Results: `docs/qa-responsive-results.json`, contact sheet `docs/screenshots/responsive/contact-sheet.jpg`.

| Class | Viewports | Result |
|---|---|---|
| Small phones | 320×568, 344×882 (Fold cover), 375×667, 375×812 | PASS |
| Large phones | 412×915, 430×932 | PASS |
| Phones landscape | 568×320, 667×375, 812×375, 915×412, 932×430 | PASS |
| Tablets / foldables | 673×841, 768×1024, 800×1280, 834×1194, 1024×1366 (+ landscape) | PASS (tablet layout: larger HUD) |
| Desktop / laptop | 920×620, 1024×700, 1280×720, 1366×768, 1440×900, 1536×864, 1600×900, 1280×1024, 1920×1080 | PASS (compact layout below 1180×820) |

Layout classes: `mobile` (touch or < 900 px), `tablet` (touch and shorter side ≥ 600 px), `compact` (desktop < 1180 wide
or < 820 high), plus `portrait` / `landscape`. Emulated devices only — not yet checked on physical phones.
