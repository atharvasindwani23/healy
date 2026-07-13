// Telegram transport — send messages and long-poll for incoming ones.
// Long polling means no public webhook/tunnel: fully local, on-theme.

import { TELEGRAM_TOKEN } from "./config.js";

const API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export async function sendMessage(chatId, text, extra = {}) {
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  return json.result;
}

// Send a message with a tap-to-share-location button.
// A reply-keyboard button with request_location:true is the ONLY reliable way to share
// location to a bot (the attachment-menu Location option is hidden in bot chats on newer apps).
export async function askForLocation(chatId, text = "Tap below to share where you are and I'll find something healthy nearby 📍") {
  return sendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[{ text: "📍 Share my location", request_location: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

// Long-poll loop. Calls onMessage({chatId, text, name}) for each incoming text.
export async function pollLoop(onMessage) {
  let offset = 0;
  // Skip backlog: start from the latest update so we only handle NEW messages.
  const init = await fetch(`${API}/getUpdates`).then((r) => r.json());
  if (init.ok && init.result.length) {
    offset = init.result[init.result.length - 1].update_id + 1;
  }

  console.log("Healy is listening on Telegram. Text your bot to chat. (Ctrl+C to stop)\n");
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30`);
      const json = await res.json();
      if (!json.ok) {
        await sleep(2000);
        continue;
      }
      for (const u of json.result) {
        offset = u.update_id + 1;
        const m = u.message || u.edited_message;
        if (!m) continue;
        // Location share takes priority over text.
        // live_period present => live location (streams updates); otherwise a one-time pin.
        if (m.location) {
          await onMessage({
            chatId: m.chat.id,
            name: m.chat.first_name,
            location: { lat: m.location.latitude, lng: m.location.longitude },
            isLive: Boolean(m.location.live_period),
          });
        } else if (m.text) {
          await onMessage({
            chatId: m.chat.id,
            text: m.text,
            name: m.chat.first_name,
          });
        }
      }
    } catch (e) {
      console.error("poll error:", e.message);
      await sleep(2000);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
