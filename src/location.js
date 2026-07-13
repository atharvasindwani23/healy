// Shared last-known-location store.
// Live location updates write here silently; the watcher reads it for "you've been here a while" logic.

let last = null; // { lat, lng, at: epochMs, isLive: bool }

export function setLocation(lat, lng, isLive) {
  const now = Date.now();
  // Track how long we've been near the same spot (for "sitting in one place working" detection).
  const stayedPut =
    last && haversineMeters(last.lat, last.lng, lat, lng) < 150 ? last.since : now;
  last = { lat, lng, at: now, isLive, since: stayedPut };
  return last;
}

export function getLocation() {
  return last;
}

// Minutes stationary near the current spot.
export function minutesAtCurrentSpot() {
  if (!last) return null;
  return Math.floor((Date.now() - last.since) / 60000);
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
