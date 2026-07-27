import { jsPDF } from "jspdf";

/**
 * Booking confirmation PDF from the LiteAPI complete/book payload.
 * Uses Helvetica (WinAnsi) only — all user-facing strings are ASCII-sanitized
 * so Unicode (₹, →, ·, en-dash) never garbles glyph mapping.
 */

const COLORS = {
  navy: [0, 20, 56], // #001438
  navySoft: [11, 42, 111], // #0b2a6f
  orange: [249, 114, 17], // #f97211
  ink: [26, 29, 33], // #1a1d21
  muted: [107, 114, 128], // #6b7280
  line: [232, 235, 239], // #e8ebef
  surface: [247, 248, 250],
  white: [255, 255, 255],
};

function hasValue(val) {
  if (val == null) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === "object") return Object.keys(val).length > 0;
  return true;
}

/** Coerce to a single plain string; never pass arrays/objects into doc.text. */
function asPlainString(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map(asPlainString).filter(Boolean).join(" ");
  return "";
}

/**
 * Map common Unicode punctuation/currency to Helvetica-safe ASCII.
 * jsPDF standard fonts cannot encode ₹ / → / –; unsupported chars corrupt draws.
 */
function pdfSafe(val) {
  let s = asPlainString(val);
  if (!s) return "";
  s = s
    .replace(/\u20B9/g, "Rs.") // ₹
    .replace(/\u20AC/g, "EUR ")
    .replace(/\u00A3/g, "GBP ")
    .replace(/\u2192|\u2794|\u279E|\u00BB/g, "->") // arrows
    .replace(/[\u2013\u2014\u2212]/g, "-") // en/em/minus dashes
    .replace(/[\u00B7\u2022\u2023\u2219]/g, "|") // middle dots / bullets
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

/** e.g. "1. BOM -> DEL | Air India 2402 | 06:35 - 08:35" */
function segmentLine(seg) {
  if (!seg || typeof seg !== "object") return null;
  const route = [seg.from, seg.to].filter(Boolean).map(pdfSafe).filter(Boolean).join(" -> ");
  const flight = [airlineLabel(seg), pdfSafe(seg.flight_number)].filter(Boolean).join(" ");
  const times = [seg.departure, seg.arrival].filter(Boolean).map(pdfSafe).filter(Boolean).join(" - ");
  return [route, flight, times].filter(Boolean).join(" | ") || null;
}

function drawLogoMark(doc, x, y, size = 28) {
  const r = 6;
  doc.setFillColor(...COLORS.orange);
  doc.roundedRect(x, y, size, size, r, r, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.72);
  doc.text("i", x + size / 2, y + size * 0.72, { align: "center" });
}

function drawHeader(doc, pageW, margin) {
  const headerH = 72;
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, pageW, headerH, "F");
  doc.setFillColor(...COLORS.orange);
  doc.rect(0, headerH, pageW, 3, "F");

  drawLogoMark(doc, margin, 22, 28);
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Itinero", margin + 36, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 210, 220);
  doc.text("Flight booking confirmation", margin + 36, 54);
  return headerH + 20;
}

function drawFooter(doc, pageW, pageH, margin, pageNum, pageCount) {
  const y = pageH - 28;
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(0.6);
  doc.line(margin, y - 10, pageW - margin, y - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    "Generated from your live booking confirmation. Fields shown only when returned by the provider.",
    margin,
    y
  );
  doc.text(`Page ${pageNum} of ${pageCount}`, pageW - margin, y, { align: "right" });
}

/**
 * @param {object} booking Normalized booking from POST /api/flights/complete
 * @returns {{ blob: Blob, filename: string }}
 */
export function buildBookingConfirmationPdf(booking) {
  const b = booking && typeof booking === "object" ? booking : {};
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;
  const bottomLimit = pageH - 48;

  let y = drawHeader(doc, pageW, margin);

  const ensureSpace = (need = 24) => {
    if (y + need > bottomLimit) {
      doc.addPage();
      y = margin;
    }
  };

  const writeText = (text, opts = {}) => {
    const safe = pdfSafe(text);
    if (!safe) return;
    const size = opts.size || 10;
    const style = opts.style || "normal";
    const color = opts.color || COLORS.ink;
    const x = opts.x != null ? opts.x : margin;
    const maxW = opts.maxW != null ? opts.maxW : contentW;
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(safe, maxW);
    for (let i = 0; i < lines.length; i += 1) {
      const ln = typeof lines[i] === "string" ? lines[i] : pdfSafe(lines[i]);
      ensureSpace(size + 6);
      doc.text(ln, x, y, { baseline: "top" });
      y += size + (opts.lineGap != null ? opts.lineGap : 4);
    }
  };

  const sectionCard = (title, bodyFn) => {
    ensureSpace(52);
    const cardTop = y;
    const padX = 14;
    const headerH = 28;

    // Header wash + accent + title, then body, then outer stroke sized to content.
    doc.setFillColor(...COLORS.surface);
    doc.roundedRect(margin, cardTop, contentW, headerH, 4, 4, "F");
    doc.setFillColor(...COLORS.orange);
    doc.rect(margin, cardTop, 4, headerH, "F");

    y = cardTop + 10;
    writeText(title, {
      size: 11,
      style: "bold",
      color: COLORS.navy,
      x: margin + padX,
      maxW: contentW - padX * 2,
    });
    y = cardTop + headerH + 10;
    bodyFn();
    const cardH = y + 10 - cardTop;

    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.9);
    doc.roundedRect(margin, cardTop, contentW, cardH, 4, 4, "S");
    doc.setFillColor(...COLORS.orange);
    doc.rect(margin, cardTop, 4, cardH, "F");

    y = cardTop + cardH + 14;
  };

  writeText("Booking Confirmation", { size: 20, style: "bold", color: COLORS.navy });
  y += 4;
  writeText("Thank you for booking with Itinero.", { size: 10, color: COLORS.muted });
  y += 12;

  sectionCard("Booking", () => {
    const rows = [
      hasValue(b.booking_id) ? `Booking ID: ${pdfSafe(b.booking_id)}` : null,
      hasValue(b.status) ? `Status: ${pdfSafe(b.status)}` : null,
      hasValue(b.payment_status) ? `Payment status: ${pdfSafe(b.payment_status)}` : null,
      hasValue(b.booking_ref) ? `Booking reference: ${pdfSafe(b.booking_ref)}` : null,
      hasValue(b.airline_pnr) ? `Airline PNR: ${pdfSafe(b.airline_pnr)}` : null,
      hasValue(b.timestamp) ? `Booked at: ${pdfSafe(b.timestamp)}` : null,
      hasValue(b.order_status) ? `Order status: ${pdfSafe(b.order_status)}` : null,
    ].filter(Boolean);
    if (!rows.length) {
      writeText("No booking details returned by the provider.", {
        size: 10,
        color: COLORS.muted,
        x: margin + 14,
        maxW: contentW - 28,
      });
      return;
    }
    rows.forEach((row) =>
      writeText(row, { size: 10, x: margin + 14, maxW: contentW - 28 })
    );
    const st = String(b.status || "").toUpperCase();
    if (st.includes("HOLD") || st.includes("SANDBOX") || st.includes("TEST")) {
      y += 4;
      writeText(
        "Note: This booking is in a HOLD / sandbox state and may not be a final ticketed itinerary.",
        {
          size: 9,
          style: "bold",
          color: COLORS.orange,
          x: margin + 14,
          maxW: contentW - 28,
        }
      );
    }
  });

  const locators = Array.isArray(b.airline_locators) ? b.airline_locators : [];
  if (locators.length) {
    sectionCard("Airline locators", () => {
      locators.forEach((loc) => {
        if (!loc || typeof loc !== "object") return;
        const bits = [loc.airline_code || loc.airline_name, loc.airline_pnr]
          .map(pdfSafe)
          .filter(Boolean);
        if (bits.length) {
          writeText(bits.join(" | "), { size: 10, x: margin + 14, maxW: contentW - 28 });
        }
      });
    });
  }

  const tickets = Array.isArray(b.ticket_numbers) ? b.ticket_numbers.filter(hasValue) : [];
  const td = b.ticket_data && typeof b.ticket_data === "object" ? b.ticket_data : {};
  if (tickets.length || hasValue(td.confirmation_id) || hasValue(td.ticketed_at)) {
    sectionCard("Tickets", () => {
      tickets.forEach((t) =>
        writeText(`Ticket number: ${pdfSafe(t)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        })
      );
      if (hasValue(td.confirmation_id)) {
        writeText(`Ticket confirmation ID: ${pdfSafe(td.confirmation_id)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
      if (hasValue(td.ticketed_at)) {
        writeText(`Ticketed at: ${pdfSafe(td.ticketed_at)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
      if (hasValue(td.provider)) {
        writeText(`Ticketing provider: ${pdfSafe(td.provider)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
    });
  }

  if (hasValue(b.eticket_url)) {
    sectionCard("E-ticket", () => {
      writeText(b.eticket_url, {
        size: 9,
        color: COLORS.navySoft,
        x: margin + 14,
        maxW: contentW - 28,
      });
    });
  }

  const passengers = Array.isArray(b.passengers) ? b.passengers : [];
  if (passengers.length) {
    sectionCard("Passengers", () => {
      passengers.forEach((p, i) => {
        const name = paxName(p);
        const extras = [
          p.passenger_type != null ? `type ${pdfSafe(p.passenger_type)}` : null,
          pdfSafe(p.date_of_birth || p.dob) || null,
          p.ticket_number ? `ticket ${pdfSafe(p.ticket_number)}` : null,
        ].filter(Boolean);
        writeText(
          `${i + 1}. ${name || "Passenger"}${extras.length ? ` | ${extras.join(" | ")}` : ""}`,
          { size: 10, x: margin + 14, maxW: contentW - 28 }
        );
      });
    });
  }

  const contact = b.contact && typeof b.contact === "object" ? b.contact : {};
  if (hasValue(contact.email) || hasValue(contact.phone)) {
    sectionCard("Contact", () => {
      if (hasValue(contact.email)) {
        writeText(`Email: ${pdfSafe(contact.email)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
      if (hasValue(contact.phone)) {
        const cc = contact.phone_country_code ? `+${pdfSafe(contact.phone_country_code)} ` : "";
        writeText(`Phone: ${cc}${pdfSafe(contact.phone)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
    });
  }

  const segments = Array.isArray(b.segments_summary) ? b.segments_summary : [];
  if (segments.length) {
    sectionCard("Flight segments", () => {
      segments.forEach((seg, i) => {
        const s = segmentLine(seg);
        if (s) {
          writeText(`${i + 1}. ${s}`, {
            size: 10,
            x: margin + 14,
            maxW: contentW - 28,
          });
        }
      });
    });
  }

  const total =
    b.total_price != null
      ? b.total_price
      : b.price != null
        ? b.price
        : b.payment?.amount != null
          ? b.payment.amount
          : b.pricing?.total ?? b.pricing?.totalAmount;
  const currency = b.currency || b.payment?.currency || b.pricing?.currency;
  const money = fmtMoney(total, currency);
  if (money) {
    sectionCard("Payment", () => {
      writeText(`Total paid: ${money}`, {
        size: 12,
        style: "bold",
        color: COLORS.navy,
        x: margin + 14,
        maxW: contentW - 28,
      });
      const pricing = b.pricing && typeof b.pricing === "object" ? b.pricing : {};
      if (hasValue(pricing.base) || hasValue(pricing.subtotal)) {
        const base = fmtMoney(pricing.base ?? pricing.subtotal, currency);
        if (base) {
          writeText(`Base / subtotal: ${base}`, {
            size: 10,
            x: margin + 14,
            maxW: contentW - 28,
          });
        }
      }
      if (hasValue(pricing.taxes)) {
        const taxes = fmtMoney(pricing.taxes, currency);
        if (taxes) {
          writeText(`Taxes: ${taxes}`, { size: 10, x: margin + 14, maxW: contentW - 28 });
        }
      }
      if (hasValue(b.payment_status)) {
        writeText(`Payment status: ${pdfSafe(b.payment_status)}`, {
          size: 10,
          x: margin + 14,
          maxW: contentW - 28,
        });
      }
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    drawFooter(doc, pageW, pageH, margin, p, pageCount);
  }

  const id = b.booking_id || b.airline_pnr || "booking";
  const safeName = String(id).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  return {
    blob: doc.output("blob"),
    filename: `itinero-booking-${safeName}.pdf`,
  };
}

export function downloadBookingConfirmationPdf(booking) {
  const { blob, filename } = buildBookingConfirmationPdf(booking);
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
