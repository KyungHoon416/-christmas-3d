# UI / UX SPEC

Reference: the attached CHRISTMAS WORLD SEOUL mock-up. Every element is a real DOM component over a live Three.js canvas — no background images of the mock-up are used.

## Design tokens (`client/src/ui/styles.css`)
- Panels: navy glass `rgba(16,19,44,.66)` + `backdrop-filter: blur(14px)`, 1px white/12% border, 16px radius
- Accent: pink `#ff5fa2` → `#e4407f` gradient, rose `#f2a9c6`, gold `#f6cf8f`
- Fonts: Noto Sans KR (UI), Great Vibes (logo)

## Layout (desktop ≥ 900px)

| Area | Component | Behaviour |
|---|---|---|
| A. Top nav | logo, 홈 / 서울 월드맵 / 이벤트 / 상점 / 옷장 / 프로필, net pill (ping), 알림 / 귓속말 / 친구 / 설정 | Active item highlighted pink. 상점 shows **"준비 중"** (no currency system exists, so no fake prices). |
| B. Profile | avatar, nickname, online dot, current region, couple tag, party size | Level/EXP/currency are **not shown** — those systems don't exist. |
| C. Chat | tabs 전체/지역/주변/귓속말/파티 with unread badges; nickname · message · time | Doesn't auto-scroll while you read history ("새 메시지 ↓" pill). Resizable (drag handle), minimisable. Enter focuses; Enter again sends **and returns focus to the game**. Failed sends are marked. Click a nickname → whisper. |
| D. World | 3rd-person camera, nameplates (friend = green border, couple ♥, speaking dot), chat bubbles | Nameplates hide beyond 45 m / off-screen. |
| E. Minimap | player-centred north-up canvas, buildings, landmarks, friends (green), couple (pink), me (arrow) | ± zoom; click → full region map + region list. |
| F. Friends | tabs 친구/주변/요청, search, add friend (by nickname, works offline), per-row whisper & menu, block list | Player menu: profile, 친구추가, 귓속말, 음성 초대, 손잡기, 함께 걷기, 포옹, 파티 초대, 내 위치로 초대, 커플 신청/해제, 친구 삭제, 차단, 신고, per-user volume + mute. |
| G. Action bar | 이모티콘, 인사, 하트, 손잡기, 포옹, 댄스, 함께걷기, 사진, 눈덩이 | 손잡기/함께걷기 toggle to "손 놓기/그만 걷기" while active. Targets the selected or nearest player within 4 m. |
| H. Region cards | 6 cards with thumbnails rendered from the real 3D scene (`npm run thumbs`), live player counts, "현재 위치" | Confirm dialog before travel; collapsible. |
| Side | mic (default OFF), headset (join proximity voice), heart, run toggle | Mic button glows green while you speak. |
| Carol | title, play/pause, next, volume | |

## Mobile
- `body.mobile` when `pointer: coarse` or width < 900; `portrait`/`landscape` classes follow the viewport.
- Left half of the screen = floating joystick (drag further to run), right half = camera drag — both simultaneously (multi-touch).
- Jump + snowball buttons bottom-right; chat / friends / world map buttons on the left open **bottom sheets** (portrait) or right-side drawers (landscape).
- Top menu collapses into a ☰ modal; minimap shrinks to 104 px; action bar scrolls horizontally.
- Rotation only re-lays out CSS and resizes the renderer: position, WebSocket and mic state are untouched (verified QA-02b).

## Dialogs
Login (nickname, coat colour, hat, adult self-declaration), settings (quality auto/low/med/high, stats overlay, mic/speaker device, voice volume, carol/ambient volume, location sharing, controls help, logout), wardrobe (live preview on your character), profile (couple management, sharing), events (snowball leaderboard), notifications, photo mode (hides HUD, optional couple frame, saves JPEG).

## Keyboard
WASD/arrows move · Shift run · Space jump · drag look · wheel zoom · Enter chat · F snowball · V mic · 1/2/3 wave/heart/dance · P photo · X release hand · M map · F3 stats.
