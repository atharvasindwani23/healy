// Seed Healy's memory with profile facts, goals, and computed baselines from real Fitbit history.
// Run once before demoing so the bot has personal context + baselines to compare against.
// Usage: npm run seed

import { remember } from "./memory.js";
import { getSnapshot, sleepScore } from "./googleHealth.js";
import { USER } from "./config.js";
import { recentMealHistory, getDailyTarget } from "./nutrition.js";

async function main() {
  console.log("Seeding Healy memory for", USER.name, "...\n");

  // --- Stable profile + goals (the qualitative context that makes replies personal) ---
  const facts = [
    ["profile", `${USER.name} is 20 years old, uses a Fitbit, and lives in the ${USER.timezone} timezone. Sleep target is 8 hours.`],
    ["goal", `${USER.name} wants to lose weight this month and prefers high-protein meals.`],
    ["goal", `${USER.name} is trying to build cardiovascular fitness and add more moderate/cardio-zone exercise, not just steps.`],
    ["pattern", `${USER.name} usually winds down and falls asleep around 11:30pm and wakes around 7am.`],
  ];
  for (const [type, content] of facts) {
    await remember(content, type);
    console.log(`  [${type}] ${content}`);
  }

  // --- Computed baselines from real recent data (we own the math; deterministic + trustworthy) ---
  const snap = await getSnapshot();

  if (snap.avgSteps) {
    const c = `${USER.name}'s baseline: averages about ${snap.avgSteps.toLocaleString()} steps per day over the last week.`;
    await remember(c, "baseline");
    console.log(`  [baseline] ${c}`);
  }

  // Sleep baseline needs multiple nights; we approximate from what we have and store the latest as reference.
  if (snap.sleep) {
    const c = `${USER.name}'s recent sleep reference: last night ${Math.round(snap.sleep.minutesAsleep / 60 * 10) / 10}h asleep, ${snap.sleep.efficiency}% efficiency, ${snap.sleep.deepMin}m deep, ${snap.sleep.remMin}m REM, Healy Sleep Score ${snap.sleep.score}.`;
    await remember(c, "baseline");
    console.log(`  [baseline] ${c}`);
  }

  const rhr = snap.restingHeartRate?.filter((r) => r.method === "WITH_SLEEP");
  if (rhr?.length) {
    const avg = Math.round(rhr.reduce((a, b) => a + b.bpm, 0) / rhr.length);
    const c = `${USER.name}'s baseline resting heart rate is about ${avg} bpm (measured during sleep).`;
    await remember(c, "baseline");
    console.log(`  [baseline] ${c}`);
  }

  // --- Nutrition history as a dedicated memory type ---
  const meals = recentMealHistory(7);
  for (const m of meals) {
    const c = `${USER.name} ate ${m.item} from ${m.place} for ${m.meal} on ${m.date} (${m.calories} cal).`;
    await remember(c, "nutrition");
  }
  console.log(`  [nutrition] seeded ${meals.length} meals from the past week`);

  // A pattern memory the LLM can lean on for food advice.
  await remember(
    `${USER.name} often eats a double-egg bagel sandwich from Eltana for breakfast (~600 cal) and Chipotle chicken burrito bowls for lunch (~1000 cal). Daily calorie target is ${getDailyTarget()}.`,
    "pattern"
  );
  console.log("  [pattern] seeded eating habits");

  console.log("\nDone. Memory seeded.");
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
