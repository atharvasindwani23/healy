# Pulse — the health bot that *remembers* you

> A texting-first health companion that turns raw wearable data into plain-language insight and one concrete action — and gets smarter every day because it remembers your body, your goals, and your life.

**Built for the Supermemory Local Hackathon (July 9–13).**
Solo project · TypeScript/Node · Real SMS · 100% local memory layer.

---

## The problem

Wearables sell **precision**, not **meaning**. The more you pay, the more exact the numbers — and the less you understand them. "You got 2h of REM and 55m of deep sleep" is data, not insight. Worse, once you've already bought the device, the *interpretation* is locked behind another monthly subscription (Fitbit Premium, Oura, Whoop).

You end up with a pile of numbers you don't understand and no idea what to actually **do**.

## The idea

**Pulse** is a bot that texts you like a friend throughout your day. No app to open — advice arrives as a text you read in 2 seconds. It:

- **Translates** your data into plain meaning + **one** concrete action.
- **Remembers** — your baselines, your goals, what it told you yesterday, when you usually sleep.
- **Encourages**, not just corrects — "great day, only 1,000 steps left 💪" matters as much as "maybe skip the midnight run to Dave's."
- **Checks in with context** — knows roughly where you are and what you're doing, and times advice to the moment.

## Why Supermemory is the hero 🦸

A health bot that only reacts to *today's* numbers is forgettable. A health bot that **remembers** is the entire product. Every genuinely useful thing Pulse says is only possible because of the local memory layer:

| What Pulse says | What it had to *remember* |
|---|---|
| "Your deep sleep is down 30% vs your usual." | your rolling personal **baseline** |
| "Since you're cutting weight, grab something lighter." | your stated **goal** |
| "Yesterday you said you slept badly — better tonight?" | **past conversation** |
| "You usually sleep around now, and you've got that meeting." | learned **bedtime pattern** + calendar |
| "You've hit your step goal 4 days running — nice streak." | **historical trend** |

Supermemory Local stores all of it — embeddings, storage, and semantic search, entirely on-device. It's not a passive database; it's what makes the bot feel like it *knows you*. Strip it out and Pulse is just a fancy stats readout.

---

## Architecture

```
  Fitbit ──► Google Health MCP ──► Insight Engine (LLM) ──► Twilio SMS ──► your phone
                                          ▲   │
                                          │   ▼
                                   Supermemory Local
                            (baselines · goals · past chats ·
                             sleep/step patterns · what it told you before)
```

**Flow of a single nudge:**
1. A **trigger** fires (scheduled beat, or an inbound text from you).
2. Pulse pulls the relevant **live data** from the Google Health MCP (sleep, steps, resting HR, active minutes).
3. It **recalls** relevant memories from Supermemory (your baseline for this metric, your goals, recent check-ins).
4. The **Insight Engine** (LLM) fuses live data + memory + current context into *meaning + one action*.
5. It **sends an SMS** via Twilio.
6. It **writes back** to Supermemory — what it observed, what it advised, how you replied — so tomorrow is smarter.

### Components

| Component | Tech | Role |
|---|---|---|
| **Data source** | Google Health MCP (already working) | Real Fitbit sleep, steps, resting HR, AZM |
| **Memory** | Supermemory Local | Baselines, goals, conversation history, patterns |
| **Insight Engine** | Claude (LLM) | Data + memory + context → meaning + one action |
| **Messaging** | Twilio SMS | Two-way texting, the Poke-style interface |
| **Orchestrator** | Node/TS service | Triggers, context object, glue |
| **Demo clock** | Scripted scene runner | Fires the 4 demo beats on a compressed timeline |

---

## The demo (this is the 3-min video)

A compressed "day in the life." **The data and reasoning are real** (real Fitbit data, real LLM insight, real memory recall); the *time-of-day transitions and location are staged* for the video — standard for ambient-AI demos. Each beat is designed to visibly show **memory doing work**.

**🌅 Scene 1 — Morning (wake up)**
> *Pulse texts:* "Morning Atharva ☀️ You slept 7h25m at 98% efficiency — that's **better than your 3-day average**, and your deep sleep was strong. Hope you dreamt about something good. Sleep score: 88/100."
>
> *Memory in action:* "better than your average" requires the stored baseline.

**🏢 Scene 2 — Midday (office)**
> *Pulse texts:* "You've been heads-down at the office ~3 hrs. Hydrate 💧 And since you're **cutting weight this month**, when you grab lunch near you, aim for protein + greens — skip the heavy carbs. You're at 4,200 steps."
>
> *Memory in action:* recalls the weight-loss goal + ties advice to rough location.

**🏋️ Scene 3 — Post-gym**
> *Pulse texts:* "Great session — 30 active-zone minutes, all fat-burn. Refuel with ~25g protein in the next hour. One tip: you've been all fat-burn zone lately; add one short push into cardio zone next time to build your engine."
>
> *Memory in action:* compares today's zones against the remembered pattern.

**🌙 Scene 4 — Night (wind-down)**
> *Pulse texts:* "Hey Atharva — you've got that meeting tomorrow, and you usually wind down around now. Let's protect it: phone down, hot shower, moisturize, lights out. You crushed today — only 1,000 steps to close your ring if you want a quick walk first 🚶"
>
> *Memory in action:* learned bedtime pattern + tomorrow's calendar + the day's step progress.

**Reply beat (shows two-way + memory write):** You text back "slept badly, roommate was loud." Pulse acknowledges, and **stores it** — so tomorrow's morning text references it. That closing loop is the money shot for a *memory* hackathon.

---

## What's real vs. staged (honest scoping)

Being upfront so the build stays achievable in ~2.5 days:

| Piece | v1 for the demo |
|---|---|
| Fitbit data | **Real** — via the working Google Health MCP |
| Insight generation | **Real** — live LLM calls |
| Memory (baseline/goals/history) | **Real** — Supermemory Local |
| SMS | **Real** — Twilio to an actual phone |
| Time-of-day beats | **Staged** — a scene runner fires them on a compressed clock |
| Location | **Simplified** — on-demand phone location or a set demo location per scene; **no** 24/7 background GPS, **no** "detect which app you opened" (impossible on iOS anyway) |

This keeps every *claim in the video truthful* while skipping the production-only plumbing (background-location entitlements, App Store review) that a hackathon doesn't need.

---

## Supermemory schema (draft)

Memories are written as tagged, searchable entries. Rough shape:

- **`baseline`** — rolling stats per metric. e.g. `{ metric: "deep_sleep_min", avg_3d: 77, avg_7d: 74 }`
- **`goal`** — user objectives. e.g. `"Atharva wants to lose weight this month; prefers high-protein."`
- **`pattern`** — learned rhythms. e.g. `"Usually asleep by ~11:30pm; wakes ~7am."`
- **`checkin`** — conversation turns. e.g. `"Jul 11 night: user said slept badly, roommate loud."`
- **`event`** — logged happenings. e.g. `"Jul 11: gym session, 30 AZM fat-burn."`
- **`profile`** — stable facts. e.g. `"Age 20. Fitbit user. Timezone America/Los_Angeles."`

On each interaction Pulse does a **semantic search** over these to assemble the context it needs, then **adds** new memories after responding.

---

## Build plan (~2.5 days, solo)

Today is **July 11**. Deadline **July 13, 23:59 PST**. Commit history is checked — build in-window.

### Day 1 (rest of today) — Core insight engine + memory
- [ ] Repo scaffold (public GitHub, TS/Node), env config
- [ ] Wire Google Health MCP: pull sleep (reconcile), steps/AZM (daily rollup), resting HR (reconcile)
- [ ] Stand up **Supermemory Local**; write the schema above; seed profile + goal
- [ ] Insight Engine v1: `data + memories → { message, action }` via LLM prompt
- [ ] Baseline job: compute rolling averages, store as `baseline` memories
- [ ] **Milestone:** run a script → get a real morning-sleep insight in the terminal that references the baseline

### Day 2 — Texting + the loop + context
- [ ] Twilio: send SMS; receive inbound (webhook) for two-way
- [ ] On inbound text → recall memory → respond → **write** the reply to memory
- [ ] Add rough location/context into the prompt (per-scene demo value)
- [ ] The 4 insight "beats" as callable functions (morning/midday/gym/night)
- [ ] **Milestone:** text the bot from your phone, get a memory-aware reply

### Day 3 (until 23:59 PST) — Demo polish + submission
- [ ] Scene runner: fire the 4 beats on a compressed clock for filming
- [ ] Tune prompts so each text is tight, warm, specific, one-action
- [ ] Verify the "slept badly → referenced next morning" memory loop on camera
- [ ] Record ≤3-min demo video (the day-in-the-life arc above)
- [ ] Clean README, push public repo
- [ ] **Submit:** Google Form + `#showcase` post (both required by deadline)

---

## Judging fit (why this can win)

- **Meaningfully uses Supermemory Local** — memory isn't a feature, it's the reason the bot works. Directly addresses the core rule.
- **Emotional hook** — a bot that texts you about your health and remembers your bad night lands with judges and People's Choice voters alike.
- **Real, working data** — not a mockup; it reads an actual Fitbit and says true things.
- **Clean 3-min story** — the day-in-the-life arc is inherently watchable.

---

## Setup (to be filled in as built)

```bash
# Prereqs: Node 20+, a Twilio number, Supermemory Local running, Google Health MCP configured
git clone <repo>
cd pulse
npm install
cp .env.example .env   # add Twilio + Supermemory + Google Health creds
npm run dev
```

## Stretch goals (only if ahead of schedule)

- Real phone geofence for one live "you're near X" nudge
- Calendar (Google Calendar API — the easy integration) for real "meeting tomorrow"
- Nutrition logging (Google Health already supports it) to connect food → energy/sleep
- Weekly digest text summarizing trends from memory

---

## Non-goals (explicitly out of scope for the hackathon)

- 24/7 background location tracking
- Detecting which apps you open (impossible on iOS)
- Any medical/diagnostic claims — Pulse is a wellness coach, not a doctor
- Multi-user accounts, billing, production privacy infra

---

*Pulse — you already bought the sensor. The insight should be free.*
