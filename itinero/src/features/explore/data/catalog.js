/**
 * Global Explore catalog - curated worldwide destinations.
 * Prices come from live price-calendar; never invent fares here.
 */

const u = (id, w = 900) =>
  `https://images.unsplash.com/${id}?ixlib=rb-4.0.3&auto=format&fit=crop&w=${w}&q=80`;

/** @typedef {{ id: string, slug: string, city: string, country: string, continent: string, iata: string, themes: string[], image: string, blurb: string, trendingScore: number, minTripDays?: number }} ExploreDestination */

/** @type {ExploreDestination[]} */
const EXPLORE_CATALOG_RAW = [
  // India
  { id: "goa", slug: "goa", city: "Goa", country: "India", continent: "india", iata: "GOI", themes: ["beach", "food"], image: u("photo-1559827260-dc66d52bef19"), blurb: "Beaches, spice, and late nights by the Arabian Sea.", trendingScore: 92, minTripDays: 3 },
  { id: "jaipur", slug: "jaipur", city: "Jaipur", country: "India", continent: "india", iata: "JAI", themes: ["city", "adventure"], image: u("photo-1477587458883-47145ed94245"), blurb: "Pink City palaces and vibrant bazaars.", trendingScore: 88, minTripDays: 3 },
  { id: "manali", slug: "manali", city: "Manali", country: "India", continent: "india", iata: "KUU", themes: ["hills", "adventure"], image: u("photo-1626621341517-bbf3d9990a23"), blurb: "Himalayan valleys, snow, and apple orchards.", trendingScore: 90, minTripDays: 4 },
  { id: "kochi", slug: "kochi", city: "Kochi", country: "India", continent: "india", iata: "COK", themes: ["beach", "food", "city"], image: u("photo-1593693411515-c20261bcad6e"), blurb: "Backwaters gateway and coastal Kerala flavours.", trendingScore: 84, minTripDays: 4 },
  { id: "udaipur", slug: "udaipur", city: "Udaipur", country: "India", continent: "india", iata: "UDR", themes: ["honeymoon", "city"], image: u("photo-1696861524777-978d87c7cff2"), blurb: "Lake palaces made for slow romantic days.", trendingScore: 91, minTripDays: 3 },
  { id: "leh", slug: "leh", city: "Leh", country: "India", continent: "india", iata: "IXL", themes: ["hills", "adventure", "wildlife"], image: u("photo-1589182373726-e4f658ab50f0"), blurb: "High-desert monasteries and epic road trips.", trendingScore: 87, minTripDays: 5 },
  { id: "darjeeling", slug: "darjeeling", city: "Darjeeling", country: "India", continent: "india", iata: "IXB", themes: ["hills", "food"], image: u("photo-1501785888041-af3ef285b470"), blurb: "Tea estates and Kanchenjunga mornings.", trendingScore: 80, minTripDays: 4 },
  { id: "varanasi", slug: "varanasi", city: "Varanasi", country: "India", continent: "india", iata: "VNS", themes: ["pilgrimage", "city"], image: u("photo-1561361513-2d000a50f0dc"), blurb: "Ghats, rituals, and the oldest living city energy.", trendingScore: 86, minTripDays: 3 },
  { id: "rishikesh", slug: "rishikesh", city: "Rishikesh", country: "India", continent: "india", iata: "DED", themes: ["pilgrimage", "adventure", "hills"], image: u("photo-1582510003544-4d00b7f74220"), blurb: "Yoga capital with Ganga rafting days.", trendingScore: 83, minTripDays: 3 },
  { id: "andaman", slug: "andaman", city: "Port Blair", country: "India", continent: "india", iata: "IXZ", themes: ["beach", "wildlife"], image: u("photo-1589308078059-be1415eab4c3"), blurb: "Clear water islands and coral reefs.", trendingScore: 89, minTripDays: 5 },
  { id: "srinagar", slug: "srinagar", city: "Srinagar", country: "India", continent: "india", iata: "SXR", themes: ["hills", "honeymoon"], image: u("photo-1469474968028-56623f02e42e"), blurb: "Dal Lake houseboats and Chinar shade.", trendingScore: 85, minTripDays: 4 },
  { id: "mumbai", slug: "mumbai", city: "Mumbai", country: "India", continent: "india", iata: "BOM", themes: ["city", "food"], image: u("photo-1566552881560-0be862a7c445"), blurb: "Maximum city - street food to skyline.", trendingScore: 78, minTripDays: 2 },
  { id: "lonavala", slug: "lonavala", city: "Lonavala", country: "India", continent: "india", iata: "", themes: ["hills", "wellness"], image: u("photo-1506905925346-21bda4d32df4"), blurb: "Misty ghats and a Mumbai weekend reset.", trendingScore: 74, minTripDays: 2 },
  { id: "nashik", slug: "nashik", city: "Nashik", country: "India", continent: "india", iata: "ISK", themes: ["food", "pilgrimage", "hills"], image: u("photo-1474979266404-7eaacbcd87c5"), blurb: "Vineyards, temples, and a short road north.", trendingScore: 72, minTripDays: 2 },
  { id: "alibaug", slug: "alibaug", city: "Alibaug", country: "India", continent: "india", iata: "", themes: ["beach", "wellness"], image: u("photo-1507525428034-b723cf961d3e"), blurb: "Ferry across the harbour for slow beach days.", trendingScore: 73, minTripDays: 2 },

  // Asia
  { id: "tokyo", slug: "tokyo", city: "Tokyo", country: "Japan", continent: "asia", iata: "NRT", themes: ["city", "food"], image: u("photo-1540959733332-eab4deabeeaf"), blurb: "Neon nights, quiet shrines, endless bowls.", trendingScore: 95, minTripDays: 5 },
  { id: "kyoto", slug: "kyoto", city: "Kyoto", country: "Japan", continent: "asia", iata: "KIX", themes: ["city", "culture", "food"], image: u("photo-1493976040374-85c8e12f0c0e"), blurb: "Temples, gardens, and maple-light evenings.", trendingScore: 94, minTripDays: 4 },
  { id: "bangkok", slug: "bangkok", city: "Bangkok", country: "Thailand", continent: "asia", iata: "BKK", themes: ["city", "food", "beach"], image: u("photo-1508009603885-50cf7c579365"), blurb: "Temples, markets, and midnight street eats.", trendingScore: 94, minTripDays: 4 },
  { id: "singapore", slug: "singapore", city: "Singapore", country: "Singapore", continent: "asia", iata: "SIN", themes: ["city", "food"], image: u("photo-1525625293386-3f8f99389edd"), blurb: "Garden city with hawker flavours and skyline views.", trendingScore: 93, minTripDays: 3 },
  { id: "bali", slug: "bali", city: "Bali", country: "Indonesia", continent: "asia", iata: "DPS", themes: ["beach", "honeymoon", "adventure"], image: u("photo-1555400038-63f5ba517a47"), blurb: "Rice terraces, surf, and temple sunsets.", trendingScore: 96, minTripDays: 5 },
  { id: "maldives", slug: "maldives", city: "Malé", country: "Maldives", continent: "asia", iata: "MLE", themes: ["beach", "honeymoon"], image: u("photo-1514282401047-d79a71a590e8"), blurb: "Overwater villas and turquoise lagoons.", trendingScore: 97, minTripDays: 4 },
  { id: "kathmandu", slug: "kathmandu", city: "Kathmandu", country: "Nepal", continent: "asia", iata: "KTM", themes: ["adventure", "hills", "pilgrimage"], image: u("photo-1544735716-392fe2489ffa"), blurb: "Himalaya gateway and living heritage squares.", trendingScore: 82, minTripDays: 4 },
  { id: "colombo", slug: "colombo", city: "Colombo", country: "Sri Lanka", continent: "asia", iata: "CMB", themes: ["beach", "food", "city"], image: u("photo-1552465011-b4e21bf6e79a"), blurb: "Coastal capital into tea country and safaris.", trendingScore: 81, minTripDays: 5 },
  { id: "seoul", slug: "seoul", city: "Seoul", country: "South Korea", continent: "asia", iata: "ICN", themes: ["city", "food"], image: u("photo-1517154421773-0529f29ea451"), blurb: "K-culture, mountains in the city, late-night eats.", trendingScore: 88, minTripDays: 4 },
  { id: "hong-kong", slug: "hong-kong", city: "Hong Kong", country: "China", continent: "asia", iata: "HKG", themes: ["city", "food"], image: u("photo-1536599018102-9f803c140fc1"), blurb: "Harbour skyline and dim sum marathons.", trendingScore: 86, minTripDays: 3 },
  { id: "phuket", slug: "phuket", city: "Phuket", country: "Thailand", continent: "asia", iata: "HKT", themes: ["beach", "honeymoon"], image: u("photo-1589394815804-964ed0be2eb5"), blurb: "Andaman beaches and island hopping.", trendingScore: 90, minTripDays: 4 },
  { id: "hanoi", slug: "hanoi", city: "Hanoi", country: "Vietnam", continent: "asia", iata: "HAN", themes: ["city", "food", "adventure"], image: u("photo-1528127269322-539801943592"), blurb: "Old Quarter lanes into Ha Long adventures.", trendingScore: 85, minTripDays: 4 },
  { id: "kuala-lumpur", slug: "kuala-lumpur", city: "Kuala Lumpur", country: "Malaysia", continent: "asia", iata: "KUL", themes: ["city", "food"], image: u("photo-1518548419970-58e3b4079ab2"), blurb: "Towers, rainforest edges, and street food.", trendingScore: 84, minTripDays: 3 },

  // Middle East
  { id: "dubai", slug: "dubai", city: "Dubai", country: "UAE", continent: "middle_east", iata: "DXB", themes: ["city", "honeymoon", "adventure"], image: u("photo-1512453979798-5ea266f8880c"), blurb: "Desert dunes meet futuristic skyline.", trendingScore: 98, minTripDays: 3 },
  { id: "abu-dhabi", slug: "abu-dhabi", city: "Abu Dhabi", country: "UAE", continent: "middle_east", iata: "AUH", themes: ["city", "honeymoon"], image: u("photo-1609137144813-7d9921338f24"), blurb: "Grand Mosque calm and island resorts.", trendingScore: 87, minTripDays: 3 },
  { id: "doha", slug: "doha", city: "Doha", country: "Qatar", continent: "middle_east", iata: "DOH", themes: ["city"], image: u("photo-1555881400-74d7acaacd8b"), blurb: "Museum-worthy skyline on the Gulf.", trendingScore: 79, minTripDays: 3 },
  { id: "istanbul", slug: "istanbul", city: "Istanbul", country: "Turkey", continent: "middle_east", iata: "IST", themes: ["city", "food", "honeymoon"], image: u("photo-1524231757912-21f4fe3a7200"), blurb: "Where Europe and Asia share one skyline.", trendingScore: 94, minTripDays: 4 },
  { id: "tbilisi", slug: "tbilisi", city: "Tbilisi", country: "Georgia", continent: "europe", iata: "TBS", themes: ["city", "food", "hills", "culture"], image: u("photo-1523906834658-6e24ef2386f9"), blurb: "Old streets, mountain access, and unhurried dinners.", trendingScore: 86, minTripDays: 4 },

  // Europe
  { id: "paris", slug: "paris", city: "Paris", country: "France", continent: "europe", iata: "CDG", themes: ["city", "honeymoon", "food"], image: u("photo-1502602898657-3e91760cbb34"), blurb: "Cafés, museums, and river-light evenings.", trendingScore: 97, minTripDays: 4 },
  { id: "rome", slug: "rome", city: "Rome", country: "Italy", continent: "europe", iata: "FCO", themes: ["city", "food", "honeymoon"], image: u("photo-1552832230-c0197dd311b5"), blurb: "Ancient stones and perfect pasta nights.", trendingScore: 95, minTripDays: 4 },
  { id: "london", slug: "london", city: "London", country: "UK", continent: "europe", iata: "LHR", themes: ["city", "food"], image: u("photo-1513635269975-59663e0ac1ad"), blurb: "Parks, pubs, and world-class museums.", trendingScore: 93, minTripDays: 4 },
  { id: "edinburgh", slug: "edinburgh", city: "Edinburgh", country: "UK", continent: "europe", iata: "EDI", themes: ["city", "culture", "hills"], image: u("photo-1506377247377-2a5b3b417ebb"), blurb: "Castle views, festival energy, and highland day trips.", trendingScore: 88, minTripDays: 3 },
  { id: "barcelona", slug: "barcelona", city: "Barcelona", country: "Spain", continent: "europe", iata: "BCN", themes: ["city", "beach", "food"], image: u("photo-1583422409516-2895a77efded"), blurb: "Gaudí curves and Mediterranean nights.", trendingScore: 94, minTripDays: 4 },
  { id: "amsterdam", slug: "amsterdam", city: "Amsterdam", country: "Netherlands", continent: "europe", iata: "AMS", themes: ["city"], image: u("photo-1534351590666-13e3e96b5017"), blurb: "Canals, bikes, and golden-hour bridges.", trendingScore: 89, minTripDays: 3 },
  { id: "santorini", slug: "santorini", city: "Santorini", country: "Greece", continent: "europe", iata: "JTR", themes: ["beach", "honeymoon"], image: u("photo-1570077188670-e3a8d69ac5ff"), blurb: "White cliffs and legendary sunsets.", trendingScore: 96, minTripDays: 4 },
  { id: "prague", slug: "prague", city: "Prague", country: "Czechia", continent: "europe", iata: "PRG", themes: ["city", "honeymoon"], image: u("photo-1541849546-216549ae216d"), blurb: "Fairy-tale bridges and old-town spires.", trendingScore: 88, minTripDays: 3 },
  { id: "vienna", slug: "vienna", city: "Vienna", country: "Austria", continent: "europe", iata: "VIE", themes: ["city", "food"], image: u("photo-1516550893923-42d28e5677af"), blurb: "Palaces, coffee houses, and classical calm.", trendingScore: 84, minTripDays: 3 },
  { id: "zurich", slug: "zurich", city: "Zurich", country: "Switzerland", continent: "europe", iata: "ZRH", themes: ["city", "hills", "ski"], image: u("photo-1515488764276-beab7607c1e6"), blurb: "Lake city gateway to Alps adventures.", trendingScore: 83, minTripDays: 3 },
  { id: "reykjavik", slug: "iceland", city: "Reykjavik", country: "Iceland", continent: "europe", iata: "KEF", themes: ["adventure", "hills", "wildlife"], image: u("photo-1504893524553-b855bce32c67"), blurb: "Long evenings, open lava, and northern light hunts.", trendingScore: 90, minTripDays: 5 },
  { id: "lisbon", slug: "lisbon", city: "Lisbon", country: "Portugal", continent: "europe", iata: "LIS", themes: ["city", "food", "beach"], image: u("photo-1558642452-9d2a7deb7f62"), blurb: "Tile hills, trams, and Atlantic light.", trendingScore: 90, minTripDays: 4 },
  { id: "milan", slug: "milan", city: "Milan", country: "Italy", continent: "europe", iata: "MXP", themes: ["city", "food"], image: u("photo-1513581166391-887a96ddeafd"), blurb: "Fashion capital into lake-country escapes.", trendingScore: 82, minTripDays: 3 },
  { id: "berlin", slug: "berlin", city: "Berlin", country: "Germany", continent: "europe", iata: "BER", themes: ["city", "food"], image: u("photo-1560969184-10fe8719e047"), blurb: "History, nightlife, and creative energy.", trendingScore: 85, minTripDays: 3 },

  // Americas
  { id: "new-york", slug: "new-york", city: "New York", country: "USA", continent: "americas", iata: "JFK", themes: ["city", "food"], image: u("photo-1496442226666-8d4d0e62e6e9"), blurb: "The city that never sleeps - skyline and street energy.", trendingScore: 96, minTripDays: 4 },
  { id: "los-angeles", slug: "los-angeles", city: "Los Angeles", country: "USA", continent: "americas", iata: "LAX", themes: ["city", "beach"], image: u("photo-1534190760961-74e8c1c5c3da"), blurb: "Pacific light, Hollywood, and endless drives.", trendingScore: 88, minTripDays: 4 },
  { id: "san-francisco", slug: "san-francisco", city: "San Francisco", country: "USA", continent: "americas", iata: "SFO", themes: ["city", "food"], image: u("photo-1501594907352-04cda38ebc29"), blurb: "Fog, bridges, and neighbourhood walks.", trendingScore: 86, minTripDays: 3 },
  { id: "toronto", slug: "toronto", city: "Toronto", country: "Canada", continent: "americas", iata: "YYZ", themes: ["city"], image: u("photo-1480714378408-67cf0d13bc1b"), blurb: "Lake city with neighbourhood food scenes.", trendingScore: 80, minTripDays: 3 },
  { id: "mexico-city", slug: "mexico-city", city: "Mexico City", country: "Mexico", continent: "americas", iata: "MEX", themes: ["city", "food"], image: u("photo-1578662996442-48f60103fc96"), blurb: "Museums, markets, and world-class cuisine.", trendingScore: 87, minTripDays: 4 },
  { id: "miami", slug: "miami", city: "Miami", country: "USA", continent: "americas", iata: "MIA", themes: ["beach", "city"], image: u("photo-1514214246283-d427a95c5d2f"), blurb: "Art Deco beaches and Latin rhythm.", trendingScore: 85, minTripDays: 3 },
  { id: "chicago", slug: "chicago", city: "Chicago", country: "USA", continent: "americas", iata: "ORD", themes: ["city", "food"], image: u("photo-1494522855154-9297ac14b55f"), blurb: "Architecture, lake wind, and neighbourhood eats.", trendingScore: 84, minTripDays: 3 },
  { id: "denver", slug: "denver", city: "Denver", country: "USA", continent: "americas", iata: "DEN", themes: ["hills", "adventure", "city"], image: u("photo-1546156929-a4c0ac41164c"), blurb: "Mile-high gateway to Rockies weekends.", trendingScore: 82, minTripDays: 3 },
  { id: "seattle", slug: "seattle", city: "Seattle", country: "USA", continent: "americas", iata: "SEA", themes: ["city", "food", "hills"], image: u("photo-1502175353174-a7a70eaa6b4c"), blurb: "Coffee, ferry light, and Cascade day trips.", trendingScore: 83, minTripDays: 3 },
  { id: "las-vegas", slug: "las-vegas", city: "Las Vegas", country: "USA", continent: "americas", iata: "LAS", themes: ["city", "adventure"], image: u("photo-1605833556294-ea5c7a74f57d"), blurb: "Neon nights and red-rock day escapes.", trendingScore: 86, minTripDays: 3 },
  { id: "nashville", slug: "nashville", city: "Nashville", country: "USA", continent: "americas", iata: "BNA", themes: ["city", "food"], image: u("photo-1546146830-2cca7862f0f0"), blurb: "Music Row energy and Southern tables.", trendingScore: 81, minTripDays: 3 },
  { id: "honolulu", slug: "honolulu", city: "Honolulu", country: "USA", continent: "americas", iata: "HNL", themes: ["beach", "honeymoon", "adventure"], image: u("photo-1505852679233-d9fd70aff56d"), blurb: "Pacific islands, surf, and sunrise trails.", trendingScore: 90, minTripDays: 5 },
  { id: "boston", slug: "boston", city: "Boston", country: "USA", continent: "americas", iata: "BOS", themes: ["city", "food", "culture"], image: u("photo-1501594907352-04cda38ebc29"), blurb: "Harbour walks, university energy, and New England seafood.", trendingScore: 84, minTripDays: 3 },
  { id: "austin", slug: "austin", city: "Austin", country: "USA", continent: "americas", iata: "AUS", themes: ["city", "food", "adventure"], image: u("photo-1531219572328-a0171b4448a3"), blurb: "Live music, breakfast tacos, and Hill Country day trips.", trendingScore: 85, minTripDays: 3 },
  { id: "new-orleans", slug: "new-orleans", city: "New Orleans", country: "USA", continent: "americas", iata: "MSY", themes: ["city", "food", "culture"], image: u("photo-1569949381669-ecf31ae8e613"), blurb: "Jazz nights, Creole tables, and Mississippi light.", trendingScore: 86, minTripDays: 3 },
  { id: "washington-dc", slug: "washington-dc", city: "Washington, D.C.", country: "USA", continent: "americas", iata: "DCA", themes: ["city", "culture", "family"], image: u("photo-1501466044931-62695aada8ed"), blurb: "Monuments, museums, and cherry-blossom springs.", trendingScore: 83, minTripDays: 3 },
  { id: "portland", slug: "portland", city: "Portland", country: "USA", continent: "americas", iata: "PDX", themes: ["city", "food", "hills"], image: u("photo-1469474968028-56623f02e42e"), blurb: "Coffee, forests, and Cascades weekend escapes.", trendingScore: 81, minTripDays: 3 },
  { id: "savannah", slug: "savannah", city: "Savannah", country: "USA", continent: "americas", iata: "SAV", themes: ["city", "culture", "food"], image: u("photo-1546156929-a4c0ac41164c"), blurb: "Oak-lined squares and slow Southern evenings.", trendingScore: 80, minTripDays: 2 },
  { id: "cancun", slug: "cancun", city: "Cancún", country: "Mexico", continent: "americas", iata: "CUN", themes: ["beach", "honeymoon"], image: u("photo-1552074284-5e88ef1aef18"), blurb: "Caribbean blue and Mayan day trips.", trendingScore: 89, minTripDays: 5 },
  { id: "rio", slug: "rio", city: "Rio de Janeiro", country: "Brazil", continent: "americas", iata: "GIG", themes: ["beach", "city", "adventure"], image: u("photo-1483729558449-99ef09a8c325"), blurb: "Mountains meet beach carnival energy.", trendingScore: 84, minTripDays: 5 },

  // Africa
  { id: "cape-town", slug: "cape-town", city: "Cape Town", country: "South Africa", continent: "africa", iata: "CPT", themes: ["city", "adventure", "wildlife", "beach"], image: u("photo-1580060839134-75a5edca2e99"), blurb: "Table Mountain, wine country, and wild coast.", trendingScore: 91, minTripDays: 5 },
  { id: "cairo", slug: "cairo", city: "Cairo", country: "Egypt", continent: "africa", iata: "CAI", themes: ["city", "adventure", "pilgrimage"], image: u("photo-1572252009286-268acec5ca0a"), blurb: "Pyramids, Nile evenings, and ancient streets.", trendingScore: 86, minTripDays: 4 },
  { id: "marrakech", slug: "marrakech", city: "Marrakech", country: "Morocco", continent: "africa", iata: "RAK", themes: ["city", "adventure", "food"], image: u("photo-1544644181-1484b3fdfc62"), blurb: "Souks, riads, and Atlas day trips.", trendingScore: 88, minTripDays: 4 },
  { id: "nairobi", slug: "nairobi", city: "Nairobi", country: "Kenya", continent: "africa", iata: "NBO", themes: ["wildlife", "adventure"], image: u("photo-1516426122078-c23e76319801"), blurb: "Safari capital with urban safari energy.", trendingScore: 83, minTripDays: 5 },
  { id: "zanzibar", slug: "zanzibar", city: "Zanzibar", country: "Tanzania", continent: "africa", iata: "ZNZ", themes: ["beach", "honeymoon"], image: u("photo-1571896349842-33c89424de2d"), blurb: "Spice island beaches and Stone Town lanes.", trendingScore: 87, minTripDays: 5 },

  // Oceania
  { id: "sydney", slug: "sydney", city: "Sydney", country: "Australia", continent: "oceania", iata: "SYD", themes: ["city", "beach"], image: u("photo-1506973035872-a4ec16b8e8d9"), blurb: "Harbour icon with beach-city lifestyle.", trendingScore: 92, minTripDays: 5 },
  { id: "melbourne", slug: "melbourne", city: "Melbourne", country: "Australia", continent: "oceania", iata: "MEL", themes: ["city", "food"], image: u("photo-1514395462725-fb4566210144"), blurb: "Coffee culture and laneway art.", trendingScore: 86, minTripDays: 4 },
  { id: "auckland", slug: "auckland", city: "Auckland", country: "New Zealand", continent: "oceania", iata: "AKL", themes: ["city", "adventure", "wildlife"], image: u("photo-1507699622108-4be3abd695ad"), blurb: "City of sails into island adventures.", trendingScore: 84, minTripDays: 5 },
  { id: "queenstown", slug: "queenstown", city: "Queenstown", country: "New Zealand", continent: "oceania", iata: "ZQN", themes: ["adventure", "hills", "ski"], image: u("photo-1469854523086-cc02fe5d8800"), blurb: "Adventure capital with alpine lakes.", trendingScore: 90, minTripDays: 5 },
  { id: "fiji", slug: "fiji", city: "Nadi", country: "Fiji", continent: "oceania", iata: "NAN", themes: ["beach", "honeymoon"], image: u("photo-1507525428034-b723cf961d3e"), blurb: "Island blues and slow reef days.", trendingScore: 85, minTripDays: 5 },
];

/** Approximate city coordinates for Explore map pins. */
const COORDS = {
  goa: [15.3, 74.12], jaipur: [26.91, 75.79], manali: [32.24, 77.19], kochi: [9.93, 76.27],
  udaipur: [24.59, 73.71], leh: [34.15, 77.58], darjeeling: [27.04, 88.26], varanasi: [25.32, 82.97],
  rishikesh: [30.09, 78.27], andaman: [11.62, 92.73], srinagar: [34.08, 74.8], mumbai: [19.09, 72.87],
  lonavala: [18.75, 73.41], nashik: [19.99, 73.79], alibaug: [18.64, 72.87],
  tokyo: [35.68, 139.69], kyoto: [35.01, 135.77], bangkok: [13.76, 100.5], singapore: [1.35, 103.82], bali: [-8.34, 115.09],
  maldives: [4.18, 73.51], kathmandu: [27.72, 85.32], colombo: [6.93, 79.85], seoul: [37.57, 126.98],
  "hong-kong": [22.32, 114.17], phuket: [7.88, 98.39], hanoi: [21.03, 105.85], "kuala-lumpur": [3.14, 101.69],
  dubai: [25.2, 55.27], "abu-dhabi": [24.45, 54.65], doha: [25.29, 51.53], istanbul: [41.01, 28.98],
  tbilisi: [41.72, 44.79], reykjavik: [64.13, -21.94],
  paris: [48.86, 2.35], rome: [41.9, 12.5], london: [51.51, -0.13], edinburgh: [55.95, -3.19], barcelona: [41.39, 2.17],
  amsterdam: [52.37, 4.9], santorini: [36.39, 25.46], prague: [50.08, 14.44], vienna: [48.21, 16.37],
  zurich: [47.38, 8.54], lisbon: [38.72, -9.14], milan: [45.46, 9.19], berlin: [52.52, 13.4],
  "new-york": [40.64, -73.78], "los-angeles": [33.94, -118.41], "san-francisco": [37.62, -122.38],
  toronto: [43.68, -79.63], "mexico-city": [19.44, -99.07], miami: [25.8, -80.29], cancun: [21.04, -86.87],
  chicago: [41.97, -87.91], denver: [39.86, -104.67], seattle: [47.45, -122.31],
  "las-vegas": [36.08, -115.15], nashville: [36.13, -86.67], honolulu: [21.32, -157.92],
  boston: [42.36, -71.06], austin: [30.27, -97.74], "new-orleans": [29.95, -90.07],
  "washington-dc": [38.85, -77.04], portland: [45.59, -122.6], savannah: [32.08, -81.09],
  rio: [-22.91, -43.17], "cape-town": [-33.97, 18.6], cairo: [30.11, 31.4], marrakech: [31.61, -8.0],
  nairobi: [-1.32, 36.93], zanzibar: [-6.22, 39.22], sydney: [-33.94, 151.18], melbourne: [-37.67, 144.84],
  auckland: [-37.01, 174.79], queenstown: [-45.02, 168.74], fiji: [-17.76, 177.44],
};

const FLIGHT_HOURS = {
  india: 2.5, asia: 6, middle_east: 4.5, europe: 10, americas: 16, africa: 10, oceania: 12,
};

function withGeo(list) {
  return list.map((d) => {
    const c = COORDS[d.id];
    return {
      ...d,
      lat: c ? c[0] : null,
      lng: c ? c[1] : null,
      flightHoursApprox: FLIGHT_HOURS[d.continent] ?? 8,
    };
  });
}

/** Extra travel-style tags - A-Z of how people actually travel. */
const EXTRA_THEMES = {
  manali: ["hiking", "trekking", "roadtrip", "rafting", "camping", "climbing"],
  leh: ["hiking", "trekking", "roadtrip", "camping", "biking"],
  darjeeling: ["hiking", "trekking"],
  rishikesh: ["hiking", "trekking", "wellness", "rafting", "camping"],
  srinagar: ["honeymoon", "roadtrip", "wellness", "hiking"],
  kathmandu: ["trekking", "hiking", "backpacking", "climbing"],
  queenstown: ["hiking", "trekking", "adventure", "ski", "biking", "rafting"],
  zurich: ["hiking", "ski", "biking"],
  "cape-town": ["hiking", "safari", "adventure", "biking"],
  nairobi: ["safari", "wildlife"],
  zanzibar: ["islands", "honeymoon", "scuba"],
  maldives: ["islands", "luxury", "honeymoon", "scuba"],
  bali: ["wellness", "islands", "scuba", "surfing"],
  santorini: ["islands", "honeymoon", "luxury"],
  fiji: ["islands", "honeymoon", "scuba"],
  andaman: ["islands", "wildlife", "scuba"],
  phuket: ["islands", "honeymoon", "scuba"],
  cancun: ["islands", "honeymoon", "scuba"],
  jaipur: ["culture", "family"],
  varanasi: ["culture", "pilgrimage"],
  udaipur: ["culture", "honeymoon"],
  cairo: ["culture"],
  marrakech: ["culture", "food"],
  istanbul: ["culture"],
  rome: ["culture"],
  paris: ["culture", "luxury", "biking"],
  prague: ["culture"],
  tokyo: ["culture"],
  kyoto: ["culture", "food", "wellness"],
  reykjavik: ["adventure", "wildlife", "hiking"],
  tbilisi: ["culture", "food", "backpacking", "hiking"],
  lonavala: ["wellness", "hills", "hiking"],
  nashik: ["food", "culture"],
  alibaug: ["beach", "wellness"],
  hanoi: ["culture", "backpacking", "food"],
  bangkok: ["backpacking", "food"],
  lisbon: ["backpacking", "food", "biking"],
  "mexico-city": ["culture", "food", "backpacking"],
  dubai: ["luxury"],
  "abu-dhabi": ["luxury"],
  singapore: ["family", "luxury"],
  goa: ["family", "beach"],
  kochi: ["family", "food"],
  sydney: ["family", "biking", "beach"],
  london: ["culture", "family", "biking"],
  "new-york": ["culture"],
  "los-angeles": ["roadtrip", "beach", "biking"],
  rio: ["adventure", "beach", "hiking"],
  auckland: ["adventure", "family", "biking"],
  berlin: ["culture", "biking"],
  amsterdam: ["culture", "biking"],
  barcelona: ["culture", "biking", "beach"],
  vienna: ["culture", "biking"],
  milan: ["luxury", "food"],
  "hong-kong": ["food", "city"],
  seoul: ["food", "culture", "hiking"],
  melbourne: ["food", "culture", "biking"],
  colombo: ["culture", "beach"],
  miami: ["beach"],
  denver: ["hiking", "biking", "camping", "adventure"],
  honolulu: ["beach", "hiking", "scuba"],
};

function withThemes(list) {
  return list.map((d) => ({
    ...d,
    themes: [...new Set([...(d.themes || []), ...(EXTRA_THEMES[d.id] || [])])],
  }));
}

export let EXPLORE_CATALOG = withGeo(withThemes(EXPLORE_CATALOG_RAW));

const FLIGHT_HOURS_BY_CONTINENT = {
  india: 2.5, asia: 6, middle_east: 4.5, europe: 10, americas: 16, africa: 10, oceania: 12,
};

/**
 * Merge supervisor explore_factory catalog over the bundled list.
 * Remote rows win on id/slug; keeps offline fallback intact.
 */
export function applyRemoteExploreCatalog(remoteList = []) {
  if (!Array.isArray(remoteList) || !remoteList.length) return EXPLORE_CATALOG;
  const base = withGeo(withThemes(EXPLORE_CATALOG_RAW));
  const byId = new Map(base.map((d) => [d.id, { ...d }]));
  for (const raw of remoteList) {
    if (!raw?.id && !raw?.slug) continue;
    const id = String(raw.id || raw.slug).toLowerCase();
    const prev = byId.get(id) || {};
    const continent = raw.continent || prev.continent || "";
    byId.set(id, {
      ...prev,
      ...raw,
      id,
      slug: String(raw.slug || id).toLowerCase(),
      themes: [...new Set([...(raw.themes || []), ...(prev.themes || []), ...(EXTRA_THEMES[id] || [])])],
      lat: raw.lat ?? prev.lat ?? null,
      lng: raw.lng ?? prev.lng ?? null,
      flightHoursApprox:
        raw.flightHoursApprox ??
        prev.flightHoursApprox ??
        FLIGHT_HOURS_BY_CONTINENT[continent] ??
        8,
      markets: raw.markets || prev.markets,
    });
  }
  EXPLORE_CATALOG = [...byId.values()];
  return EXPLORE_CATALOG;
}

export function getExploreCatalog() {
  return EXPLORE_CATALOG;
}

export const CONTINENTS = [
  { id: "", label: "Anywhere" },
  { id: "india", label: "India" },
  { id: "asia", label: "Asia" },
  { id: "middle_east", label: "Middle East" },
  { id: "europe", label: "Europe" },
  { id: "americas", label: "Americas" },
  { id: "africa", label: "Africa" },
  { id: "oceania", label: "Oceania" },
];

/** A-Z ways to travel - Explore’s primary navigation. */
export const TRAVEL_WAYS = [
  { id: "adventure", label: "Adventure", blurb: "Raft, climb, jump in.", image: u("photo-1469854523086-cc02fe5d8800") },
  { id: "backpacking", label: "Backpacking", blurb: "Hostels, trains, long roads.", image: u("photo-1488646953014-85cb44e25828") },
  { id: "beach", label: "Beach", blurb: "Sand, salt, slow days.", image: u("photo-1507525428034-b723cf961d3e") },
  { id: "biking", label: "Biking", blurb: "Cycle paths and bike tours.", image: u("photo-1449965408869-eaa3f722e40d") },
  { id: "camping", label: "Camping", blurb: "Tents, stars, outdoor nights.", image: u("photo-1504280390367-361c6d9f38f4") },
  { id: "city", label: "City break", blurb: "Skylines and neighbourhoods.", image: u("photo-1540959733332-eab4deabeeaf") },
  { id: "climbing", label: "Climbing", blurb: "Rock faces and via ferrata.", image: u("photo-1522163186146-592dd6697cef") },
  { id: "culture", label: "Culture", blurb: "Temples, museums, old streets.", image: u("photo-1552832230-c0197dd311b5") },
  { id: "family", label: "Family", blurb: "Trips that work for everyone.", image: u("photo-1502082553048-f009c37129b9") },
  { id: "food", label: "Food", blurb: "Markets, spices, late dinners.", image: u("photo-1504674900247-0877df9cc836") },
  { id: "hiking", label: "Hiking", blurb: "Day trails and ridge walks.", image: u("photo-1551632811-561732d1e306") },
  { id: "hills", label: "Hills", blurb: "Cool air and mountain towns.", image: u("photo-1626621341517-bbf3d9990a23") },
  { id: "honeymoon", label: "Honeymoon", blurb: "Slow, pretty, just the two of you.", image: u("photo-1514282401047-d79a71a590e8") },
  { id: "islands", label: "Islands", blurb: "Ferries, reefs, turquoise.", image: u("photo-1589308078059-be1415eab4c3") },
  { id: "luxury", label: "Luxury", blurb: "Villas, suites, no rush.", image: u("photo-1566073771259-6a8506099945") },
  { id: "pilgrimage", label: "Pilgrimage", blurb: "Faith, ghats, sacred cities.", image: u("photo-1561361513-2d000a50f0dc") },
  { id: "rafting", label: "Rafting", blurb: "River runs and white water.", image: u("photo-1530866495561-507c9faab2ed") },
  { id: "roadtrip", label: "Road trip", blurb: "Wheels, playlists, open sky.", image: u("photo-1449965408869-eaa3f722e40d") },
  { id: "safari", label: "Safari", blurb: "Dawn drives and big sky.", image: u("photo-1516426122078-c23e76319801") },
  { id: "scuba", label: "Scuba", blurb: "Reefs, wrecks, blue water.", image: u("photo-1544551763-46a013bb70d5") },
  { id: "ski", label: "Ski", blurb: "Snow, lifts, alpine nights.", image: u("photo-1551698618-1dfe5d97d256") },
  { id: "trekking", label: "Trekking", blurb: "Multi-day paths in the hills.", image: u("photo-1589182373726-e4f658ab50f0") },
  { id: "wellness", label: "Wellness", blurb: "Yoga, quiet, reset.", image: u("photo-1544367567-0f2fcb009e0b") },
  { id: "wildlife", label: "Wildlife", blurb: "Parks, reefs, wild things.", image: u("photo-1546182990-dffeafbe841d") },
];

/** Activity-forward vibes for Home + taste modal (shared marketing taxonomy). */
export const HOME_VIBES = [
  "hiking",
  "trekking",
  "biking",
  "beach",
  "adventure",
  "rafting",
  "scuba",
  "wildlife",
  "hills",
  "city",
  "food",
  "camping",
].map((id) => TRAVEL_WAYS.find((w) => w.id === id)).filter(Boolean);

export const THEMES = [
  { id: "", label: "All" },
  ...TRAVEL_WAYS.map((w) => ({ id: w.id, label: w.label })),
];

export const BUDGETS = [
  { id: "", label: "Any budget" },
  { id: "15000", label: "Under ₹15k" },
  { id: "30000", label: "Under ₹30k" },
  { id: "60000", label: "Under ₹60k" },
  { id: "100000", label: "Under ₹1L" },
];

export const DURATIONS = [
  { id: "", label: "Any length" },
  { id: "weekend", label: "Weekend", maxDays: 3 },
  { id: "week", label: "1 week", maxDays: 8 },
  { id: "long", label: "2+ weeks", minDays: 10 },
];

export const SORTS = [
  { id: "best", label: "Best" },
  { id: "cheapest", label: "Cheapest" },
  { id: "trending", label: "Trending" },
  { id: "az", label: "A-Z" },
];

/** Popular destination IATAs for flight-deal rails (global). */
export const HOT_DEST_IATAS = [
  "DXB", "BKK", "SIN", "DPS", "MLE", "CDG", "LHR", "JFK", "IST", "HKT", "GOI", "BOM",
];

export function getDestinationBySlug(slug) {
  const key = String(slug || "").toLowerCase();
  return EXPLORE_CATALOG.find((d) => d.slug === key || d.id === key) || null;
}

/** Destinations tagged with a travel-way theme (beach, hills, pilgrimage, …). */
export function destinationsByTheme(themeId) {
  const id = String(themeId || "").trim();
  if (!id) return EXPLORE_CATALOG;
  return EXPLORE_CATALOG.filter((d) => (d.themes || []).includes(id));
}

export function relatedDestinations(dest, limit = 6) {
  if (!dest) return [];
  return EXPLORE_CATALOG.filter(
    (d) =>
      d.id !== dest.id &&
      (d.continent === dest.continent ||
        d.themes.some((t) => dest.themes.includes(t)))
  )
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, limit);
}

export function sampleDatesForMonth(monthKey) {
  /** @param {string} monthKey YYYY-MM or "" for anytime (next ~45 days) */
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!monthKey) {
    for (let i = 7; i <= 45; i += 4) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(ymd(d));
    }
    return dates.slice(0, 10);
  }

  const [ys, ms] = monthKey.split("-").map(Number);
  const year = ys;
  const monthIndex = ms - 1;
  const days = [5, 8, 12, 15, 18, 22, 25, 28].filter((day) => {
    const d = new Date(year, monthIndex, day);
    return d.getMonth() === monthIndex && d >= today;
  });
  for (const day of days) {
    dates.push(ymd(new Date(year, monthIndex, day)));
  }
  if (!dates.length) {
    // Month is past or empty - sample next month
    const d = new Date(year, monthIndex + 1, 8);
    dates.push(ymd(d));
  }
  return dates.slice(0, 10);
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function upcomingMonths(count = 6) {
  const out = [{ id: "", label: "Anytime" }];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    out.push({ id, label });
  }
  return out;
}
