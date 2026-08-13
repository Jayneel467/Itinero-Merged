/**
 * Destination travel intel for Explore detail.
 * Snapshot for planning - not a prescription. Confirm vaccines with a clinic
 * and visas with the embassy / official immigration site before you fly.
 */

const ROUTINE = [
  { name: "Routine (Tdap, MMR, polio, flu)", note: "Keep childhood + adult boosters up to date." },
  { name: "Hepatitis A", note: "Food and water exposure on most leisure trips." },
  { name: "Typhoid", note: "Useful where street food and tap water are common." },
  { name: "Hepatitis B", note: "If you might need medical care or stay longer." },
];

const DISCLAIMER =
  "Planning snapshot only. Confirm vaccines with a travel clinic 4-6 weeks before departure, and visas on the official immigration site. Rules change.";

function extraTz(key) {
  if (key === "US") return "Varies (ET / PT / etc.) - check your city";
  if (key === "MX") return "CDMX CST; Cancún EST";
  if (key === "AU") return "Sydney/Melbourne AEST/AEDT";
  return "";
}

function schengen(extra = {}) {
  return {
    currency: { code: "EUR", name: "Euro", tip: "Cards widely accepted. Carry some cash for markets." },
    plugs: "Type C / E / F, 230V",
    language: extra.language || ["Local language", "English in tourist areas"],
    timezone: extra.timezone || "CET / CEST",
    callingCode: extra.callingCode || "",
    emergency: { all: "112", note: extra.emergencyNote || "112 works EU-wide." },
    visa: {
      indian:
        extra.visaIndian ||
        "Indian passports need a Schengen visa (Type C) before travel. Apply via VFS / embassy. Passport 3+ months beyond return, travel insurance (~€30k), itinerary, funds. Start 4-6 weeks early.",
      general: extra.visaGeneral || "Many non-EU passports need Schengen. ETIAS for visa-exempt nationals when live.",
    },
    health: {
      required: [],
      recommended: [
        { name: "Routine boosters", note: "Tdap, MMR, flu." },
        { name: "Hepatitis A", note: "Optional for short city breaks; useful if eating widely." },
        { name: "COVID / respiratory", note: "Follow current airline and local rules." },
      ],
      malaria: extra.malaria || "No malaria risk in these cities.",
      water: extra.water || "Tap water is generally safe in Western/Northern Europe. Still fine to use bottled if you prefer.",
      altitude: extra.altitude || "",
      other: extra.healthOther || [],
    },
    when: extra.when || {
      best: "Apr-Jun and Sep-Oct - milder weather, fewer crowds.",
      avoid: "August in south Europe is hottest and busiest.",
      seasons: [
        { name: "Spring", months: "Mar-May", note: "Pleasant city walking." },
        { name: "Summer", months: "Jun-Aug", note: "Long days, peak prices." },
        { name: "Autumn", months: "Sep-Nov", note: "Soft light, good value." },
        { name: "Winter", months: "Dec-Feb", note: "Christmas markets / ski nearby." },
      ],
    },
    safety: extra.safety || {
      level: "Normal tourist caution",
      tips: ["Watch bags on metro and in tourist squares.", "Use licensed taxis / official apps."],
    },
    money: extra.money || {
      cards: "Visa/Mastercard widely accepted.",
      atm: "ATMs everywhere. Notify your bank.",
      tipping: "Round up or 5-10% if service not included.",
    },
    gettingAround: extra.gettingAround || ["Walk + metro/tram.", "Airport express or taxi with meter/app."],
    culture: extra.culture || ["Dress modestly in churches.", "Book big museums ahead."],
    packing: extra.packing || ["Layers", "Comfortable walking shoes", "Universal adaptor"],
    documents: extra.documents || [
      "Passport (validity as per visa)",
      "Schengen visa + insurance",
      "Return ticket / hotel proof",
    ],
    alerts: extra.alerts || [],
    official: extra.official || [],
    ...extra.rest,
  };
}

export const COUNTRY_INTEL = {
  Kenya: {
    iso: "KE",
    currency: { code: "KES", name: "Kenyan shilling", tip: "USD is used in some safari lodges. Cards in Nairobi; cash in parks." },
    language: ["English", "Swahili"],
    timezone: "EAT (UTC+3)",
    plugs: "Type G, 240V",
    callingCode: "+254",
    emergency: { police: "999 / 112", ambulance: "999", note: "Save lodge / driver numbers on safari." },
    visa: {
      indian:
        "Indian passports generally need a Kenya eTA / e-visa before travel (immigration.go.ke). Passport 6 months validity, blank page, return ticket. Apply online - do not assume visa on arrival.",
      general: "Most visitors need eTA. Confirm on the official Kenya immigration portal; rules change.",
    },
    health: {
      required: [
        {
          name: "Yellow fever certificate",
          note:
            "Required if you arrive from (or transit) a yellow-fever endemic country. Direct India → Kenya is usually not on that mandatory list, but the vaccine is still strongly recommended for Kenya (especially safari / western / coastal areas). Carry the yellow card if you have it. Some clinics and lodges still ask.",
        },
      ],
      recommended: [
        ...ROUTINE,
        { name: "Yellow fever", note: "Recommended for Kenya even on a Nairobi + Mara trip. Get it ≥10 days before travel." },
        { name: "Rabies", note: "If safari, rural stays, or animal contact." },
        { name: "Cholera", note: "Occasionally advised for outbreaks - ask the clinic." },
      ],
      malaria:
        "Malaria risk is real outside high-altitude Nairobi. Maasai Mara, Amboseli, Tsavo, the coast (Mombasa/Diani) - prophylaxis is usually recommended. Nairobi city (~1,800 m) is lower risk but not zero if you day-trip. Use DEET, long sleeves at dusk, nets in lodges.",
      water: "Bottled or boiled. Avoid tap ice outside good hotels.",
      altitude: "Nairobi is ~1,795 m - mild. No AMS like Leh, but drink water and take it easy day one.",
      other: [
        "Sun + dehydration on game drives.",
        "Tsetse flies in some parks - wear neutral colours, not blue/black.",
        "Travel insurance with medical evacuation for safari.",
      ],
    },
    when: {
      best: "Late Jun-Oct (Great Migration in Mara, dry roads) and Jan-Feb (calving in some parks, short dry).",
      avoid: "Apr-May long rains - muddy park tracks, some camps close.",
      seasons: [
        { name: "Dry / migration", months: "Jul-Oct", note: "Best wildlife viewing in Mara. Cool mornings, book early." },
        { name: "Short dry", months: "Jan-Feb", note: "Hotter, good for many parks." },
        { name: "Long rains", months: "Mar-May", note: "Lush, fewer tourists, harder driving." },
        { name: "Short rains", months: "Nov-Dec", note: "Afternoon showers; still doable." },
      ],
    },
    safety: {
      level: "Urban caution + organised safari",
      tips: [
        "Nairobi: use hotel cars / Uber / Bolt; avoid walking isolated streets at night.",
        "Safari: stay in the vehicle unless the guide says otherwise. Don't feed wildlife.",
        "Keep copies of passport + yellow-fever card separate from originals.",
      ],
    },
    money: {
      cards: "Nairobi hotels and malls take cards. Parks and small shops often cash (KES).",
      atm: "ATMs at NBO airport and city malls. Tell your bank.",
      tipping: "Safari: ~USD 10-15/day for driver-guide, less for camp staff - in envelope at end.",
    },
    gettingAround: [
      "Fly into Jomo Kenyatta (NBO). Wilson (WIL) for many domestic safari hops.",
      "Nairobi ↔ Mara: scheduled bush flight (~45-60 min) or 5-6 hr road.",
      "Don't self-drive parks unless experienced. Use a registered safari operator.",
    ],
    culture: [
      "Ask before photographing people, especially Maasai communities.",
      "Dress modestly in towns; khaki/earth tones on safari.",
      "Right-hand traffic. English is widely spoken.",
    ],
    packing: [
      "Neutral safari clothes, fleece for dawn drives",
      "Binoculars, zoom lens, power bank",
      "DEET, sunscreen, malaria tablets if prescribed",
      "Yellow-fever card + copies",
      "Type G adaptor",
    ],
    documents: [
      "Passport (6 months)",
      "Kenya eTA / e-visa printout",
      "Yellow fever certificate if you have it / if required by routing",
      "Return ticket, lodge vouchers, travel insurance",
    ],
    alerts: [
      { tone: "health", label: "Yellow fever recommended" },
      { tone: "health", label: "Malaria prophylaxis for parks" },
      { tone: "visa", label: "eTA / e-visa before you fly" },
    ],
    official: [
      { label: "Kenya eTA / immigration", href: "https://www.etakenya.go.ke/" },
      { label: "WHO yellow fever", href: "https://www.who.int/emergencies/yellow-fever" },
    ],
  },

  Tanzania: {
    iso: "TZ",
    currency: { code: "TZS", name: "Tanzanian shilling", tip: "USD common in Zanzibar hotels. Small notes for Stone Town." },
    language: ["Swahili", "English"],
    timezone: "EAT (UTC+3)",
    plugs: "Type D / G, 230V",
    callingCode: "+255",
    emergency: { police: "112 / 999", ambulance: "114", note: "Zanzibar: also save hotel / dive operator." },
    visa: {
      indian:
        "Indian passports typically need a Tanzania e-visa before travel (or VOA at some airports - e-visa is safer). Zanzibar is Tanzania: one visa covers mainland + island. Passport 6 months.",
      general: "Most visitors need a visa. Apply via immigration.go.tz.",
    },
    health: {
      required: [
        {
          name: "Yellow fever certificate",
          note:
            "Required if arriving from a yellow-fever endemic country. Direct India → Zanzibar/DAR usually not mandatory, but vaccine is recommended for Tanzania. Carry the certificate. Some Zanzibar arrivals have been asked.",
        },
      ],
      recommended: [
        ...ROUTINE,
        { name: "Yellow fever", note: "Recommended for Tanzania including Zanzibar." },
        { name: "Rabies", note: "Rural / animal contact." },
      ],
      malaria:
        "Zanzibar and mainland have malaria risk. Prophylaxis commonly advised plus nets and DEET. Don't skip just because you're on a beach holiday.",
      water: "Bottled. Ice only at reputable hotels.",
      altitude: "",
      other: ["Reef-safe sunscreen.", "Currents on east-coast beaches can be strong."],
    },
    when: {
      best: "Jun-Oct dry; Dec-Feb warm with short rains possible. Diving often good Jun-Oct and Dec-Mar.",
      avoid: "Apr-May long rains - ferries and some hotels quieter / closed.",
      seasons: [
        { name: "Dry", months: "Jun-Oct", note: "Best safari on mainland; pleasant Zanzibar." },
        { name: "Hot", months: "Dec-Mar", note: "Beach weather, possible showers." },
        { name: "Long rains", months: "Apr-May", note: "Lush, fewer crowds." },
      ],
    },
    safety: {
      level: "Normal island + town caution",
      tips: [
        "Stone Town: watch bags in alleys at night.",
        "Use registered taxis / hotel transfers from ZNZ airport.",
        "Respect dress codes near Stone Town / villages - cover shoulders and knees.",
      ],
    },
    money: {
      cards: "Hotels take cards; many shops cash (USD or TZS).",
      atm: "Stone Town ATMs exist; don't rely on village ATMs.",
      tipping: "10% in restaurants if not included. Guides separately.",
    },
    gettingAround: [
      "Fly ZNZ (Abeid Amani Karume). Ferries from Dar (check weather).",
      "Spice tours and north beaches by private transfer.",
    ],
    culture: ["Muslim island - modest dress outside resorts.", "Ask before photos in Stone Town."],
    packing: ["Light linen, modest cover-up", "Reef shoes", "DEET + malaria tablets if prescribed", "YF card"],
    documents: ["Passport", "Tanzania visa / e-visa", "Yellow fever card if held", "Return ticket"],
    alerts: [
      { tone: "health", label: "Yellow fever recommended" },
      { tone: "health", label: "Malaria risk including Zanzibar" },
      { tone: "visa", label: "e-visa before travel" },
    ],
    official: [{ label: "Tanzania immigration", href: "https://www.immigration.go.tz/" }],
  },

  "South Africa": {
    iso: "ZA",
    currency: { code: "ZAR", name: "Rand", tip: "Cards widely used in Cape Town. Keep some cash for townships / markets." },
    language: ["English", "Afrikaans", "isiXhosa and others"],
    timezone: "SAST (UTC+2)",
    plugs: "Type M / N / C, 230V (Type M still common)",
    callingCode: "+27",
    emergency: { police: "10111", ambulance: "10177", all: "112 from mobile" },
    visa: {
      indian:
        "Indian passports generally need a South Africa visa before travel (no VOA). Apply via VFS. Passport 30+ days beyond stay, two blank pages. Start early.",
      general: "Many nationalities are visa-exempt; Indians typically are not. Check DHA.",
    },
    health: {
      required: [
        {
          name: "Yellow fever if arriving from endemic country",
          note: "Not required for direct India → CPT. Required if you transit a YF country en route.",
        },
      ],
      recommended: [
        ...ROUTINE,
        { name: "Rabies", note: "If safari / township animals." },
      ],
      malaria:
        "Cape Town and the Garden Route: no malaria. Kruger / lowveld / northeast: malaria risk - prophylaxis if you add a safari there.",
      water: "Tap water generally safe in Cape Town. Bottled if unsure.",
      altitude: "Table Mountain hikes - hydration, wind, sun.",
      other: ["Strong UV. Load-shedding: hotels have backups; carry a power bank."],
    },
    when: {
      best: "Nov-Mar summer beaches; whale season roughly Jun-Nov. Dec-Jan is peak and windy (Cape Doctor).",
      avoid: "",
      seasons: [
        { name: "Summer", months: "Nov-Mar", note: "Beaches, long days, SE wind." },
        { name: "Winter", months: "Jun-Aug", note: "Green, whales, some rain. Good for wine country." },
      ],
    },
    safety: {
      level: "Be street-smart",
      tips: [
        "Don't walk isolated beaches / CBD streets with valuables at night.",
        "Use Uber / hotel taxis. Lock car doors in traffic.",
        "Hike Table Mountain with a group / daylight / water.",
      ],
    },
    money: { cards: "Widely accepted.", atm: "Everywhere in city.", tipping: "10-15% restaurants." },
    gettingAround: ["CPT airport → city 20-30 min.", "Uber works well. MyCiTi bus. Car for Cape Peninsula."],
    culture: ["Tipping culture like the US more than Europe.", "Load-shedding etiquette - hotels will brief you."],
    packing: ["Windbreaker", "Sunscreen", "Type M adaptor or universal", "Hiking shoes"],
    documents: ["Passport", "SA visa", "Return ticket", "Insurance"],
    alerts: [{ tone: "visa", label: "Visa before travel (Indian passports)" }],
    official: [{ label: "South Africa DHA", href: "https://www.dha.gov.za/" }],
  },

  Egypt: {
    iso: "EG",
    currency: { code: "EGP", name: "Egyptian pound", tip: "Agree taxi fares or use Uber. USD/EUR sometimes quoted at tourist sites." },
    language: ["Arabic", "English in tourist areas"],
    timezone: "EET (UTC+2)",
    plugs: "Type C / F, 220V",
    callingCode: "+20",
    emergency: { police: "122", touristPolice: "126", ambulance: "123" },
    visa: {
      indian:
        "Indian passports typically need an Egypt e-visa or visa on arrival at CAI (check current list). Passport 6 months. e-visa in advance is smoother.",
      general: "Many nationalities VOA / e-visa. Confirm visa2egypt.gov.eg.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Hepatitis A + Typhoid", note: "Important for street food." },
      ],
      malaria: "Generally no malaria in Cairo / Nile tourist corridor.",
      water: "Bottled only. Avoid tap ice and unpeeled fruit from street stalls if your stomach is sensitive.",
      altitude: "",
      other: ["Heat exhaustion at pyramids - hat, water, early morning visit.", "Dust / pollution in Cairo."],
    },
    when: {
      best: "Oct-Apr cooler for pyramids and Nile. May-Sep is very hot.",
      avoid: "Peak summer midday sightseeing.",
      seasons: [
        { name: "Cool", months: "Nov-Mar", note: "Best walking weather." },
        { name: "Hot", months: "May-Sep", note: "Early starts only." },
      ],
    },
    safety: {
      level: "Tourist-police presence; normal caution",
      tips: [
        "Use licensed guides at Giza. Ignore aggressive touts.",
        "Dress modestly at mosques; women carry a scarf.",
        "Uber in Cairo is easier than random taxis.",
      ],
    },
    money: { cards: "Hotels yes; many sites cash.", atm: "Cairo malls / hotels.", tipping: "Baksheesh is expected - small notes." },
    gettingAround: ["CAI airport. Uber. Pre-book pyramid / Nile day tours."],
    culture: ["Ramadan hours change.", "Ask before photos of people."],
    packing: ["Linen, scarf, sunglasses", "Electrolytes", "Comfortable shoes for sand/stone"],
    documents: ["Passport", "Egypt visa / e-visa", "Hotel voucher"],
    alerts: [{ tone: "health", label: "Bottled water + heat caution" }],
    official: [{ label: "Egypt e-visa", href: "https://www.visa2egypt.gov.eg/" }],
  },

  Morocco: {
    iso: "MA",
    currency: { code: "MAD", name: "Moroccan dirham", tip: "Cash in medina. Cards in riads and modern areas." },
    language: ["Arabic", "French", "English in tourist riads"],
    timezone: "WET / WEST",
    plugs: "Type C / E, 220V",
    callingCode: "+212",
    emergency: { police: "19", ambulance: "15", note: "From mobile often 112." },
    visa: {
      indian:
        "Indian passports generally need a Morocco visa in advance (no VOA). Apply via embassy / VFS. Passport 6 months.",
      general: "Many Western passports are visa-free; Indians typically need a visa.",
    },
    health: {
      required: [],
      recommended: ROUTINE,
      malaria: "No malaria in Marrakech / main tourist cities.",
      water: "Bottled. Be careful with salads/ice if sensitive.",
      altitude: "Atlas day trips - hydrate.",
      other: ["Sun in the medina. Modest dress reduces hassle."],
    },
    when: {
      best: "Mar-May and Sep-Nov. Summers are very hot inland.",
      avoid: "Jul-Aug peak heat in Marrakech.",
      seasons: [
        { name: "Spring / autumn", months: "Mar-May, Sep-Nov", note: "Best medina + Atlas." },
        { name: "Summer", months: "Jun-Aug", note: "Hot; riads with pools help." },
        { name: "Winter", months: "Dec-Feb", note: "Mild days, cold nights. Atlas snow possible." },
      ],
    },
    safety: {
      level: "Medina awareness",
      tips: ["Guided first walk in medina helps.", "Agree taxi price or use meters / Careem where available.", "Keep valuables zipped."],
    },
    money: { cards: "Riads yes.", atm: "Guéliz / Hivernage.", tipping: "Small dirhams for guides / hammam." },
    gettingAround: ["RAK airport. Petit / grand taxis. Train to other cities."],
    culture: ["Friday mosque rhythms.", "Ask before photos in souks."],
    packing: ["Modest layers", "Comfortable shoes for cobbles", "Scarf"],
    documents: ["Passport", "Morocco visa", "Riad confirmation"],
    alerts: [{ tone: "visa", label: "Visa before travel (Indian passports)" }],
    official: [],
  },

  India: {
    iso: "IN",
    currency: { code: "INR", name: "Indian rupee", tip: "UPI everywhere. Foreign cards: ATMs + some hotels." },
    language: ["Hindi and regional languages", "English widely in tourism"],
    timezone: "IST (UTC+5:30)",
    plugs: "Type C / D / M, 230V",
    callingCode: "+91",
    emergency: { all: "112", ambulance: "108", note: "112 is the unified emergency number." },
    visa: {
      indian: "Indian citizens: no visa for domestic travel. Carry a government photo ID (Aadhaar / passport / DL) for flights.",
      general:
        "Most foreign visitors need an e-Visa or sticker visa. Apply at indianvisaonline.gov.in. Passport 6 months, return ticket.",
    },
    health: {
      required: [],
      recommended: [
        { name: "Routine boosters", note: "Especially if you live abroad and are visiting India." },
        { name: "Hepatitis A / Typhoid", note: "For travellers not living in India." },
        { name: "Malaria", note: "Depends on region - not usually for Goa/Jaipur/Mumbai short city trips; ask for northeast / forests." },
      ],
      malaria: "Varies by state. Big tourist cities: generally low. Forest / rural / some coasts: ask a clinic.",
      water: "Bottled or filtered. Avoid tap ice from unknown stalls.",
      altitude: "",
      other: ["Sun, spicy food adjustment, pollution in some metros."],
    },
    when: {
      best: "Oct-Mar for most of north and west. Monsoon Jun-Sep (lush Kerala / Goa, flooding risk some cities). Hills: summer escape Apr-Jun.",
      avoid: "",
      seasons: [
        { name: "Winter", months: "Nov-Feb", note: "Peak tourism in Rajasthan, Goa, Kerala." },
        { name: "Summer", months: "Apr-Jun", note: "Hot plains; good for Manali / Leh / Srinagar." },
        { name: "Monsoon", months: "Jun-Sep", note: "Heavy rain many coasts; landslides in hills." },
      ],
    },
    safety: {
      level: "Normal domestic caution",
      tips: ["Use official taxis / apps (Uber, Ola, prepaid airport).", "Keep ID on flights and hotels.", "Respect local dress at temples."],
    },
    money: { cards: "UPI + cards common.", atm: "Everywhere.", tipping: "5-10% if no service charge." },
    gettingAround: ["Flights, IRCTC trains, buses. Metro in big cities."],
    culture: ["Remove shoes in temples. Ask before photos of rituals.", "Right-hand traffic."],
    packing: ["ID + boarding pass", "Light cotton / layers for hills", "Mosquito repellent"],
    documents: ["Photo ID for domestic flights", "Hotel confirmations"],
    alerts: [],
    official: [{ label: "India e-Visa (foreign visitors)", href: "https://indianvisaonline.gov.in/" }],
  },

  Nepal: {
    iso: "NP",
    currency: { code: "NPR", name: "Nepalese rupee", tip: "INR notes often accepted in Kathmandu (not coins / damaged notes). ATMs in Thamel." },
    language: ["Nepali", "English in tourist areas"],
    timezone: "NPT (UTC+5:45)",
    plugs: "Type C / D / M, 230V",
    callingCode: "+977",
    emergency: { police: "100", ambulance: "102" },
    visa: {
      indian:
        "Indian citizens: no visa. Enter with passport or other eligible ID (voter ID / Aadhaar rules can change - passport is simplest). Keep it on you.",
      general: "Most others get VOA or e-visa. Passport 6 months.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Rabies", note: "Street dogs / monkeys in some areas." },
      ],
      malaria: "Kathmandu valley: essentially none. Lowland Terai: possible - ask if you go south.",
      water: "Bottled. Don't drink tap.",
      altitude:
        "Kathmandu ~1,400 m is fine. Treks (Everest / Annapurna) need acclimatisation, Diamox only if a doctor prescribes, never rush sleep altitude.",
      other: ["Air quality in Kathmandu can be poor in winter. Mask if sensitive."],
    },
    when: {
      best: "Oct-Nov and Mar-Apr for trekking skies. Monsoon Jun-Sep is wet on trails.",
      avoid: "Monsoon high passes if you're not experienced.",
      seasons: [
        { name: "Autumn", months: "Oct-Nov", note: "Clearest mountain views." },
        { name: "Spring", months: "Mar-Apr", note: "Rhododendrons, good trek weather." },
        { name: "Monsoon", months: "Jun-Sep", note: "Lush, leeches, clouds." },
      ],
    },
    safety: {
      level: "City + trek sense",
      tips: ["Use TIMS / permits for treks.", "Only licensed agencies for Everest region.", "Earthquake-aware: know hotel exits."],
    },
    money: { cards: "Hotels yes; treks cash NPR.", atm: "Thamel / Durbar Marg.", tipping: "Trekking staff tipping is customary - ask your agency the going rate." },
    gettingAround: ["Fly KTM. Tourist buses / domestic flights to Pokhara / Lukla."],
    culture: ["Walk clockwise around stupas. Dress modestly at temples."],
    packing: ["Broken-in boots for treks", "Layers + down", "Water purification"],
    documents: ["Passport / valid ID", "Trek permits if applicable", "Insurance covering helicopter rescue for treks"],
    alerts: [{ tone: "health", label: "Altitude on treks - acclimatise" }],
    official: [],
  },

  Japan: {
    iso: "JP",
    currency: { code: "JPY", name: "Yen", tip: "Still a cash-friendly country. 7-Eleven ATMs take foreign cards." },
    language: ["Japanese", "English signage in big cities"],
    timezone: "JST (UTC+9)",
    plugs: "Type A / B, 100V (bring a proper adaptor; US-style pins)",
    callingCode: "+81",
    emergency: { police: "110", ambulance: "119" },
    visa: {
      indian:
        "Indian passports need a Japan visa in advance (no VOA). Apply via VFS / embassy. Multiple-entry possible if eligible. Start 3-4 weeks early.",
      general: "Many Western passports visa-free. Indians generally need a visa.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "Japan has excellent healthcare; no special tropical vaccines." }],
      malaria: "None.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["Summer heat/humidity Jul-Aug. Pollen in spring for some."],
    },
    when: {
      best: "Mar-May (cherry) and Oct-Nov (momiji). Avoid Golden Week if you hate crowds.",
      avoid: "",
      seasons: [
        { name: "Spring", months: "Mar-May", note: "Sakura. Book everything early." },
        { name: "Summer", months: "Jun-Aug", note: "Rainy season then heat. Festivals." },
        { name: "Autumn", months: "Sep-Nov", note: "Clear skies, foliage." },
        { name: "Winter", months: "Dec-Feb", note: "Illuminations, ski up north." },
      ],
    },
    safety: { level: "Very safe", tips: ["Keep IC card charged.", "Don't eat while walking in some areas.", "Quiet phones on trains."] },
    money: { cards: "Improving; still carry yen.", atm: "7-Eleven, JP Post.", tipping: "No tipping." },
    gettingAround: ["Suica/Pasmo. Shinkansen. Welcome Suica / IC for visitors."],
    culture: ["Shoes off indoors. Don't tip. Queue neatly."],
    packing: ["Comfortable walking shoes", "Type A adaptor", "Light layers"],
    documents: ["Passport", "Japan visa", "Hotel list for landing card"],
    alerts: [{ tone: "visa", label: "Visa before travel (Indian passports)" }],
    official: [{ label: "MOFA Japan visas", href: "https://www.mofa.go.jp/j_info/visit/visa/" }],
  },

  Thailand: {
    iso: "TH",
    currency: { code: "THB", name: "Thai baht", tip: "Cash for street food. Cards at malls/hotels." },
    language: ["Thai", "English in tourist zones"],
    timezone: "ICT (UTC+7)",
    plugs: "Type A / B / C, 220V",
    callingCode: "+66",
    emergency: { touristPolice: "1155", all: "191 / 1669 ambulance" },
    visa: {
      indian:
        "Indian passports are often visa-exempt for short tourism (check current duration - it has been 60 days) or TDAC arrival card online. Passport 6 months. Rules change - confirm immigration.go.th before you fly.",
      general: "Many nationalities visa-exempt. Overstay fines are strict.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Japanese encephalitis", note: "If rural / long stay / monsoon." },
        { name: "Rabies", note: "Stray dogs / monkeys (temples)." },
      ],
      malaria: "Bangkok, Phuket, major islands: generally no. Border forests / some rural north: possible.",
      water: "Bottled. Ice at busy street stalls is usually factory ice - still your call.",
      altitude: "",
      other: ["Dengue in rainy season - DEET, long sleeves at dusk.", "Don't touch temple monkeys."],
    },
    when: {
      best: "Nov-Feb cooler/dry for Bangkok + islands. Apr is Songkran and hot.",
      avoid: "Sep-Oct can be very wet on Andaman (Phuket).",
      seasons: [
        { name: "Cool dry", months: "Nov-Feb", note: "Peak tourism." },
        { name: "Hot", months: "Mar-May", note: "Very hot inland." },
        { name: "Rain", months: "Jun-Oct", note: "Gulf vs Andaman differ - check island." },
      ],
    },
    safety: {
      level: "Tourist-normal",
      tips: ["Grab taxi, not random tuk-tuk without a price.", "Respect the King / temples - cover shoulders.", "Scooter only with licence + helmet."],
    },
    money: { cards: "Hotels/malls yes.", atm: "Everywhere; foreign-card fees apply.", tipping: "Small change / 10% nicer restaurants." },
    gettingAround: ["BKK / HKT / DMK. BTS/MRT in Bangkok. Ferries to islands."],
    culture: ["Wai greeting. Buddha images - never disrespect.", "Take shoes off in temples/homes."],
    packing: ["Light clothes + temple cover-up", "DEET", "Reef-safe sunscreen"],
    documents: ["Passport 6 months", "Return ticket", "TDAC / visa as required"],
    alerts: [{ tone: "health", label: "Dengue caution in rainy season" }],
    official: [{ label: "Thai immigration", href: "https://www.immigration.go.th/" }],
  },

  Indonesia: {
    iso: "ID",
    currency: { code: "IDR", name: "Rupiah", tip: "Cash for warungs. Cards at nicer villas." },
    language: ["Indonesian", "English in south Bali"],
    timezone: "WITA (UTC+8) in Bali",
    plugs: "Type C / F, 230V",
    callingCode: "+62",
    emergency: { police: "110", ambulance: "118" },
    visa: {
      indian:
        "Indian passports typically get visa on arrival / e-VOA for tourism (check current length, often 30 days extendable). Passport 6 months, return ticket, proof of funds. Apply e-VOA before flying to skip queues.",
      general: "VOA / visa-exempt lists change. Confirm imigrasi.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Rabies", note: "Street dogs / monkeys (Ubud)." },
        { name: "Japanese encephalitis", note: "Rural rice-field stays." },
      ],
      malaria: "South Bali tourist belt: generally low. Eastern islands / rural: ask.",
      water: "Bottled. Don't drink tap.",
      altitude: "",
      other: ["Dengue year-round, worse in wet season.", "Scooter accidents are the #1 tourist injury - helmet, licence, insurance."],
    },
    when: {
      best: "Apr-Jun and Sep-Oct. Jul-Aug peak. Wet ~Nov-Mar (still doable in south Bali).",
      avoid: "",
      seasons: [
        { name: "Dry", months: "Apr-Oct", note: "Best beach + rice terrace light." },
        { name: "Wet", months: "Nov-Mar", note: "Afternoon storms, greener, fewer crowds." },
      ],
    },
    safety: {
      level: "Normal + scooter caution",
      tips: ["International licence to ride.", "Temple etiquette (sarong).", "Drink-spiking: watch your glass in nightlife."],
    },
    money: { cards: "Villas/cafés yes.", atm: "Kuta/Canggu/Ubud. Use official ATMs.", tipping: "Round up; 5-10% if no service charge." },
    gettingAround: ["DPS airport. Grab. Private driver for day trips. Fast boats to islands - check weather."],
    culture: ["Hindu Bali - ceremonies can close roads. Dress modestly at temples.", "Nyepi (Day of Silence): airport/roads shut - don't fly that day."],
    packing: ["Sarong for temples", "Mosquito repellent", "Reef-safe sunscreen", "Scooter licence if riding"],
    documents: ["Passport 6 months", "e-VOA / VOA", "Return ticket"],
    alerts: [{ tone: "health", label: "Dengue + bottled water" }],
    official: [{ label: "Indonesia e-VOA", href: "https://molina.imigrasi.go.id/" }],
  },

  Singapore: {
    iso: "SG",
    currency: { code: "SGD", name: "Singapore dollar", tip: "Cards + GrabPay everywhere. Hawker centres often accept cards now." },
    language: ["English", "Mandarin", "Malay", "Tamil"],
    timezone: "SGT (UTC+8)",
    plugs: "Type G, 230V",
    callingCode: "+65",
    emergency: { police: "999", ambulance: "995" },
    visa: {
      indian:
        "Indian passports generally need a Singapore visa (some categories eligible for visa-free/VOA with conditions - most tourists still apply via authorised agents / ICA). Confirm ica.gov.sg. Passport 6 months.",
      general: "Many passports visa-free. Indians usually visa-required.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "No special tropical shots for a short city break." }],
      malaria: "None.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["Haze some months. Dengue exists - DEET in evenings if parks/outdoors."],
    },
    when: {
      best: "Feb-Apr slightly drier. Tropical year-round; Nov-Jan rainier.",
      avoid: "",
      seasons: [{ name: "Year-round", months: "All", note: "Hot, humid. Indoor + hawker hopping works any month." }],
    },
    safety: { level: "Extremely safe", tips: ["Chewing gum / littering / smoking rules are strict.", "Drugs: zero tolerance."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "Not expected; service charge often included." },
    gettingAround: ["Changi → MRT. EZ-Link / SimplyGo. Grab."],
    culture: ["Queue. Don't eat on MRT.", "Hawker hygiene ratings are posted."],
    packing: ["Light clothes", "Type G adaptor", "Light jacket for AC"],
    documents: ["Passport", "Singapore visa if required", "SG Arrival Card (online)"],
    alerts: [],
    official: [{ label: "ICA Singapore", href: "https://www.ica.gov.sg/" }],
  },

  Maldives: {
    iso: "MV",
    currency: { code: "MVR", name: "Rufiyaa", tip: "USD widely used at resorts. 1 USD ≈ 15.4 MVR officially." },
    language: ["Dhivehi", "English at resorts" ],
    timezone: "MVT (UTC+5)",
    plugs: "Type G, 230V (resorts often have universal sockets)",
    callingCode: "+960",
    emergency: { police: "119", ambulance: "102" },
    visa: {
      indian: "Indian passports: visa on arrival for tourism (typically 30 days) with passport 6 months, return ticket, proof of hotel/resort, sufficient funds. Free VOA for eligible tourists - confirm immigration.gov.mv.",
      general: "Most tourists get VOA. Must have confirmed accommodation.",
    },
    health: {
      required: [],
      recommended: ROUTINE,
      malaria: "No malaria.",
      water: "Desalinated / bottled at resorts. Don't drink tap.",
      altitude: "",
      other: ["Strong sun + reef. Reef-safe sunscreen required at many properties.", "Seasickness on speedboat transfers."],
    },
    when: {
      best: "Dec-Apr dry (peak, pricier). May-Nov wetter with good rates and manta season in some atolls.",
      avoid: "",
      seasons: [
        { name: "Dry", months: "Dec-Apr", note: "Best beach weather." },
        { name: "Wet", months: "May-Nov", note: "Short storms, greener deals, diving often still excellent." },
      ],
    },
    safety: { level: "Resort-safe", tips: ["Respect local island dress codes outside resorts.", "Alcohol only at licensed resorts, not inhabited local islands."] },
    money: { cards: "Resorts on card.", atm: "Malé; not on most resort islands.", tipping: "Service charge often 10% already. Extra for butler/guide if exceptional." },
    gettingAround: ["Fly MLE. Speedboat or seaplane to resort - seaplanes usually daylight only."],
    culture: ["Muslim country. Modest dress on local islands and Malé."],
    packing: ["Reef-safe SPF", "Light cover-up for Malé", "Motion-sickness tablets if boats"],
    documents: ["Passport 6 months", "Resort confirmation", "Return ticket", "IMUGA / arrival form if required"],
    alerts: [],
    official: [{ label: "Maldives immigration", href: "https://immigration.gov.mv/" }],
  },

  "Sri Lanka": {
    iso: "LK",
    currency: { code: "LKR", name: "Sri Lankan rupee", tip: "Cards in Colombo hotels. Cash up-country." },
    language: ["Sinhala", "Tamil", "English widely in tourism"],
    timezone: "SLST (UTC+5:30)",
    plugs: "Type D / G / M, 230V",
    callingCode: "+94",
    emergency: { police: "119", ambulance: "1990" },
    visa: {
      indian: "Indian passports typically need ETA (eta.gov.lk) before travel. Passport 6 months. Don't skip ETA assuming VOA.",
      general: "ETA for most visitors.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Japanese encephalitis", note: "If rural / long stay." },
      ],
      malaria: "Largely eliminated - generally no prophylaxis for standard tourist circuits. Confirm with clinic.",
      water: "Bottled.",
      altitude: "Hill country is mild.",
      other: ["Dengue in monsoon. DEET.", "Train to Ella: book early."],
    },
    when: {
      best: "Dec-Mar south/west (Colombo, Galle, safari). May-Sep east coast. Two monsoons - pick coast accordingly.",
      avoid: "",
      seasons: [
        { name: "SW coast dry", months: "Dec-Mar", note: "Colombo-Galle-Yala classic." },
        { name: "East dry", months: "May-Sep", note: "Trinco / Arugam Bay." },
      ],
    },
    safety: { level: "Normal", tips: ["Temple dress code.", "Use registered taxis / PickMe."] },
    money: { cards: "Cities yes.", atm: "Colombo / Kandy.", tipping: "10% if not included." },
    gettingAround: ["CMB airport. PickMe. Trains scenic but sell out."],
    culture: ["No Buddha tattoos / disrespect. Remove shoes at temples."],
    packing: ["Temple cover-up", "DEET", "Light rain jacket"],
    documents: ["Passport", "ETA approval", "Return ticket"],
    alerts: [{ tone: "visa", label: "ETA before you fly" }],
    official: [{ label: "Sri Lanka ETA", href: "https://www.eta.gov.lk/" }],
  },

  UAE: {
    iso: "AE",
    currency: { code: "AED", name: "Dirham", tip: "Cards everywhere. 1 USD ≈ 3.67 AED (pegged)." },
    language: ["Arabic", "English everywhere in Dubai/Abu Dhabi"],
    timezone: "GST (UTC+4)",
    plugs: "Type G, 230V",
    callingCode: "+971",
    emergency: { police: "999", ambulance: "998" },
    visa: {
      indian:
        "Many Indian passports get visa on arrival (14 days) if they hold a valid US/UK/EU visa or residence, or may need a pre-arranged UAE visa via airline / ICP. Rules change - check u.ae / ICP and your airline before you fly. Passport 6 months.",
      general: "GCC and many Western passports visa-free. Others pre-arrange.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "No special shots for a short Dubai trip." }],
      malaria: "None.",
      water: "Tap is desalinated and generally safe; many still drink bottled.",
      altitude: "",
      other: ["Extreme heat May-Sep - outdoor sightseeing early morning only.", "Alcohol only in licensed venues."],
    },
    when: {
      best: "Nov-Mar pleasant. Apr & Oct shoulder. May-Sep very hot (beach + malls still work).",
      avoid: "",
      seasons: [
        { name: "Cool", months: "Nov-Mar", note: "Best for desert + corniche." },
        { name: "Hot", months: "May-Sep", note: "50°C possible. Plan indoors midday." },
      ],
    },
    safety: { level: "Very safe", tips: ["Respect dress in malls/mosques.", "Zero tolerance for drugs / vape rules - check current vape law.", "Don't photograph people / police without consent."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "10-15% restaurants if no service charge." },
    gettingAround: ["DXB / AUH. Metro in Dubai. RTA taxi / Uber / Careem. Salik tolls on cars."],
    culture: ["Friday mosque / family day rhythms.", "Ramadan: no eating/drinking in public daylight."],
    packing: ["Light modest clothes", "Scarf for Grand Mosque", "Type G adaptor", "Sunscreen"],
    documents: ["Passport 6 months", "UAE visa / VOA eligibility proof", "Hotel booking"],
    alerts: [{ tone: "visa", label: "Check VOA eligibility vs pre-visa" }],
    official: [{ label: "UAE ICP / u.ae", href: "https://u.ae/" }],
  },

  Qatar: {
    iso: "QA",
    currency: { code: "QAR", name: "Qatari riyal", tip: "Cards everywhere. Pegged ~3.64 per USD." },
    language: ["Arabic", "English widely"],
    timezone: "AST (UTC+3)",
    plugs: "Type D / G, 240V",
    callingCode: "+974",
    emergency: { all: "999" },
    visa: {
      indian: "Many Indian travellers are visa-free / VOA for short tourism - confirm Hayya / MOI Qatar before travel. Passport 6 months.",
      general: "Check MOI visa-free list.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None.",
      water: "Bottled or hotel tap as advised.",
      altitude: "",
      other: ["Summer heat is extreme."],
    },
    when: { best: "Nov-Mar.", avoid: "Jul-Aug outdoor days.", seasons: [{ name: "Cool", months: "Nov-Mar", note: "Best." }] },
    safety: { level: "Very safe", tips: ["Respect local law and dress.", "Alcohol only licensed venues."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "10% if not included." },
    gettingAround: ["DOH (Hamad). Metro. Karwa taxi / Uber."],
    culture: ["Modest dress in Souq Waqif / mosques."],
    packing: ["Light modest clothes", "Type G adaptor"],
    documents: ["Passport", "Visa status confirmation", "Hotel"],
    alerts: [],
    official: [{ label: "Qatar MOI visas", href: "https://www.moi.gov.qa/" }],
  },

  Turkey: {
    iso: "TR",
    currency: { code: "TRY", name: "Turkish lira", tip: "Cards in Istanbul. Keep lira cash for bazaars. Rates move fast." },
    language: ["Turkish", "English in Sultanahmet / Beyoğlu"],
    timezone: "TRT (UTC+3)",
    plugs: "Type C / F, 230V",
    callingCode: "+90",
    emergency: { all: "112" },
    visa: {
      indian: "Indian passports generally need an e-visa (evisa.gov.tr) before travel. Passport 6 months. Print / screenshot the e-visa.",
      general: "Many nationalities e-visa or exemption. Indians typically e-visa.",
    },
    health: {
      required: [],
      recommended: ROUTINE,
      malaria: "None in Istanbul.",
      water: "Bottled preferred.",
      altitude: "",
      other: ["Cats are everywhere - lovely, don't feed from your plate."],
    },
    when: {
      best: "Apr-Jun and Sep-Oct. Summer is hot and crowded. Winter is damp, cheap, still magical.",
      avoid: "",
      seasons: [
        { name: "Shoulder", months: "Apr-Jun, Sep-Oct", note: "Best walking." },
        { name: "Summer", months: "Jul-Aug", note: "Hot, cruise crowds." },
      ],
    },
    safety: { level: "Big-city caution", tips: ["Watch bags in tram / Grand Bazaar.", "Use BiTaksi / Uber.", "Scam: unsolicited 'help' to restaurants."] },
    money: { cards: "Yes in tourist zones.", atm: "Everywhere.", tipping: "5-10% restaurants." },
    gettingAround: ["IST / SAW. Istanbulkart for tram/metro/ferry."],
    culture: ["Cover shoulders/knees in mosques; women carry a scarf.", "Shoes off in mosques."],
    packing: ["Scarf", "Tram-friendly shoes", "Light layers"],
    documents: ["Passport", "e-visa", "Hotel"],
    alerts: [{ tone: "visa", label: "e-visa before you fly" }],
    official: [{ label: "Turkey e-visa", href: "https://www.evisa.gov.tr/" }],
  },

  UK: {
    iso: "GB",
    currency: { code: "GBP", name: "Pound sterling", tip: "Contactless everywhere. No need for much cash." },
    language: ["English"],
    timezone: "GMT / BST",
    plugs: "Type G, 230V",
    callingCode: "+44",
    emergency: { all: "999 / 112" },
    visa: {
      indian:
        "Indian passports need a UK Standard Visitor visa before travel. Apply via VFS. Biometrics required. Start several weeks early. ETA is for visa-exempt nationalities - not a substitute for Indian visitor visas.",
      general: "Visa or ETA depending on nationality.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["Weather changes hourly - layers."],
    },
    when: {
      best: "May-Sep for parks and long evenings. December for lights. Always pack rain.",
      avoid: "",
      seasons: [{ name: "Year-round", months: "All", note: "Museums work any month." }],
    },
    safety: { level: "Normal big city", tips: ["Watch phones on Tube.", "Night buses / Uber after last Tube."] },
    money: { cards: "Contactless everywhere.", atm: "Everywhere.", tipping: "10-12.5% if no service charge." },
    gettingAround: ["Heathrow Express / Elizabeth Line / Piccadilly. Oyster / contactless bank card."],
    culture: ["Queue. Stand on the right on escalators."],
    packing: ["Rain jacket", "Type G adaptor", "Comfortable walking shoes"],
    documents: ["Passport", "UK visa vignette / BRP as applicable", "Proof of funds / hotel if asked"],
    alerts: [{ tone: "visa", label: "UK visitor visa before travel" }],
    official: [{ label: "UK visas GOV.UK", href: "https://www.gov.uk/browse/visas-immigration" }],
  },

  USA: {
    iso: "US",
    currency: { code: "USD", name: "US dollar", tip: "Cards everywhere. Tip 15-20% on sit-down meals." },
    language: ["English", "Spanish in many cities"],
    timezone: extraTz("US"),
    plugs: "Type A / B, 120V",
    callingCode: "+1",
    emergency: { all: "911" },
    visa: {
      indian:
        "Indian passports need a B1/B2 visa (interview at USVAC / embassy). ESTA is not for Indian passports. Dropbox possible if you qualify. Start months ahead - appointments can be slow. Passport valid for travel.",
      general: "ESTA (VWP) or visa. Indians: visa.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "Healthcare is excellent and expensive - insurance is essential." }],
      malaria: "None in these cities.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["Travel insurance with US medical cover is not optional."],
    },
    when: {
      best: "NYC: Apr-Jun, Sep-Nov. LA: year-round. Miami: winter dry; summer humid/hurricane watch.",
      avoid: "",
      seasons: [{ name: "City dependent", months: "See destination", note: "US is huge - seasons differ coast to coast." }],
    },
    safety: { level: "Urban awareness", tips: ["Know neighbourhoods at night.", "911 for emergencies.", "Don't leave bags on restaurant chairs."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "15-20% restaurants, $1-2/drink, airport porters." },
    gettingAround: ["JFK/EWR/LGA, LAX, MIA, SFO. Subway in NYC. Ride-hail everywhere. ESTA/visa + ESTA not interchangeable."],
    culture: ["Tipping is expected. ID for alcohol (21+)."],
    packing: ["Layers for NYC seasons", "Type A adaptor", "Comfortable walking shoes"],
    documents: ["Passport", "US visa", "ESTA not applicable for Indian passports", "Address of first night"],
    alerts: [
      { tone: "visa", label: "B1/B2 visa - not ESTA" },
      { tone: "money", label: "Medical insurance essential" },
    ],
    official: [{ label: "US travel.state.gov", href: "https://travel.state.gov/" }],
  },

  Canada: {
    iso: "CA",
    currency: { code: "CAD", name: "Canadian dollar", tip: "Cards everywhere. Tip 15-18%." },
    language: ["English", "French (official, especially Québec)"],
    timezone: "ET in Toronto (UTC−5/−4)",
    plugs: "Type A / B, 120V",
    callingCode: "+1",
    emergency: { all: "911" },
    visa: {
      indian: "Indian passports need a Canadian TRV (visitor visa) or may use eTA only if they already have a valid US visa / certain documents - most first-time Indian tourists need a visa. Apply via IRCC. Biometrics. Start early.",
      general: "eTA or visa depending on nationality.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["Winter is serious - proper coat if Dec-Mar."],
    },
    when: { best: "May-Oct for Toronto city + Niagara. Winter festivals if you like cold.", avoid: "", seasons: [{ name: "Summer", months: "Jun-Sep", note: "Best patio weather." }] },
    safety: { level: "Very safe", tips: ["Normal big-city awareness."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "15-18%." },
    gettingAround: ["YYZ. UP Express. TTC. Uber."],
    culture: ["Polite queues. Bilingual labels."],
    packing: ["Season-appropriate coat", "Type A adaptor"],
    documents: ["Passport", "Canada visa / eTA as applicable"],
    alerts: [{ tone: "visa", label: "Visitor visa for most Indian passports" }],
    official: [{ label: "IRCC Canada", href: "https://www.canada.ca/en/immigration-refugees-citizenship.html" }],
  },

  Mexico: {
    iso: "MX",
    currency: { code: "MXN", name: "Mexican peso", tip: "Cards in CDMX / Cancún hotels. Cash for mercados." },
    language: ["Spanish", "English in hotel zones"],
    timezone: extraTz("MX"),
    plugs: "Type A / B, 127V",
    callingCode: "+52",
    emergency: { all: "911" },
    visa: {
      indian:
        "Indian passports often need a Mexico visa, but may be exempt if holding a valid US/UK/Canada/Schengen visa - check SRE / INM. FMM / immigration form on arrival. Passport 6 months.",
      general: "Many are visa-exempt. Indians: check visa vs exemption via other visas.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Hepatitis A / Typhoid", note: "Especially CDMX street food tours." },
      ],
      malaria: "CDMX / Cancún hotel zone: generally none. Rural south/some coasts: ask.",
      water: "Bottled. Don't drink tap. Brushing teeth with bottled in sensitive stomachs.",
      altitude: "Mexico City ~2,240 m - take it easy day one, drink water, go easy on alcohol.",
      other: ["Sun on the Yucatán is intense."],
    },
    when: {
      best: "CDMX: Mar-May / Oct-Nov. Cancún: Dec-Apr dry. Hurricane watch Aug-Oct on Caribbean.",
      avoid: "",
      seasons: [
        { name: "Dry Caribbean", months: "Dec-Apr", note: "Best beach." },
        { name: "Rain / hurricane", months: "Jun-Oct", note: "Yucatán storms possible." },
      ],
    },
    safety: {
      level: "City + resort awareness",
      tips: ["Use official taxis / Uber in CDMX.", "Stick to well-known areas at night.", "Cancún hotel zone is easier than wandering unknown nightlife spots alone."],
    },
    money: { cards: "Tourist zones yes.", atm: "Use bank ATMs.", tipping: "10-15% restaurants." },
    gettingAround: ["MEX / CUN. Uber in CDMX. ADO buses. Don't drink and drive."],
    culture: ["Learn basic Spanish please/thank you.", "Tipping culture."],
    packing: ["Altitude / sun prep", "Spanish phrasebook", "Type A adaptor"],
    documents: ["Passport", "Visa or exemption proof", "Return ticket"],
    alerts: [{ tone: "health", label: "CDMX altitude + bottled water" }],
    official: [{ label: "Mexico SRE visas", href: "https://www.gob.mx/sre" }],
  },

  Brazil: {
    iso: "BR",
    currency: { code: "BRL", name: "Real", tip: "Cards in Rio tourist areas. Small cash for beach vendors." },
    language: ["Portuguese", "Limited English outside hotels"],
    timezone: "BRT (UTC−3) in Rio",
    plugs: "Type N / C, 127V or 220V depending on building - bring a universal + check hotel.",
    callingCode: "+55",
    emergency: { police: "190", ambulance: "192", tourist: "1746 in Rio" },
    visa: {
      indian: "Indian passports generally need a Brazil visa e-visa / consulate - confirm gov.br before travel (rules have flipped visa-free on/off). Passport 6 months.",
      general: "Check current reciprocity rules.",
    },
    health: {
      required: [
        {
          name: "Yellow fever",
          note:
            "Recommended for much of Brazil. Rio city is not always listed as mandatory, but vaccine is often advised if you add Iguazu / Amazon / other states. Certificate may be asked depending on routing. Get it ≥10 days before.",
        },
      ],
      recommended: [
        ...ROUTINE,
        { name: "Yellow fever", note: "Strongly consider for Brazil beyond a 3-day Copacabana-only stay." },
      ],
      malaria: "Rio city: no. Amazon / some north/west: yes - if you go, prophylaxis + nets.",
      water: "Bottled.",
      altitude: "",
      other: ["Dengue / Zika / chikungunya - DEET, especially summer. Pregnant travellers: discuss Zika with a doctor."],
    },
    when: {
      best: "Apr-Jun and Sep-Oct. Carnival (Feb/Mar dates move) is amazing and expensive. Summer Dec-Mar is hot + rain.",
      avoid: "",
      seasons: [
        { name: "Shoulder", months: "Apr-Jun, Sep-Oct", note: "Best city + beach balance." },
        { name: "Summer / Carnival", months: "Dec-Mar", note: "Hot, festive, pricier." },
      ],
    },
    safety: {
      level: "Be alert",
      tips: [
        "Don't flash phones on the beach / in traffic.",
        "Use official taxis / Uber. Avoid isolated beaches after dark.",
        "Leave passports in the hotel safe; carry a copy + one card.",
      ],
    },
    money: { cards: "Tourist Rio yes.", atm: "Use bank ATMs, not standalone.", tipping: "10% often already on the bill (coberto)." },
    gettingAround: ["GIG / SDU. Metro + Uber. Don't walk with valuables in unknown favelas without a reputable tour."],
    culture: ["Portuguese > Spanish. Friendly, late dinners."],
    packing: ["DEET", "Anti-theft bag", "Yellow fever card", "Swim + cover-up"],
    documents: ["Passport", "Brazil visa as required", "YF certificate if held"],
    alerts: [
      { tone: "health", label: "Yellow fever + mosquito-borne disease caution" },
      { tone: "safety", label: "Street-smart in Rio" },
    ],
    official: [{ label: "Brazil gov visas", href: "https://www.gov.br/" }],
  },

  Australia: {
    iso: "AU",
    currency: { code: "AUD", name: "Australian dollar", tip: "Cards everywhere. Tap-and-go." },
    language: ["English"],
    timezone: extraTz("AU"),
    plugs: "Type I, 230V",
    callingCode: "+61",
    emergency: { all: "000" },
    visa: {
      indian: "Indian passports need an Australia visitor visa (eVisitor is not for Indians - usually subclass 600 or ETA if eligible). Apply via ImmiAccount. Start early. Biometrics may be required.",
      general: "ETA / eVisitor / 600 depending on nationality.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None in Sydney/Melbourne.",
      water: "Tap water is safe.",
      altitude: "",
      other: ["UV is extreme - SPF, hat. Bushfire / heatwave alerts in summer."],
    },
    when: {
      best: "Sydney: Sep-Nov, Mar-May. Melbourne similar. Summer Dec-Feb is peak beach + expensive.",
      avoid: "",
      seasons: [{ name: "Spring / autumn", months: "Sep-Nov, Mar-May", note: "Best walking weather." }],
    },
    safety: { level: "Very safe", tips: ["Swim between the flags.", "Don't touch wildlife."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "Not required; round up for great service." },
    gettingAround: ["SYD / MEL. Opal / Myki. Uber. Domestic flights for distance."],
    culture: ["Casual. Strict biosecurity on arrival - declare food."],
    packing: ["SPF 50", "Type I adaptor", "Light layers"],
    documents: ["Passport", "Australia visa grant", "Incoming passenger card - declare food"],
    alerts: [{ tone: "visa", label: "Visitor visa before travel" }],
    official: [{ label: "Australia ImmiAccount", href: "https://immi.homeaffairs.gov.au/" }],
  },

  "New Zealand": {
    iso: "NZ",
    currency: { code: "NZD", name: "New Zealand dollar", tip: "Cards everywhere." },
    language: ["English", "Māori"],
    timezone: "NZST / NZDT",
    plugs: "Type I, 230V",
    callingCode: "+64",
    emergency: { all: "111" },
    visa: {
      indian: "Indian passports need an NZeTA + visitor visa pathway as applicable - most Indian tourists need a visitor visa (NZeTA alone is not enough). Apply via Immigration NZ. Start early.",
      general: "NZeTA for visa-waiver; visa for others.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None.",
      water: "Tap water is safe in towns. Treat backcountry water.",
      altitude: "Queenstown / Alps - hydrate; not Himalayan AMS, but respect alpine weather.",
      other: ["UV extreme. Alpine weather changes fast - layers for hikes."],
    },
    when: {
      best: "Dec-Mar summer. Ski Jun-Aug Queenstown/Wanaka. Shoulder Nov/Apr quieter.",
      avoid: "",
      seasons: [
        { name: "Summer", months: "Dec-Mar", note: "Hikes, long days." },
        { name: "Ski", months: "Jun-Aug", note: "Queenstown / Wanaka." },
      ],
    },
    safety: { level: "Very safe", tips: ["Respect DOC trail advice.", "Drive on the left. One-lane bridges."] },
    money: { cards: "Everywhere.", atm: "Everywhere.", tipping: "Not expected." },
    gettingAround: ["AKL / ZQN. Campervan or flights. Book Milford / trails early."],
    culture: ["Māori protocols on marae. Remove shoes when asked."],
    packing: ["Layers + rain shell", "Broken-in boots", "Type I adaptor", "SPF"],
    documents: ["Passport", "NZ visa / NZeTA as required", "Onward ticket"],
    alerts: [{ tone: "visa", label: "Visitor visa for most Indian passports" }],
    official: [{ label: "Immigration NZ", href: "https://www.immigration.govt.nz/" }],
  },

  Fiji: {
    iso: "FJ",
    currency: { code: "FJD", name: "Fijian dollar", tip: "Cards at resorts. Cash for local villages." },
    language: ["English", "Fijian", "Hindi"],
    timezone: "FJT (UTC+12)",
    plugs: "Type I, 240V",
    callingCode: "+679",
    emergency: { all: "911 / 917 ambulance" },
    visa: {
      indian: "Indian passports often get visa on arrival for tourism - confirm immigration.gov.fj. Passport 6 months, return ticket, proof of funds/hotel.",
      general: "Many visa-exempt / VOA.",
    },
    health: {
      required: [],
      recommended: ROUTINE,
      malaria: "None.",
      water: "Bottled outside resorts.",
      altitude: "",
      other: ["Dengue possible. Reef-safe sunscreen. Cyclone season roughly Nov-Apr."],
    },
    when: {
      best: "May-Oct drier. Nov-Apr wetter / cyclone watch, still warm.",
      avoid: "",
      seasons: [
        { name: "Dry", months: "May-Oct", note: "Best beach." },
        { name: "Wet", months: "Nov-Apr", note: "Lush, possible storms." },
      ],
    },
    safety: { level: "Relaxed", tips: ["Respect village dress codes (sulu).", "Don't drink tap in rural areas."] },
    money: { cards: "Resorts yes.", atm: "Nadi / Denarau.", tipping: "Not required; small gifts / appreciation fine." },
    gettingAround: ["NAN airport. Resort transfers. Inter-island flights / ferries."],
    culture: ["Bula! Sunday is church day in many villages.", "Remove hat/sunglasses in villages sometimes."],
    packing: ["Reef-safe SPF", "Modest cover-up for villages", "Type I adaptor"],
    documents: ["Passport 6 months", "Return ticket", "Hotel voucher"],
    alerts: [],
    official: [],
  },

  Vietnam: {
    iso: "VN",
    currency: { code: "VND", name: "Dong", tip: "Cash for street food. Cards in hotels. Huge numbers - don't panic at 6 zeros." },
    language: ["Vietnamese", "English in tourist Hanoi / Hoi An"],
    timezone: "ICT (UTC+7)",
    plugs: "Type A / C / F, 220V",
    callingCode: "+84",
    emergency: { police: "113", ambulance: "115" },
    visa: {
      indian: "Indian passports typically need a Vietnam e-visa (evisa.xuatnhapcanh.gov.vn) before travel. Passport 6 months, photo upload. Print the approval.",
      general: "e-visa for many. Some visa-exempt.",
    },
    health: {
      required: [],
      recommended: [
        ...ROUTINE,
        { name: "Japanese encephalitis", note: "Rural / long stay." },
        { name: "Rabies", note: "Dogs / motorbike countryside." },
      ],
      malaria: "Hanoi / big cities: generally none. Rural south/central highlands: ask.",
      water: "Bottled.",
      altitude: "",
      other: ["Motorbike accidents. Dengue in rain."],
    },
    when: {
      best: "Hanoi: Oct-Dec and Mar-Apr. Summers hot/wet. Tet (Jan/Feb dates move) shuts family businesses.",
      avoid: "",
      seasons: [{ name: "Cool dry north", months: "Oct-Dec", note: "Best Hanoi walking." }],
    },
    safety: { level: "Traffic is the hazard", tips: ["Cross streets slowly and predictably.", "Grab taxi. Don't ride without a licence + helmet."] },
    money: { cards: "Hotels yes.", atm: "Hanoi plentiful.", tipping: "Not required; round up." },
    gettingAround: ["HAN. Grab. Overnight trains. Ha Long day tours."],
    culture: ["Shoes off some temples/homes. Don't pat kids' heads."],
    packing: ["Layers for Hanoi winter damp", "DEET", "Earplugs"],
    documents: ["Passport", "e-visa printout", "Return ticket"],
    alerts: [{ tone: "visa", label: "e-visa before you fly" }],
    official: [{ label: "Vietnam e-visa", href: "https://evisa.xuatnhapcanh.gov.vn/" }],
  },

  Malaysia: {
    iso: "MY",
    currency: { code: "MYR", name: "Ringgit", tip: "Cards in KL. Cash for hawker stalls." },
    language: ["Malay", "English widely", "Chinese / Tamil"],
    timezone: "MYT (UTC+8)",
    plugs: "Type G, 240V",
    callingCode: "+60",
    emergency: { police: "999", ambulance: "999" },
    visa: {
      indian: "Indian passports often get visa on arrival / eNTRI / visa exemption depending on current policy - it has changed several times. Confirm imi.gov.my and your airline before you fly. Passport 6 months.",
      general: "Many visa-exempt. Indians: verify current VOA/eNTRI.",
    },
    health: {
      required: [],
      recommended: ROUTINE,
      malaria: "KL / Penang / Langkawi tourist: generally none. Borneo interior: ask.",
      water: "Bottled outside good hotels.",
      altitude: "",
      other: ["Haze some months. Dengue - DEET."],
    },
    when: { best: "Year-round equatorial. Dec-Feb rainier on east coast.", avoid: "", seasons: [{ name: "Year-round", months: "All", note: "KL is a food city any month." }] },
    safety: { level: "Normal", tips: ["Grab taxi.", "Drug laws are extremely strict."] },
    money: { cards: "Malls yes.", atm: "Everywhere.", tipping: "Not expected; rounding up is fine." },
    gettingAround: ["KUL. KLIA Ekspres. Grab. MRT/LRT."],
    culture: ["Muslim-majority - modest dress at mosques. Alcohol available in non-Muslim venues."],
    packing: ["Light clothes", "Type G adaptor", "DEET"],
    documents: ["Passport 6 months", "Visa / VOA status", "Return ticket"],
    alerts: [{ tone: "visa", label: "Confirm current Indian VOA / eNTRI rules" }],
    official: [{ label: "Immigration Malaysia", href: "https://www.imi.gov.my/" }],
  },

  "South Korea": {
    iso: "KR",
    currency: { code: "KRW", name: "Won", tip: "Cards everywhere. T-money for transit." },
    language: ["Korean", "English in tourist Seoul"],
    timezone: "KST (UTC+9)",
    plugs: "Type C / F, 220V",
    callingCode: "+82",
    emergency: { all: "112 police / 119 fire-ambulance" },
    visa: {
      indian: "Indian passports typically need a Korea visa, though K-ETA / visa-free has applied to some categories - confirm hikorea.go.kr. Don't assume visa-free.",
      general: "K-ETA for visa-waiver nationals.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None in Seoul.",
      water: "Tap generally safe; many drink bottled / filtered.",
      altitude: "",
      other: ["Yellow dust some spring days - mask if sensitive."],
    },
    when: { best: "Apr-Jun and Sep-Nov. Summer humid; winter cold and dry.", avoid: "", seasons: [{ name: "Spring / autumn", months: "Apr-Jun, Sep-Nov", note: "Best Seoul walking." }] },
    safety: { level: "Very safe", tips: ["Metro is easy. T-money card."] },
    money: { cards: "Everywhere.", atm: "Global ATMs / 7-Eleven.", tipping: "Not customary." },
    gettingAround: ["ICN. AREX. T-money. Kakao T taxi."],
    culture: ["Shoes off in some restaurants. Two-hand pour for drinks."],
    packing: ["Layers for big seasonal swings", "Comfortable walking shoes"],
    documents: ["Passport", "Korea visa / K-ETA as required"],
    alerts: [],
    official: [{ label: "HiKorea", href: "https://www.hikorea.go.kr/" }],
  },

  China: {
    iso: "CN",
    currency: { code: "HKD", name: "Hong Kong dollar", tip: "Hong Kong: HKD. Octopus card. Cards + AlipayHK / WeChat Pay increasingly." },
    language: ["Cantonese", "English widely in HK tourism", "Mandarin"],
    timezone: "HKT (UTC+8)",
    plugs: "Type G (HK), 220V",
    callingCode: "+852",
    emergency: { all: "999" },
    visa: {
      indian:
        "Hong Kong: Indian passports typically need a pre-arrival registration (HK visit) - not the same as mainland China visa. Confirm imm.gov.hk. Mainland China (if you add Shenzhen/Beijing) needs a separate PRC visa.",
      general: "HK vs mainland are different immigration systems.",
    },
    health: {
      required: [],
      recommended: [{ name: "Routine boosters", note: "" }],
      malaria: "None in Hong Kong.",
      water: "Tap in HK is treated; many still drink bottled.",
      altitude: "",
      other: [],
    },
    when: { best: "Oct-Dec clear and cool. May-Sep hot, humid, typhoon watch.", avoid: "", seasons: [{ name: "Autumn", months: "Oct-Dec", note: "Best harbour weather." }] },
    safety: { level: "Very safe", tips: ["Octopus for MTR.", "Typhoon signal 8: stay indoors."] },
    money: { cards: "Widely.", atm: "Everywhere.", tipping: "Not required; round up taxis." },
    gettingAround: ["HKG. Airport Express. MTR. Star Ferry."],
    culture: ["HK is not mainland China for visas or plugs (Type G)."],
    packing: ["Type G adaptor", "Light jacket for AC / winter"],
    documents: ["Passport", "HK pre-arrival registration if required", "Separate mainland visa if crossing"],
    alerts: [{ tone: "visa", label: "HK registration ≠ China visa" }],
    official: [{ label: "HK Immigration", href: "https://www.immd.gov.hk/" }],
  },
};

COUNTRY_INTEL.France = schengen({
  language: ["French", "English in tourist Paris"],
  callingCode: "+33",
  timezone: "CET / CEST",
  gettingAround: ["CDG / ORY. Navigo / t+ tickets. RER B from CDG."],
  culture: ["Bonjour before asking anything. Dinner late."],
});
COUNTRY_INTEL.Italy = schengen({
  language: ["Italian", "English in tourist Rome / Milan"],
  callingCode: "+39",
  gettingAround: ["FCO / MXP. Leonardo Express. Validate train tickets."],
  water: "Tap water is safe; fountains (nasoni) in Rome are drinkable.",
});
COUNTRY_INTEL.Spain = schengen({
  language: ["Spanish", "Catalan in Barcelona", "English in tourist zones"],
  callingCode: "+34",
  gettingAround: ["BCN / MAD. Metro. Pickpockets on Las Ramblas - zip bags."],
  safety: { level: "Watch bags", tips: ["Bag theft is the main issue in Barcelona.", "Metro and rambla awareness."] },
});
COUNTRY_INTEL.Netherlands = schengen({
  language: ["Dutch", "Excellent English"],
  callingCode: "+31",
  gettingAround: ["AMS Schiphol train to Centraal. OV-chipkaart / OVpay. Bike lanes - look both ways."],
});
COUNTRY_INTEL.Greece = schengen({
  language: ["Greek", "English on islands"],
  callingCode: "+30",
  when: {
    best: "May-Jun and Sep-Oct for Santorini. Jul-Aug hottest + cruise crowds.",
    avoid: "Mid-August peak.",
    seasons: [
      { name: "Shoulder", months: "May-Jun, Sep-Oct", note: "Best light, fewer crowds." },
      { name: "Peak", months: "Jul-Aug", note: "Hot, busy, gorgeous sunsets anyway." },
    ],
  },
  gettingAround: ["JTR / ATH. ATMs on island. Book sunset / Oia stays early."],
  water: "Bottled on islands. Don't assume tap.",
});
COUNTRY_INTEL.Czechia = schengen({
  language: ["Czech", "English in Prague centre"],
  callingCode: "+420",
  currency: { code: "CZK", name: "Czech koruna", tip: "Not euro day-to-day. Avoid exchange booths with bad rates - use ATMs." },
  gettingAround: ["PRG. 24h transit ticket. Trams."],
});
COUNTRY_INTEL.Austria = schengen({
  language: ["German", "English in Vienna tourism"],
  callingCode: "+43",
  gettingAround: ["VIE. CAT / ÖBB. Wiener Linien."],
});
COUNTRY_INTEL.Switzerland = schengen({
  language: ["German / French / Italian", "English widely"],
  callingCode: "+41",
  currency: { code: "CHF", name: "Swiss franc", tip: "Not euro. Cards everywhere. Expensive - budget accordingly." },
  gettingAround: ["ZRH. Swiss Travel Pass if moving a lot. Trains are the point."],
  when: {
    best: "Jun-Sep hiking. Dec-Mar ski. Cities year-round.",
    avoid: "",
    seasons: [
      { name: "Summer", months: "Jun-Sep", note: "Lakes + Alps hikes." },
      { name: "Winter", months: "Dec-Mar", note: "Ski. Book Zermatt / Jungfrau early." },
    ],
  },
});
COUNTRY_INTEL.Portugal = schengen({
  language: ["Portuguese", "English in Lisbon tourism"],
  callingCode: "+351",
  gettingAround: ["LIS. Metro. Trams - watch pickpockets on 28."],
});
COUNTRY_INTEL.Germany = schengen({
  language: ["German", "Good English in Berlin"],
  callingCode: "+49",
  gettingAround: ["BER. BVG. Deutschlandticket if staying longer."],
});

/** City-level extras merged on top of country intel. */
export const CITY_INTEL = {
  nairobi: {
    notes: [
      "Nairobi is the safari hub, not just a city break. Most travellers land NBO then fly or drive to Maasai Mara, Amboseli, or Tsavo.",
      "Wilson Airport (WIL) is used for many domestic safari hops - not Jomo Kenyatta.",
      "Giraffe Centre, Nairobi National Park, and Karen Blixen are doable without leaving the metro.",
    ],
    gettingAround: [
      "Fly into Jomo Kenyatta (NBO). Immigration + eTA printout ready.",
      "Wilson (WIL) for bush flights to Mara / Amboseli.",
      "Uber / Bolt in Nairobi. Hotel car after dark.",
      "NBO → Mara: bush flight ~1 hr or 5-6 hr road (leave early).",
    ],
    healthExtra: [
      "If your trip is Nairobi + Mara, treat it as a malaria-risk trip even though the city itself is lower risk.",
      "Yellow fever: get it if you can - lodges and some onward countries will be happier seeing the card.",
    ],
  },
  zanzibar: {
    notes: [
      "Zanzibar is Tanzania - one visa. Stone Town + Nungwi/Kendwa beaches is the classic split.",
      "Spice tours, Prison Island, and sunset dhows are the usual add-ons.",
    ],
  },
  leh: {
    notes: [
      "Altitude ~3,500 m. Plan 48 hours of rest on arrival - no rafting, no Khardung La day 1.",
      "Inner Line Permit (ILP) needed for some valleys (Nubra, Pangong) - your operator usually arranges.",
      "Flights are weather-prone. Keep a buffer day.",
    ],
    alerts: [
      { tone: "health", label: "High altitude - acclimatise 48h" },
      { tone: "docs", label: "ILP for Nubra / Pangong" },
    ],
    health: {
      altitude:
        "Leh ~3,500 m. AMS is common if you fly in and rush. Sleep, hydrate, avoid alcohol day 1-2. Diamox only if a doctor prescribes it. Descend if severe headache / vomiting / confusion.",
      recommended: [
        { name: "Routine boosters", note: "" },
        { name: "Diamox discussion", note: "Ask a doctor before flying in - don't self-medicate." },
      ],
    },
  },
  manali: {
    notes: ["Rohtang / Atal Tunnel rules and permits change with season.", "Landslides possible in monsoon."],
    alerts: [{ tone: "season", label: "Monsoon landslide risk" }],
  },
  srinagar: {
    notes: ["Houseboats on Dal: check heating in winter.", "Some areas need permits - follow local advice."],
  },
  goa: {
    notes: ["GOI is Dabolim (south/central). GOX is Mopa (north). Don't mix them up on the ticket.", "Monsoon is lush but many beach shacks close."],
    alerts: [{ tone: "airport", label: "Confirm GOI vs GOX (Mopa)" }],
  },
  andaman: {
    notes: [
      "Restricted Area Permit is largely relaxed for Indians but foreigners still have rules - check.",
      "Don't fly drones near defence areas. Coral = no touching, no sunscreen in water unless reef-safe.",
    ],
  },
  varanasi: {
    notes: ["Dawn boat on the Ganga is the thing. Dress modestly on ghats.", "Aarti crowds - zip bags."],
  },
  rishikesh: {
    notes: ["Yoga + rafting. Ganga is cold. Some ashrams have silence / no-alcohol rules."],
  },
  maldives: {
    notes: ["Seaplanes usually don't fly after dark - late MLE arrivals may overnight in Malé.", "Your resort transfer is part of the trip, not a taxi hail."],
  },
  dubai: {
    notes: ["DXB vs DWC (Al Maktoum) - check which airport.", "Desert safari: book licensed operators, not random lobby touts."],
  },
  "cape-town": {
    notes: ["Load-shedding: hotels have inverters. Carry a power bank.", "Cape Peninsula + penguins + Stellenbosch is a 2-3 day add."],
  },
  "queenstown": {
    notes: ["Adventure capital: bungy, skydive, ski. Book Milford Sound weather-flex.", "Alpine weather - layers even in summer."],
  },
  kathmandu: {
    notes: ["Thamel is the tourist base. Durbar squares need a ticket.", "Trek add-ons: Pokhara / Everest region need extra days + permits."],
  },
  tokyo: {
    notes: ["IC card on day one. Pocket Wi-Fi or eSIM. Cash still useful at tiny restaurants."],
  },
  bali: {
    notes: ["Nyepi closes the island - don't fly that day.", "South (Canggu/Seminyak) vs Ubud vs Uluwatu are different trips."],
  },
  santorini: {
    notes: ["Oia sunset is packed - go early or watch from a caldera hotel.", "ATMs on the island; still carry some euros."],
  },
};

const DEFAULT_INTEL = {
  currency: { code: "", name: "", tip: "" },
  language: [],
  timezone: "",
  plugs: "",
  callingCode: "",
  emergency: {},
  visa: {
    indian: "Check the destination embassy / official immigration site for your passport. Rules change.",
    general: "Confirm visa before you buy non-refundable tickets.",
  },
  health: {
    required: [],
    recommended: ROUTINE,
    malaria: "Ask a travel clinic - depends on region.",
    water: "When unsure, bottled.",
    altitude: "",
    other: [],
  },
  when: { best: "Check local seasons.", avoid: "", seasons: [] },
  safety: { level: "Normal caution", tips: [] },
  money: { cards: "", atm: "", tipping: "" },
  gettingAround: [],
  culture: [],
  packing: [],
  documents: ["Passport", "Return ticket", "Insurance"],
  alerts: [],
  official: [],
  notes: [],
};

export function getTravelIntel(dest) {
  if (!dest) return { ...DEFAULT_INTEL, disclaimer: DISCLAIMER };
  const country = COUNTRY_INTEL[dest.country] || DEFAULT_INTEL;
  const city = CITY_INTEL[dest.id] || CITY_INTEL[dest.slug] || {};
  const health = {
    ...(country.health || {}),
    ...(city.health || {}),
    required: [...(country.health?.required || []), ...(city.health?.required || [])],
    recommended: city.health?.recommended || country.health?.recommended || [],
    other: [...(country.health?.other || []), ...(city.healthExtra || [])],
  };
  return {
    ...DEFAULT_INTEL,
    ...country,
    ...city,
    health,
    alerts: [...(country.alerts || []), ...(city.alerts || [])],
    notes: city.notes || [],
    gettingAround: city.gettingAround || country.gettingAround || [],
    disclaimer: DISCLAIMER,
    countryName: dest.country,
    cityName: dest.city,
  };
}

export function intelSearchText(intel) {
  if (!intel) return "";
  const bits = [
    intel.visa?.indian,
    intel.visa?.general,
    ...(intel.health?.required || []).map((v) => `${v.name} ${v.note}`),
    ...(intel.health?.recommended || []).map((v) => `${v.name} ${v.note}`),
    intel.health?.malaria,
    intel.health?.water,
    intel.health?.altitude,
    intel.when?.best,
    ...(intel.alerts || []).map((a) => a.label),
  ];
  return bits.filter(Boolean).join(" \n ");
}

/** Compact snapshot for Vero page_context + instant answers. */
export function summarizeIntelForVero(intel) {
  if (!intel) return null;
  const yfReq = (intel.health?.required || []).find((v) => /yellow/i.test(v.name));
  const yfRec = (intel.health?.recommended || []).find((v) => /yellow/i.test(v.name));
  return {
    visa_indian: intel.visa?.indian || "",
    visa_general: intel.visa?.general || "",
    yellow_fever: yfReq?.note || yfRec?.note || "",
    malaria: intel.health?.malaria || "",
    water: intel.health?.water || "",
    altitude: intel.health?.altitude || "",
    required_vaccines: (intel.health?.required || []).map((v) =>
      v.note ? `${v.name}: ${v.note}` : v.name
    ),
    recommended_vaccines: (intel.health?.recommended || []).map((v) => v.name),
    health_other: intel.health?.other || [],
    best_time: intel.when?.best || "",
    avoid: intel.when?.avoid || "",
    currency: intel.currency?.code
      ? `${intel.currency.code} · ${intel.currency.name}`
      : "",
    money_tip: intel.currency?.tip || "",
    plugs: intel.plugs || "",
    language: (intel.language || []).join(", "),
    timezone: intel.timezone || "",
    emergency: intel.emergency || {},
    safety: intel.safety?.level || "",
    safety_tips: intel.safety?.tips || [],
    getting_around: intel.gettingAround || [],
    alerts: (intel.alerts || []).map((a) => a.label),
    disclaimer: intel.disclaimer || DISCLAIMER,
  };
}
