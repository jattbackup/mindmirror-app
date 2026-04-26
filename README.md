# MindMirror

> A goal-aligned coaching agent for the Even Realities G2 smart glasses.
> Brief it in 30 seconds. It listens for 10–15 minutes, summarises every 30 s on
> the HUD, and tells you when the conversation drifts off-goal. Sessions are
> written to a local-first, encrypted, searchable memory.

This repository contains the full MindMirror v1 implementation:

- **G2 runtime** (`g2/`) — input, render, trigger engine, session lifecycle
- **Companion WebView** (`companion/`) — onboarding, sessions, search, setup
- **Encrypted local memory** (`memory/`) — schema, crypto, vector index
- **Backend** (`server/`) — STT proxy, LLM summarise, embeddings, search
- **Demo fixtures + replay test** (`fixtures/`, `tests/integration/`)

The canonical product spec lives in [`SPEC.md`](./SPEC.md).

---

## Table of contents

1. [Architecture at a glance](#architecture-at-a-glance)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Running in the simulator](#running-in-the-simulator)
6. [Running on real glasses (QR pairing)](#running-on-real-glasses-qr-pairing)
7. [Running the backend](#running-the-backend)
8. [Companion WebView](#companion-webview)
9. [Tests](#tests)
10. [Packaging for Even Hub](#packaging-for-even-hub)
11. [Demo replay](#demo-replay)
12. [Troubleshooting](#troubleshooting)
13. [Project layout](#project-layout)

---

## Architecture at a glance

```
 ┌────────────────┐   BLE    ┌──────────────────┐   HTTPS / WSS   ┌──────────────┐
 │  Even G2       │ ───────► │  Companion       │ ──────────────► │  Backend     │
 │  (display +    │ ◄─────── │  WebView (.ehpk) │ ◄────────────── │  (Node/TS)   │
 │   mic input)   │  audio   │  React + SDK     │   summarise /   │  STT proxy   │
 └────────────────┘  + taps  └──────────────────┘   embed / score └──────────────┘
                                     │
                                     ▼
                              ┌──────────────────┐
                              │ Encrypted KV     │
                              │ (bridge.localSt.)│
                              │ + vector index   │
                              └──────────────────┘
```

The iPhone (or simulator host) is a dumb BLE proxy. Application logic, secrets,
and persistent memory all live in the WebView and on your backend. Raw audio
is **never** persisted at rest — only encrypted transcripts and summaries.

---

## Prerequisites

| Tool                     | Version            | Notes                                                      |
| ------------------------ | ------------------ | ---------------------------------------------------------- |
| Node.js                  | **≥ 20.x**         | Required by Vite 7 and `tsx`                               |
| npm                      | ≥ 10.x             | Or pnpm/yarn — examples below use npm                      |
| macOS / Linux / WSL2     | any recent         | Windows native works; macOS recommended for the Even App   |
| Even Realities account   | —                  | Needed only for QR-pairing real G2 hardware                |
| OpenAI API key           | —                  | Backend uses it for summarise + embeddings                 |
| Soniox API key           | —                  | Backend proxies the realtime STT WebSocket                 |

You do **not** need a physical pair of G2 glasses to run the app — the
`@evenrealities/evenhub-simulator` (a devDependency) renders the dual 576 × 288
canvas and lets you fire taps and audio events from your machine.

---

## Installation

Clone, then install both the app and the backend:

```bash
git clone https://github.com/jattbackup/mindmirror-app.git
cd mindmirror-app

# 1. App (WebView + simulator + tests)
npm install

# 2. Backend (STT proxy, LLM, embeddings)
cd server
npm install
cd ..
```

Sanity check:

```bash
npm run lint     # tsc --noEmit
npm test         # vitest run (unit + integration)
```

Both should be green on a fresh clone.

---

## Configuration

### App-side (Vite)

Create `.env.local` in the repo root:

```bash
# .env.local
VITE_MM_BACKEND_URL=http://localhost:8787
```

This is the dev default the WebView talks to via the `/api` proxy declared in
`vite.config.ts`. The companion `Setup` page lets the wearer override it at
runtime; the env var is only used until the user picks a host.

### Backend (`server/.env`)

```bash
# server/.env
OPENAI_API_KEY=sk-...
SONIOX_API_KEY=...
PORT=8787                # optional, defaults to 8787
ALLOWED_ORIGIN=*         # tighten before shipping (see SPEC §7 / C10)
```

Keys are **never** sent to the WebView — the backend signs short-lived STT
tokens and proxies LLM calls.

### `app.json` whitelist

`app.json` declares the network domains the WebView is allowed to call. If you
point at a different backend, add its origin to `permissions.network.whitelist`
(C10 in the spec) before re-packing the `.ehpk`.

---

## Running in the simulator

The Even Hub simulator (v0.7.1, pinned via the `@evenrealities/evenhub-simulator`
devDependency) renders both lenses on your laptop and lets you simulate taps,
double-taps, and microphone audio.

### One-time setup

The simulator binary ships with the npm package — no separate install. Verify
it's discoverable:

```bash
npx evenhub --version
```

### Two-terminal workflow (recommended)

**Terminal 1 — Vite dev server (the WebView):**

```bash
npm run dev
# → Local: http://localhost:5173
# → Network: http://<your-LAN-IP>:5173
```

`npm run dev` runs `vite --host 0.0.0.0 --port 5173` so the simulator (and a
real phone on the same LAN) can reach it.

**Terminal 2 — simulator + backend:**

```bash
# Backend (STT / LLM / embed)
cd server
OPENAI_API_KEY=... SONIOX_API_KEY=... npm run dev   # listens on :8787
```

**Terminal 3 — the simulator window:**

```bash
npx evenhub simulate --url http://localhost:5173
```

The simulator opens with two stacked 576×288 canvases. Controls:

- **Click** the canvas → single tap (`CLICK_EVENT`)
- **Double-click** → double tap (root double-tap exits per C5)
- **Shift-click** → long press
- **Drag a `.wav` onto the window** → simulated mic input (S16LE, 16 kHz mono)
- **`F5`** → force reload the WebView

When the page loads you'll see MindMirror auto-connect (per C11), draw the
`onboard` card, and wait for a tap.

### Faster: simulator + Vite in one terminal

```bash
npm run dev & npx evenhub simulate --url http://localhost:5173
```

If you'd rather not juggle terminals, install
[mprocs](https://github.com/pvolok/mprocs) or use `concurrently`. The repo
deliberately keeps the scripts plain so you can wire your own runner.

### Simulator caveats (C12)

The simulator caps **page containers at 4** and **image containers at 200×100**.
Every page in MindMirror already fits inside that budget, but if you add new
pages keep the ceiling in mind — the spec calls this out at C12 / §6.

---

## Running on real glasses (QR pairing)

1. Make sure your laptop and phone are on the same Wi-Fi.
2. Start the dev server: `npm run dev`.
3. In a second terminal: `npm run qr` — this prints a QR code that points the
   Even App at `http://<your-LAN-IP>:5173`.
4. Open the **Even App** on your phone, choose **Scan QR**, and point it at
   the terminal output.
5. The app loads on the G2 within ~6 s and auto-connects (C11).
6. Tap the `onboard` card to start a session. (The companion `Setup` page is
   the easiest place to enter the goal.)

---

## Running the backend

The backend is a tiny Node/TypeScript HTTP+WS server (`server/src/index.ts`).
Routes:

| Method | Path              | Purpose                                            |
| ------ | ----------------- | -------------------------------------------------- |
| GET    | `/health`         | Liveness probe                                     |
| POST   | `/stt/connect`    | Mints a short-lived Soniox session token          |
| WS     | `/stt/ws`         | Proxies PCM frames to Soniox realtime STT         |
| POST   | `/llm/summarise`  | LLM tick → `{title, bullets, actionItems, ...}`   |
| POST   | `/embed`          | Batch text embeddings                              |
| POST   | `/goal/embed`     | Embeds the onboarding goal string                 |
| POST   | `/goal/score`     | Scores a transcript window against the goal       |
| POST   | `/search`         | Cosine search over the encrypted vector index     |

Run it with:

```bash
cd server
npm run dev          # tsx watch mode
# — or —
npm run build && npm start
```

The server reads `OPENAI_API_KEY` and `SONIOX_API_KEY` from the environment.
Rate limiting is per `installId` (bridge install token).

---

## Companion WebView

The React companion (rendered inside the `.ehpk`) lives in `companion/`:

- `pages/Onboarding.tsx` — participants, goal, time-box, embeds the goal
- `pages/Sessions.tsx`   — list past sessions, alignment summary, drift count
- `pages/Search.tsx`     — semantic recall ("what did we agree about ___?")
- `pages/Setup.tsx`      — backend host override, install token reset
- `pages/Privacy.tsx`    — what's stored, what isn't, key rotation

Every persistent write goes through `memory/index.ts`, which encrypts before
calling `bridge.setLocalStorage` (C8). Browser `localStorage` and IndexedDB
are deliberately not used — they don't survive `.ehpk` reloads.

---

## Tests

```bash
npm test                                    # unit + integration (vitest)
npm test -- g2/trigger                      # focused suite
npm test -- tests/integration/demo-replay   # full 12-min replay against fixtures
```

Coverage hot-spots:

- `g2/trigger/__tests__/` — metronome, fusion, cooldown, goal-alignment, mute
- `g2/render/render.spec.ts` — container budget enforcement (C2)
- `memory/crypto.spec.ts` and `memory/memory.spec.ts` — encrypt/decrypt round-trips
- `server/test/goal.spec.ts` — goal scoring math
- `tests/integration/demo-replay.spec.ts` — feeds `fixtures/demo/transcript.json`
  through the trigger engine and asserts the per-tick alignment / kind matches
  `expected.json`

---

## Packaging for Even Hub

```bash
npm run pack
# 1. vite build → dist/
# 2. evenhub pack app.json dist -o mindmirror.ehpk
```

Notes:

- `mindmirror.ehpk` is gitignored and re-generated on every `npm run pack`.
- Update `app.json` `version` and `permissions.network.whitelist` before
  submitting to Even Hub.
- The package_id (`com.mindmirror.app`) is reverse-domain, lowercase, no
  hyphens — required by C10.

---

## Demo replay

Set `VITE_FIXTURE=demo` to drive the app from the recorded transcript instead
of the live mic:

```bash
VITE_FIXTURE=demo npm run dev
```

The fixture lives in `fixtures/demo/`:

```
fixtures/demo/
├── README.md         instructions
├── goal.txt          the onboarding goal string
├── transcript.json   timestamped Soniox tokens (~10 min)
└── expected.json     { tickIndex, expectedAlign, expectedKind }
```

`tests/integration/demo-replay.spec.ts` asserts that running the trigger engine
over `transcript.json` reproduces `expected.json` — i.e. the demo is also a
regression test.

---

## Troubleshooting

**"Cannot find module `@evenrealities/even_hub_sdk`"** — run `npm install`
in the repo root, not the `server/` directory.

**Simulator opens but the page is blank** — check the Vite terminal for build
errors, then reload the simulator with `F5`. The simulator forwards console
errors to its own DevTools (right-click → Inspect).

**`npm run qr` prints `0.0.0.0:5173` instead of a LAN IP** — pass `--host` to
`evenhub qr`, or set `EVENHUB_QR_HOST=192.168.x.x` in your shell.

**STT "401 invalid api key"** — the backend isn't loading `server/.env`. Either
export the keys inline (`OPENAI_API_KEY=... npm run dev`) or confirm the file is
adjacent to `server/package.json`.

**Drift alerts never fire in the simulator** — the simulator's mic input has to
deliver enough goal-divergent speech to push the rolling alignment score below
the drift threshold. Use the demo fixture (`VITE_FIXTURE=demo`) to reproduce
the canonical 5:35 drift card.

**`Operation not permitted` when removing `.git/index.lock`** — only relevant
in sandboxed environments; on macOS just `rm -f .git/index.lock`.

---

## Project layout

```
mindmirror-app/
├── SPEC.md                     canonical build spec (read first)
├── app.json                    Even Hub manifest
├── index.html                  WebView entry
├── vite.config.ts              dev server + /api proxy
├── package.json
├── _shared/                    constants shared across g2/ + companion/
├── g2/                         on-glasses runtime
│   ├── audio/                  mic open/close, framing
│   ├── input/                  tap/double-tap/long-press normalisation
│   ├── render/                 page lifecycle + cards (armed, card, finalising, …)
│   ├── session/                lifecycle + timebox
│   ├── trigger/                metronome, fusion, cooldown, detectors
│   └── state.ts                event-sourced session state
├── companion/                  React companion pages (onboarding, sessions, search, setup, privacy)
├── memory/                     encrypted KV + vector index over bridge.setLocalStorage
├── server/                     Node backend (STT proxy, LLM, embeds, search)
├── fixtures/demo/              recorded 10-min meeting + expected per-tick output
├── tests/                      integration + replay tests
└── dist/                       built WebView (gitignored)
```

---

## Contributing

Run `npm run lint && npm test` before opening a PR. New trigger detectors must
ship with a spec under `g2/trigger/__tests__/`. New render states must keep
≤ 4 containers per page and exactly one `isEventCapture: 1` (C2).

## License

See repository root.
