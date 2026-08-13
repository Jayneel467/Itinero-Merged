const KEY = "itinero_device_id";

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY) || "";
    if (!/^[A-Za-z0-9._:-]{8,80}$/.test(id)) {
      id =
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
