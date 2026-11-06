# ❄️ Christmas World Seoul

A 3D Christmas social metaverse set in six districts of Seoul — meet people, chat, whisper, make friends, hold hands and talk with proximity voice while it snows.

![Gwanghwamun](docs/screenshots/region-gwanghwamun.jpg)

## Deploy (free, HTTPS — voice chat works)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/KyungHoon416/-christmas-3d)

Click the button, sign in to Render with GitHub, press **Apply**. After ~3 minutes you get `https://christmas-world-seoul.onrender.com` (or similar). Any Docker host also works (`Dockerfile`).

## Quick start
```bash
npm install
npm run build
npm start          # → http://localhost:3000
```
Development (hot reload): `npm run dev` → http://localhost:5173

### Voice chat on phones / other PCs (same Wi-Fi)
Browsers only allow the microphone on `https://` (or `localhost`). Run:
```bash
npm run start:https
```
The server prints `https://<your-LAN-IP>:3000`. Open it on each phone/PC, accept the self-signed certificate warning once (Advanced → Proceed), then press 🎧 and 🎙. To use your own certificate set `SSL_CERT` and `SSL_KEY` (file paths). For voice across different networks also set `TURN_URL`, `TURN_USER`, `TURN_PASS`.

The shared Claude artifact version cannot use the microphone (the artifact sandbox blocks microphone access and WebRTC).

## Tests
```bash
npm test                                       # unit + server integration
npm run build && PORT=3100 npm start &
BASE=http://localhost:3100 npm run test:e2e    # multi-browser E2E (Playwright/Chromium)
node scripts/loadtest.js 50 20                 # bot load test
BASE=http://localhost:3100 npm run thumbs      # regenerate world-map card thumbnails
```

## Docs
`docs/CURRENT_PROJECT_AUDIT.md` · `ARCHITECTURE.md` · `UI_UX_SPEC.md` · `WORLD_MAP_SPEC.md` · `MULTIPLAYER_SPEC.md` · `VOICE_CHAT_SPEC.md` · `QA_REPORT.md` · `DEVELOPMENT_REPORT.md`

## Controls
WASD move · Shift run · Space jump · drag to look · wheel zoom · Enter chat · F snowball · V mic · 1/2/3 emotes · P photo · X release hand · M map · F3 stats. On phones: left side joystick, right side look.

Carols are public-domain compositions synthesised in the browser; all textures are procedural. Seoul layouts are stylised approximations.
