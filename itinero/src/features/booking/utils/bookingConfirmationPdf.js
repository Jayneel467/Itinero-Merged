import { jsPDF } from "jspdf";
import { describeAirport } from "@/constants/airports";
import {
  inferAirlineCode,
  airlineLogoFallbacks,
} from "@/features/flights/utils/airlineIdentity";
import { formatFlightClock } from "@/features/flights/utils/flightCheckout";
import { likelyTerminal } from "@/features/vero/utils/airlineFacts";

/**
 * Itinero confirmed e-ticket PDF.
 * Matches the passenger itinerary layout: wordmark header, airline row,
 * navy booking-reference bar, route, airport cards, pax/contact,
 * cream amount + barcode, navy Vero strip. Helvetica + ASCII-safe strings.
 */

const C = {
  navy: [0, 20, 57],
  orange: [233, 110, 51],
  ink: [17, 24, 39],
  muted: [107, 114, 128],
  line: [229, 231, 235],
  gray: [245, 247, 250],
  cream: [255, 247, 237],
  white: [255, 255, 255],
  green: [5, 150, 105],
};

function hasValue(val) {
  if (val == null) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val).length > 0;
  return true;
}

function asPlainString(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(asPlainString).filter(Boolean).join(" ");
  return "";
}

function pdfSafe(val) {
  let s = asPlainString(val);
  if (!s) return "";
  s = s
    .replace(/\u20B9/g, "Rs.")
    .replace(/\u20AC/g, "EUR ")
    .replace(/\u00A3/g, "GBP ")
    .replace(/\u2192|\u2794|\u279E|\u00BB/g, "->")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00B7\u2022\u2023\u2219]/g, "|")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function fmtMoney(amount, currency) {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return pdfSafe(amount);
  const cur = String(currency || "").toUpperCase();
  const num = n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cur === "INR" || cur === "") return `Rs. ${num}`;
  return `${cur} ${num}`;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function prettyTravelDate(raw) {
  const dt = parseDate(raw);
  if (!dt) return pdfSafe(raw);
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function prettyIssued(raw) {
  const dt = raw ? new Date(raw) : null;
  if (!dt || Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function paxName(p) {
  const parts = [p.title, p.first_name || p.firstName, p.last_name || p.lastName].filter(Boolean);
  return pdfSafe(parts.join(" ")) || null;
}

function airlineLabel(seg) {
  const raw = seg.airline || seg.airline_name || seg.airline_code;
  if (raw && typeof raw === "object") {
    return pdfSafe(raw.name || raw.code || raw.airline_name || "");
  }
  return pdfSafe(raw);
}

function imageFormat(dataUrl) {
  if (typeof dataUrl !== "string") return "PNG";
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadPublicImage(fileName) {
  try {
    const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${base}${fileName}`, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function loadRemoteImage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(url, { mode: "cors", signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function loadAirlineLogo(code, stored) {
  const urls = airlineLogoFallbacks(code, stored);
  for (const url of urls.slice(0, 2)) {
    const img = await loadRemoteImage(url);
    if (img) return img;
  }
  return null;
}

function text(doc, str, x, y, opts = {}) {
  const safe = pdfSafe(str);
  if (!safe) return y;
  doc.setFont("helvetica", opts.style || "normal");
  doc.setFontSize(opts.size || 10);
  doc.setTextColor(...(opts.color || C.ink));
  const maxW = opts.maxW;
  if (maxW) {
    const lines = doc.splitTextToSize(safe, maxW);
    const lh = (opts.size || 10) + (opts.lh || 3);
    lines.forEach((ln, i) => {
      doc.text(ln, x, y + i * lh, { align: opts.align || "left" });
    });
    return y + lines.length * lh;
  }
  doc.text(safe, x, y, { align: opts.align || "left" });
  return y + (opts.size || 10) + 4;
}

function safeImage(doc, dataUrl, x, y, w, h) {
  if (!dataUrl) return false;
  try {
    doc.addImage(dataUrl, imageFormat(dataUrl), x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

function drawWordmark(doc, x, y, size = 18) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...C.navy);
  doc.text("itin", x, y);
  const w = doc.getTextWidth("itin");
  doc.setTextColor(...C.orange);
  doc.text("ero", x + w, y);
  return w + doc.getTextWidth("ero");
}

function drawBarcode(doc, seed, x, y, w, h) {
  const src = String(seed || "ITINERO").toUpperCase().replace(/[^A-Z0-9]/g, "") || "ITINERO";
  let bits = "";
  for (let i = 0; i < src.length; i += 1) {
    const n = src.charCodeAt(i);
    bits += (n % 2 ? "11010" : "10110") + (n % 3 ? "001" : "100");
  }
  bits = `1101${bits}${bits.slice(0, 18)}1101`;
  const unit = w / bits.length;
  let cx = x;
  doc.setFillColor(...C.ink);
  for (let i = 0; i < bits.length; i += 1) {
    const barW = unit * (bits[i] === "1" ? 1.15 : 0.55);
    if (bits[i] === "1") doc.rect(cx, y, Math.max(0.55, barW), h, "F");
    cx += unit;
  }
}

function airportFromSeg(seg, side) {
  const code = side === "from" ? seg.from || seg.origin : seg.to || seg.destination;
  const extra = side === "from" ? seg.from_airport : seg.to_airport;
  const d = extra && extra.code ? extra : describeAirport(code);
  return {
    code: pdfSafe(d.code || code),
    name: pdfSafe(d.name || d.fullName || code),
    fullName: pdfSafe(d.fullName || d.name || code),
    city: pdfSafe(d.city || ""),
    location: pdfSafe(d.location || d.region || ""),
    terminals: pdfSafe(d.terminals || ""),
    tip: pdfSafe(d.tip || ""),
    time: formatFlightClock(
      side === "from" ? seg.departure || seg.dep_time : seg.arrival || seg.arr_time
    ),
  };
}

function stopsLabel(stops) {
  if (stops == null || stops === "") return "";
  if (typeof stops === "number") return stops === 0 ? "Direct" : `${stops} stop${stops === 1 ? "" : "s"}`;
  const s = String(stops).toLowerCase();
  if (s === "0" || s === "nonstop" || s === "non-stop" || s === "direct") return "Direct";
  return pdfSafe(stops);
}

/**
 * @param {object} booking
 * @param {{ veroImg?: string|null, itineroImg?: string|null, airlineImg?: string|null }} [opts]
 */
export function buildBookingConfirmationPdf(booking, opts = {}) {
  const b = booking && typeof booking === "object" ? booking : {};
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 36;
  const contentW = pageW - m * 2;

  const rawSegs = Array.isArray(b.segments_summary) && b.segments_summary.length > 0 ? b.segments_summary : [{}];

  rawSegs.forEach((seg, idx) => {
    if (idx > 0) {
      doc.addPage();
    }
    const origin = airportFromSeg(seg, "from");
    const dest = airportFromSeg(seg, "to");
    if (idx === 0 && b.origin_airport?.code) {
      Object.assign(origin, {
        code: pdfSafe(b.origin_airport.code) || origin.code,
        name: pdfSafe(b.origin_airport.name) || origin.name,
        fullName: pdfSafe(b.origin_airport.fullName || b.origin_airport.name) || origin.fullName,
        city: pdfSafe(b.origin_airport.city) || origin.city,
        location: pdfSafe(b.origin_airport.location) || origin.location,
        terminals: pdfSafe(b.origin_airport.terminals) || origin.terminals,
        tip: pdfSafe(b.origin_airport.tip) || origin.tip,
      });
    }
    if (idx === 0 && b.dest_airport?.code) {
      Object.assign(dest, {
        code: pdfSafe(b.dest_airport.code) || dest.code,
        name: pdfSafe(b.dest_airport.name) || dest.name,
        fullName: pdfSafe(b.dest_airport.fullName || b.dest_airport.name) || dest.fullName,
        city: pdfSafe(b.dest_airport.city) || dest.city,
        location: pdfSafe(b.dest_airport.location) || dest.location,
        terminals: pdfSafe(b.dest_airport.terminals) || dest.terminals,
        tip: pdfSafe(b.dest_airport.tip) || dest.tip,
      });
    }

    const airline = pdfSafe(seg.airline || b.airline || airlineLabel(seg) || "Airline");
    const airlineCode = inferAirlineCode(
      airline,
      seg.flight_number || b.flight_number,
      seg.airline_code || b.airline_code
    );
    const flightNo = pdfSafe(seg.flight_number || b.flight_number || airlineCode);
    const duration = pdfSafe(seg.duration || b.duration || "");
    const cabin = pdfSafe(seg.cabin || b.cabin || "Economy");
    const stops = stopsLabel(seg.stops ?? b.stops) || "Direct";
    const travelDate = prettyTravelDate(seg.date || b.travel_date || "");
    const bookingId = pdfSafe(
      b.airline_pnr || b.booking_ref || b.booking_id || "ITN"
    );
    const rawStatus = pdfSafe(b.status || "PAID").toUpperCase();
    const payStatus = pdfSafe(b.payment_status || "");
    const status =
      /PAID|COMPLETED|TICKETED|CONFIRMED/.test(`${rawStatus} ${payStatus}`.toUpperCase())
        ? "PAID"
        : rawStatus === "CREATED"
          ? "PAID"
          : rawStatus;
    const money = fmtMoney(
      b.total_price ?? b.price ?? b.payment?.amount,
      b.currency || b.payment?.currency
    );
    const issued = prettyIssued(b.timestamp);
    const depUsual = likelyTerminal(airlineCode, origin.code);
    const arrUsual = likelyTerminal(airlineCode, dest.code);

    doc.setFillColor(...C.white);
    doc.rect(0, 0, pageW, pageH, "F");

    /* ----- Header ----- */
    drawWordmark(doc, m, 48, 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C.ink);
    const legLabel = seg.leg_label || (rawSegs.length > 1 ? (idx === 0 ? "DEPARTING FLIGHT" : "RETURN FLIGHT") : "");
    doc.text(
      legLabel ? `CONFIRMED E-TICKET (${legLabel.toUpperCase()})` : "CONFIRMED E-TICKET",
      pageW - m,
      40,
      { align: "right" }
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    const subtitle = rawSegs.length > 1
      ? `Passenger itinerary · Show at check-in (Ticket ${idx + 1} of ${rawSegs.length})`
      : "Passenger itinerary · Show at check-in";
    doc.text(subtitle, pageW - m, 54, { align: "right" });
    if (issued) {
      doc.text(`Issued ${issued}`, pageW - m, 66, { align: "right" });
    }

    doc.setDrawColor(...C.orange);
    doc.setLineWidth(3);
    doc.line(m, 78, pageW - m, 78);

    let y = 94;

    /* ----- Airline row ----- */
    const airH = 58;
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.9);
    doc.roundedRect(m, y, contentW, airH, 10, 10, "FD");

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.line);
    doc.roundedRect(m + 12, y + 10, 38, 38, 8, 8, "FD");
    const segAirlineImg = idx === 0 ? opts.airlineImg : null;
    if (!safeImage(doc, segAirlineImg, m + 13, y + 11, 36, 36)) {
      doc.setFillColor(...C.orange);
      doc.roundedRect(m + 13, y + 11, 36, 36, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...C.white);
      doc.text((airlineCode || "FL").slice(0, 2), m + 31, y + 34, { align: "center" });
    }
    text(doc, airline, m + 62, y + 26, { size: 13, style: "bold", color: C.ink });
    text(doc, [flightNo, cabin, stops].filter(Boolean).join("  |  "), m + 62, y + 44, {
      size: 10,
      color: C.muted,
    });
    if (!safeImage(doc, opts.itineroImg, pageW - m - 92, y + 18, 78, 22)) {
      drawWordmark(doc, pageW - m - 78, y + 36, 14);
    }
    y += airH + 12;

    /* ----- Booking reference bar ----- */
    const barH = 54;
    doc.setFillColor(...C.navy);
    doc.roundedRect(m, y, contentW, barH, 10, 10, "F");
    text(doc, "BOOKING REFERENCE", m + 18, y + 18, { size: 8, style: "bold", color: [196, 210, 232] });
    const ticketPnr = rawSegs.length > 1 && idx > 0 ? `${bookingId}-R` : bookingId;
    text(doc, ticketPnr, m + 18, y + 40, { size: 18, style: "bold", color: C.white });

    const pillW = 58;
    const pillX = pageW / 2 - pillW / 2;
    doc.setFillColor(...C.white);
    doc.roundedRect(pillX, y + 18, pillW, 20, 10, 10, "F");
    text(doc, status || "PAID", pageW / 2, y + 32, {
      size: 9,
      style: "bold",
      color: status === "PAID" ? C.green : C.orange,
      align: "center",
    });

    if (travelDate) {
      text(doc, travelDate, pageW - m - 18, y + 32, {
        size: 11,
        style: "bold",
        color: C.white,
        align: "right",
      });
    }
    y += barH + 22;

    /* ----- Route ----- */
    text(doc, "DEPART", m, y, { size: 8, style: "bold", color: C.orange });
    text(doc, "ARRIVE", pageW - m, y, { size: 8, style: "bold", color: C.orange, align: "right" });

    text(doc, (origin.time || "--:--").slice(0, 5), m, y + 28, { size: 28, style: "bold", color: C.ink });
    text(doc, (dest.time || "--:--").slice(0, 5), pageW - m, y + 28, {
      size: 28,
      style: "bold",
      color: C.ink,
      align: "right",
    });

    const midX = pageW / 2;
    if (duration) {
      text(doc, duration, midX, y + 10, { size: 10, style: "bold", color: C.ink, align: "center" });
    }
    doc.setDrawColor(...C.orange);
    doc.setLineWidth(2);
    doc.line(midX - 78, y + 28, midX - 8, y + 28);
    doc.line(midX + 8, y + 28, midX + 78, y + 28);
    doc.setFillColor(...C.orange);
    doc.circle(midX, y + 28, 4.2, "F");
    text(doc, stops, midX, y + 46, { size: 9, color: C.muted, align: "center" });

    text(doc, origin.code, m, y + 56, { size: 16, style: "bold", color: C.ink });
    text(doc, dest.code, pageW - m, y + 56, { size: 16, style: "bold", color: C.ink, align: "right" });
    text(doc, origin.city || origin.name, m, y + 74, { size: 11, color: C.muted, maxW: 200 });
    text(doc, dest.city || dest.name, pageW - m, y + 74, {
      size: 11,
      color: C.muted,
      align: "right",
      maxW: 200,
    });
    text(doc, origin.name, m, y + 90, { size: 9, color: C.muted, maxW: 210 });
    text(doc, dest.name, pageW - m, y + 90, { size: 9, color: C.muted, align: "right", maxW: 210 });
    y += 108;

    /* ----- Airport cards ----- */
    const cardW = (contentW - 12) / 2;
    const cardH = 126;
    const drawAirportCard = (x, title, ap, usual) => {
      doc.setFillColor(...C.gray);
      doc.roundedRect(x, y, cardW, cardH, 10, 10, "F");
      text(doc, title, x + 14, y + 18, { size: 8, style: "bold", color: C.orange });
      text(doc, ap.fullName || ap.name, x + 14, y + 36, { size: 11, style: "bold", color: C.ink, maxW: cardW - 28 });
      text(doc, ap.location || ap.city, x + 14, y + 52, { size: 9, color: C.muted, maxW: cardW - 28 });
      let ty = y + 68;
      if (ap.terminals) {
        ty = text(doc, `Terminals: ${ap.terminals}`, x + 14, ty, {
          size: 9,
          style: "bold",
          color: C.ink,
          maxW: cardW - 28,
          lh: 3,
        });
      }
      if (usual) {
        ty = text(doc, `Usual for this airline: ${usual}`, x + 14, ty + 2, {
          size: 8,
          style: "bold",
          color: C.ink,
          maxW: cardW - 28,
          lh: 3,
        });
      }
      if (ap.tip) {
        text(doc, ap.tip, x + 14, ty + 4, { size: 8, color: C.muted, maxW: cardW - 28, lh: 3 });
      }
    };
    drawAirportCard(m, "DEPARTURE AIRPORT", origin, depUsual);
    drawAirportCard(m + cardW + 12, "ARRIVAL AIRPORT", dest, arrUsual);
    y += cardH + 12;

    /* ----- Passenger + contact ----- */
    const passengers = Array.isArray(b.passengers) ? b.passengers : [];
    const contact = b.contact && typeof b.contact === "object" ? b.contact : {};
    const paxCount = Math.max(1, passengers.length);
    const paxH = Math.max(76, 32 + paxCount * 16);
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.9);
    doc.roundedRect(m, y, contentW, paxH, 10, 10, "FD");
    text(doc, "PASSENGER(S)", m + 16, y + 18, { size: 8, style: "bold", color: C.orange });
    if (passengers.length) {
      passengers.forEach((p, i) => {
        let typeStr = "Adult";
        const rawType = p.passenger_type ?? p.type;
        if (rawType === 1 || String(rawType).toLowerCase() === "child" || String(rawType).toLowerCase() === "chd") {
          typeStr = "Child";
        } else if (rawType === 2 || String(rawType).toLowerCase() === "infant" || String(rawType).toLowerCase() === "inf") {
          typeStr = "Infant";
        }
        const extra = [typeStr, p.date_of_birth || p.dob].filter(Boolean).map(pdfSafe);
        text(
          doc,
          `${i + 1}. ${paxName(p) || "Passenger"}${extra.length ? `  |  ${extra.join("  |  ")}` : ""}`,
          m + 16,
          y + 36 + i * 15,
          { size: 9.5, color: C.ink, maxW: contentW / 2 - 24 }
        );
      });
    } else {
      text(doc, "Lead passenger on file", m + 16, y + 36, { size: 10, color: C.muted });
    }
    text(doc, "CONTACT", m + contentW / 2 + 12, y + 18, { size: 8, style: "bold", color: C.orange });
    if (hasValue(contact.email)) {
      text(doc, contact.email, m + contentW / 2 + 12, y + 36, {
        size: 9.5,
        color: C.ink,
        maxW: contentW / 2 - 24,
      });
    }
    if (hasValue(contact.phone)) {
      const cc = contact.phone_country_code ? `+${pdfSafe(contact.phone_country_code)} ` : "+91 ";
      text(doc, `${cc}${pdfSafe(contact.phone)}`, m + contentW / 2 + 12, y + 52, { size: 9, color: C.ink });
    }
    y += paxH + 12;

    /* ----- Amount + barcode ----- */
    const payH = 68;
    const payW = contentW * 0.58 - 6;
    doc.setFillColor(...C.cream);
    doc.roundedRect(m, y, payW, payH, 10, 10, "F");
    text(doc, "AMOUNT PAID", m + 16, y + 18, { size: 8, style: "bold", color: C.orange });
    text(doc, money || "Rs. --", m + 16, y + 42, { size: 18, style: "bold", color: C.ink });
    const paySub = rawSegs.length > 1 ? "Combined Round-Trip Total · Card" : (payStatus || "Card · Stripe");
    text(doc, paySub, m + 16, y + 58, { size: 8, color: C.muted, maxW: payW - 28 });

    const barX = m + payW + 12;
    const barW = contentW - payW - 12;
    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.line);
    doc.roundedRect(barX, y, barW, payH, 10, 10, "FD");
    drawBarcode(doc, ticketPnr, barX + 14, y + 12, barW - 28, 32);
    text(doc, ticketPnr, barX + barW / 2, y + 56, { size: 9, style: "bold", color: C.ink, align: "center" });
    y += payH + 14;

    /* ----- Vero ----- */
    const veroH = 58;
    doc.setFillColor(...C.navy);
    doc.roundedRect(m, y, contentW, veroH, 10, 10, "F");
    if (opts.veroImg) safeImage(doc, opts.veroImg, m + 12, y + 8, 42, 42);
    const veroX = opts.veroImg ? m + 66 : m + 18;
    text(doc, "Need help? Ask Vero", veroX, y + 22, { size: 12, style: "bold", color: C.white });
    text(
      doc,
      "Open Itinero and tap Vero for terminals, baggage, a hotel near arrival, or a cab.",
      veroX,
      y + 40,
      { size: 9, color: [210, 220, 236], maxW: contentW - (opts.veroImg ? 90 : 36) }
    );
    y += veroH + 18;

    /* ----- Fine print ----- */
    text(
      doc,
      "Issued by Itinero. Gate numbers appear on airport screens - we never invent them.",
      m,
      Math.min(y + 6, pageH - 28),
      { size: 8, color: C.muted, maxW: contentW - 90 }
    );
    text(doc, "itinero + Vero", pageW - m, Math.min(y + 6, pageH - 28), {
      size: 8,
      style: "bold",
      color: C.muted,
      align: "right",
    });
  });

  const id = b.booking_id || b.airline_pnr || "booking";
  const safeName = String(id).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  return {
    blob: doc.output("blob"),
    filename: `itinero-eticket-${safeName}.pdf`,
  };
}

export async function downloadBookingConfirmationPdf(booking, opts = {}) {
  const code = inferAirlineCode(
    booking?.airline,
    booking?.segments_summary?.[0]?.flight_number || booking?.flight_number,
    booking?.airline_code || booking?.segments_summary?.[0]?.airline_code
  );
  const storedLogo = booking?.airline_logo || booking?.segments_summary?.[0]?.airline_logo;
  const [veroImg, itineroImg, airlineImg] = await Promise.all([
    opts.veroImage === false ? null : opts.veroImage || loadPublicImage("vero-chatbot.png"),
    opts.itineroImage === false ? null : opts.itineroImage || loadPublicImage("itinero-logo.png"),
    opts.airlineImage === false ? null : opts.airlineImage || loadAirlineLogo(code, storedLogo),
  ]);
  const { blob, filename } = buildBookingConfirmationPdf(booking, {
    ...opts,
    veroImg,
    itineroImg,
    airlineImg,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

/** Branded hotel stay voucher PDF (matches email voucher layout). */
export async function downloadHotelVoucherPdf(data = {}) {
  const [veroImg, itineroImg] = await Promise.all([
    loadPublicImage("vero-chatbot.png"),
    loadPublicImage("itinero-logo.png"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const m = 40;
  const contentW = pageW - m * 2;
  const bookingId = pdfSafe(data.bookingId || data.bookingRef || "stay");
  const money = fmtMoney(data.totalPrice, data.currency);

  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pageW, 78, "F");
  doc.setFillColor(...C.orange);
  doc.rect(0, 78, pageW, 4, "F");
  if (itineroImg) {
    try {
      doc.addImage(itineroImg, imageFormat(itineroImg), m, 22, 110, 24);
    } catch {
      text(doc, "itinero", m, 40, { size: 16, style: "bold", color: C.white });
    }
  } else {
    text(doc, "itinero", m, 40, { size: 16, style: "bold", color: C.white });
  }
  text(doc, "HOTEL VOUCHER", pageW - m, 42, {
    size: 10,
    style: "bold",
    color: [253, 186, 116],
    align: "right",
  });

  let y = 110;
  text(doc, pdfSafe(data.hotelName || "Hotel stay"), m, y, {
    size: 18,
    style: "bold",
    color: C.ink,
    maxW: contentW,
  });
  y += 18;
  if (data.roomName || data.location) {
    text(doc, pdfSafe(data.roomName || data.location || ""), m, y, {
      size: 11,
      color: C.muted,
      maxW: contentW,
    });
    y += 16;
  }
  y += 10;

  doc.setFillColor(...C.navy);
  doc.roundedRect(m, y, contentW, 52, 10, 10, "F");
  text(doc, "BOOKING REFERENCE", m + 14, y + 16, { size: 8, style: "bold", color: [196, 210, 232] });
  text(doc, bookingId, m + 14, y + 36, { size: 14, style: "bold", color: C.white });
  text(doc, "CONFIRMED", pageW - m - 14, y + 30, {
    size: 9,
    style: "bold",
    color: C.green,
    align: "right",
  });
  y += 68;

  const cardW = (contentW - 12) / 2;
  doc.setFillColor(...C.cream);
  doc.roundedRect(m, y, cardW, 64, 10, 10, "F");
  text(doc, "CHECK-IN", m + 12, y + 18, { size: 8, style: "bold", color: C.orange });
  text(doc, pdfSafe(data.checkIn || "-"), m + 12, y + 40, { size: 12, style: "bold", color: C.ink, maxW: cardW - 24 });
  doc.setFillColor(...C.cream);
  doc.roundedRect(m + cardW + 12, y, cardW, 64, 10, 10, "F");
  text(doc, "CHECK-OUT", m + cardW + 24, y + 18, { size: 8, style: "bold", color: C.orange });
  text(doc, pdfSafe(data.checkOut || "-"), m + cardW + 24, y + 40, {
    size: 12,
    style: "bold",
    color: C.ink,
    maxW: cardW - 24,
  });
  y += 80;

  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.line);
  doc.roundedRect(m, y, contentW, 70, 10, 10, "FD");
  text(doc, "GUEST", m + 14, y + 18, { size: 8, style: "bold", color: C.orange });
  text(doc, "CONTACT", m + contentW / 2 + 8, y + 18, { size: 8, style: "bold", color: C.orange });
  text(doc, pdfSafe(data.guestName || "Guest on file"), m + 14, y + 40, {
    size: 12,
    style: "bold",
    color: C.ink,
    maxW: contentW / 2 - 24,
  });
  text(doc, pdfSafe(data.email || ""), m + contentW / 2 + 8, y + 38, {
    size: 10,
    color: C.ink,
    maxW: contentW / 2 - 24,
  });
  const guestMeta = [pdfSafe(data.guests || ""), pdfSafe(data.nights || "")]
    .filter(Boolean)
    .join(" / ");
  if (guestMeta) {
    text(doc, guestMeta, m + 14, y + 56, { size: 9, color: C.muted });
  }
  y += 86;

  const payW = contentW * 0.58 - 6;
  doc.setFillColor(...C.cream);
  doc.roundedRect(m, y, payW, 62, 10, 10, "F");
  text(doc, "AMOUNT PAID", m + 14, y + 18, { size: 8, style: "bold", color: C.orange });
  text(doc, money || "Rs. --", m + 14, y + 42, { size: 16, style: "bold", color: C.ink });
  text(doc, pdfSafe(data.paymentId || data.paymentLabel || "Card | Stripe"), m + 14, y + 56, {
    size: 8,
    color: C.muted,
    maxW: payW - 28,
  });
  const barX = m + payW + 12;
  const barW = contentW - payW - 12;
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.line);
  doc.roundedRect(barX, y, barW, 62, 10, 10, "FD");
  drawBarcode(doc, bookingId, barX + 14, y + 12, barW - 28, 28);
  text(doc, bookingId, barX + barW / 2, y + 52, {
    size: 9,
    style: "bold",
    color: C.ink,
    align: "center",
  });
  y += 78;

  doc.setFillColor(...C.navy);
  doc.roundedRect(m, y, contentW, 58, 10, 10, "F");
  if (veroImg) {
    try {
      doc.addImage(veroImg, imageFormat(veroImg), m + 12, y + 8, 42, 42);
    } catch {
      /* ignore */
    }
  }
  const veroX = veroImg ? m + 66 : m + 18;
  text(doc, "Need help? Ask Vero", veroX, y + 22, { size: 12, style: "bold", color: C.white });
  text(
    doc,
    "Open Itinero and tap Vero for late checkout, nearby food, or a cab.",
    veroX,
    y + 40,
    { size: 9, color: [210, 220, 236], maxW: contentW - (veroImg ? 90 : 36) }
  );
  y += 72;

  text(
    doc,
    "Present this voucher at check-in with a government ID. Issued by Itinero.",
    m,
    Math.min(y, pageH - 28),
    { size: 8, color: C.muted, maxW: contentW - 90 }
  );
  text(doc, "itinero + Vero", pageW - m, Math.min(y, pageH - 28), {
    size: 8,
    style: "bold",
    color: C.muted,
    align: "right",
  });

  const safeName = String(bookingId).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  doc.save(`itinero-hotel-voucher-${safeName}.pdf`);
  return `itinero-hotel-voucher-${safeName}.pdf`;
}
