import { jsPDF } from "jspdf";
import { formatDisplayDate, formatTransfer } from "@/features/packages/utils/itineraryFormat";

/**
 * Branded package itinerary PDF - day-by-day plan, stay summary, know-before-you-go.
 */

const C = {
  navy: [0, 20, 57],
  orange: [233, 110, 51],
  ink: [17, 24, 39],
  muted: [107, 114, 128],
  line: [229, 231, 235],
  cream: [255, 247, 237],
  white: [255, 255, 255],
};

function pdfSafe(val) {
  if (val == null) return "";
  let s = String(val)
    .replace(/\u20B9/g, "Rs.")
    .replace(/\u2192/g, "->")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\t\n\r\x20-\x7E]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function fmtMoney(amount, currency, formatMoney) {
  if (amount == null || amount === "") return "";
  if (typeof formatMoney === "function") return pdfSafe(formatMoney(amount));
  const n = Number(amount);
  if (Number.isNaN(n)) return pdfSafe(amount);
  const cur = String(currency || "INR").toUpperCase();
  const num = n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "INR" ? `Rs. ${num}` : `${cur} ${num}`;
}

function guestName(g) {
  return pdfSafe([g?.firstName, g?.lastName].filter(Boolean).join(" ").trim() || "Guest");
}

function drawHeader(doc, pageNum) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, w, 56, "F");
  doc.setFillColor(...C.orange);
  doc.rect(0, 56, w, 3, "F");
  doc.setTextColor(...C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("itinero", 36, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(253, 186, 116);
  doc.text("PACKAGE ITINERARY", w - 36, 28, { align: "right" });
  if (pageNum > 1) {
    doc.setTextColor(196, 210, 232);
    doc.text(`Page ${pageNum}`, w - 36, 42, { align: "right" });
  }
  return 78;
}

function drawDayBlock(doc, day, x, y, w) {
  const title = pdfSafe(day.title || `Day ${day.day}`);
  const narrative = pdfSafe(day.narrative || day.description || "");
  const stay = pdfSafe(day.stayCity || day.hotel_city || "");
  const lines = [];
  if (narrative) lines.push(narrative.slice(0, 200));
  (day.activities || []).slice(0, 4).forEach((a) => lines.push(`  - ${pdfSafe(a).slice(0, 72)}`));
  (day.meals || []).slice(0, 2).forEach((m) => lines.push(`  Meal: ${pdfSafe(m).slice(0, 48)}`));
  (day.transfers || []).slice(0, 2).forEach((t) => lines.push(`  ${pdfSafe(formatTransfer(t)).slice(0, 72)}`));
  if (stay) lines.push(`  Stay: ${stay.slice(0, 40)}`);

  const blockH = 28 + Math.min(lines.length, 8) * 11;
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, blockH, 4, 4, "FD");

  doc.setTextColor(...C.orange);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`Day ${day.day || "?"}: ${title.slice(0, 52)}`, x + 10, y + 14);
  if (day.date) {
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(pdfSafe(formatDisplayDate(day.date)).slice(0, 24), x + w - 10, y + 14, { align: "right" });
  }

  doc.setTextColor(...C.ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let ty = y + 26;
  lines.slice(0, 8).forEach((line) => {
    doc.text(line.slice(0, 90), x + 10, ty);
    ty += 11;
  });
  return blockH + 8;
}

export function downloadPackageConfirmationPdf(booking, { formatMoney } = {}) {
  if (!booking) return;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const m = 36;
  const contentW = w - m * 2;
  let page = 1;
  let y = drawHeader(doc, page);

  const pkg = booking.package || {};
  const stay = booking.stay || {};
  const guest = booking.guest || {};
  const payment = booking.payment || {};
  const flight = booking.flight || null;
  const ref = pdfSafe(booking.bookingId || "PKG");

  doc.setFillColor(...C.navy);
  doc.roundedRect(m, y, contentW, 52, 6, 6, "F");
  doc.setTextColor(196, 210, 232);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("BOOKING REFERENCE", m + 14, y + 16);
  doc.setTextColor(...C.white);
  doc.setFontSize(14);
  doc.text(ref.slice(0, 32), m + 14, y + 36);
  doc.setFontSize(10);
  doc.text(pdfSafe(pkg.title || "Package").slice(0, 44), w - m - 14, y + 36, { align: "right" });
  y += 66;

  const rows = [
    ["Guest", guestName(guest)],
    ["Email", pdfSafe(guest.email)],
    ["Dates", `${pdfSafe(formatDisplayDate(stay.checkIn))} - ${pdfSafe(formatDisplayDate(stay.checkOut))}`],
    ["Hotel", pdfSafe(stay.hotel?.name || "Hotel")],
    ["Room", pdfSafe(stay.room?.title || stay.room?.board || "")],
    ["Amount paid", fmtMoney(payment.totalCharged ?? stay.total, stay.currency, formatMoney)],
  ];
  if (flight) {
    rows.push(["Flight", `${pdfSafe(flight.origin)} -> ${pdfSafe(flight.destination)}`]);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  rows.forEach(([label, value]) => {
    if (!value) return;
    doc.setTextColor(...C.muted);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), m, y);
    doc.setTextColor(...C.ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(value.slice(0, 62), m + 100, y);
    y += 16;
  });

  y += 8;
  doc.setTextColor(...C.orange);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DAY-BY-DAY ITINERARY", m, y);
  y += 14;

  (pkg.itinerary || []).forEach((day) => {
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      page += 1;
      y = drawHeader(doc, page);
      doc.setTextColor(...C.orange);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("ITINERARY (continued)", m, y);
      y += 14;
    }
    y += drawDayBlock(doc, day, m, y, contentW);
  });

  const know = (pkg.knowBeforeYouGo || []).slice(0, 4);
  if (know.length && y < doc.internal.pageSize.getHeight() - 80) {
    y += 6;
    const kh = 16 + know.length * 20;
    doc.setFillColor(...C.cream);
    doc.roundedRect(m, y, contentW, kh, 4, 4, "F");
    doc.setTextColor(...C.orange);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("KNOW BEFORE YOU GO", m + 12, y + 14);
    let ky = y + 28;
    doc.setTextColor(...C.ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    know.forEach((item) => {
      doc.text(`${pdfSafe(item.title)}: ${pdfSafe(item.body).slice(0, 78)}`, m + 12, ky);
      ky += 18;
    });
  }

  doc.setTextColor(...C.muted);
  doc.setFontSize(7);
  doc.text("Issued by Itinero. Ground costs are estimates unless marked bookable.", m, doc.internal.pageSize.getHeight() - 24);
  doc.text("support@itinero.company", w - m, doc.internal.pageSize.getHeight() - 24, { align: "right" });

  const safeRef = ref.replace(/[^\w-]/g, "_") || "package";
  doc.save(`itinero-package-${safeRef}.pdf`);
}
