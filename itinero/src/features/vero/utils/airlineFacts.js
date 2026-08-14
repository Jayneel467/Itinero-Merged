/**
 * Published airline ops Vero can quote when the e-ticket snapshot
 * has no baggage/terminal. Prefer ticket fields when present.
 * Never invent gates.
 */

import { findAirportByCode } from "@/constants/airports";

const INDIA_IATA = new Set(
  [
    "AMD", "ATQ", "BBI", "BDQ", "BHO", "BLR", "BOM", "CCU", "CJB", "COK",
    "DED", "DEL", "GAU", "GOI", "GOX", "GWL", "HYD", "IDR", "IMF", "IXB",
    "IXC", "IXE", "IXJ", "IXL", "IXM", "IXR", "IXU", "IXZ", "JAI", "JDH",
    "JLR", "LKO", "MAA", "NAG", "PAT", "PNQ", "RPR", "SXR", "STV", "TRV",
    "TRZ", "UDR", "VGA", "VNS", "VTZ",
  ]
);

export function isIndiaAirport(code) {
  const c = String(code || "").toUpperCase().slice(0, 3);
  if (!c) return false;
  if (INDIA_IATA.has(c)) return true;
  return /india/i.test(findAirportByCode(c)?.state || "");
}

export function isDomesticIndia(origin, dest) {
  return isIndiaAirport(origin) && isIndiaAirport(dest);
}

/** Airline + airport → likely terminal. Empty if we should not guess. */
const TERMINAL_HINT = {
  "QP:BOM": "T2",
  "6E:BOM": "T2",
  "SG:BOM": "T1",
  "G8:BOM": "T1",
  "AI:BOM": "T2",
  "UK:BOM": "T2",
  "IX:BOM": "T2",
  "QP:DEL": "T1",
  "6E:DEL": "T1",
  "SG:DEL": "T1",
  "AI:DEL": "T3",
  "UK:DEL": "T3",
  "IX:DEL": "T1",
  "QP:BLR": "T1",
  "6E:BLR": "T1",
  "AI:BLR": "T2",
};

export function likelyTerminal(airlineCode, airport) {
  const a = String(airlineCode || "").toUpperCase().slice(0, 2);
  const p = String(airport || "").toUpperCase().slice(0, 3);
  if (!a || !p) return "";
  return TERMINAL_HINT[`${a}:${p}`] || "";
}

const BAGGAGE = {
  QP: {
    name: "Akasa Air",
    domestic: {
      cabinShort: "7 kg cabin (1 bag, max 115 cm L+W+H) + 3 kg personal item under the seat",
      checkedShort: "15 kg check-in, 1 piece on standard/Plus fares",
      cabinChip: "7 kg + 3 kg item",
      checkedChip: "15 kg / 1 pc",
      extra:
        "Lite/unbundled fares can include **0 kg** check-in. Student fares: **25 kg**. Stretch/Flex sometimes **20 kg**. Airport extra is roughly ₹600-700/kg - cheaper if you add kg on Akasa before travel. One piece max 32 kg / 158 cm.",
    },
    international: {
      cabinShort: "7 kg cabin + 3 kg personal item",
      checkedShort: "usually 30 kg / 2 pieces (Phuket often 20 kg / 1 piece)",
      cabinChip: "7 kg + 3 kg item",
      checkedChip: "30 kg / 2 pcs",
      extra: "Confirm the sector on your e-ticket. Airport extra on Gulf sectors is steeper than domestic.",
    },
  },
  "6E": {
    name: "IndiGo",
    domestic: {
      cabinShort: "7 kg cabin (1 piece, typically 55×35×25 cm) + a small personal item",
      checkedShort: "15 kg check-in on regular Saver/Super Saver; Flexi/Super 6E can be higher",
      cabinChip: "7 kg cabin",
      checkedChip: "15 kg",
      extra: "IndiGo Lite-style fares may exclude free check-in. Pre-buy extra kg in the IndiGo app - cheaper than the airport.",
    },
    international: {
      cabinShort: "7 kg cabin + personal item",
      checkedShort: "usually 20-30 kg depending on sector and fare",
      extra: "Gulf / SEA sectors vary - use the kg printed on your IndiGo ticket if it differs.",
    },
  },
  SG: {
    name: "SpiceJet",
    domestic: {
      cabinShort: "7 kg cabin (1 piece)",
      checkedShort: "15 kg check-in on standard SpiceSaver/SpiceMax-style fares",
      extra: "SpiceJet unbundled fares can be cabin-only. Extra kg is cheaper prepaid than at the airport.",
    },
    international: {
      cabinShort: "7 kg cabin",
      checkedShort: "typically 20-30 kg by sector",
      extra: "Use the allowance printed on the ticket for Gulf/SEA.",
    },
  },
  AI: {
    name: "Air India",
    domestic: {
      cabinShort: "7 kg cabin (1 piece) + a small personal item",
      checkedShort: "15 kg economy check-in on most domestic fares; higher on Flex / business",
      extra: "Air India still prints allowance on the e-ticket - trust that if it differs.",
    },
    international: {
      cabinShort: "7-8 kg cabin (route/cabin dependent)",
      checkedShort: "typically 20-25 kg economy; more in premium cabins (piece concept on some long-haul)",
      extra: "Long-haul can be piece-based (2 × 23 kg). Read the ticket, don’t assume kg.",
    },
  },
  IX: {
    name: "Air India Express",
    domestic: {
      cabinShort: "7 kg cabin",
      checkedShort: "15 kg check-in on regular fares",
      extra: "Value/Lite fares may drop free check-in. Prepaid extra is cheaper.",
    },
    international: {
      cabinShort: "7 kg cabin",
      checkedShort: "typically 20-30 kg by Gulf/SEA sector",
      extra: "Ticket print wins if it disagrees.",
    },
  },
  UK: {
    name: "Vistara / Air India",
    domestic: {
      cabinShort: "7 kg cabin + personal item",
      checkedShort: "15 kg economy; Club Vistara / business higher",
      extra: "Now under Air India - e-ticket kg is the source of truth.",
    },
    international: {
      cabinShort: "7-8 kg cabin",
      checkedShort: "often 2 × 23 kg on long-haul economy",
      extra: "Piece concept on many intl tickets.",
    },
  },
  GF: {
    name: "Gulf Air",
    domestic: null,
    international: {
      cabinShort: "7 kg cabin (1 piece) + a small personal item",
      checkedShort: "typically 30 kg economy (2 pieces on many fares) India-Gulf",
      extra: "Falcon Gold / business is higher. Trust the e-ticket if it shows pieces.",
    },
  },
  EK: {
    name: "Emirates",
    domestic: null,
    international: {
      cabinShort: "7 kg cabin + a small personal item (some fares allow more in premium)",
      checkedShort: "usually 25-35 kg economy depending on fare; premium much higher",
      extra: "Emirates prints kg on the ticket - that number wins.",
    },
  },
  EY: {
    name: "Etihad",
    domestic: null,
    international: {
      cabinShort: "7 kg cabin + personal item",
      checkedShort: "typically 25-30 kg economy India-AUH",
      extra: "Guest Seat / business is higher. Ticket print wins.",
    },
  },
  QR: {
    name: "Qatar Airways",
    domestic: null,
    international: {
      cabinShort: "7 kg cabin + personal item",
      checkedShort: "typically 25-30 kg economy; 2 × 23 kg on many long-haul tickets",
      extra: "Qatar is often piece-based on long-haul - read the e-ticket.",
    },
  },
};

function ticketBagLabel(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "object") {
    return [raw.cabin, raw.checked, raw.cabin_kg, raw.checked_kg]
      .filter((p) => p != null && p !== "")
      .map(String)
      .join(" · ");
  }
  return String(raw).trim();
}

/** LiteAPI often returns weightKg/pieces 0 - that is "none included", not missing data. */
function isZeroAllowance(label) {
  const s = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return false;
  if (/^(none|nil|not included|no bag|no bags)$/.test(s)) return true;
  if (/^0+(\s*(kg|kgs|pc|pcs|piece|pieces))?$/.test(s)) return true;
  if (/^0\s*kg/.test(s)) return true;
  return false;
}

/**
 * @returns {{ airline: string, domestic: boolean, cabin: string, checked: string, extra: string, fromTicket: boolean, supplierZero: boolean }}
 */
export function baggageFacts({
  airlineCode,
  airlineName,
  origin,
  dest,
  ticketCabin,
  ticketChecked,
} = {}) {
  const code = String(airlineCode || "").toUpperCase().slice(0, 2);
  const spec = BAGGAGE[code] || null;
  const domestic = isDomesticIndia(origin, dest);
  const lane = spec ? (domestic ? spec.domestic : spec.international) || spec.domestic || spec.international : null;
  const ticketC = ticketBagLabel(ticketCabin);
  const ticketK = ticketBagLabel(ticketChecked);
  const zeroC = isZeroAllowance(ticketC);
  const zeroK = isZeroAllowance(ticketK);
  const positiveTicket =
    (ticketC && !zeroC) || (ticketK && !zeroK);
  const supplierZero =
    (zeroC || zeroK) && !positiveTicket && Boolean(ticketC || ticketK);

  if (supplierZero) {
    return {
      airline: spec?.name || airlineName || code || "this airline",
      code,
      domestic,
      fromTicket: true,
      supplierZero: true,
      cabinChip: "0 kg on fare",
      checkedChip: "0 kg on fare",
      cabin: ticketC
        ? `supplier fare shows **${ticketC}** cabin included`
        : "supplier fare shows **0 kg cabin** included",
      checked: ticketK
        ? `supplier fare shows **${ticketK}** checked included`
        : "supplier fare shows **0 kg checked** included",
      extra:
        (lane?.extra ? `${lane.extra} ` : "") +
        `Published ${spec?.name || "carrier"} policy is often more generous than this fare line (e.g. cabin ~7 kg) - confirm in the airline app / boarding pass before you fly.`,
    };
  }

  const fromTicket = Boolean(positiveTicket);

  return {
    airline: spec?.name || airlineName || code || "this airline",
    code,
    domestic,
    fromTicket,
    supplierZero: false,
    cabinChip: ticketC || lane?.cabinChip || "7 kg cabin",
    checkedChip: ticketK || lane?.checkedChip || (domestic ? "15 kg / 1 pc" : "See ticket"),
    cabin: ticketC || lane?.cabinShort || "7 kg cabin on most Indian LCC / full-service economy tickets",
    checked:
      ticketK ||
      lane?.checkedShort ||
      (domestic
        ? "15 kg check-in on a typical India domestic economy fare (basic/unbundled can be 0 kg)"
        : "check-in kg is printed on your e-ticket for this international sector"),
    extra: lane?.extra || "If you need more weight, buy extra kg online before the airport counter.",
  };
}

export function formatBaggageReply(facts, { flightNo, origin, dest, originCity, destCity } = {}) {
  const f = facts || {};
  const label = [f.airline, flightNo].filter(Boolean).join(" ");
  const route = [originCity || origin, destCity || dest].filter(Boolean).join(" → ");
  let ticketNote;
  if (f.supplierZero) {
    ticketNote =
      "That’s what **this ticket stored** (often “0 checked / 0 carry-on”). It is **not** always the same as IndiGo’s published cabin rule - check the airline app or airport counter before you pack.";
  } else if (f.fromTicket) {
    ticketNote = "This is what’s on **your ticket snapshot** in Itinero.";
  } else if (f.domestic) {
    ticketNote =
      "Your e-ticket didn’t store a bag line, so this is **published domestic allowance** for this carrier - basic/unbundled fares can drop check-in to 0 kg.";
  } else {
    ticketNote =
      "Your e-ticket didn’t store a bag line, so this is the **usual published allowance** for this carrier - confirm in the airline app.";
  }
  const liteHint =
    !f.fromTicket && String(f.code) === "QP" && f.domestic
      ? " A ~₹4k BOM-DEL Akasa fare is almost always **Plus (15 kg)**, not Lite."
      : "";

  return [
    `On **${label || "this flight"}**${route ? ` (${route})` : ""}:`,
    "",
    `**Cabin** - ${f.cabin}.`,
    `**Check-in** - ${f.checked}.`,
    "",
    `${ticketNote}${liteHint}`,
    f.extra,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatTerminalReply({
  airlineCode,
  airlineName,
  flightNo,
  origin,
  dest,
  originCity,
  destCity,
  depTerminal,
  arrTerminal,
} = {}) {
  const label = [airlineName || airlineCode, flightNo].filter(Boolean).join(" ");
  const depHint = depTerminal || likelyTerminal(airlineCode, origin);
  const arrHint = arrTerminal || likelyTerminal(airlineCode, dest);
  const depSure = Boolean(depTerminal);
  const arrSure = Boolean(arrTerminal);
  const lines = [`**${label || "This flight"}** ${origin || ""} → ${dest || ""}`.trim()];
  if (depHint) {
    lines.push(
      `**${originCity || origin} (${origin})** - depart **${depHint}**${
        depSure ? "" : " (usual for this airline here; confirm on the boarding pass / CSMIA screens)"
      }.`
    );
  } else {
    lines.push(
      `**${originCity || origin} (${origin || "origin"})** - terminal isn’t stored on this booking. Check the airline app / airport screens. I won’t invent a gate.`
    );
  }
  if (arrHint) {
    lines.push(
      `**${destCity || dest} (${dest})** - arrive **${arrHint}**${
        arrSure ? "" : " (typical for this airline; follow flight-number screens)"
      }.`
    );
  }
  lines.push("Gates only show on airport screens the day of travel - I never invent those.");
  return lines.join("\n");
}
