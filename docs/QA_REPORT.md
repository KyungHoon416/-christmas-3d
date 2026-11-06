# QA REPORT

Environment: Linux cloud container, Node 22, Chromium (Playwright) headless with **SwiftShader (CPU) WebGL** — there is no GPU, so FPS numbers below are *not* representative of real devices. Fake microphones (`--use-fake-device-for-media-stream`) for WebRTC.

How to reproduce:
```bash
npm test                                   # 18 unit + server integration tests
npm run build && PORT=3100 npm start &
BASE=http://localhost:3100 npm run test:e2e  # real browsers, writes docs/qa-e2e-results.json + docs/screenshots
node scripts/loadtest.js 50 20             # 50-bot room load test
```

## Results

| ID | Test | Result | Evidence |
|---|---|---|---|
| QA-01 | PC 접속 | ✅ PASS | E2E: canvas renders ~220 draw calls / 130k tris (low), HUD present; screenshots `docs/screenshots/e2e-desktop-multiplayer.jpg` |
| QA-02 | 모바일 접속 세로·가로 | ✅ PASS (emulated) | E2E iPhone 13 emulation: mobile UI + joystick in portrait; rotate to 844×390 → position, socket and mic state unchanged. **Not tested on a physical phone.** |
| QA-03 | 캐릭터 이동 | ✅ PASS | Walk/run/jump/skate animations, camera orbit/zoom/wall pull-in; leader movement in QA-12 |
| QA-04 | 건물 충돌 | ✅ PASS | `tests/collision.test.js` (building solid, alley walkable, bridge vs under-bridge, water) + server rejects tree clipping (`server.test.js`) |
| QA-05 | 폭설 | ✅ PASS (visual) | Region screenshots: two-layer GPU snow, roof/ledge snow caps, snow piles, footprints, fog, lamp-lit flakes |
| QA-06 | 6개 지역 이동 | ✅ PASS | E2E travel + standalone run through all 6 regions (0.6–6 s each on CPU rendering) |
| QA-07 | 멀티플레이 | ✅ PASS | 3 browser contexts see each other; remote position matches self-reported within 0.01 m; reconnect resumes same account and re-shows players |
| QA-08 | 전체 채팅 | ✅ PASS | Typed in UI on A → appears in B and C |
| QA-09 | 귓속말 | ✅ PASS | Recipient gets it, third party does not; still works across regions; blocked → refused |
| QA-10 | 음성 동시 대화 | ✅ PASS | 3 mics on simultaneously: every client receives both other streams (peak RMS 0.06–0.46). Gain 1.0 at ≤3 m, 0 at ~13 m. Leave/re-join keeps other streams. **Same-machine only, no TURN, no real phones.** |
| QA-11 | 친구추가 | ✅ PASS | Request → accept via mobile UI button → both lists updated |
| QA-12 | 손잡기 | ✅ PASS | Decline → nothing; accept → follower tracks leader (gap ≈0.95 m); cancel releases instantly; disconnect / distance release (server tests) |
| QA-13 | 커플 | ✅ PASS | Requires friendship + adult flags + consent; dissolve |
| QA-14 | 미니맵 | ✅ PASS (manual) | Minimap uses the same world coordinates as movement/colliders; arrow orientation verified against facing |
| QA-15 | 캐럴 | ✅ PASS | Play/pause/next/volume UI; ducking to 25 % while voices are active (E2E) |
| QA-16 | 성능 | ⚠️ MEASURED, targets not verifiable here | See below |
| QA-17 | 보안 | ✅ PASS (scope below) | Speed/teleport & wall-clip rejection, whisper privacy, block filter, adult+consent checks, RTC relay restrictions, rate limits |
| QA-18 | 회귀 / 오류 | ✅ PASS | No page errors or console errors during the whole E2E run |

Latest automated run: `docs/qa-e2e-results.json`.

## Performance (QA-16)

| Measurement | Value | Notes |
|---|---|---|
| Desktop smoke (1600×900, medium, SwiftShader) | 33–44 FPS, ~280 draw calls, ~195k tris | single client |
| Multi-client E2E (low, 3 clients on one CPU) | 3–8 FPS | CPU contention; render call itself 4–8 ms |
| Region switch memory | geometry/texture/program counts and JS heap flat over 3 round trips | `InstancedMesh.dispose()` added |
| Server, 50 bots in one room | tick 2.7 ms, 24 KB/s per client, chat p95 2 ms, RSS 78 MB | `scripts/loadtest.js` |
| Bundle | 721 KB JS (205 KB gzip), 22 KB CSS | |

The 60 FPS desktop / 30 FPS mobile targets **could not be verified** without a GPU. Built-in mitigations: adaptive quality (snow density → shadows → bloom), pixel-ratio caps, instancing/batching (≈160–280 draw calls per region), remote-player animation LOD beyond 60 m, culling beyond 140 m, snapshot LOD beyond 45 m, shader precompile behind the loading screen. Measure on real hardware with the in-game overlay (F3 or 설정 → 성능 정보).

## Known gaps
- Real accounts / verified age: guest nickname + token, adult is self-declared.
- TURN server not configured (voice can fail behind strict NATs).
- No physical-device test (iOS Safari, Android Chrome); output-device selection is Chromium-only.
- Shop / currency / level systems do not exist (shown as "준비 중").
- Seoul geometry is approximated, not GIS-accurate.
