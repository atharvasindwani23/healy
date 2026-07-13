// Healy — the live two-way bot.
// Listens on Telegram, runs each incoming message through the Insight Engine, replies.
// Usage: npm start

import { pollLoop, sendMessage, askForLocation } from "./telegram.js";
import { chat, chatWithLocation } from "./engine.js";
import { setLocation } from "./location.js";

// Phrases that should trigger the share-location button.
const LOCATION_INTENT = /(where.*(eat|lunch|dinner|food)|near ?me|healthy.*(near|around|spot|place)|places? (near|around)|\/location)/i;

async function handle({ chatId, text, name, location, isLive }) {
  try {
    if (location) {
      // Always update the stored position (used by the proactive watcher).
      setLocation(location.lat, location.lng, isLive);
      if (isLive) {
        // Live location streams updates every few seconds — store SILENTLY, never reply per update.
        console.log(`[${name}] 📍 live location update (silent): ${location.lat}, ${location.lng}`);
        return;
      }
      // One-time pin => the user actively wants a recommendation now.
      console.log(`\n[${name}] 📍 shared pin: ${location.lat}, ${location.lng}`);
      const reply = await chatWithLocation(location.lat, location.lng);
      console.log(`[Healy] ${reply}`);
      await sendMessage(chatId, reply);
      return;
    }
    console.log(`\n[${name}] ${text}`);
    // If they're asking about nearby food/places, offer the tap-to-share button.
    if (LOCATION_INTENT.test(text)) {
      await askForLocation(chatId);
      console.log(`[Healy] (sent location-share button)`);
      return;
    }
    const reply = await chat(text);
    console.log(`[Healy] ${reply}`);
    await sendMessage(chatId, reply);
  } catch (e) {
    console.error("handle error:", e.message);
    await sendMessage(chatId, "Sorry, I hit a snag pulling that together — try me again in a sec.");
  }
}

pollLoop(handle).catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
