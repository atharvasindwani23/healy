// Places module — finds healthy food spots near a location via Google Places API (New).
// Needs GOOGLE_PLACES_API_KEY in env. Falls back to a small stub list if the key is missing,
// so the feature degrades gracefully instead of crashing the demo.

const KEY = process.env.GOOGLE_PLACES_API_KEY;

// Reverse-geocode lat/lng -> a human area name (e.g. "Capitol Hill, Seattle").
export async function describeLocation(lat, lng) {
  if (!KEY) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${KEY}`;
    const json = await (await fetch(url)).json();
    const r = json.results?.[0];
    if (!r) return null;
    // Prefer neighborhood + city.
    const get = (type) => r.address_components?.find((c) => c.types.includes(type))?.long_name;
    const hood = get("neighborhood") || get("sublocality") || get("route");
    const city = get("locality") || get("administrative_area_level_1");
    return [hood, city].filter(Boolean).join(", ") || r.formatted_address;
  } catch {
    return null;
  }
}

// Find nearby healthy-leaning food places. Returns [{name, rating, vicinity, types}].
export async function healthyPlacesNearby(lat, lng, radiusMeters = 1200) {
  if (!KEY) return stubPlaces();
  try {
    // Places API (New) Text Search — querying "healthy" lets Google's own relevance
    // surface salad/poke/bowl/veg spots, which pure type-based Nearby Search misses.
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.rating,places.formattedAddress,places.primaryType,places.location",
      },
      body: JSON.stringify({
        textQuery: "healthy food restaurant",
        maxResultCount: 20,
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
        },
      }),
    });
    const json = await res.json();
    const places = (json.places || []).map((p) => ({
      name: p.displayName?.text,
      rating: p.rating,
      address: p.formattedAddress,
      type: p.primaryType,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
    }));
    // Score each place for "healthiness" so genuinely healthy spots rank above fried/fast food.
    const ranked = places
      .filter((p) => p.name)
      .map((p) => ({ ...p, healthScore: healthScoreFor(p) }))
      .filter((p) => p.healthScore > -2) // drop the clearly-unhealthy (fried chicken, burgers, donuts)
      .sort((a, b) => {
        if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
        return (b.rating || 0) - (a.rating || 0);
      });
    return ranked.slice(0, 5);
  } catch {
    return stubPlaces();
  }
}

// Heuristic "healthiness" score from name + Google place type.
// Positive = healthy-leaning, negative = fried/fast food. Tuned so e.g. Dave's Hot Chicken ranks low.
function healthScoreFor(p) {
  const text = `${p.name} ${p.type || ""}`.toLowerCase();
  let score = 0;

  const healthy = /(salad|poke|bowl|mediterranean|greek|juice|smoothie|health|green|fresh|vegan|vegetarian|veget|sweetgreen|cava|chipotle|sushi|tea house|green tea|acai|farm|garden|wrap|grain)/;
  const unhealthy = /(fried|hot chicken|wings|burger|pizza|donut|doughnut|bbq|barbecue|ice cream|dessert|bakery|fast food|taco bell|mcdonald|kfc|popeye|shake|fries|cheesesteak|brewery|brewing|bar|pub|beer|cocktail)/;

  // Name/keyword signals
  if (healthy.test(text)) score += 2;
  if (unhealthy.test(text)) score -= 3;

  // Google primary type signals
  if (/(meal_takeaway|fast_food)/.test(p.type || "")) score -= 1;
  if (/(cafe|health)/.test(p.type || "")) score += 1;

  return score;
}

function stubPlaces() {
  // Used only if no API key — keeps the feature alive for a scripted demo.
  return [
    { name: "Sweetgreen", rating: 4.5, address: "nearby", type: "restaurant" },
    { name: "Evergreens Salad", rating: 4.4, address: "nearby", type: "restaurant" },
    { name: "Chipotle", rating: 4.2, address: "nearby", type: "meal_takeaway" },
  ];
}

// Compact summary string for the LLM prompt.
export function placesSummary(places) {
  if (!places?.length) return "No nearby places found.";
  return places
    .map((p) => `${p.name}${p.rating ? ` (${p.rating}★)` : ""}`)
    .join(", ");
}
