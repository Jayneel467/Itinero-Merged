/** Normalize supplier room labels for grouping (mirrors supervisor/hotel_structured.py). */
export function normalizeRoomLabel(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  const out = [];
  for (const ch of text) {
    out.push(/[a-z0-9]/.test(ch) ? ch : " ");
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

const ROOM_NOISE = new Set([
  "the",
  "a",
  "an",
  "and",
  "with",
  "hotel",
  "lalit",
  "mumbai",
  "delhi",
  "bangalore",
  "chennai",
  "hyderabad",
  "kolkata",
  "jaipur",
  "goa",
  "business",
  "city",
  "view",
  "bed",
  "beds",
  "non",
  "smoking",
  "room",
]);

/** Collapse supplier variants ("Deluxe King", "DELUXE KING BED", etc.) into one group. */
export function canonicalRoomGroupKey(value) {
  const key = normalizeRoomLabel(value);
  if (!key) return "room";
  const rawTokens = key.split(" ");
  const tokens = rawTokens.filter((t) => !ROOM_NOISE.has(t));
  const text = tokens.join(" ");

  if (rawTokens.includes("club") && rawTokens.includes("king")) return "club king room";
  if (rawTokens.includes("deluxe") && rawTokens.includes("king")) return "deluxe king room";
  if (rawTokens.includes("spa") && rawTokens.includes("suite")) return "spa suite";
  if (rawTokens.includes("suite") && rawTokens.includes("executive")) return "executive suite";
  if (
    (rawTokens.includes("one") && rawTokens.includes("bedroom") && rawTokens.includes("apartment")) ||
    (rawTokens.includes("apartment") && rawTokens.includes("bedroom"))
  ) {
    return "one bedroom apartment";
  }
  return text || key;
}

function roomGroupKey(room) {
  const raw =
    room?.groupKey ||
    room?.category ||
    room?.title ||
    room?.name ||
    "";
  return canonicalRoomGroupKey(raw);
}

/** Keep cheapest distinct product per room type + board + refund rules. */
export function dedupeRoomOffers(rooms) {
  const best = new Map();
  for (const room of rooms || []) {
    const group = roomGroupKey(room);
    const board = normalizeRoomLabel(room.board || "room only");
    const product = `${group}|${board}|${Boolean(room.freeCancellation)}|${Boolean(room.payAtHotel)}`;
    const curTotal = Number(room.totalPrice) || Number(room.price) || Number.POSITIVE_INFINITY;
    const prev = best.get(product);
    if (!prev) {
      best.set(product, room);
      continue;
    }
    const prevTotal = Number(prev.totalPrice) || Number(prev.price) || Number.POSITIVE_INFINITY;
    if (curTotal < prevTotal) best.set(product, room);
  }
  return [...best.values()].sort(
    (a, b) =>
      (Number(a.totalPrice) || Number(a.price) || 1e18) -
      (Number(b.totalPrice) || Number(b.price) || 1e18)
  );
}

function pickDisplayTitle(candidates) {
  const scored = (candidates || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((t) => {
      let score = 0;
      if (/^[A-Z]/.test(t)) score += 2;
      if (!/\(/.test(t)) score += 1;
      if (!/BED$/i.test(t)) score += 1;
      if (t.length < 40) score += 1;
      if (/^Room /i.test(t)) score -= 2;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score || a.t.length - b.t.length);
  return scored[0]?.t || "Room";
}

function mergeImageLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const u of list || []) {
      const s = String(u || "").trim();
      if (!s || seen.has(s)) continue;
      if (/hotel_room\.png|no[-_]?image/i.test(s)) continue;
      seen.add(s);
      out.push(s.startsWith("//") ? `https:${s}` : s);
    }
  }
  return out;
}

/** Group flat rate offers into room types (Nuitee-style booking layout). */
export function groupRoomsByType(rooms) {
  const deduped = dedupeRoomOffers(rooms);
  const map = new Map();

  for (const room of deduped) {
    const key = roomGroupKey(room);
    if (!map.has(key)) {
      map.set(key, {
        key,
        titleCandidates: [],
        image: room.image,
        images: mergeImageLists(room.images, [room.image]),
        bedType: room.bedType,
        capacity: room.capacity,
        size: room.size,
        view: room.view,
        rates: [],
      });
    }
    const group = map.get(key);
    group.titleCandidates.push(room.category || room.title || room.name);
    group.images = mergeImageLists(group.images, room.images, [room.image]);
    if (!group.image && room.image) group.image = room.image;
    if ((!group.bedType || group.bedType === "Standard bed") && room.bedType) {
      group.bedType = room.bedType;
    }
    if (!group.capacity && room.capacity) group.capacity = room.capacity;
    if ((!group.size || group.size === "-") && room.size) group.size = room.size;
    if ((!group.view || group.view === "Standard view") && room.view) {
      group.view = room.view;
    }
    group.rates.push(room);
  }

  return Array.from(map.values())
    .map((g) => {
      const seen = new Set();
      const rates = [];
      for (const rate of [...g.rates].sort(
        (a, b) =>
          (Number(a.totalPrice) || Number(a.price) || 0) -
          (Number(b.totalPrice) || Number(b.price) || 0)
      )) {
        const fp = [
          normalizeRoomLabel(rate.board || "room only"),
          Boolean(rate.freeCancellation),
          Boolean(rate.payAtHotel),
          Math.round(Number(rate.price) || 0),
        ].join("|");
        if (seen.has(fp)) continue;
        seen.add(fp);
        rates.push(rate);
      }
      return {
        ...g,
        image: g.images[0] || g.image || "",
        title: pickDisplayTitle(g.titleCandidates),
        rates,
      };
    })
    .filter((g) => g.rates.length > 0)
    .sort(
      (a, b) =>
        (Number(a.rates[0]?.totalPrice) || Number(a.rates[0]?.price) || 1e18) -
        (Number(b.rates[0]?.totalPrice) || Number(b.rates[0]?.price) || 1e18)
    );
}

/** One card per physical room type for detail-page carousels. */
export function uniqueRoomTypesForList(rooms) {
  return groupRoomsByType(rooms).map((group) => {
    const best = group.rates[0];
    return {
      ...best,
      id: group.key,
      title: group.title,
      name: group.title,
      category: group.title,
      images: group.images,
      image: group.image,
      bedType: group.bedType || best.bedType,
      capacity: group.capacity || best.capacity,
      size: group.size || best.size,
      view: group.view || best.view,
      pricePerNight: best.pricePerNight || best.price,
      price: best.pricePerNight || best.price,
      rateCount: group.rates.length,
    };
  });
}
