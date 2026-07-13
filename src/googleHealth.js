// Google Health client — talks directly to health.googleapis.com v4.
// Reuses the Google Health MCP's stored OAuth creds and refreshes the access token on demand.
//
// Endpoint shapes (verified against the live API):
//   reconcile  -> GET  .../dataTypes/{type}/dataPoints:reconcile?dataSourceFamily=...
//   dailyRollUp-> POST .../dataTypes/{type}/dataPoints:dailyRollUp  body: {dataSourceFamily, range:{start:{date},end:{date}}}
//   list       -> GET  .../dataTypes/{type}/dataPoints?pageSize=N

import { readGoogleHealthCreds } from "./config.js";

const BASE = "https://health.googleapis.com/v4/users/me";
const ALL_SOURCES = "users/me/dataSourceFamilies/all-sources";

let cachedToken = null;
let cachedExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;
  const { clientId, clientSecret, refreshToken } = readGoogleHealthCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  cachedToken = json.access_token;
  cachedExpiry = Date.now() + (json.expires_in ?? 3600) * 1000;
  return cachedToken;
}

async function authed(url, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Health ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function ymd(d) {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// --- Reconcile (stitched cross-source stream): sleep, resting HR ---
async function reconcile(type) {
  const url = `${BASE}/dataTypes/${type}/dataPoints:reconcile?dataSourceFamily=${encodeURIComponent(ALL_SOURCES)}`;
  const json = await authed(url);
  return json.dataPoints || [];
}

// --- Daily rollup: steps, active-zone-minutes, distance ---
async function dailyRollup(type, startDate, endDate) {
  const url = `${BASE}/dataTypes/${type}/dataPoints:dailyRollUp`;
  const json = await authed(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataSourceFamily: ALL_SOURCES,
      range: { start: { date: ymd(startDate) }, end: { date: ymd(endDate) } },
    }),
  });
  return json.rollupDataPoints || [];
}

// --- List raw points: exercise sessions ---
async function list(type, pageSize = 10) {
  const url = `${BASE}/dataTypes/${type}/dataPoints?pageSize=${pageSize}`;
  const json = await authed(url);
  return json.dataPoints || [];
}

// ---------- Normalized, insight-ready getters ----------

// Most recent night of sleep, summarized into plain numbers + a Healy Sleep Score.
export async function getLastNightSleep() {
  const points = await reconcile("sleep");
  if (!points.length) return null;
  // Points come newest-first; take the most recent session.
  const s = points[0].sleep;
  const sum = s.summary || {};
  const asleep = Number(sum.minutesAsleep || 0);
  const inBed = Number(sum.minutesInSleepPeriod || 0);
  const stages = {};
  for (const st of sum.stagesSummary || []) stages[st.type] = Number(st.minutes);
  const efficiency = inBed ? Math.round((asleep / inBed) * 100) : 0;
  return {
    date: s.interval?.endTime?.slice(0, 10),
    minutesAsleep: asleep,
    minutesInBed: inBed,
    efficiency,
    deepMin: stages.DEEP || 0,
    remMin: stages.REM || 0,
    lightMin: stages.LIGHT || 0,
    awakeMin: stages.AWAKE || 0,
    score: sleepScore({ efficiency, asleep, deep: stages.DEEP || 0, rem: stages.REM || 0 }),
  };
}

// Transparent 0-100 "Healy Sleep Score": 40% efficiency, 30% duration vs 8h, 30% deep+REM proportion.
export function sleepScore({ efficiency, asleep, deep, rem }) {
  const effComponent = Math.min(efficiency, 100) * 0.4;
  const durComponent = Math.min(asleep / 480, 1) * 100 * 0.3;
  const restorative = asleep ? (deep + rem) / asleep : 0; // healthy ~0.4-0.5
  const restComponent = Math.min(restorative / 0.45, 1) * 100 * 0.3;
  return Math.round(effComponent + durComponent + restComponent);
}

// Daily steps for the last N days -> [{date, steps}] sorted oldest-first (today last).
export async function getSteps(days = 7) {
  const points = await dailyRollup("steps", daysAgo(days), daysAgo(-1));
  return points
    .map((p) => ({
      date: `${p.civilStartTime.date.year}-${String(p.civilStartTime.date.month).padStart(2, "0")}-${String(p.civilStartTime.date.day).padStart(2, "0")}`,
      steps: Number(p.steps?.countSum || 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Active Zone Minutes for the last N days, sorted oldest-first (today last).
export async function getActiveZoneMinutes(days = 7) {
  const points = await dailyRollup("active-zone-minutes", daysAgo(days), daysAgo(-1));
  return points
    .map((p) => {
      const a = p.activeZoneMinutes || {};
      return {
        date: `${p.civilStartTime.date.year}-${String(p.civilStartTime.date.month).padStart(2, "0")}-${String(p.civilStartTime.date.day).padStart(2, "0")}`,
        fatBurn: Number(a.sumInFatBurnHeartZone || 0),
        cardio: Number(a.sumInCardioHeartZone || 0),
        peak: Number(a.sumInPeakHeartZone || 0),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Recent resting heart rate readings.
export async function getRestingHeartRate() {
  const points = await reconcile("daily-resting-heart-rate");
  return points.map((p) => ({
    date: `${p.dailyRestingHeartRate.date.year}-${String(p.dailyRestingHeartRate.date.month).padStart(2, "0")}-${String(p.dailyRestingHeartRate.date.day).padStart(2, "0")}`,
    bpm: Number(p.dailyRestingHeartRate.beatsPerMinute),
    method: p.dailyRestingHeartRate.dailyRestingHeartRateMetadata?.calculationMethod,
  }));
}

// Recent workouts.
export async function getWorkouts(count = 5) {
  const points = await list("exercise", count);
  return points.map((p) => {
    const e = p.exercise;
    const m = e.metricsSummary || {};
    return {
      type: e.displayName || e.exerciseType,
      start: e.interval?.startTime,
      durationMin: Math.round(Number(e.activeDuration?.replace("s", "") || 0) / 60),
      calories: m.caloriesKcal,
      steps: Number(m.steps || 0),
      avgHeartRate: Number(m.averageHeartRateBeatsPerMinute || 0),
      activeZoneMinutes: Number(m.activeZoneMinutes || 0),
    };
  });
}

// One-shot snapshot the insight engine can reason over.
export async function getSnapshot() {
  const [sleep, steps, azm, rhr, workouts] = await Promise.all([
    getLastNightSleep(),
    getSteps(7),
    getActiveZoneMinutes(7),
    getRestingHeartRate(),
    getWorkouts(3),
  ]);
  // Average excludes today (partial) so "better than your average" is a fair comparison.
  const todaySteps = steps.length ? steps[steps.length - 1].steps : 0;
  const priorDays = steps.slice(0, -1).map((s) => s.steps).filter((n) => n > 0);
  const avgSteps = priorDays.length ? Math.round(priorDays.reduce((a, b) => a + b, 0) / priorDays.length) : 0;
  return { sleep, steps, todaySteps, avgSteps, azm, restingHeartRate: rhr, workouts };
}
