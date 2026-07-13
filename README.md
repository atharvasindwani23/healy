# Healy 🩺

**Your health data has a lot to say. It's just never learned to text.**

Healy is a texting-first health companion. It reads your wearable, remembers your life, knows where you are and what you ate, and messages you like a friend who happens to have a medical-adjacent brain — *"slept solid last night, like 7.5 hrs. you've been heads-down 2 hrs and it's been 4h since you ate — grab a bowl from Plantiful, you've got 700 cals left."*

No app to open. No dashboard to decode. Just a text that already did the thinking.

Built on **[Supermemory Local](https://supermemory.ai)** — the memory layer is the whole point, and it never leaves your machine.

---

## The thesis

Wearables sell **precision**. They do not sell **meaning**. Every year the sensor gets a better optical heart-rate array and a worse idea of what to tell you about it. You end up paying a subscription to be told your "readiness is 62" — a number derived from data you already own, delivered with the interpretive depth of a mood ring.

Healy inverts that. You already bought the sensor. The insight should be free — and it should come to you, phrased like a person, at the moment it's useful.

The trick that makes it more than a notification spammer is **memory**. A bot that reacts to today's numbers is a stats readout with extra steps. A bot that knows your baseline, your goals, what you ate three hours ago, and what you told it last night is a companion. That memory is Supermemory, running entirely local.

---

## Architecture

```
                                   ┌──────────────────────────────┐
                                   │        Insight Engine         │
   Telegram  ◄──── long-poll ────► │      (OpenAI, src/engine)     │
  (two-way,                        │  fuse → interpret → 1 action  │
   location)                       └───────────┬──────────────────┘
      ▲                                        │  recall / write
      │ send                    ┌──────────────┼───────────────────────────┐
      │                         ▼              ▼               ▼            ▼
 ┌────┴─────┐          ┌─────────────┐  ┌────────────┐  ┌───────────┐ ┌──────────┐
 │  Watcher │          │ Supermemory │  │   Google   │  │  Places   │ │ Calendar │
 │ proactive│          │    Local    │  │   Health   │  │   (New)   │ │ Nutrition│
 │  nudges  │          │  :6767      │  │   v4 API   │  │ text srch │ │  (json)  │
 └──────────┘          │ (semantic)  │  │  (Fitbit)  │  └───────────┘ └──────────┘
                       └─────────────┘  └────────────┘
```

Everything is plain ESM Node (`type: "module"`), zero build step, zero framework. Secrets live in `--env-file` files; nothing is hardcoded. The whole thing is ~10 small modules that each do one job and compose.

### The signal-fusion loop (the actual magic)

Every inbound message — text *or* location — runs through the same pipeline in `src/engine.js`:

1. **Recall** — semantic search against Supermemory for memories relevant to what you just said (`recall(userMessage)`).
2. **Snapshot** — pull live Fitbit data in parallel (`Promise.all` over sleep / steps / AZM / resting HR / workouts).
3. **Context assembly** — memories + Fitbit snapshot + calendar + nutrition + (optional) location & nearby places get flattened into one dense prompt block.
4. **Compose** — OpenAI generates a reply under a system prompt tuned hard against chatbot-voice (no "Hey Atharva! 🌟", no bullet lists, no motivational bows — lowercase, contractions, one emoji max, 1–3 sentences).
5. **Write-back** — the exchange is persisted to Supermemory as a `checkin` memory, so tomorrow's recall is smarter than today's.

That write-back step is why it compounds. Every conversation is training data for the next one, stored locally, retrieved by meaning rather than keyword.

---

## Why Supermemory is the hero

Strip Supermemory out and Healy degrades into a weather app for your body. Every genuinely personal thing it says is a memory retrieval:

| What Healy says | The memory behind it |
|---|---|
| *"better than your usual"* | computed `baseline` (rolling avg, we do the math deterministically) |
| *"fits your weight-cutting vibe"* | `goal` — recalled semantically, not hardcoded |
| *"you usually crash around 11:30"* | learned `pattern` |
| *"you had Chipotle for lunch, 700 cals left"* | `nutrition` entries + running budget |
| *"before your big demo"* | `calendar` context |
| *"yesterday you said you slept bad"* | prior `checkin`, written back automatically |

Memories are natural-language documents with scalar metadata (`type: goal|pattern|baseline|nutrition|checkin|event|profile`), scoped by `containerTag`, retrieved with **hybrid semantic search** (`searchMode: "hybrid"`, `threshold: 0.3`). Embeddings are the local `bge-base` model — **no data leaves the box.** A query like *"what are my health goals?"* returns the weight-loss memory at ~0.6 similarity despite sharing zero keywords. That's the entire product working.

**Design decision worth calling out:** we do *not* trust the LLM extraction layer to do arithmetic. Numbers ("down 30% vs baseline") are computed in code, deterministically, and *stored* as memories. Supermemory owns qualitative recall; our code owns math. Async "dreaming" extraction is great for "roommate was loud → recalled next morning," terrible for a trustworthy percentage.

---

## The integrations, in detail

### 🏃 Google Health (Fitbit) — `src/googleHealth.js`
Talks directly to `health.googleapis.com/v4`, reusing the Google Health MCP's stored OAuth creds and refreshing the access token on demand (cached until 60s before expiry). Three endpoint dialects, reverse-engineered against the live API:

- **`:reconcile`** (GET) — the cross-source stitched stream. This is the *only* path that returns sleep and daily-resting-heart-rate; the naive `list` endpoint returns empty for them (a genuine footgun — we found it the hard way).
- **`:dailyRollUp`** (POST, body `{range:{start:{date},end:{date}}}`) — steps, active-zone-minutes, distance. Watch the `windowSize * pageSize ≤ 90 days` limit or it 400s.
- **`list`** (GET) — raw exercise sessions.

Everything is normalized into insight-ready objects: sleep gets decomposed into stages + a **Healy Sleep Score** (0–100: 40% efficiency, 30% duration-vs-8h, 30% deep+REM proportion — transparent and deterministic, not a black box). Averages exclude the partial current day so *"better than your average"* is an honest comparison.

### 🧠 Supermemory — `src/memory.js`
Two functions, `remember(content, type)` and `recall(query)`, wrapping `POST /v3/documents` and `POST /v4/search` on `localhost:6767`. Local mode needs no auth. That's it. The simplicity is the point — the intelligence is in *what* we store and *when* we retrieve it.

### 📍 Location + Places — `src/places.js`, `src/location.js`
Telegram is the location source (a bot can't passively track you — Telegram removed the attachment-menu Location option in bot chats, so we send a `request_location` reply-keyboard button instead). Two modes, and the distinction matters:

- **Live location** streams an update every few seconds. Healy stores it **silently** — updates a last-known-position + a "how long stationary near this spot" haversine tracker. It never replies to a live update. (Early versions did. Ten Plantiful texts happened. It's debounced now.)
- **One-time pin** = an explicit "recommend something" → single reply.

Nearby healthy food comes from **Google Places API (New) `searchText`** querying *"healthy food restaurant"* with a location bias — because pure type-based Nearby Search misses the salad/poke/bowl spots. Results run through a keyword+type **health-scoring heuristic** that rewards `salad|poke|bowl|mediterranean|vegan|…` and penalizes `fried|hot chicken|burger|brewery|bar|…`, then drops anything clearly unhealthy. Reverse-geocoding turns lat/lng into *"Capitol Hill, Seattle."*

### 🍔 Nutrition — `src/nutrition.js`
Tracks meals, calories, and — critically — **time since last meal** and **calories remaining vs. daily target**. A week of realistic Seattle meals lives in `nutrition.json` (edit it live; the bot re-reads with no restart). This powers the flagship proactive moment: noticing you're low on fuel and haven't eaten, cross-referenced with location and how long you've been sitting.

### 📅 Calendar — `src/calendar.js`
Today/tomorrow's events feed context ("wind down, you've got a 9am"). Backed by `calendar.json` behind an interface identical to the real Google Calendar API — the swap to live OAuth is a one-function change (the health token lacks Calendar scope, so this is the honest stopgap).

### 📲 Telegram transport — `src/telegram.js`
Long-polling (`getUpdates`, 30s timeout) — **no webhook, no tunnel, fully local.** Skips backlog on boot so it only handles new messages. Handles text, one-time locations, and live locations distinctly via `live_period`. `askForLocation()` sends the tap-to-share button.

---

## Proactive intelligence — `src/watcher.js`

The part that makes Healy feel *alive*: it texts you first, but rarely, and only when it has a reason. A poll loop (default every 2 min) checks two triggers, each behind a cooldown so it never nags:

- **Post-workout** — a newly-synced Fitbit exercise fires a congrats + refuel tip that accounts for your remaining calories. (90-min cooldown. Note: Fitbit sync lags 15min–hrs, so this is honestly-delayed, not instant.)
- **Low fuel** — daytime only, when it's been >3h since your last meal *and* you have calories left *and* (bonus signal) you've been stationary in one spot a while: a gentle *"you've been heads-down and running low, grab something near you that fits your goal."* (120-min cooldown.)

State is primed on boot (existing workouts marked seen) so it reacts only to what happens *after* it starts.

---

## Module map

```
src/
├── config.js       user profile, timezones, targets, credential loading
├── googleHealth.js Fitbit v4 client — reconcile / rollup / list + Sleep Score
├── memory.js       Supermemory remember() / recall()
├── engine.js       the brain: chat(), chatWithLocation(), composeBeat()
├── places.js       Google Places text-search + health-scoring + geocoding
├── location.js     silent live-location store + haversine dwell tracking
├── nutrition.js    meals, calories remaining, time-since-last-meal
├── calendar.js     today/tomorrow events (Google Calendar-shaped interface)
├── telegram.js     long-poll transport, location button, send
├── bot.js          the live two-way loop (npm start)
├── watcher.js      proactive nudges (npm run watch)
├── seed.js         seed profile/goals/baselines/nutrition into memory
├── cli.js          chat with Healy in the terminal
└── beat.js         fire a proactive beat on demand
```

---

## Running it

**Prereqs:** Node 20+, [Supermemory Local](https://supermemory.ai/docs/self-hosting/quickstart) running on `:6767`, a Telegram bot token (via @BotFather), an OpenAI key, a Google Places API key, and Google Health OAuth (via the Google Health MCP).

```bash
npm install

# secrets (git-ignored)
echo 'OPENAI_API_KEY=sk-...'          > .env.local
echo 'GOOGLE_PLACES_API_KEY=AIza...' >> .env.local
printf 'TELEGRAM_BOT_TOKEN=...\nTELEGRAM_CHAT_ID=...\n' > .env.telegram

npm run seed          # load profile, goals, baselines, a week of nutrition into Supermemory
npm start             # the two-way bot goes live on Telegram
npm run watch         # (separately) proactive workout + hunger nudges

npm run chat -- "how did i sleep?"   # terminal chat, no Telegram
npm run beat -- gym                  # fire a proactive beat manually
```

Then text your bot. Ask it how you slept. Tell it you're stressed. Send it a location and watch it find you a bowl.

---

## Notable engineering footguns (documented so you don't rediscover them)

- **Sleep & resting-HR only exist on `:reconcile`, not `list`.** The obvious endpoint lies to you with an empty array.
- **`success: true` ≠ delivered.** (Learned from a *different* messaging platform whose free tier silently dropped API sends while returning 200s. Telegram doesn't do this. Telegram is honest.)
- **Live location will absolutely spam you** if you reply per update. Debounce or die.
- **Places Nearby Search under-returns healthy spots** vs. `searchText` with a "healthy" query. Fried chicken will out-rank salad unless you score against it.
- **Rollup queries 400** if `windowSize * pageSize > 90 days`.

---

## What's local vs. cloud

**Local:** Supermemory (storage, embeddings, semantic search — your entire health memory), the whole Node app, long-poll transport, all business logic. **Cloud:** OpenAI (composition), Google Health (your own Fitbit data), Google Places (public restaurant data), Telegram (transport). Your *memory* — the sensitive, cumulative model of you — never leaves the machine.

---

*Healy — you already bought the sensor. The insight should be free.*
