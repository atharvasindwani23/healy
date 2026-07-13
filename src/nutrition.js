// Nutrition module — tracks meals, calories, and "time since last meal".
// Backed by nutrition.json (edit it to play with scenarios). Same-shape swap for a real API later.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { USER } from "./config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function load() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "nutrition.json"), "utf8"));
  } catch {
    return { dailyTargetKcal: USER.calorieTarget, meals: [] };
  }
}

function todayStr() {
  // Local civil date. Uses the configured timezone offset loosely via local time.
  return new Date().toISOString().slice(0, 10);
}

export function getTodaysMeals(date = todayStr()) {
  const data = load();
  return data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function getDailyTarget() {
  return load().dailyTargetKcal || USER.calorieTarget;
}

// Calories eaten today, remaining vs target.
export function calorieStatus(date = todayStr()) {
  const meals = getTodaysMeals(date);
  const eaten = meals.reduce((s, m) => s + (m.calories || 0), 0);
  const target = getDailyTarget();
  return { eaten, target, remaining: target - eaten, mealCount: meals.length };
}

// Minutes since the last logged meal (null if none today). Uses the meal's local clock time.
export function minutesSinceLastMeal(date = todayStr()) {
  const meals = getTodaysMeals(date);
  if (!meals.length) return null;
  const last = meals[meals.length - 1];
  const [h, m] = last.time.split(":").map(Number);
  const now = new Date();
  const mealMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, nowMinutes - mealMinutes);
}

// Compact natural-language summary for the LLM prompt.
export function nutritionSummary(date = todayStr()) {
  const meals = getTodaysMeals(date);
  const { eaten, target, remaining } = calorieStatus(date);
  const sinceLast = minutesSinceLastMeal(date);
  const lines = [];
  if (meals.length) {
    lines.push(
      "Today's meals: " +
        meals.map((m) => `${m.meal} at ${m.time} — ${m.item} @ ${m.place} (${m.calories} cal)`).join("; ")
    );
  } else {
    lines.push("No meals logged today yet.");
  }
  lines.push(`Calories: ${eaten} eaten of ${target} target, ${remaining} remaining.`);
  if (sinceLast != null) {
    const hrs = Math.floor(sinceLast / 60);
    const mins = sinceLast % 60;
    lines.push(`Time since last meal: ${hrs ? hrs + "h " : ""}${mins}m.`);
  }
  return lines.join("\n");
}

// Recent history (for weekly context / patterns).
export function recentMealHistory(days = 7) {
  const data = load();
  return data.meals.slice(-days * 3);
}
