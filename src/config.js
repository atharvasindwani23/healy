// Central config + shared constants for Healy.
// Secrets come from env files (loaded via node --env-file); nothing sensitive is hardcoded here.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const USER = {
  name: "Atharva",
  containerTag: "atharva", // Supermemory scope — single-user demo
  timezone: "America/Chicago", // Fitbit data is UTC-5/6; used for civil-day math + display
  sleepTargetMin: 480, // 8h target for a 20-year-old
  calorieTarget: 2300, // daily intake target (overridden by nutrition.json dailyTargetKcal if present)
};

export const SUPERMEMORY_URL =
  process.env.SUPERMEMORY_URL || "http://localhost:6767";

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Google Health OAuth lives in the MCP's local config/token files.
// We reuse them directly so Healy shares the same authenticated session.
const GH_DIR = join(homedir(), ".google-health-mcp");

export function readGoogleHealthCreds() {
  const config = JSON.parse(readFileSync(join(GH_DIR, "config.json"), "utf8"));
  const tokens = JSON.parse(readFileSync(join(GH_DIR, "tokens.json"), "utf8"));
  return {
    clientId: config.GOOGLE_HEALTH_CLIENT_ID,
    clientSecret: config.GOOGLE_HEALTH_CLIENT_SECRET,
    refreshToken: tokens.refresh_token,
  };
}
