# MindMirror — Codex Build Spec
**Target platform:** Even Realities G2 (dual 576×288 micro-LED, no camera, no speaker, microphone over BLE 5.x).
**Author of spec:** Cognitive Architect / Full-Stack EM (30+ yrs).
**Audience:** Codex (and any human collaborator) tasked with implementation.
**Status:** v1.0 — buildable. Treat unspecified details as engineering judgment, but do not violate the “Hard Constraints” section.

> **Reference sources baked into this spec.** All G2 platform claims trace to the local notes at `../even-g2-notes-main/docs/` (architecture, display, input-events, page-lifecycle, device-apis, ui-patterns, simulator, packaging, browser-ui). The Soniox-WS pattern, audio plumbing, and bridge bootstrap mirror `../stt-even-g2-main/g2/main.ts`. Browser settings UI follows the `even-toolkit` patterns in `../even-g2-notes-main/docs/browser-ui.md`. Do not invent SDK calls that are not in those references.

---

## 0. The One Sentence

MindMirror is a goal-aligned coaching agent on the G2 that you brief in 30 seconds, then it listens for the next 10–15 minutes — surfacing a glanceable summary on the HUD every 30 seconds, and from minute 2 onwards scoring every segment against the goal you set so it can tell you when the conversation is drifting and nudge it back on track. Every session is written to a local-first, encrypted, searchable memory the user can query later (“what did we decide about the API schema last Tuesday?”).

The judging panel’s sharpest question — *“when does it surface, and how does it decide?”* — is answered by the **Trigger Engine** (§3): a deterministic 30-second tick after a 2-minute warmup, accelerated by phase-transition cues, and gated by a goal-alignment score so the wearer sees fewer cards when things are on-track and more when they’re drifting. That is the load-bearing piece. Everything else is plumbing.

## 0.1 Canonical Flow (the demo)

```
 ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────────────────────────┐
 │ 1. ONBOARD       │  │ 2. RECORD        │  │ 3. SUMMARISE + ALIGN                           │
 │ (≤ 30 s)         │→ │ (auto on tap)    │→ │ (10–15 min)                                    │
 │                  │  │                  │  │                                                │
 │ • Who's here     │  │ • Mic opens      │  │ • t < 2 min:  warmup  → 30 s ticks, recap only │
 │ • What's the     │  │ • Live tail on   │  │ • t ≥ 2 min:  align   → 30 s ticks + drift     │
 │   goal           │  │   HUD body       │  │                         alerts when score      │
 │ • Time-box       │  │ • STT WS opens   │  │                         drops below threshold  │
 │ • Goal embedded  │  │                  │  │ • Closing-cue → final actions card + finalise  │
 └──────────────────┘  └──────────────────┘  └────────────────────────────────────────────────┘
```

The user briefs once, taps once, then never has to interact again until the meeting ends. Cards appear on a steady 30-second cadence so the wearer learns the rhythm; drift alerts interrupt only when the agent has earned the right.

---

## 1. Hard Constraints (do not violate)

These are derived from the G2 platform docs and the Even Hub submission rules. Codex must treat them as invariants.

| # | Constraint | Source |
|---|---|---|
| C1 | Canvas is exactly **576 × 288 px**, 4-bit greyscale (16 levels of green). Black = LED off. | `display.md` |
| C2 | **Max 4 image containers + 8 other containers = 12 total per page.** Exactly **one** container must have `isEventCapture: 1`. | `display.md` |
| C3 | Text content limits: `createStartUpPageContainer` ≤ 1000 chars, `textContainerUpgrade` ≤ 2000 chars, `rebuildPageContainer` ≤ 1000 chars. | `display.md`, `page-lifecycle.md` |
| C4 | `createStartUpPageContainer` is called **exactly once** per app lifecycle. After that, use `rebuildPageContainer` or `textContainerUpgrade`. | `page-lifecycle.md` |
| C5 | **Root-page double-tap MUST call `shutDownPageContainer(1)`** or the Even Hub review will reject the app. Non-root double-tap = go back. | `page-lifecycle.md` |
| C6 | `CLICK_EVENT == 0` is normalised to `undefined` by the SDK. Always also accept `undefined` as a click when a non-audio event is present. | `input-events.md`, observed in `stt-even-g2-main/g2/main.ts` |
| C7 | Audio: `bridge.audioControl(true)` opens the mic. PCM frames arrive as `audioEvent.audioPcm` — **16 kHz, mono, S16LE, 10 ms frames, 40 bytes each**. Must call `createStartUpPageContainer` first. | `device-apis.md` |
| C8 | **Browser `localStorage` does NOT persist** inside the `.ehpk` WebView across app/glasses restarts. Use `bridge.setLocalStorage` / `bridge.getLocalStorage` (string KV, no `remove`; write `""` to delete). Recommended pattern: in-memory `Map` cache with write-through. | `architecture.md`, `device-apis.md` |
| C9 | **Image containers cannot be initialised with data** during `createStartUpPageContainer` — create empty placeholder, then `updateImageRawData`. No concurrent image updates. Width 20–288, height 20–144. | `display.md`, `page-lifecycle.md` |
| C10 | `app.json` `package_id` must be reverse-domain, lowercase letters/digits only, **no hyphens**. `permissions.network` must list every domain the WebView fetches from. | `packaging.md` |
| C11 | Auto-connect on page load (`actions.connect()` fired without user input). Keep a manual button as a fallback. | `architecture.md` |
| C12 | **Simulator caps:** simulator (v0.7.1) rejects > 4 containers per page and image containers > 200×100. Real hardware honours C2/C9 limits. Spec must work inside both. | `simulator.md` |
| C13 | **No emoji, no font sizing, no alignment options.** Single LVGL font. Use Unicode block elements (`█▇▆▅▄▃▂▁`) for progress, box-drawing for separators, `▲ ▼ ●` for indicators. CJK fullwidth (`　` etc.) for grid alignment when needed. | `display.md` |
| C14 | The iPhone is a **dumb BLE proxy**. App logic, secrets, LLM/STT keys, embeddings, and the memory store live on **your server** (or in the WebView for local-first paths). Glasses are display + input only. | `architecture.md` |
| C15 | **Privacy invariant:** raw audio leaves the glasses → goes to the WebView → either (a) streams to STT WS or (b) is processed in-WebView. Raw audio is **never** persisted at rest. Only transcripts and summaries are stored, and they are **encrypted** before persisting (see §5). | Product requirement; ratified by C14. |

If a design choice in this spec ever appears to conflict with C1–C15, the constraint wins.

---

## 2. Mission, Non-Goals, Success Criteria

### 2.1 Mission
Make the G2 the first wearable where a meeting / 1:1 / hallway chat *ends with you having understood it*, without you ever looking at a phone.

### 2.2 Non-Goals (v1)
- No real-time captioning (that’s the existing `stt` app — different product).
- No translation.
- No speaker diarisation in v1 (stretch in §11).
- No cloud-only mode. Local-first or it doesn’t ship.
- No “send to Slack” / “create Linear ticket” actions in v1 — those are great v2 hooks but they distract the demo.
- No camera or photo capture (hardware does not support it).

### 2.3 Success Criteria (Definition of Done)
A reviewer must be able to:
1. Run `npm install && npm run dev` in `mindmirror/`.
2. Scan the QR (`npm run qr`) and have the app appear on the G2 within 6 s.
3. Complete the **Onboarding** flow on the G2 + companion in ≤ 30 s: enter participants, type a free-text goal, set a time-box (default 15 min). Goal is embedded; install token is stored.
4. Run the **10–15 min scripted demo** (§9.1) and observe:
   - A `recap` card every 30 s after the first warmup tick (skipped when content is too thin).
   - From t ≥ 2 min, an **alignment indicator** in the card header (`align: 0.71 ▲`) and at least one **drift alert** when the conversation veers off-goal.
   - A final `actions` card on the closing cue, with action items + decisions extracted.
5. Ask, in the companion WebView search box, *“what did we agree about the API schema last Tuesday?”* and get the right snippet back.
6. Pull the IndexedDB blob off the device and confirm bytes are encrypted (cannot grep for plaintext from the demo).
7. Double-tap on the root page → exit confirmation dialogue appears (C5).

---

## 3. Cognitive Trigger Model — *the load-bearing idea*

> **Design principle:** the agent surfaces on a **predictable cadence** so the wearer can trust the rhythm, plus **interrupts that cadence** when (a) the conversation hits a natural phase transition or (b) it has drifted from the goal the wearer set during onboarding. The user never *requests* a summary — they receive them, with confidence about when.

### 3.1 The two clocks

MindMirror runs on **two clocks** simultaneously:

1. **The metronome** — a deterministic tick that fires every `TICK_MS` (default **30_000 ms**). On each tick, if there is enough new content (`MIN_CONTENT_TOKENS = 40`) and the wearer is wearing the glasses, surface a `recap` card built from the rolling transcript tail since the last tick.
2. **The conductor** — an event-driven path. Phase-transition signals (closing-cue, topic shift, long silence) can **pull a tick forward** (early recap) or **add a beat** (a second card with extra urgency: drift alert, action items). The conductor never *delays* the metronome; it only accelerates or augments.

Together they answer the judge’s “when, and how does it decide?” question concretely:
- **It decides every 30 seconds, by default.** That alone makes it an agent.
- **It decides earlier when it detects a phase transition.**
- **It decides to escalate when the conversation drifts from the goal** (after a 2-minute warmup so the goal-alignment baseline has settled).

### 3.2 Phase Schedule (warmup → align → close)

```
t = 0:00   Onboarding ends, mic opens, ARMED state
           ─────────────────────────────────────────────────────────────
t = 0:30   Tick #1   → if new tokens ≥ 40, surface "recap" card
t = 1:00   Tick #2   → recap
t = 1:30   Tick #3   → recap
           ─── ALIGN PHASE STARTS at t = 2:00 ─────────────────────────
t = 2:00   Tick #4   → recap PLUS goal-alignment score in header
                       (e.g. "align 0.78 ▲")
t = 2:30   Tick #5   → recap + score
                       if score < ALIGN_THRESHOLD (0.55), append
                       a "drift hint" bullet ("← steer toward goal: …")
t = 3:00   Tick #6   → if score has dropped > DRIFT_DELTA (0.20)
                       since onboarding, escalate to a "drift alert"
                       card (different layout, see §4.1)
…
t ≈ 12-15  Closing-cue fires anywhere → final "actions" card,
           transition to FINALISING state
```

The 2-minute warmup is not arbitrary: it gives the goal-alignment scorer enough conversational material to compute a stable baseline cosine before it starts judging drift. Without warmup, the first 30 s of small-talk would always look like drift.

### 3.3 Trigger Taxonomy (what can surface, in priority)

| Pri | Trigger | What surfaces | Allowed when |
|---|---|---|---|
| 1 | **Closing-cue** (“alright, let’s wrap”, “talk soon”, “bye”) | Final `actions` card, finalise session | any time after t = 0:30 |
| 2 | **Drift alert** — alignment score dropped > `DRIFT_DELTA` from baseline AND below `ALIGN_THRESHOLD` AND sustained for ≥ 20 s | `drift` card with: top 1 drift bullet + top 1 “bring it back” suggestion | t ≥ 2:00 |
| 3 | **Phase-transition pull-forward** — closing-cue-lite, topic shift (embedding novelty + discourse marker), or ≥ 8 s silence | The next `recap` tick fires now instead of waiting | any time after t = 0:30 |
| 4 | **Metronome tick** every `TICK_MS` | `recap` card. Header includes `align` once t ≥ 2:00 | always (gated by `MIN_CONTENT_TOKENS`) |
| 5 | **Manual mark** — user single-taps in `armed` to flag the moment | The next tick is pulled forward AND tagged `manual` in memory | any time |

Cooldown rule: `recap` ticks suppress further `recap` for `COOLDOWN_MS = 12_000` (so a tick + a pull-forward don’t collide). `drift` and `closing-cue` are **never** suppressed by cooldown — they preempt.

### 3.4 Signal Detectors (cheap → expensive)

Same layered approach as before; each detector returns a `DetectorOutput` consumed by `fusion.ts`. Crucially, **goal alignment** is now a first-class detector, not an afterthought.

1. **VAD / silence** — energy + ZCR over PCM frames in the WebView. No network. Continuously updates `silenceMs`.
2. **Closing-cue keyword** — regex over the rolling **final** transcript tail. Phrases: `\b(alright|ok|okay|so)\b.{0,15}\b(wrap|good|done|that[’']s it|bye|talk soon|ttyl|see you|let[’']s call it)\b` plus configurable list.
3. **Discourse-shift heuristic** — Jaccard < 0.15 between the previous 30 s window and the next 10 s window, plus a leading discourse marker (`so,`, `anyway,`, `next,`, `moving on,`, `switching gears,`).
4. **Goal-alignment scorer** *(NEW, the agent’s differentiator)* — see §3.5. Runs once per metronome tick once t ≥ 2:00.
5. **Embedding-novelty** — every tick, embed the last 30 s and compute cosine against the rolling segment centroid; output drives both topic-shift detection and a freshness signal for the summariser.
6. **LLM gate** *(last resort)* — only invoked when detectors disagree with the goal-alignment scorer; a small LLM call returns `{phase, drift_explanation}` and is rate-limited to ≤ 1 call / 60 s.

### 3.5 Goal-Alignment Scorer (the new heart)

At onboarding (§4.2 `ONBOARD` state), the user provides a free-text **goal** (e.g. *“Decide whether to ship v1 with SSO or defer it. Get explicit ownership of the contract draft.”*). The companion sends it to `POST /goal/embed` (§6.6) which returns a normalised vector `g ∈ ℝ³⁸⁴`. This vector is the **anchor** for the rest of the session.

Every metronome tick (after warmup) computes:

```
segment_vec = embed(last_30s_of_final_transcript)         // L2-normalised
align_t     = cosine(segment_vec, g)                       // ∈ [-1, 1], usually 0.2..0.9
baseline    = mean(align_t for first 4 ticks after warmup) // computed once at t = 4:00
drift_t     = baseline - align_t                           // positive = drifting away
```

Surface rules:
- `align_t` is shown in the card header: `align 0.71 ▲` (▲ = above baseline) or `align 0.43 ▼`.
- If `align_t < ALIGN_THRESHOLD (0.55)` for ≥ 20 s sustained → append an inline drift-hint bullet to the next `recap` card.
- If `drift_t > DRIFT_DELTA (0.20)` for ≥ 30 s sustained → escalate to a standalone `drift` card (Pri 2). The `drift` card body asks the LLM for one sentence: *“What single steer would bring the conversation back toward the goal?”* — that single sentence is the only body content, in italics-as-quote-style (no italic on G2; we render with leading `❝` and trailing `❞` from the supported Unicode set).

The wearer learns to trust the header alignment indicator as a sort of **conversational compass**. It is the most novel piece of the demo.

### 3.6 Fusion Logic (revised)

The fusion is now a small state machine, not a pure score. It runs on each tick **and** on every detector event:

```
on tick():
  ensure_warmup_done?
  if since_last_surface_ms < COOLDOWN_MS and not pulled_forward: return
  build_recap_card(transcript_tail, prior_summaries)
  if t >= ALIGN_AFTER_MS:
    align = goal_alignment.score()
    decorate_card_header(align)
    if drift_sustained(align): card.bullets.push(drift_hint(align))
  surface(card, kind='recap')

on detector_event(e):
  switch e.reason:
    case 'closing_cue':
      build_actions_card(); surface(kind='actions'); finalise_session(); break
    case 'topic_shift' | 'silence_long':
      pull_next_tick_forward(); break
    case 'drift_breached':
      ask_llm_for_one_steer(); surface_drift_card(); break
    case 'manual_mark':
      pull_next_tick_forward(tag='manual'); break
```

Constants (`_shared/constants.ts`):

```ts
export const TICK_MS            = 30_000
export const COOLDOWN_MS        = 12_000     // between ordinary ticks
export const MIN_CONTENT_TOKENS = 40         // skip a tick if too thin
export const ALIGN_AFTER_MS     = 120_000    // 2 min warmup
export const ALIGN_BASELINE_TICKS = 4        // 4 ticks after warmup = 2 min baseline window
export const ALIGN_THRESHOLD    = 0.55       // below this = "off-goal" zone
export const DRIFT_DELTA        = 0.20       // sustained drop = drift
export const DRIFT_SUSTAINED_MS = 30_000
export const SESSION_TIMEBOX_MS = 15 * 60_000 // soft default; user-adjustable in onboarding
```

### 3.7 Motion / Room-Change Proxy (unchanged, demoted)

Same heuristics as before (`isWearing` flicker, `ABNORMAL_EXIT_EVENT`, sustained silence after closing-cue) — but **no longer load-bearing for the demo**. Kept as a Pri-3 pull-forward signal so the agent still recaps if you walk out mid-meeting. Score weight 0.15.

### 3.8 What we explicitly do NOT do

- **No “wake word.”** Wake words are a different product.
- **No on-demand summary on tap.** Tap is reserved for **dismiss / save / mark-this-moment**.
- **No proactive notifications during quiet hours** (configurable in companion UI).
- **No drift alerts before t = 2:00.** Goal-alignment needs a baseline; surfacing drift before then would punish small talk and feel preachy.
- **No silent metronome ticks.** If a tick has < `MIN_CONTENT_TOKENS` of new material, we skip the surface but still log a “heartbeat” to memory so we know the agent was awake. The wearer never sees an empty card.

---

## 4. G2 HUD UX

### 4.1 Visual Vocabulary

The G2 has no colour, no font sizing, no alignment. We adopt four reusable card layouts. Each is buildable inside C2 (≤ 12 containers) and C3 (≤ 1000 chars on rebuild).

**Standard `recap` card (with alignment indicator after t=2:00):**

```
┌──────────────────────────────────────────────────────────┐  ← row 0..32   (header)
│  ● 03:30 / 15:00   tick 7   align 0.71 ▲                 │
├──────────────────────────────────────────────────────────┤  ← row 32..256 (body)
│                                                          │
│  Just covered                                            │
│   • Pricing tier rename (Pro → Studio)                   │
│   • Defer SSO to v1.1                                    │
│   • Action: Dana sends draft contract by Fri             │
│                                                          │
├──────────────────────────────────────────────────────────┤  ← row 256..288 (footer)
│  ▲ prev · ● mark · ▼ dismiss                             │
└──────────────────────────────────────────────────────────┘
```

**`drift` card (Pri 2 — interrupts cadence):**

```
┌──────────────────────────────────────────────────────────┐
│  ◆ 06:00 / 15:00   align 0.38 ▼   drift 0.33             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   ❝ You agreed to decide on SSO this call —              │
│     last 90s has been on pricing only. ❞                 │
│                                                          │
│   ▶ steer: "let's lock SSO before time's up"             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ▲ ignore · ● accept · ▼ dismiss + mute drift 5min       │
└──────────────────────────────────────────────────────────┘
```

**`actions` card (closing cue, end-of-session):**

```
┌──────────────────────────────────────────────────────────┐
│  ■ 14:42   3 actions · 2 decisions                       │
├──────────────────────────────────────────────────────────┤
│  Decisions                                               │
│   ✓ Ship v1 without SSO (defer to v1.1)                  │
│   ✓ Pricing tier rename Pro → Studio                     │
│  Actions                                                 │
│   → Dana: send draft contract by Fri                     │
│   → Aman: spec SSO scope by Mon                          │
│   → both: review next Tue 10am                           │
├──────────────────────────────────────────────────────────┤
│  ▲ prev · ● save session · ▼ end                         │
└──────────────────────────────────────────────────────────┘
```

Four card templates:

1. **`recap` card** — body shows ≤ 5 bullets, header shows tick number + (after warmup) alignment score.
2. **`drift` card** — single quoted observation + a single one-line steer. Designed to be readable in < 2 s.
3. **`actions` card** — final card on closing cue. Decisions block above actions block.
4. **`memory-hit` card** *(triggered by companion search)* — body shows the matched snippet + date.

Header status glyphs (all in supported Unicode set per `display.md`):
- `●` recording, `○` paused, `■` stopped, `◆` drift alert.
- Battery: `▆▆▆▁` etc. (block elements, 8 levels available).
- Alignment: `align 0.71 ▲` / `align 0.43 ▼`. Bar variant for the onboarding screen: `━━━━━━─────`.
- Time-box: `MM:SS / TT:00` showing elapsed / time-box.

### 4.2 Pages (state machine)

```
[home] ──tap──▶ [onboard] ──confirm──▶ [armed] ──tick / trigger──▶ [card]
   ▲                                       │                         │
   │                                       └── closing-cue ──▶ [actions card] ──▶ [finalising] ──▶ [home]
   │                                                                  │
   └────────── double-tap on home → shutdown(1) ─────────────────────┘
```

States and their container budgets (every page is ≤ 4 containers, simulator-safe per C12):

| State | Containers | Notes |
|---|---|---|
| `home` | 1 text (event capture) + 1 image (logo, optional) | Root. Double-tap → `shutDownPageContainer(1)`. |
| `onboard` | 1 text header + 1 text body + 1 footer | Tiny on-glass confirm screen showing **the goal that the companion just sent** + participant list + time-box, e.g. `goal: ship v1 SSO decision · 15:00 · Aman, Dana`. Wearer taps to accept → `armed`. The actual goal text is typed in the companion (typing on G2 is impossible); this screen is the on-glass acknowledgement. |
| `armed` | 1 text header (timer) + 1 text body (live tail) + 1 invisible event-capture text behind | `audioControl(true)` is on. Body shows live transcript tail (≤ 240 chars). Header pulses `●` once per second. |
| `card` | 1 header + 1 body + 1 footer = 3 text containers (capture on body) | Surfaced by trigger engine (`recap` / `drift` / `actions` / `memory-hit`). Auto-dismiss after `CARD_TTL` (default 12 s) unless tapped. |
| `finalising` | 1 text header + 1 text body | Shown for ~3 s after `actions` card while we write the session to memory. Body: `saving 8 segments · encrypting · done ✓`. |
| `recall` | 1 header + 1 list (≤ 8 items) | Companion search hit pushes the matched snippet here. |
| `exit-dialogue` | handled by host | Triggered by C5. |

**Onboarding co-flow.** The wearer cannot type on the G2 (no keyboard, no mic-as-input in v1). Onboarding is therefore a **two-screen** flow: the heavy lifting happens in the companion `Onboarding.tsx` page (participants, goal text, time-box, STT provider), and the G2 shows only the confirm card so the wearer can verify and start. If the companion is not open, `home` shows `tap when ready in companion ↗` and waits.

### 4.3 Input Mapping

| Gesture | Where | Action |
|---|---|---|
| Single tap | `home` | If onboarding ready → enter `onboard`. Else show `tap in companion ↗` hint. |
| Single tap | `onboard` | Confirm goal, enter `armed`, start mic, start metronome |
| Single tap | `armed` | Mark “interesting moment” — pulls the next tick forward and tags `manual` in memory |
| Single tap | `card` (recap/actions) | Save card explicitly + dismiss |
| Single tap | `card` (drift) | Accept the steer (logged as “coached intervention” in memory) + dismiss |
| Scroll up / `SCROLL_TOP_EVENT` | `card` | Show previous card from this session |
| Scroll down / `SCROLL_BOTTOM_EVENT` | `card` (recap/actions) | Dismiss, return to `armed` |
| Scroll down / `SCROLL_BOTTOM_EVENT` | `card` (drift) | Dismiss + mute drift alerts for `DRIFT_MUTE_MS` (default 5 min) |
| Double tap | `home` | `shutDownPageContainer(1)` (C5 — non-negotiable) |
| Double tap | any non-root | Go back one state |

### 4.4 Glanceability rules

- **Body text ≤ 5 bullets, ≤ 60 chars per bullet** (truncate with `…`). Source: `paginate-text` from even-toolkit.
- **First bullet must answer the implicit question** (“what did we just agree?” for `actions`, “what did we just discuss?” for `recap`).
- **No raw transcript on a card.** Cards are model-summarised. The transcript is one tap away in the companion app.
- Use `textContainerUpgrade` for header timer and wrap-gauge updates (≥ 1 Hz is fine, real hardware doesn’t flicker).
- Use `rebuildPageContainer` only on state transitions (cheap on real hardware, flicker on simulator — acceptable per `simulator.md`).

---

## 5. Memory Layer

### 5.1 Goals

- Every session’s **summaries** (not raw audio) and **transcript** are searchable forever, locally, encrypted at rest.
- Recall must answer “what did we decide about X last Tuesday?” in ≤ 800 ms on a typical device.
- Export and delete are **one click each** in the companion app.

### 5.2 Where data lives

The G2 itself stores nothing except a couple of UI prefs (`bridge.setLocalStorage`). All real persistence happens in the **companion** (the WebView running inside the Even App on the iPhone) and optionally syncs to the user’s server.

- **Tier 1 (always on, on-device):** an in-memory `Map`, write-through to `bridge.setLocalStorage` for prefs only (per pattern in `device-apis.md` §“Recommended pattern”).
- **Tier 2 (companion store):** browser-side IndexedDB inside the WebView, encrypted with WebCrypto AES-GCM 256 using a key derived from a user passphrase via PBKDF2-SHA256 (200k iters) — passphrase entered once in the browser settings page. Key is held in JS memory only; never persisted.
- **Tier 3 (optional, user-owned cloud):** if the user provides a Supabase URL + anon key (or generic Postgres URL via the backend), summaries+transcripts sync as encrypted blobs. Only metadata (timestamps, embedding vectors) is queryable in clear.

### 5.3 Schema

```ts
type SessionId = string                           // ULID
type SegmentId = string                           // ULID

type Session = {
  id: SessionId
  startedAt: number                               // epoch ms
  endedAt: number | null
  title: string | null                            // model-generated post-hoc
  locationHint: string | null                     // user-tagged ("office", "car")
  participants: string[]                          // entered in onboarding
  goal: string                                    // free-text, entered in onboarding
  goalEmbedding: Float32Array                     // 384-dim, anchor for align scoring
  timeboxMs: number                               // user-set in onboarding (default 15 min)
  alignBaseline: number | null                    // computed at t = 4 min (4 ticks after warmup)
  finalAlign: number | null                       // last align score before finalisation
  outcome: 'completed' | 'abandoned' | 'timeboxed' | null
  tagIds: string[]
}

type Segment = {                                  // a "tick" or trigger-driven surface
  id: SegmentId
  sessionId: SessionId
  startedAt: number
  endedAt: number
  kind: 'recap' | 'drift' | 'actions' | 'heartbeat'
  triggerThatFiredIt: 'tick' | 'closing_cue' | 'topic_shift'
                    | 'silence' | 'motion' | 'manual_mark' | 'drift_breach'
  summary: string                                 // ≤ 500 chars
  bullets: string[]                               // ≤ 5
  actionItems: ActionItem[]
  decisions: string[]
  embedding: Float32Array                         // 384-dim, see §5.4
  alignScore: number | null                       // cosine(segment, goal); null before warmup
  driftFromBaseline: number | null                // baseline - alignScore; null before baseline set
  llmSteer: string | null                         // only set on drift cards
  wasAccepted: boolean | null                     // user tap on drift card → true
}

type ActionItem = {
  who: string | null                              // best-effort, may be null
  what: string
  due: string | null                              // ISO-ish, model-extracted
}
```

Indexes:
- `sessions(startedAt DESC)`
- `sessions(goalEmbedding)` — for cross-session “similar past meetings” recall (v2 hook)
- `segments(sessionId, startedAt)`
- `segments(embedding)` — HNSW (use `hnswlib-wasm` in browser for v1; switch to pgvector in Tier 3).
- `segments(kind)` — quick filter for “show me only the drift moments” review.

`heartbeat` segments record skipped ticks (content too thin) so the audit log shows the agent was awake. They carry empty bullets and no embedding write to the HNSW index.

### 5.4 Embeddings

- Use `text-embedding-3-small` (OpenAI) or `voyage-3-lite` via the backend proxy (§6.3). Output dim 384 (truncate if needed).
- Embed at `Segment` granularity, not per word. ~150–500 tokens per segment.
- Store the L2-normalised vector. Cosine ≡ dot product after normalisation — keeps client search trivial.

### 5.5 Recall query

```
companion search box → backend /search?q=…
   ↓
backend embeds q → vector
   ↓
client (with the user’s passphrase-derived key) does:
  - top-k cosine on local segments      (Tier 2)
  - merges with backend top-k if Tier 3 enabled
  - decrypts top-k summaries client-side
  - returns ranked list to UI
   ↓
selected hit pushes to G2 `recall` page (1 list container)
```

For the demo, top-k = 5; latency budget 800 ms cold, 200 ms warm.

### 5.6 Privacy & retention

- Default retention: **30 days for transcripts**, **forever for summaries**, configurable.
- Single `Forget Session` button in companion → deletes encrypted blob, vector index entry, prefs.
- `Forget Everything` button → wipes IndexedDB and SDK storage; clears Tier 3 too if connected.
- We never write raw PCM to disk. (Asserted in unit test §9.3.)

---

## 6. Backend Services

The backend is intentionally thin (per C14). Four endpoints, one purpose each. Stateless except for STT WS pass-through. Deploy on Vercel / Cloudflare Workers / a Node VPS — no constraint here, but pin `permissions.network` in `app.json` to the chosen domain (C10).

### 6.1 `POST /stt/connect`
Returns a short-lived (5 min) signed STT WS URL so the WebView can open Soniox / Deepgram / etc. without seeing the upstream API key. Same shape as the existing `stt-even-g2-main` app, but the key never leaves the server.

Request: `{ provider: 'soniox' | 'deepgram', sampleRate: 16000 }`
Response: `{ url: string, headers?: Record<string,string>, expiresAt: number }`

### 6.2 `POST /llm/summarise`
The summariser. Called once per metronome tick that surfaces (and once per closing-cue / drift trigger).

Request:
```json
{
  "transcriptTail": "string, ≤ 8000 chars",
  "phase": "warmup" | "align" | "drift" | "wrap",
  "goal": "string ≤ 500 chars",
  "priorSummaries": ["…"],
  "alignScore": 0.71,
  "driftFromBaseline": 0.04,
  "style": "recap" | "drift" | "actions"
}
```

Response:
```json
{
  "title": "string ≤ 60 chars",
  "bullets": ["…", "…"],
  "actionItems": [{"who": null, "what": "…", "due": null}],
  "decisions": ["…"],
  "steer": "single-line nudge, only present when style='drift'",
  "tokensIn": 1234,
  "tokensOut": 87
}
```

Hard limits: `bullets.length ≤ 5`, each bullet ≤ 60 chars, `steer` ≤ 80 chars (the model is told this; the server truncates as a safety net).

Prompt template lives at `mindmirror/server/prompts/summarise.md` — see §7.5.

### 6.3 `POST /embed`
Batch-embed an array of strings. Returns `Float32Array` per item (as base64 of little-endian floats for transport; client decodes). L2-normalised on the server so clients can do dot-product instead of cosine.

### 6.4 `POST /search`
Optional Tier 3. Embeds query, returns top-k segment IDs + cosine scores. Decryption stays on the client.

### 6.5 `POST /goal/embed`
Called once at onboarding. Lightweight wrapper over `/embed` so the contract is explicit: the goal vector is the **anchor** for an entire session and gets cached server-side keyed by `(installId, sessionId)` for the duration of the session.

Request:
```json
{ "sessionId": "01HX…", "goal": "string ≤ 500 chars" }
```

Response:
```json
{ "sessionId": "01HX…", "embedding": "<base64 of 384-dim float32 LE>", "ttlMs": 5400000 }
```

The TTL exceeds the soft 15-min time-box by a comfortable margin so a session that runs long does not lose its anchor mid-call.

### 6.6 `POST /goal/score` *(optional batch path)*
Convenience for benchmarking and offline replay. The on-device alignment scorer normally runs **fully in the WebView** using the cached goal vector and the per-tick segment embedding from `/embed` — no extra round trip. This endpoint exists for the eval harness (§9.4) only.

Request:
```json
{ "sessionId": "01HX…", "segments": ["string …", "string …"] }
```

Response:
```json
{ "scores": [0.71, 0.66, 0.42], "baseline": 0.69, "drift": [0.0, 0.03, 0.27] }
```

### 6.5 Cross-cutting

- **Auth:** companion sends a per-install token (UUID stored in `bridge.setLocalStorage('mm.installId')`). Server-side rate-limit at 60 req/min/install.
- **Logging:** request timing only. **Never log transcript or summary bodies.** Tested in §9.3.
- **Secrets:** `OPENAI_API_KEY`, `SONIOX_API_KEY`, `EMBEDDING_PROVIDER_URL`. Stored in the host platform (Vercel env, etc.). Never bundled.
- **CORS:** allow only the `app.json` `package_id`-derived origin.

---

## 7. File Scaffold (Codex-buildable)

This is the file tree Codex should produce. **Bold** files are the ones whose signatures Codex must match exactly so downstream wiring works. Other files are stubs Codex fills in.

```
mindmirror/
├── app.json                          ★ (see §7.1)
├── package.json                      ★
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
├── _shared/
│   ├── app-types.ts                  ★ same shape as stt-even-g2-main/_shared/app-types.ts
│   ├── log.ts                        (copy + extend stt’s log.ts)
│   └── constants.ts                  ★ exports SAMPLE_RATE, FRAME_BYTES, COOLDOWN_MS, …
├── g2/                               ── code that runs in the WebView and talks to the glasses
│   ├── index.ts                      ★ `export const app: AppModule = {…}`
│   ├── main.ts                       ★ bootstrap: bridge, audio, render loop, metronome
│   ├── state.ts                      ★ Zustand-style store (no React dep on glasses path)
│   ├── session/
│   │   ├── lifecycle.ts              ★ start/finalise session, manages SessionId + goal vector
│   │   └── timebox.ts                ★ counts down SESSION_TIMEBOX_MS, surfaces "5 min left"
│   ├── render/
│   │   ├── home.ts                   renders home page
│   │   ├── onboarding.ts             ★ renders on-glass confirm card (goal · participants · time)
│   │   ├── armed.ts                  renders listening page + live tail + timer
│   │   ├── card.ts                   renders a Card (recap | drift | actions | memory-hit)
│   │   ├── finalising.ts             renders 3-second "saving…" view
│   │   ├── recall.ts                 renders a list
│   │   └── format.ts                 wrap/pad/truncate helpers (use even-toolkit/text-utils)
│   ├── input/
│   │   └── events.ts                 ★ normalise eventType (handles C6); routes by state
│   ├── audio/
│   │   ├── stt-client.ts             ★ open WS via /stt/connect, push PCM frames
│   │   └── vad.ts                    ★ energy-based VAD, exposes silenceMs
│   └── trigger/
│       ├── index.ts                  ★ public API: `onAudioFrame`, `onTranscript`, `tick`,
│       │                              `onGoalSet`, `subscribe`
│       ├── metronome.ts              ★ deterministic TICK_MS clock, fires `onTick(n)`
│       ├── detectors/
│       │   ├── closingCue.ts
│       │   ├── discourseShift.ts
│       │   ├── embeddingNovelty.ts   calls /embed
│       │   ├── goalAlignment.ts      ★ §3.5 — keeps baseline, scores per tick, raises drift
│       │   ├── llmGate.ts            calls /llm/summarise with style=='drift'
│       │   ├── silence.ts            wraps audio/vad
│       │   └── motionProxy.ts        consumes isWearing + ABNORMAL_EXIT
│       ├── fusion.ts                 ★ implements §3.6 (state machine, not just a score)
│       └── cooldown.ts               ★ §3.3 cooldown rule
├── memory/
│   ├── index.ts                      ★ public: `appendSegment`, `search`, `forget*`
│   ├── crypto.ts                     ★ AES-GCM via WebCrypto, PBKDF2 KDF
│   ├── store.ts                      ★ IndexedDB wrapper
│   ├── vectorIndex.ts                ★ thin wrapper over hnswlib-wasm
│   └── schema.ts                     ★ types in §5.3, JSON-schema runtime validators
├── companion/                        ── the browser (settings) UI rendered in the WebView
│   ├── ui.tsx                        ★ even-toolkit components (Cards, Input, Toggle, Search)
│   ├── pages/
│   │   ├── Setup.tsx                 passphrase, server URL, STT provider
│   │   ├── Onboarding.tsx            ★ THE FLOW STARTER — participants, goal, time-box;
│   │   │                              calls POST /goal/embed and pushes the on-glass confirm
│   │   ├── Sessions.tsx              list past sessions + summaries (with goal + final align)
│   │   ├── Search.tsx                ★ recall query box → /search → memory.search → push to G2
│   │   └── Privacy.tsx               retention sliders, Forget buttons, export
│   └── styles.css                    imports even-toolkit theme + typography + utilities
└── server/                           ── deploys independently
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts                  Hono / Express, wires the four routes
    │   ├── routes/
    │   │   ├── stt.connect.ts        ★ §6.1
    │   │   ├── llm.summarise.ts      ★ §6.2 (now goal-aware, four styles)
    │   │   ├── embed.ts              §6.3
    │   │   ├── search.ts             §6.4
    │   │   ├── goal.embed.ts         ★ §6.5 — caches goal vector by sessionId
    │   │   └── goal.score.ts         §6.6 (eval-only batch path)
    │   ├── prompts/
    │   │   └── summarise.md          ★ see §7.5
    │   └── lib/
    │       ├── auth.ts               install-token middleware
    │       ├── ratelimit.ts
    │       └── redact.ts             defensive log scrubber
    └── README.md
```

### 7.1 `mindmirror/app.json`

```json
{
  "package_id": "com.mindmirror.app",
  "name": "MindMirror",
  "version": "1.0.0",
  "description": "Always-listening agent that surfaces glanceable summaries at conversation phase transitions, and lets you search every session you've had.",
  "author": "MindMirror",
  "entrypoint": "index.html",
  "permissions": {
    "network": [
      "stt-rt.soniox.com",
      "api.openai.com",
      "<YOUR_BACKEND_HOST>"
    ]
  }
}
```

> Codex: replace `<YOUR_BACKEND_HOST>` at packaging time. Keep the list **explicit** — `["*"]` will pass review but leaks intent.

### 7.2 `mindmirror/package.json` (skeleton)

```json
{
  "name": "mindmirror",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "vite build",
    "preview": "vite preview",
    "qr": "evenhub qr --http --port 5173",
    "pack": "npm run build && evenhub pack app.json dist -o mindmirror.ehpk",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@evenrealities/even_hub_sdk": "^0.0.7",
    "even-toolkit": "*",
    "hnswlib-wasm": "*",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@evenrealities/evenhub-cli": "^0.1.5",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vitest": "^2.0.0"
  }
}
```

### 7.3 Required signatures (Codex must not rename these)

```ts
// _shared/app-types.ts (mirror stt-even-g2-main exactly)
export type SetStatus = (text: string) => void
export type AppActions = { connect: () => Promise<void>; action: () => Promise<void> }
export type AppModule = {
  id: string; name: string; pageTitle?: string; connectLabel?: string
  actionLabel?: string; initialStatus?: string
  createActions: (setStatus: SetStatus) => Promise<AppActions> | AppActions
}
```

```ts
// g2/trigger/index.ts
export type Phase = 'warmup' | 'align' | 'drift' | 'wrap'
export type SurfaceKind = 'recap' | 'drift' | 'actions' | 'heartbeat'
export type TriggerReason =
  | 'tick' | 'closing_cue' | 'topic_shift' | 'silence'
  | 'motion' | 'manual_mark' | 'drift_breach'

export type TriggerEvent = {
  phase: Phase
  reason: TriggerReason
  kind: SurfaceKind
  alignScore: number | null
  driftFromBaseline: number | null
  surfaceAt: number   // epoch ms
  tickIndex: number   // monotonically increasing per session
}

export type GoalContext = {
  sessionId: string
  goal: string
  goalEmbedding: Float32Array  // 384-dim, L2-normalised
  timeboxMs: number
}

export type TriggerEngine = {
  onAudioFrame(pcm: Uint8Array): void
  onFinalTranscript(text: string): void
  onProvisionalTranscript(text: string): void
  onWearingChanged(isWearing: boolean): void
  onGoalSet(goal: GoalContext): void          // called once at session start
  subscribe(cb: (e: TriggerEvent) => void): () => void
  forceMark(): void                           // user single-taps in `armed`
  muteDrift(durationMs: number): void         // user dismisses a drift card
  reset(): void                               // on session end
}
export function createTriggerEngine(opts: { now?: () => number; backendUrl: string }): TriggerEngine
```

```ts
// memory/index.ts
export type SearchHit = { segmentId: string; sessionId: string; score: number; snippet: string; ts: number }
export type Memory = {
  startSession(init: {
    sessionId: string
    goal: string
    goalEmbedding: Float32Array
    participants: string[]
    timeboxMs: number
    startedAt: number
  }): Promise<void>
  appendSegment(seg: import('./schema').Segment): Promise<void>
  finaliseSession(sessionId: string, args: {
    title: string | null
    finalAlign: number | null
    outcome: 'completed' | 'abandoned' | 'timeboxed'
  }): Promise<void>
  search(query: string, k?: number): Promise<SearchHit[]>
  forgetSession(sessionId: string): Promise<void>
  forgetAll(): Promise<void>
  exportEncryptedBlob(): Promise<Blob>
}
export function createMemory(opts: { passphrase: string; backendUrl?: string }): Promise<Memory>
```

```ts
// g2/render/card.ts
export type CardKind = 'recap' | 'drift' | 'actions' | 'memory-hit'
export type CardModel = {
  kind: CardKind
  title: string                  // ≤ 60 chars
  bullets: string[]              // ≤ 5; empty for 'drift'
  steer?: string                 // present iff kind === 'drift'
  alignScore?: number            // header indicator (after warmup)
  driftFromBaseline?: number     // header indicator
  tickIndex?: number             // header label (e.g. "tick 7")
  elapsedMs?: number             // header timer
  timeboxMs?: number             // header timer denominator
  footerHint?: string
}
export async function renderCard(bridge: import('@evenrealities/even_hub_sdk').EvenAppBridge,
                                 card: CardModel,
                                 mode: 'create' | 'rebuild' | 'upgrade'): Promise<void>
```

```ts
// g2/render/onboarding.ts
export type OnboardingModel = {
  goal: string                   // truncated to fit 2 lines on glass
  participants: string[]         // truncated, joined with ' · '
  timeboxMs: number              // shown as MM:00
}
export async function renderOnboarding(
  bridge: import('@evenrealities/even_hub_sdk').EvenAppBridge,
  model: OnboardingModel
): Promise<void>
```

```ts
// g2/session/lifecycle.ts
export type SessionStartArgs = {
  goal: string
  participants: string[]
  timeboxMs: number
}
export type SessionHandle = {
  sessionId: string
  startedAt: number
  goalEmbedding: Float32Array
}
export async function startSession(args: SessionStartArgs, opts: { backendUrl: string }): Promise<SessionHandle>
export async function finaliseSession(handle: SessionHandle, opts: {
  outcome: 'completed' | 'abandoned' | 'timeboxed'
  finalAlign: number | null
}): Promise<void>
```

### 7.4 Detector interface (extensible)

```ts
// g2/trigger/detectors/_iface.ts
export type DetectorContext = {
  now: number
  silenceMs: number
  finalTail: string         // last ~30 s of finals
  provisional: string
  isWearing: boolean
  sinceLastSurfaceMs: number
}
export type DetectorOutput = { weight: number; reason: TriggerEvent['reason'] | null; phaseHint?: Phase }
export interface Detector {
  name: string
  run(ctx: DetectorContext): Promise<DetectorOutput> | DetectorOutput
}
```

This is how we keep the door open for IMU/RSSI detectors later (§3.5).

### 7.5 Prompt — `server/prompts/summarise.md`

Codex implements this verbatim. Keep it short; LLM cost dominates if it bloats.

```
You are MindMirror, an embedded summariser running on smart glasses.
Your output appears on a 576x288 monochrome HUD; the wearer glances for ~2 seconds.
The wearer set a GOAL for this conversation. Treat the goal as the north star.

Input:
- transcriptTail: the last 30s-3min of conversation
- phase: "warmup" | "align" | "drift" | "wrap"
- goal: free-text goal the wearer typed at onboarding
- priorSummaries: prior bullets from the same session (avoid repeating)
- alignScore: cosine similarity (0-1) between transcriptTail and goal
- driftFromBaseline: positive number = drifting away from goal
- style: "recap" | "drift" | "actions"

Rules (HARD):
1. Output VALID JSON matching the schema below. No prose outside JSON.
2. <= 5 bullets. <= 60 chars per bullet. No emoji. No markdown.
3. Every bullet must encode information the wearer DID NOT already know
   from priorSummaries.
4. Action items must have an explicit owner if and only if the transcript
   names one. Do not invent owners. due=null if not stated.
5. If style=="recap":
     - phase=="warmup": neutral status snapshot ("so far we…").
     - phase=="align": status snapshot framed against the goal
       ("toward goal: X · open: Y").
   Do NOT mention the alignScore number in the bullets — the HUD shows it
   in the header.
6. If style=="drift":
     - bullets MUST be empty.
     - "steer" MUST be a single sentence (<= 80 chars) that names the
       specific topic the conversation has drifted to AND proposes one
       concrete sentence the wearer could say to bring it back to the goal.
     - Quote-style: do not start with "you should" or "try to". Phrase as
       a sentence the wearer could literally say out loud.
7. If style=="actions" (closing-cue):
     - bullets becomes a short recap of the call as a whole.
     - actionItems and decisions are populated from the WHOLE session,
       not just the tail (priorSummaries is the source of truth for
       earlier content).
     - Re-rank: most goal-relevant decision first.

Schema:
{
 "title": string,                    // <= 60 chars, glanceable
 "bullets": string[],                // <= 5; empty when style=="drift"
 "actionItems": [{"who": string|null, "what": string, "due": string|null}],
 "decisions": string[],
 "steer": string|null                // present iff style=="drift"
}
```

---

## 8. Build / Run / Package

### 8.1 Local dev
```
cd mindmirror
npm install
npm run dev          # in one terminal
npm run qr           # in another → scan with the Even App
```

### 8.2 Backend
```
cd mindmirror/server
npm install
echo "OPENAI_API_KEY=..." >> .env
echo "SONIOX_API_KEY=..." >> .env
npm run dev
```

Point the WebView at the backend by setting `VITE_MM_BACKEND_URL` in `mindmirror/.env.local` (Vite picks it up). The companion `Setup` page lets the user override at runtime; this env is only the dev default.

### 8.3 Packaging for Even Hub
```
cd mindmirror
npm run pack         # produces mindmirror.ehpk
```
Add `*.ehpk` to `.gitignore` (mirrors `stt-even-g2-main/.gitignore`).

---

## 9. Acceptance Tests / Demo Script

### 9.1 The 12-minute demo (recorded video for judges)

The demo runs against a recorded WAV played into the laptop’s mic so it’s reproducible. Total runtime ~12 minutes, fits inside the default 15-minute time-box.

**Setup (off-camera, ~30 s):** Open companion → `Onboarding` page → enter
- participants: `Aman, Dana`
- goal: *“Decide whether to ship v1 with SSO or defer it. Get explicit ownership of the contract draft.”*
- time-box: `15:00`

Companion calls `POST /goal/embed`, then pushes the on-glass `onboard` confirm card. Wearer sees the goal echoed back.

| t (m:ss) | What plays | Expected G2 surface |
|---|---|---|
| 0:00 | Wearer taps `onboard` → enter `armed` | header `● 00:00 / 15:00`, body shows live tail |
| 0:00–0:30 | Small talk, weather, coffee | nothing (warmup, content too thin) |
| **0:30** | **Tick #1** — Aman: “OK so SSO. Where’d we land last time…” | **`recap` card** — 2 bullets, header `tick 1` (no align yet — pre-warmup) |
| 0:30–1:00 | Discussion of SSO scope | tail updates live |
| **1:00** | **Tick #2** | `recap` — 3 bullets re: SSO scope |
| **1:30** | **Tick #3** | `recap` — first decision draft |
| **2:00** | **Tick #4 — ALIGN PHASE BEGINS** | `recap` — header now shows `align 0.78 ▲` (high alignment, on goal) |
| **2:30** | Tick #5 | `recap` — `align 0.74 ▲` |
| **3:00** | Tick #6 | `recap` — `align 0.71 ▲` |
| **3:30** | Tick #7 | `recap` — `align 0.69 ▲` |
| **4:00** | Tick #8 — **baseline now established at 0.73** | `recap` — `align 0.70 ▲` |
| 4:00–6:00 | Conversation drifts to pricing tier rename for next 2 min | ticks #9–12, `align` slides 0.62 → 0.55 → 0.48 → 0.41 |
| **5:30** | Sustained low-align passes drift threshold | header shows `align 0.41 ▼ drift 0.32` and footer hints “drift sustained 30s” |
| **5:35** | **Drift breach triggers Pri-2 alert** | **`drift` card** — quoted observation: *“You agreed to decide on SSO this call — last 90s has been on pricing only.”* + steer: *“let’s lock SSO before time’s up”* |
| 5:40 | Wearer single-taps drift card → accept | logged as “coached intervention”; speakers naturally pivot back to SSO |
| 6:00–9:00 | Discussion returns to SSO, decision crystallises | ticks #13–18, `align` recovers to 0.71 |
| 9:30 | Aman: “Alright I think we’re good — Dana you’ll send the draft Friday?” Dana: “yep” | **closing-cue detected** |
| **9:32** | **Pri-1 fires** | **`actions` card** with: decision (defer SSO to v1.1) + actions (`Dana: send draft contract by Fri`, `Aman: spec SSO scope by Mon`) |
| 9:35 | Wearer taps to save → `finalising` view (3 s) | session written to encrypted memory |
| 10:00 | Open companion `Sessions` page | session shown with `goal: ship v1 SSO decision · final align 0.71 · 1 drift intervention (accepted)` |
| 10:10 | Open companion `Search`, type *“API schema”* | top hit returns from a *prior* fixture session; tap → G2 shows `memory-hit` card |

The demo proves the four product claims in order: **(1) onboarding sets a goal**, **(2) periodic ticks**, **(3) goal-alignment scoring after warmup**, **(4) drift alert that the wearer acts on**, **(5) closing-cue final actions**, **(6) recall across sessions**.

### 9.1.1 Timing fixtures for replay

`mindmirror/fixtures/demo/` (Codex must produce):

```
fixtures/demo/
├── meeting.wav          stereo 16k WAV, ~10 min, two speakers
├── goal.txt             the goal string
├── transcript.json      timestamped final tokens (from a prior Soniox run)
├── expected.json        per-tick: { tickIndex, expectedAlign, expectedKind }
└── README.md            "to replay: VITE_FIXTURE=demo npm run dev"
```

`expected.json` is what `tests/integration/demo-replay.spec.ts` asserts against — the demo is also a regression test.

### 9.2 Functional acceptance

- [ ] Auto-connect fires on page load (C11).
- [ ] Root double-tap shows host exit dialogue (C5).
- [ ] Onboarding writes a `Session` row with `goal`, `goalEmbedding`, `participants`, `timeboxMs` before the first tick fires.
- [ ] No browser `localStorage` writes for anything that should persist (grep CI rule).
- [ ] Container counts on every page ≤ 4 (simulator-safe per C12).
- [ ] Body text wrap respects ≤ 60 chars per line via `even-toolkit/paginate-text`.
- [ ] Metronome fires within ±300 ms of the expected tick (clock-drift bounded).
- [ ] No alignment header is shown on cards before t = ALIGN_AFTER_MS.
- [ ] Drift card never fires before t = ALIGN_AFTER_MS + ALIGN_BASELINE_TICKS × TICK_MS.
- [ ] After a closing-cue trigger, mic stops within 30 s of silence; session is finalised; `Memory.appendSegment` was called per surface + `finaliseSession` once with non-null `outcome`.

### 9.3 Privacy acceptance (must be a CI test)

- [ ] `npm test` includes `crypto.spec.ts` proving AES-GCM round-trip and that the IndexedDB blob does not contain the plaintext used in the test.
- [ ] `server/test/no-leak.spec.ts` runs the routes with a transcript containing the marker `MINDMIRROR_LEAK_CANARY` and asserts the marker does not appear in any stdout/stderr or response except the one explicitly returning a summary.
- [ ] `audio-no-disk.spec.ts` runs a full session in jsdom with a fake `audioEvent` stream and asserts no `IndexedDB`, `bridge.setLocalStorage`, or `fetch(body=…)` call ever contains a raw PCM byte.

### 9.4 Trigger correctness (unit + integration)

In `g2/trigger/__tests__/`:
- `closingCue.spec.ts` — 30 positive phrases, 30 hard negatives (“OK actually wait…”).
- `metronome.spec.ts` — using fake timers, assert exactly 24 ticks fire over 12 minutes (TICK_MS = 30s) and tickIndex is monotonic + gapless.
- `goalAlignment.spec.ts` — fixture transcripts where the “on-goal” segments score ≥ 0.65 and “off-goal” segments score ≤ 0.45 against the goal embedding (use the eval harness in `tests/eval/align-eval.ts`).
- `goalAlignment.baseline.spec.ts` — first 4 ticks after warmup compute the baseline; tick #5+ uses it.
- `fusion.spec.ts` — fixture transcripts with hand-labelled phase boundaries; assert the right `kind` (recap/drift/actions) fires within ±2 s of the label and the closing cue always wins over a concurrent drift breach.
- `cooldown.spec.ts` — back-to-back recap ticks respect `COOLDOWN_MS`, but `drift_breach` and `closing_cue` preempt regardless.
- `mute.spec.ts` — after the wearer dismisses a drift card with scroll-down, no further drift cards for `DRIFT_MUTE_MS`.

`tests/integration/demo-replay.spec.ts` plays `fixtures/demo/transcript.json` through the engine with fake timers and asserts the produced surface stream matches `fixtures/demo/expected.json` exactly. This is the gate for "demo is reproducible."

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM mis-summarises and surfaces a wrong “decision” | Med | High (trust) | Constrain with the prompt, cap bullet length, include `priorSummaries` to reduce drift, add a “mark wrong” gesture (long-press, v2). For demo, hand-validate the demo transcript. |
| 30s ticks feel relentless → notification fatigue | High | High | `MIN_CONTENT_TOKENS` floor skips silent ticks; companion exposes `TICK_MS` slider (30/45/60/90); `recap` body is 3 bullets max so the glance cost is low. |
| Goal vector poorly captures intent (one-line goal too vague) | High | Med | Onboarding `Goal` field has a 1-line affordance to add up to 3 “success criteria” bullets that get embedded together with the goal. Eval set in `tests/eval/align-eval.ts` regression-tests this. |
| Drift alert wrongly fires on a legitimate productive tangent | Med | High | Two-stage gate: (a) `align < 0.55` AND (b) `drift > 0.20` AND (c) sustained for `DRIFT_SUSTAINED_MS`. Drift card asks the LLM for a steer rather than asserting drift unilaterally. Wearer-dismiss mutes for 5 min. |
| Trigger fires too rarely → demo dud | Low | High | The metronome guarantees a tick every 30s. Demo is deterministic. |
| Bridge not present (running in plain browser) | Low (dev only) | Low | `withTimeout(waitForEvenAppBridge(), 6000)` then fall back to mock-glasses log panel (mirrors `stt-even-g2-main`). |
| BLE drops mid-segment | Med | Med | On `ABNORMAL_EXIT_EVENT`, flush the in-memory transcript to the segment buffer with `triggerThatClosedIt='motion'` so we don’t lose the partial. |
| User passphrase forgotten | Low | High | Make it explicit in `Setup.tsx`: *“If you lose this passphrase your past sessions are unrecoverable. We do not store it.”* Offer optional recovery key download. |
| Simulator > 4 container or > 200×100 image limit (C12) | High in dev | Low | All pages designed for 3–4 text containers and no large image. Card is text-only. |
| Soniox / OpenAI outage | Low | Med | Provider abstraction in `server/routes/`. Swap Deepgram or Anthropic with one env var change. |

---

## 11. v2 Hooks (do not build now, but design must not preclude)

- **Diarisation** — surface `Speaker A: …` once Soniox/Deepgram diarisation is enabled. The `Segment.bullets` schema already supports it via free-text.
- **“Send to…” actions** — once a card is on screen, single tap saves; long press could send to Linear / Slack / Notion via MCP.
- **IMU motion detector** — drop into `detectors/motion.ts` when SDK exposes it.
- **Multi-device memory sync** — Tier 3 already supports this; just need conflict-free merge (CRDT) when two glasses write the same session ID.
- **On-glass voice queries** — “MindMirror, what did Dana say about the contract?” — requires a wake word, see §3.6 for why we’re skipping for v1.
- **Calendar binding** — auto-tag a session with the current calendar event title.

---

## 12. Open Questions (need product call before code)

1. **STT provider for v1** — Soniox (used in `stt-even-g2-main`) or Deepgram? Soniox has the working WS pattern; Deepgram has better diarisation. Default: **Soniox** for parity with the existing reference app.
2. **LLM provider** — `gpt-4o-mini`, `claude-haiku`, or local `llama-3.1-8b` via Ollama? Default: **OpenAI** for demo speed; provider is abstracted at `server/routes/llm.summarise.ts`.
3. **Default retention for transcripts** — 30 days vs 7 days. Default: **30 days** (privacy slider in Setup goes 0 → 365).
4. **Demo passphrase ergonomics** — accept a 4-digit PIN for demo or require a real passphrase? Default: **PIN allowed in demo mode, banner warns it’s insecure.**
5. **Default TICK_MS** — 30 s feels right for a 15-min meeting; for a 60-min standup it would be too noisy. Should we auto-scale TICK_MS to `timeboxMs / 30` (so 1-hour meetings tick every 2 min)? Default: **fixed 30 s for v1**, expose slider, revisit with telemetry.
6. **Drift card aggressiveness** — should the drift card auto-dismiss after `CARD_TTL` like a recap, or stick until tapped? Default: **stick** (it’s a coaching moment, the wearer should make a choice).
7. **Goal embedding model for goal vs segment** — same model for both, or use a richer goal embedding (e.g. ada-3-large for the anchor, 3-small for segments)? Default: **same model**, keep the math symmetrical, revisit if eval shows drift in alignment scoring.

Codex: implement with the defaults above; expose them as constants in `_shared/constants.ts` so a product decision flips one file.

---

## 13. Glossary

| Term | Meaning here |
|---|---|
| **Surface** (verb) | Push a card to the G2 HUD. Always agent-initiated, never user-initiated. |
| **Phase transition** | The moment a conversation crosses one of the §3.1 boundaries. |
| **Card** | A 3-container HUD layout shown for `CARD_TTL` ms. |
| **Segment** | The unit of memory. One conversation phase = one segment row. |
| **Tier 1/2/3** | On-device prefs / encrypted IndexedDB / optional encrypted cloud. |
| **Closing-cue** | Lexical signal that the conversation is ending. |
| **Cooldown** | Minimum gap between two surfaces, see §3.4. |

---

## 14. Codex Working Agreement

When Codex executes against this spec:
1. Build in this order, milestone by milestone:
   - **M1 — `_shared/` + `app.json` + `index.html` + bridge bootstrap** (mirror `stt-even-g2-main` patterns; verify `waitForEvenAppBridge` + auto-connect work).
   - **M2 — `companion/Onboarding.tsx` + `server/routes/goal.embed.ts` + `g2/session/lifecycle.ts` + `g2/render/onboarding.ts`** (the *flow starter* — onboarding must light up before any trigger work).
   - **M3 — `g2/audio/` + `g2/render/armed.ts` + STT proxy + live tail rendering** (proves audio path end-to-end).
   - **M4 — `g2/trigger/metronome.ts` + `g2/render/card.ts` (recap kind only) + `server/routes/llm.summarise.ts`** (proves the 30-second tick).
   - **M5 — `g2/trigger/detectors/goalAlignment.ts` + alignment header + drift card** (the differentiator).
   - **M6 — `g2/trigger/detectors/closingCue.ts` + actions card + `g2/render/finalising.ts`** (closes the loop).
   - **M7 — `memory/` + `companion/Search.tsx` + memory-hit card** (recall path).
   - **M8 — privacy CI tests + demo replay test + `fixtures/demo/`** (acceptance gate).
2. Produce **failing tests first** for each `★`-marked file’s public signature, then implement.
3. Do **not** rename any `★`-marked symbols; downstream wiring depends on them.
4. After every milestone, run `npm test && npm run lint`. Both must be green before moving on.
5. The 12-minute demo (§9.1) and the demo replay test (§9.4) are the **single user-visible acceptance gate**. If they don’t run end-to-end, the milestone is not done.
6. If a constraint in §1 ever appears to make a feature impossible, stop and write a note in `mindmirror/NOTES.md` instead of softening the constraint.
