// Calendar module.
// NOTE: currently backed by a local calendar.json (the health OAuth token lacks Calendar scope).
// The interface below is identical to what a real Google Calendar API client would expose —
// to go live, replace loadEvents() with a fetch to
//   https://www.googleapis.com/calendar/v3/calendars/primary/events
// using a Calendar-scoped token. Nothing else changes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEvents() {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, "calendar.json"), "utf8"));
    return raw.events || [];
  } catch {
    return [];
  }
}

function sameDay(iso, day) {
  return iso.slice(0, 10) === day;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// Events for a given date (defaults today), sorted by start time.
export function getEvents(date = new Date()) {
  const day = ymd(date);
  return loadEvents()
    .filter((e) => sameDay(e.start, day))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function getTomorrowEvents() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return getEvents(t);
}

// Compact natural-language summary for the LLM prompt.
export function calendarSummary() {
  const today = getEvents();
  const tomorrow = getTomorrowEvents();
  const fmt = (e) => {
    const time = e.start.slice(11, 16);
    return `${time} ${e.title}${e.notes ? ` (${e.notes})` : ""}`;
  };
  const parts = [];
  parts.push(today.length ? `Today: ${today.map(fmt).join(", ")}` : "Today: nothing scheduled");
  parts.push(tomorrow.length ? `Tomorrow: ${tomorrow.map(fmt).join(", ")}` : "Tomorrow: nothing scheduled");
  return parts.join("\n");
}
