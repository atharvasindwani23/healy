// Supermemory client — the hero of the project.
// Stores and semantically recalls facts about Atharva, all locally at localhost:6767.
// Every add/search is scoped to the user's containerTag.

import { SUPERMEMORY_URL, USER } from "./config.js";

// Add a natural-language memory. `type` becomes filterable metadata (goal | pattern | checkin | event | baseline | profile).
export async function remember(content, type = "checkin") {
  const res = await fetch(`${SUPERMEMORY_URL}/v3/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      containerTag: USER.containerTag,
      metadata: { type },
    }),
  });
  if (!res.ok) throw new Error(`Supermemory add ${res.status}: ${await res.text()}`);
  return res.json();
}

// Semantic search over Atharva's memories. Returns array of plain strings (memory or chunk text).
export async function recall(query, limit = 6) {
  const res = await fetch(`${SUPERMEMORY_URL}/v4/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      containerTag: USER.containerTag,
      searchMode: "hybrid",
      limit,
      threshold: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Supermemory search ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.results || []).map((r) => r.memory || r.chunk).filter(Boolean);
}
