// CLI tester — chat with Healy in the terminal without Telegram.
// Usage: npm run chat -- "how did I sleep last night?"

import { chat } from "./engine.js";

const message = process.argv.slice(2).join(" ") || "How am I doing today?";
console.log(`\nYou: ${message}\n`);
const reply = await chat(message);
console.log(`Healy: ${reply}\n`);
