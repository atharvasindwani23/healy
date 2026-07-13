// Proactive watcher — Healy texts you UNPROMPTED, but INFREQUENTLY, on two triggers:
//   1. A new workout synced from Fitbit  -> congrats + refuel tip
//   2. You haven't eaten in a while + calories left + sitting in one spot -> gentle "grab a bite" nudge
//
// Guardrails so it never spams:
//   - Each trigger type has a cooldown (default 90 min).
//   - Food nudge only fires during daytime, when it's been >Xh since last meal.
//   - Uses your last shared location (live location stored silently by the bot) if available.
//
// Run alongside the chat bot:  npm run watch   (best: run `npm start` AND `npm run watch`)

import { getWorkouts, getSteps } from "./googleHealth.js";
import { composeBeat } from "./engine.js";
import { remember } from "./memory.js";
import { sendMessage } from "./telegram.js";
import { calorieStatus, minutesSinceLastMeal } from "./nutrition.js";
import { getLocation, minutesAtCurrentSpot } from "./location.js";
import { describeLocation } from "./places.js";
import { TELEGRAM_CHAT_ID, USER } from "./config.js";

const POLL_MS = Number(process.env.WATCH_POLL_MS || 120_000); // check every 2 min
const WORKOUT_COOLDOWN = 90 * 60_000;
const FOOD_COOLDOWN = 120 * 60_000;
const HUNGRY_AFTER_MIN = 180; // 3h since last meal
const SITTING_MIN = 45; // been in one spot at least this long

const seenWorkouts = new Set();
let lastWorkoutText = 0;
let lastFoodText = 0;

async function primeState() {
  try {
    (await getWorkouts(10)).forEach((w) => w.start && seenWorkouts.add(w.start));
  } catch {}
}

async function checkWorkouts() {
  if (Date.now() - lastWorkoutText < WORKOUT_COOLDOWN) return;
  const workouts = await getWorkouts(5);
  for (const w of workouts) {
    if (!w.start || seenWorkouts.has(w.start)) continue;
    seenWorkouts.add(w.start);
    console.log(`\n[watcher] new workout: ${w.type} (${w.durationMin}min)`);
    const text = await composeBeat(
      `${USER.name} just finished a ${w.type} (${w.durationMin} min, ${w.activeZoneMinutes} active-zone min, ${w.calories} cal). Quick congrats + one refuel tip, factoring in his remaining calories today. Friend texting, short.`
    );
    lastWorkoutText = Date.now();
    await deliver(text, `proactive: reacted to a finished ${w.type} workout`);
    return; // one at a time
  }
}

async function checkHunger() {
  if (Date.now() - lastFoodText < FOOD_COOLDOWN) return;
  const hour = new Date().getHours();
  if (hour < 10 || hour > 21) return; // daytime only

  const sinceMeal = minutesSinceLastMeal();
  if (sinceMeal == null || sinceMeal < HUNGRY_AFTER_MIN) return;

  const { remaining } = calorieStatus();
  if (remaining < 200) return; // no budget left -> don't push food

  const loc = getLocation();
  const sitting = minutesAtCurrentSpot();
  let area = null;
  if (loc) area = await describeLocation(loc.lat, loc.lng).catch(() => null);

  const contextBits = [
    `It's been about ${Math.floor(sinceMeal / 60)}h since ${USER.name} last ate`,
    `he has ~${remaining} calories left today`,
    area ? `he's around ${area}` : null,
    sitting != null && sitting >= SITTING_MIN ? `he's been in one spot working for ~${sitting} min` : null,
  ].filter(Boolean);

  console.log(`\n[watcher] hunger nudge: ${contextBits.join("; ")}`);
  const text = await composeBeat(
    `${contextBits.join(". ")}. Gently nudge him to take a short break and grab a healthy bite that fits his remaining calories and weight goal${area ? ", ideally something near him" : ""}. Warm, brief, friend-like. Frame it like you noticed he's been heads-down and low on fuel.`
  );
  lastFoodText = Date.now();
  await deliver(text, `proactive: noticed ${USER.name} hadn't eaten in ${Math.floor(sinceMeal / 60)}h`);
}

async function deliver(text, memoryNote) {
  console.log(`[Healy → you] ${text}`);
  await sendMessage(TELEGRAM_CHAT_ID, text);
  await remember(`${memoryNote}. Healy texted: "${text}"`, "event").catch(() => {});
}

async function loop() {
  await primeState();
  console.log(`[watcher] running. polling every ${POLL_MS / 1000}s. workout cooldown ${WORKOUT_COOLDOWN / 60000}m, food cooldown ${FOOD_COOLDOWN / 60000}m.`);
  while (true) {
    try {
      await checkWorkouts();
      await checkHunger();
    } catch (e) {
      console.error("[watcher] error:", e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
