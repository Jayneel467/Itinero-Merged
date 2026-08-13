/** STOL / mountain fields almost never on live global fares. Don’t invent prices. */
export const STOL_LOCAL = {
  LUA: { name: "Lukla", hub: "KTM", hubName: "Kathmandu" },
  JMO: { name: "Jomsom", hub: "KTM", hubName: "Kathmandu" },
  IMK: { name: "Simikot", hub: "KTM", hubName: "Kathmandu" },
  PPL: { name: "Phaplu", hub: "KTM", hubName: "Kathmandu" },
};

export function stolEmptyHint(origin, destination) {
  const o = String(origin || "").toUpperCase();
  const d = String(destination || "").toUpperCase();
  const destHit = STOL_LOCAL[d];
  const originHit = STOL_LOCAL[o];
  if (destHit) {
    if (o === destHit.hub) {
      return {
        title: `${destHit.name} isn’t on live fares`,
        copy:
          `${destHit.name} is a short mountain hop from ${destHit.hubName}. ` +
          `Small STOL operators sell it locally - we don’t invent those prices. ` +
          `Fly into ${destHit.hubName} first, then book that last sector on the ground.`,
      };
    }
    return {
      title: `${destHit.name} isn’t on live fares`,
      copy:
        `No through-ticket to ${destHit.name} on live global fares. ` +
        `Search ${o} → ${destHit.hub} (${destHit.hubName}), then book the last hop locally.`,
      altFrom: o,
      altTo: destHit.hub,
      altLabel: `Search ${o} → ${destHit.hub}`,
    };
  }
  if (originHit) {
    return {
      title: `${originHit.name} isn’t on live fares`,
      copy:
        `Depart ${originHit.hubName} (${originHit.hub}) on live fares, ` +
        `or book the ${originHit.name} hop locally.`,
      altFrom: originHit.hub,
      altTo: d,
      altLabel: d ? `Search ${originHit.hub} → ${d}` : "",
    };
  }
  return null;
}
