const KEY = "itinero_selected_train";

export function persistSelectedTrain(train = {}, extra = {}) {
  if (!train?.number && !extra.number) return null;
  const payload = {
    number: String(train.number || extra.number || "").replace(/\D/g, ""),
    name: train.name || extra.name || "",
    from_code: String(train.from_code || extra.from_code || "").toUpperCase(),
    to_code: String(train.to_code || extra.to_code || "").toUpperCase(),
    from_name: train.from_name || extra.from_name || "",
    to_name: train.to_name || extra.to_name || "",
    dep: train.dep || extra.dep || "",
    arr: train.arr || extra.arr || "",
    duration: train.duration || extra.duration || "",
    days: train.days || extra.days || "",
    kind: train.kind || extra.kind || "",
    date: extra.date || train.date || "",
    class_code: extra.class_code || train.class_code || "",
    quota: extra.quota || train.quota || "GN",
    fare: extra.fare ?? train.fare ?? null,
    status: extra.status || train.status || "",
    status_text: extra.status_text || train.status_text || extra.status || train.status || "",
    available: extra.available ?? train.available ?? null,
    waitlist: extra.waitlist ?? train.waitlist ?? null,
    book_url: extra.book_url || train.book_url || "",
    irctc_url: extra.irctc_url || train.irctc_url || "",
    schedule_url: extra.schedule_url || train.schedule_url || "",
    food_url: extra.food_url || train.food_url || "",
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
  return payload;
}

export function readSelectedTrain() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
