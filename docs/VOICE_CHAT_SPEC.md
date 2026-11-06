# VOICE CHAT SPEC

File: `client/src/net/voice.js` (signalling relay in `server/game.js#rtcRelay`).

## Distance policy (game metres; 1 game m ≈ `region.scale` real m)
| Distance | Gain |
|---|---|
| 0 – 3 m | 1.0 |
| 3 – 10 m | `(1 − t)²`, t = (d − 3) / 7 |
| > 10 m | 0 (muted) |
Peer connections open below 18 m and close above 26 m (hysteresis avoids flapping).

## Why simultaneous talking works
- One `RTCPeerConnection` **per remote user**, one transceiver (sendrecv).
- Each remote stream → its own `MediaStreamAudioSourceNode → GainNode (distance × user volume × mute) → master → destination`, plus its own `AnalyserNode` for the speaking indicator. Streams are mixed by WebAudio; nothing is overwritten by "the last speaker".
- The stream is also attached to a muted `<audio>` element (Chrome requires it for remote WebRTC audio to flow into WebAudio).
- Roles are deterministic (lower user id makes the offer) → no glare. ICE candidates queued until the remote description is set. Stalled negotiations (>12 s) are retried; `failed` connections are closed and recreated.
- Mic toggling uses `sender.replaceTrack()` → no renegotiation; existing connections survive mic changes and new joiners.

## Controls
Mic **OFF by default** · join/leave proximity voice (headset button) · input device select (re-acquires mic, replaces track on all peers) · output device select (`AudioContext.setSinkId`, Chromium only; otherwise a notice) · per-user volume 0–150 % and mute (player menu) · master voice volume · speaking indicators (nameplate dot, mic button glow).
`getUserMedia` uses `echoCancellation`, `noiseSuppression`, `autoGainControl`. Errors are translated: permission denied, no device, overconstrained device, insecure context (HTTPS required off-localhost).

Gain and level metering run on a 50 ms timer independent of the render loop; music ducking (to 25 %) has an 800 ms release hold.

## Verified (real Chromium, fake microphones, `tests/e2e/run-e2e.mjs`)
- QA-10: 3 users with mics on simultaneously — each receives both other streams with non-zero level.
- QA-10b: gain ≈ 1 at ≤ 3 m. QA-10c: gain → 0 at ~13 m.
- QA-10d: one user leaves and re-joins voice; the other pair's stream keeps flowing and the re-joiner is heard by both.
- QA-15a: carol ducks to 0.25 while voices are active.

## Not verified / limits
- **No TURN server configured** → users behind symmetric NAT may fail to connect (set `TURN_URL/USER/PASS`). Only same-machine (host candidates) was tested.
- Not tested on real phones / Safari; echo cancellation quality with real speakers not measured.
- Mesh topology: each user uploads one stream per nearby talker; beyond ~8 simultaneous nearby talkers an SFU (e.g. LiveKit/mediasoup) is recommended.
