// The Insight Engine — Healy's brain.
// Fuses (a) the user's message, (b) recalled memories, and (c) live Fitbit data
// into a warm, specific, one-action reply. Then writes new memory so tomorrow is smarter.

import OpenAI from "openai";
import { OPENAI_MODEL, USER } from "./config.js";
import { recall, remember } from "./memory.js";
import { getSnapshot } from "./googleHealth.js";
import { calendarSummary } from "./calendar.js";
import { describeLocation, healthyPlacesNearby, placesSummary } from "./places.js";
import { nutritionSummary } from "./nutrition.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM = `You are Healy — you text ${USER.name} like a close friend who happens to know a lot about health. Not an assistant. Not a coach with a clipboard. A friend.

How you text:
- Talk like a real person texting: casual, relaxed, lowercase is fine, contractions always.
- SHORT. Usually 1-3 sentences. Sometimes just one line. This is a text, not a health report.
- At most ONE emoji, and often none. Never lead with "Hey ${USER.name}!" + emoji — that's the robot tell.
- No cheerleading ("stellar!", "amazing!", "great job!!"), no exclamation-point spam, no bullet lists.
- Drop numbers naturally, the way a friend would ("you actually slept solid last night — like 7.5 hrs") not like a dashboard ("7.7h, 100% efficiency, score 99/100").
- Don't over-explain or wrap up with a motivational bow. Real friends just... stop texting.
- It's fine to be a little dry, a little funny, ask a quick question back.

What you're doing underneath:
- Turn the data into MEANING and, when it helps, ONE doable nudge. But don't force a tip into every message.
- Use MEMORIES so you sound like you actually know him — his goals, his patterns, what he told you before.
- Use the DATA for real specifics. If it's missing, don't make it up.
- You're a friend, not a doctor. No diagnoses; if something sounds medical, tell him to get it checked.

Example of the vibe you want:
BAD: "Hey Atharva! 🌟 You got 7.7 hours of sleep with 100% efficiency and a stellar Healy Sleep Score of 99/100! Keep up the great work! 😊"
GOOD: "slept really well last night — like 7.5 solid hours, barely woke up. you've got a good streak going. how you feeling?"`;

// Build a compact, readable snapshot string for the prompt.
function formatData(snap) {
  const lines = [];
  if (snap.sleep) {
    const s = snap.sleep;
    lines.push(
      `Last night sleep: ${(s.minutesAsleep / 60).toFixed(1)}h asleep, ${s.efficiency}% efficiency, ${s.deepMin}m deep, ${s.remMin}m REM, ${s.awakeMin}m awake. Healy Sleep Score ${s.score}/100.`
    );
  }
  if (snap.steps?.length) {
    lines.push(`Steps today so far: ${snap.todaySteps.toLocaleString()}. Recent daily average (excluding today): ${snap.avgSteps.toLocaleString()}/day.`);
  }
  const azmToday = snap.azm?.[snap.azm.length - 1];
  if (azmToday) {
    lines.push(`Active Zone Minutes today: ${azmToday.fatBurn} fat-burn, ${azmToday.cardio} cardio, ${azmToday.peak} peak.`);
  }
  const rhr = snap.restingHeartRate?.[0];
  if (rhr) lines.push(`Latest resting heart rate: ${rhr.bpm} bpm.`);
  if (snap.workouts?.length) {
    const w = snap.workouts[0];
    lines.push(`Most recent workout: ${w.type}, ${w.durationMin}min, ${w.calories}cal, avg HR ${w.avgHeartRate}, ${w.activeZoneMinutes} AZM.`);
  }
  return lines.join("\n") || "No recent data available.";
}

// Main entry: given a user's text, produce Healy's reply.
// includeData=false skips the (slower) Fitbit fetch for quick conversational turns.
export async function chat(userMessage, { includeData = true } = {}) {
  const memories = await recall(userMessage).catch(() => []);
  let dataBlock = "(live data not fetched for this turn)";
  if (includeData) {
    try {
      dataBlock = formatData(await getSnapshot());
    } catch (e) {
      dataBlock = `(couldn't fetch live data: ${e.message})`;
    }
  }

  const context = `MEMORIES about ${USER.name} (from Supermemory):
${memories.length ? memories.map((m) => "- " + m).join("\n") : "- (none found)"}

LIVE FITBIT DATA:
${dataBlock}

CALENDAR:
${calendarSummary()}

NUTRITION TODAY:
${nutritionSummary()}

${USER.name} just texted you:
"${userMessage}"

Reply as Healy.`;

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    temperature: 0.85,
    max_tokens: 250,
  });

  const reply = completion.choices[0].message.content.trim();

  // Write the exchange back to memory so future turns recall it.
  await remember(`${USER.name} texted: "${userMessage}" — Healy replied: "${reply}"`, "checkin").catch(() => {});

  return reply;
}

// Location-aware reply: user shared a location pin. Recommend a nearby healthy spot in context.
export async function chatWithLocation(lat, lng, note = "") {
  const [area, places, snap, memories] = await Promise.all([
    describeLocation(lat, lng),
    healthyPlacesNearby(lat, lng),
    getSnapshot().catch(() => null),
    recall("food goals and location preferences").catch(() => []),
  ]);

  const context = `MEMORIES about ${USER.name}:
${memories.length ? memories.map((m) => "- " + m).join("\n") : "- (none)"}

LIVE FITBIT DATA:
${snap ? formatData(snap) : "(unavailable)"}

CALENDAR:
${calendarSummary()}

LOCATION: ${USER.name} just shared his location${area ? ` — around ${area}` : ""}.
HEALTHY SPOTS NEARBY: ${placesSummary(places)}

${note ? `Context: ${note}\n` : ""}Text ${USER.name} a quick, natural suggestion for a healthy nearby option that fits his goals. Mention a specific place by name. Keep it short and friend-like.`;

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    temperature: 0.85,
    max_tokens: 250,
  });
  const reply = completion.choices[0].message.content.trim();
  await remember(`${USER.name} shared location${area ? ` near ${area}` : ""}. Healy suggested: "${reply}"`, "event").catch(() => {});
  return reply;
}

// Proactive beat: no user message, just an instruction for what nudge to compose.
export async function composeBeat(instruction) {
  const snap = await getSnapshot().catch(() => null);
  const memories = await recall(instruction).catch(() => []);
  const context = `MEMORIES about ${USER.name}:
${memories.length ? memories.map((m) => "- " + m).join("\n") : "- (none)"}

LIVE FITBIT DATA:
${snap ? formatData(snap) : "(unavailable)"}

CALENDAR:
${calendarSummary()}

NUTRITION TODAY:
${nutritionSummary()}

Compose a proactive text to ${USER.name} for this moment: ${instruction}
Reply as Healy (just the text you'd send).`;

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    temperature: 0.85,
    max_tokens: 250,
  });
  return completion.choices[0].message.content.trim();
}
