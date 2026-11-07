# Ad banner — project audit (before implementation)

| # | Item | Finding | Status |
|---|---|---|---|
| 1 | Framework | Vite 5 + vanilla JS (no React/Next) | IMPLEMENTED |
| 2 | 3D | Three.js 0.170 directly (no R3F); regions built by `client/src/engine/regionBuilder.js` | IMPLEMENTED |
| 3 | Firebase init | `client/src/net/firebaseRoom.js` (`/__/firebase/init.json`, anonymous auth, in-memory persistence) | IMPLEMENTED |
| 4 | Firestore / RTDB / Storage | **Realtime Database** only (presence, pose, WebRTC signalling). No Firestore. Storage bucket `christmas-3d.firebasestorage.app` is in the config but **not provisioned** (REST → 404) | RTDB IMPLEMENTED · Firestore MISSING · Storage MISSING |
| 5 | Regions | 6 regions in `shared/regions.js` (광화문, 서울광장, 청계천, 명동, DDP, 남산) | IMPLEMENTED |
| 6 | Movement / collision | `shared/collision.js` 2.5D colliders, shared by client prediction and server validation | IMPLEMENTED |
| 7 | Chat / whisper / voice | `server/game.js`, `client/src/ui/chat.js`, WebRTC `client/src/net/voice.js` | IMPLEMENTED |
| 8 | Mobile UI / input | joystick, touch buttons, `body.mobile` layout, interaction prompt button (DDP) | IMPLEMENTED |
| 9 | Admin page | none | MISSING |
| 10 | Ad code | none (no ads, no AdSense) | MISSING |
| — | Analytics | no Firebase Analytics (no measurementId in config) | MISSING |

Decisions taken from the audit
* Use the existing **Realtime Database** (not Firestore) for ad data: `/ads/slots`, `/ads/locations`, `/ads/images`, `/adStats`, `/admins`.
* Storage: upload code is implemented, with an automatic fallback to a compressed copy in RTDB
  because the bucket does not exist yet.
* Banner placement in shared code so client and server collision stay identical.
* Interaction reuses the DDP prompt pattern (E key + tappable button).
