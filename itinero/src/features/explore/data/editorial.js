/**
 * Explore editorial layer - moods, collections, moments, season windows.
 * Validity is computed from today's date. Never a hardcoded September list.
 */

const u = (id, w = 1400) =>
  `https://images.unsplash.com/${id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=${w}&q=80`;

export const HERO_HINTS = [
  "Somewhere warm but not crowded",
  "A city that feels romantic at night",
  "Mountains without a difficult trek",
  "Somewhere I’ve probably never considered",
  "Great vegetarian food and nightlife",
];

export const CRAVINGS = [
  {
    id: "slow-mornings",
    label: "Slow mornings",
    blurb: "Villas · cafés · beaches · spas",
    themes: ["wellness", "beach", "honeymoon", "islands"],
    moods: ["slow", "romantic", "reset"],
    image: u("photo-1544367567-0f2fcb009e0b"),
  },
  {
    id: "big-landscapes",
    label: "Big landscapes",
    blurb: "Mountains · deserts · islands",
    themes: ["hills", "adventure", "islands", "wildlife"],
    moods: ["landscape", "adventure"],
    image: u("photo-1469854523086-cc02fe5d8800"),
  },
  {
    id: "after-dark",
    label: "After-dark energy",
    blurb: "Food · music · streets · skyline",
    themes: ["city", "food"],
    moods: ["nightlife", "food", "city"],
    image: u("photo-1514565131-fce0801e5785"),
  },
  {
    id: "just-us",
    label: "Just us",
    blurb: "Romantic places · sunsets · quiet stays",
    themes: ["honeymoon", "islands", "luxury"],
    moods: ["romantic", "slow"],
    image: u("photo-1514282401047-d79a71a590e8"),
  },
  {
    id: "something-wild",
    label: "Something wild",
    blurb: "Rafting · safari · diving · trekking",
    themes: ["adventure", "safari", "wildlife", "trekking"],
    moods: ["adventure", "wild"],
    image: u("photo-1516426122078-c23e76319801"),
  },
  {
    id: "different-world",
    label: "A different world",
    blurb: "Culture · architecture · history",
    themes: ["culture", "city", "pilgrimage"],
    moods: ["culture", "history"],
    image: u("photo-1552832230-c0197dd311b5"),
  },
  {
    id: "reset",
    label: "Reset",
    blurb: "Wellness · nature · slower travel",
    themes: ["wellness", "hills", "beach"],
    moods: ["reset", "slow"],
    image: u("photo-1506905925346-21bda4d32df4"),
  },
  {
    id: "spiritual",
    label: "Spiritual journeys",
    blurb: "Sacred cities · temples · pilgrimage",
    themes: ["pilgrimage", "culture", "wellness"],
    moods: ["spiritual", "culture"],
    image: u("photo-1561361513-2d000a50f0dc"),
  },
];

export const FEEL_LIKE = [
  {
    id: "paris-without-paris-prices",
    title: "Paris without Paris prices",
    blurb: "Cafés, old streets, and evening walks - without Western Europe fares.",
    destIds: ["lisbon", "prague", "tbilisi", "istanbul", "vienna"],
    image: u("photo-1541849546-216549ae216d", 900),
  },
  {
    id: "maldives-without-isolation",
    title: "Maldives without the resort isolation",
    blurb: "Turquoise water, but you can still walk into town.",
    destIds: ["zanzibar", "andaman", "phuket", "goa", "fiji"],
    image: u("photo-1559827260-dc66d52bef19", 900),
  },
  {
    id: "switzerland-closer",
    title: "Switzerland closer to home",
    blurb: "Alpine air without the 12-hour hop.",
    destIds: ["manali", "srinagar", "leh", "darjeeling", "queenstown"],
    image: u("photo-1469474968028-56623f02e42e", 900),
  },
  {
    id: "walking-after-dark",
    title: "Places made for walking after dark",
    blurb: "Streets that stay alive when the lights come on.",
    destIds: ["istanbul", "barcelona", "tokyo", "lisbon", "mumbai"],
    image: u("photo-1514565131-fce0801e5785", 900),
  },
  {
    id: "one-lakh-luxurious",
    title: "Where ₹1 lakh feels luxurious",
    blurb: "Suites, slow breakfasts, and the feeling you splurged - without Europe prices.",
    destIds: ["udaipur", "bali", "srinagar", "jaipur", "kochi"],
    image: u("photo-1696861524777-978d87c7cff2", 900),
  },
  {
    id: "first-international",
    title: "Amazing first international trips",
    blurb: "Easy entry, familiar food, short hops from India.",
    destIds: ["dubai", "bangkok", "singapore", "colombo", "kathmandu"],
    image: u("photo-1512453979798-5ea266f8880c", 900),
  },
  {
    id: "slow-beach-towns",
    title: "Beach towns where you can actually slow down",
    blurb: "Not just a pool. A place to stay put.",
    destIds: ["alibaug", "goa", "zanzibar", "kochi", "fiji"],
    image: u("photo-1507525428034-b723cf961d3e", 900),
  },
  {
    id: "mountains-easy",
    title: "Mountains without difficult hiking",
    blurb: "Views, cool air, and walks you can do in sneakers.",
    destIds: ["lonavala", "darjeeling", "udaipur", "srinagar", "zurich"],
    image: u("photo-1506905925346-21bda4d32df4", 900),
  },
];

/** month = 1-12. Window is seasonal, regenerated each year from Date.now(). */
export const MOMENTS = [
  {
    id: "cherry-blossom",
    title: "Cherry blossom",
    place: "Japan",
    destIds: ["tokyo", "kyoto"],
    months: [3, 4],
    image: u("photo-1522383225653-ed111181a951"),
    reason: "Sakura window - streets and temples go pink for a few weeks.",
  },
  {
    id: "northern-lights",
    title: "Northern lights",
    place: "Iceland / Norway",
    destIds: ["reykjavik"],
    months: [9, 10, 11, 12, 1, 2, 3],
    image: u("photo-1419242902214-272b3f66ee7a"),
    reason: "Long dark skies - aurora season, not a summer postcard.",
  },
  {
    id: "christmas-markets",
    title: "Christmas markets",
    place: "Europe",
    destIds: ["vienna", "prague", "berlin", "london"],
    months: [11, 12],
    image: u("photo-1543589077-47d81606c1bf"),
    reason: "Mulled wine, lights, and old-town squares.",
  },
  {
    id: "fall-colors",
    title: "Fall colors",
    place: "New England & Japan",
    destIds: ["kyoto", "tokyo", "new-york"],
    months: [9, 10, 11],
    image: u("photo-1476820865390-c52aeebb9891"),
    reason: "Maple and ginkgo - a short, vivid window.",
  },
  {
    id: "monsoon-ghats",
    title: "Monsoon waterfalls",
    place: "Western Ghats",
    destIds: ["lonavala", "kochi", "goa", "nashik"],
    months: [6, 7, 8, 9],
    image: u("photo-1506905925346-21bda4d32df4"),
    reason: "Hills go green and the waterfalls actually run.",
  },
  {
    id: "safari-season",
    title: "Safari season",
    place: "Kenya / Tanzania",
    destIds: ["nairobi", "zanzibar"],
    months: [6, 7, 8, 9, 10],
    image: u("photo-1516426122078-c23e76319801"),
    reason: "Dry season - wildlife concentrates around water.",
  },
  {
    id: "tulip-season",
    title: "Tulip season",
    place: "Netherlands",
    destIds: ["amsterdam"],
    months: [4, 5],
    image: u("photo-1490750967868-88aa4486c946"),
    reason: "Keukenhof and the bulb fields - April, not all year.",
  },
  {
    id: "ski-season",
    title: "Ski season",
    place: "Alps / Japan",
    destIds: ["zurich", "queenstown", "tokyo"],
    months: [12, 1, 2, 3],
    image: u("photo-1551698618-1dfe5d97d256"),
    reason: "Snow on the ground - lifts, not hiking trails.",
  },
  {
    id: "lantern-festivals",
    title: "Lantern festivals",
    place: "East + South Asia",
    destIds: ["chiang-mai", "hanoi", "jaipur", "varanasi"],
    months: [10, 11, 1, 2],
    image: u("photo-1522383225653-ed111181a951"),
    reason: "Nights lit for a festival week - check this year’s dates.",
  },
];

export const CLOSER_BY_ORIGIN = {
  BOM: [
    { id: "lonavala", label: "~2h", mode: "drive" },
    { id: "nashik", label: "~3h", mode: "drive" },
    { id: "alibaug", label: "quick escape", mode: "ferry" },
    { id: "goa", label: "short flight", mode: "flight" },
    { id: "udaipur", label: "short flight", mode: "flight" },
  ],
  DEL: [
    { id: "jaipur", label: "~4h", mode: "drive" },
    { id: "rishikesh", label: "~5h", mode: "drive" },
    { id: "udaipur", label: "short flight", mode: "flight" },
    { id: "srinagar", label: "short flight", mode: "flight" },
    { id: "manali", label: "overnight", mode: "drive" },
  ],
  BLR: [
    { id: "kochi", label: "short flight", mode: "flight" },
    { id: "goa", label: "short flight", mode: "flight" },
    { id: "colombo", label: "short hop", mode: "flight" },
    { id: "mumbai", label: "2h flight", mode: "flight" },
  ],
  JFK: [
    { id: "miami", label: "~3h", mode: "flight" },
    { id: "toronto", label: "~1h30", mode: "flight" },
    { id: "chicago", label: "~2h", mode: "flight" },
    { id: "london", label: "overnight", mode: "flight" },
    { id: "cancun", label: "sun escape", mode: "flight" },
  ],
  LAX: [
    { id: "san-francisco", label: "~1h20", mode: "flight" },
    { id: "las-vegas", label: "~1h", mode: "flight" },
    { id: "seattle", label: "~2h30", mode: "flight" },
    { id: "honolulu", label: "island hop", mode: "flight" },
    { id: "mexico-city", label: "~3h30", mode: "flight" },
  ],
  SFO: [
    { id: "los-angeles", label: "~1h20", mode: "flight" },
    { id: "seattle", label: "~2h", mode: "flight" },
    { id: "las-vegas", label: "~1h30", mode: "flight" },
    { id: "honolulu", label: "island hop", mode: "flight" },
  ],
  ORD: [
    { id: "new-york", label: "~2h", mode: "flight" },
    { id: "miami", label: "~3h", mode: "flight" },
    { id: "denver", label: "~2h30", mode: "flight" },
    { id: "toronto", label: "~1h30", mode: "flight" },
  ],
  MIA: [
    { id: "new-york", label: "~3h", mode: "flight" },
    { id: "cancun", label: "~1h40", mode: "flight" },
    { id: "mexico-city", label: "~3h", mode: "flight" },
    { id: "nashville", label: "~2h", mode: "flight" },
  ],
  DEN: [
    { id: "las-vegas", label: "~2h", mode: "flight" },
    { id: "chicago", label: "~2h30", mode: "flight" },
    { id: "los-angeles", label: "~2h20", mode: "flight" },
    { id: "seattle", label: "~2h40", mode: "flight" },
  ],
  LHR: [
    { id: "paris", label: "~1h20", mode: "flight" },
    { id: "amsterdam", label: "~1h", mode: "flight" },
    { id: "barcelona", label: "~2h", mode: "flight" },
    { id: "lisbon", label: "~2h30", mode: "flight" },
  ],
};

/** Per-destination editorial. Missing ids fall back to catalog blurb. */
export const DESTINATION_STORY = {
  bali: {
    tagline: "Rice terraces in the morning. Surf at sunset. Villas hidden behind jungle walls.",
    why: "Bali still does slow mornings and a little adventure in the same day - without needing a 14-hour flight from India.",
    feelsLike: "Green, warm, and unhurried - cafés before noon, cliffs before dusk.",
    worth: ["Mount Batur", "Ubud mornings", "Uluwatu cliffs", "Surf beaches", "Spa culture", "Food"],
    durations: [
      { days: 4, label: "Highlights" },
      { days: 7, label: "Sweet spot" },
      { days: 10, label: "Slower Bali" },
    ],
    vibes: ["Romantic", "Adventure", "Slow", "Beach", "Food"],
    neighbourhoods: [
      { name: "Ubud", note: "Green, calm, cultural" },
      { name: "Seminyak", note: "Restaurants, shopping, nightlife" },
      { name: "Uluwatu", note: "Cliffs and villas" },
      { name: "Canggu", note: "Cafés and younger energy" },
    ],
    best: "Apr-Jun · Sep-Oct",
    seasonMonths: [4, 5, 6, 9, 10],
    moods: ["slow", "romantic", "adventure", "beach", "food"],
    visaLight: "Visa on arrival / VOA for many passports",
  },
  istanbul: {
    tagline: "Europe and Asia in the same evening.",
    why: "Food, history and evenings matter equally here - ferries, old mosques, rooftop dinners.",
    feelsLike: "A city that stays awake after dark without feeling like a theme park.",
    worth: ["Bosphorus ferry", "Old mosques", "Rooftop dinners", "Grand Bazaar lanes", "Galata nights"],
    durations: [
      { days: 4, label: "City hit" },
      { days: 6, label: "Sweet spot" },
      { days: 9, label: "Asia + Europe slow" },
    ],
    vibes: ["Food", "Culture", "Romance", "City"],
    neighbourhoods: [
      { name: "Sultanahmet", note: "History, mosques, first-timer" },
      { name: "Karaköy / Galata", note: "Evenings, design, walks" },
      { name: "Kadıköy", note: "Asian side, local food" },
    ],
    best: "Apr-Jun · Sep-Oct",
    seasonMonths: [4, 5, 6, 9, 10],
    moods: ["food", "culture", "romantic", "nightlife", "city"],
    visaLight: "e-Visa for many passports",
  },
  udaipur: {
    tagline: "Lakes, palaces, and monsoon hills that actually glow.",
    why: "Romance without the complexity of an international trip - and monsoon is a feature, not a bug.",
    feelsLike: "Slow boat evenings and palace light on water.",
    worth: ["Lake Pichola", "City Palace", "Monsoon palaces", "Aravalli views", "Old-city walks"],
    durations: [
      { days: 3, label: "Weekend-plus" },
      { days: 5, label: "Sweet spot" },
      { days: 7, label: "With Rajasthan" },
    ],
    vibes: ["Romantic", "Culture", "Slow"],
    neighbourhoods: [
      { name: "Lake-side", note: "Boats, palaces, sunsets" },
      { name: "Old city", note: "Lanes, rooftops, food" },
    ],
    best: "Jul-Sep monsoon · Oct-Feb cool",
    seasonMonths: [7, 8, 9, 10, 11, 12, 1, 2],
    moods: ["romantic", "slow", "culture"],
    visaLight: "Domestic",
  },
  kyoto: {
    tagline: "Temples in the morning. Maple light by afternoon.",
    why: "Autumn is when Kyoto feels most itself - not just cherry-blossom crowds.",
    feelsLike: "Quiet, precise, walkable - a different Japan than Tokyo nights.",
    worth: ["Fushimi Inari", "Arashiyama", "Gion dusk", "Temple gardens", "Kaiseki"],
    durations: [
      { days: 3, label: "Temples hit" },
      { days: 5, label: "Sweet spot" },
      { days: 8, label: "With Osaka / Nara" },
    ],
    vibes: ["Culture", "Food", "Slow"],
    neighbourhoods: [
      { name: "Higashiyama", note: "Temples and lanes" },
      { name: "Arashiyama", note: "Bamboo and river" },
      { name: "Downtown", note: "Nights and trains" },
    ],
    best: "Mar-Apr · Oct-Nov",
    seasonMonths: [3, 4, 10, 11],
    moods: ["culture", "slow", "food"],
    visaLight: "Check Japan visa / eVISA",
  },
  reykjavik: {
    tagline: "Long evenings and landscapes that don’t ask for a filter.",
    why: "Iceland in the bright months is about space and light - not only the aurora poster.",
    feelsLike: "Open, elemental, and surprisingly close to cafés.",
    worth: ["Golden Circle", "South coast falls", "Blue lagoon / sky lagoon", "Reykjavik nights", "Aurora (winter)"],
    durations: [
      { days: 5, label: "Ring-road taste" },
      { days: 8, label: "Sweet spot" },
      { days: 12, label: "Full island" },
    ],
    vibes: ["Landscape", "Adventure", "Reset"],
    neighbourhoods: [{ name: "Reykjavik", note: "Base, food, flights" }],
    best: "Jun-Aug light · Sep-Mar aurora",
    seasonMonths: [6, 7, 8, 9, 10, 11, 12, 1, 2],
    moods: ["landscape", "adventure", "reset"],
    visaLight: "Schengen / visa check",
  },
  tbilisi: {
    tagline: "European-style streets, mountain access, great food - without Western Europe pricing.",
    why: "A first ‘unexpected’ city that still feels easy: wine, sulfur baths, and old balconies.",
    feelsLike: "Walkable, slightly wild, very edible.",
    worth: ["Old town balconies", "Sulfur baths", "Wine country day", "Cable car views", "Khinkali nights"],
    durations: [
      { days: 4, label: "City" },
      { days: 7, label: "City + Kazbegi" },
    ],
    vibes: ["Food", "Culture", "First international"],
    neighbourhoods: [
      { name: "Old Tbilisi", note: "Baths, balconies, nights" },
      { name: "Vera / Sololaki", note: "Cafés, walks" },
    ],
    best: "May-Jun · Sep-Oct",
    seasonMonths: [5, 6, 9, 10],
    moods: ["food", "culture", "city", "adventure"],
    visaLight: "Often visa-free / e-visa - confirm",
  },
  bangkok: {
    tagline: "Warm, food-heavy, energetic - and a short hop from Mumbai.",
    why: "The city that still rewards wandering after dark.",
    feelsLike: "Heat, herbs, temples, and midnight bowls.",
    worth: ["Chao Phraya boats", "Street food", "Temples", "Rooftop nights", "Day trip islands"],
    durations: [
      { days: 3, label: "City hit" },
      { days: 5, label: "City + beach" },
    ],
    vibes: ["Food", "City", "Nightlife"],
    neighbourhoods: [
      { name: "Riverside", note: "Boats and hotels" },
      { name: "Thonglor / Ekkamai", note: "Nights and food" },
    ],
    best: "Nov-Feb",
    seasonMonths: [11, 12, 1, 2],
    moods: ["food", "nightlife", "city", "beach"],
    visaLight: "Visa exemption / VOA for many",
  },
  goa: {
    tagline: "Salt, spice, and permission to do very little.",
    why: "Still the easiest slow beach from western India - if you pick the right pocket.",
    feelsLike: "Late breakfasts and a sea that doesn’t rush you.",
    worth: ["Old Goa", "Beach pockets", "Spice + seafood", "Ferry days"],
    durations: [
      { days: 3, label: "Escape" },
      { days: 6, label: "Sweet spot" },
    ],
    vibes: ["Beach", "Slow", "Food"],
    neighbourhoods: [
      { name: "North", note: "Busier, nightlife" },
      { name: "South", note: "Slower, quieter" },
    ],
    best: "Nov-Mar",
    seasonMonths: [11, 12, 1, 2, 3],
    moods: ["beach", "slow", "food", "reset"],
    visaLight: "Domestic",
  },
  paris: {
    tagline: "Cafés, museums, and river-light evenings.",
    why: "Still the reference for a romantic city - expensive, yes; replaceable, no.",
    feelsLike: "Walk until the lights come on.",
    worth: ["Seine walks", "Museums", "Neighbourhood dinners", "Day trip palaces"],
    durations: [
      { days: 4, label: "Classic" },
      { days: 6, label: "Sweet spot" },
    ],
    vibes: ["Romance", "Culture", "Food"],
    neighbourhoods: [
      { name: "Marais", note: "Walks, shops" },
      { name: "Latin Quarter", note: "Books, cafés" },
    ],
    best: "Apr-Jun · Sep-Oct",
    seasonMonths: [4, 5, 6, 9, 10],
    moods: ["romantic", "culture", "food", "city"],
    visaLight: "Schengen visa for many",
  },
};

export function getStory(dest) {
  if (!dest) return null;
  return DESTINATION_STORY[dest.id] || DESTINATION_STORY[dest.slug] || null;
}

export function monthWindowMeta(months = [], now = new Date()) {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const active = months.includes(m);
  const next = months.find((x) => x >= m) ?? months[0];
  const year = next && next < m ? y + 1 : y;
  const from = months.length ? new Date(year, Math.min(...months) - 1, 1) : null;
  const until = months.length ? new Date(year, Math.max(...months), 0) : null;
  return {
    active,
    valid_from: from ? from.toISOString().slice(0, 10) : null,
    valid_until: until ? until.toISOString().slice(0, 10) : null,
    generated_at: now.toISOString(),
  };
}
