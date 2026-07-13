// Proactive "beat" runner — fires one of the demo's scheduled nudges and texts it to the user.
// Usage: npm run beat -- morning|midday|gym|night   (or pass a custom instruction)

import { composeBeat } from "./engine.js";
import { sendMessage } from "./telegram.js";
import { TELEGRAM_CHAT_ID } from "./config.js";

const BEATS = {
  morning: "It's the morning right after Atharva woke up. Give a warm sleep recap using last night's data, compare to his usual, and one tip for the day.",
  midday: "It's midday and Atharva has been working for a few hours. Nudge him to hydrate and, tying to his weight-loss goal, suggest a healthy lunch approach. Mention his step progress.",
  gym: "Atharva just finished a workout. Congratulate him using the most recent workout data, give a refuel tip, and one way to make the next session better.",
  night: "It's late evening near Atharva's usual bedtime and he has a meeting tomorrow. Encourage him to wind down with a specific routine, and note his step progress for the day.",
};

const arg = process.argv.slice(2).join(" ") || "morning";
const instruction = BEATS[arg] || arg;

const text = await composeBeat(instruction);
console.log(`\n[beat: ${arg}]\n${text}\n`);
await sendMessage(TELEGRAM_CHAT_ID, text);
console.log("Sent to Telegram.");
