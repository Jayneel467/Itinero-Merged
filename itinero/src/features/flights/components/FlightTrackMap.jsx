import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { APP_CONFIG } from "@/app/config";
import styles from "./FlightTrackMap.module.css";

const GMAPS_CB = "__itineroGmapsReady";

function MapEmpty({ title, copy }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden>
        <MapPin size={26} strokeWidth={2.1} />
      </div>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyCopy}>{copy}</p>
    </div>
  );
}

function loadGoogleMaps(key) {
  if (typeof window === "undefined" || !key) return Promise.reject(new Error("no_key"));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (window.__itineroGmapsPromise) return window.__itineroGmapsPromise;
  window.__itineroGmapsPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else reject(new Error("maps_missing"));
    };
    if (document.querySelector("script[data-itinero-gmaps]")) {
      window[GMAPS_CB] = done;
      return;
    }
    window[GMAPS_CB] = done;
    const s = document.createElement("script");
    s.dataset.itineroGmaps = "1";
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${GMAPS_CB}`;
    s.onerror = () => reject(new Error("maps_js_failed"));
    document.head.appendChild(s);
  });
  return window.__itineroGmapsPromise;
}

/** Twin-jet top-down, nose = north. One compound silhouette (737-class). */
const PLANE_D = [
  "M50 2.8 C56.4 2.8 58.8 13.2 59 24 L59.2 78.5 C59.2 89.8 55.4 97.2 50 99.7 C44.6 97.2 40.8 89.8 40.8 78.5 L41 24 C41.2 13.2 43.6 2.8 50 2.8 Z",
  "M43 28.5 C26.5 33 12.5 40.2 4.8 45.6 C1.6 47.4 2.4 52.4 7.2 52.8 L24.5 49.4 L43 39.2 Z",
  "M57 28.5 C73.5 33 87.5 40.2 95.2 45.6 C98.4 47.4 97.6 52.4 92.8 52.8 L75.5 49.4 L57 39.2 Z",
  "M31.5 35 C36.4 35 38.2 37.8 38.2 42.6 L38.2 52.4 C38.2 57 36.4 59.4 31.5 59.4 C26.6 59.4 24.8 57 24.8 52.4 L24.8 42.6 C24.8 37.8 26.6 35 31.5 35 Z",
  "M68.5 35 C73.4 35 75.2 37.8 75.2 42.6 L75.2 52.4 C75.2 57 73.4 59.4 68.5 59.4 C63.6 59.4 61.8 57 61.8 52.4 L61.8 42.6 C61.8 37.8 63.6 35 68.5 35 Z",
  "M43 80.8 C30.5 86.8 20.2 92.6 14.8 95.8 C12 97.2 12.8 100.2 17.2 100 L43 89.2 Z",
  "M57 80.8 C69.5 86.8 79.8 92.6 85.2 95.8 C88 97.2 87.2 100.2 82.8 100 L57 89.2 Z",
].join(" ");

function planeSvg(heading = 0) {
  const deg = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 100 100">
    <g transform="rotate(${deg} 50 50)">
      <path fill="#FFCC00" d="${PLANE_D}"/>
    </g>
  </svg>`;
}

function gmapsPlaneIcon(gmaps, heading) {
  const deg = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return {
    path: PLANE_D,
    fillColor: "#FFCC00",
    fillOpacity: 1,
    strokeColor: "#B8860B",
    strokeWeight: 1.1,
    scale: 0.62,
    rotation: deg,
    anchor: new gmaps.Point(50, 50),
  };
}

function airportPin(code) {
  return L.divIcon({
    className: "",
    html: `<div class="${styles.apt}">${code || "•"}</div>`,
    iconSize: [52, 28],
    iconAnchor: [26, 14],
  });
}

function planeIcon(heading, small = false) {
  const size = small ? 36 : 56;
  return L.divIcon({
    className: "",
    html: `<div class="${small ? styles.planePinSm : styles.planePin}">${planeSvg(heading)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function bindMapResize(gmaps, map, el) {
  if (!gmaps || !map || !el || typeof ResizeObserver === "undefined") {
    return () => {};
  }
  const kick = () => {
    const center = map.getCenter?.();
    gmaps.event.trigger(map, "resize");
    if (center) map.setCenter(center);
  };
  const ro = new ResizeObserver(() => kick());
  ro.observe(el);
  const t1 = window.setTimeout(kick, 60);
  const t2 = window.setTimeout(kick, 280);
  window.addEventListener("resize", kick);
  return () => {
    ro.disconnect();
    window.clearTimeout(t1);
    window.clearTimeout(t2);
    window.removeEventListener("resize", kick);
  };
}

function asLatLon(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon ?? raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function ll(p) {
  return [p.lat, p.lon];
}

function gll(p) {
  return { lat: p.lat, lng: p.lon };
}

function FitOnce({ points, lockKey, closeIn }) {
  const map = useMap();
  const fitted = useRef("");
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(t);
  }, [map]);
  useEffect(() => {
    if (!points?.length) return;
    const key = `${lockKey}:${closeIn ? "near" : "wide"}`;
    if (fitted.current === key) return;
    fitted.current = key;
    if (points.length === 1) {
      map.setView(points[0], closeIn ? 10 : 7);
      return;
    }
    map.fitBounds(L.latLngBounds(points).pad(closeIn ? 0.35 : 0.16), {
      animate: true,
      maxZoom: closeIn ? 11 : 8,
    });
  }, [map, points, lockKey, closeIn]);
  return null;
}

function OsmMap({ trail, origin, dest, plane, heading, originCode, destCode, lockKey, closeIn }) {
  const wide = useMemo(() => {
    const out = [];
    if (origin) out.push(ll(origin));
    trail.forEach((p) => out.push(ll(p)));
    if (plane) out.push(ll(plane));
    if (dest) out.push(ll(dest));
    return out;
  }, [trail, origin, dest, plane]);
  const near = useMemo(() => {
    const out = [];
    trail.slice(-12).forEach((p) => out.push(ll(p)));
    if (plane) out.push(ll(plane));
    if (dest) out.push(ll(dest));
    return out.length ? out : wide;
  }, [trail, plane, dest, wide]);
  const center = wide[0] || [22.5, 78];
  const leadIn = origin && trail[0] ? [ll(origin), ll(trail[0])] : null;
  const remain = plane && dest ? [ll(plane), ll(dest)] : null;
  const flown = trail.map(ll);

  return (
    <MapContainer center={center} zoom={6} scrollWheelZoom className={styles.map} worldCopyJump>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitOnce points={closeIn ? near : wide} lockKey={lockKey} closeIn={closeIn} />
      {leadIn ? (
        <Polyline positions={leadIn} pathOptions={{ color: "#60a5fa", weight: 3, opacity: 0.75, dashArray: "7 8" }} />
      ) : null}
      {flown.length > 1 ? (
        <Polyline positions={flown} pathOptions={{ color: "#1d4ed8", weight: 4, opacity: 0.95 }} />
      ) : null}
      {remain ? (
        <Polyline positions={remain} pathOptions={{ color: "#f97211", weight: 3, opacity: 0.95, dashArray: "8 7" }} />
      ) : null}
      {origin ? <Marker position={ll(origin)} icon={airportPin(originCode)} zIndexOffset={200} /> : null}
      {dest ? <Marker position={ll(dest)} icon={airportPin(destCode)} zIndexOffset={200} /> : null}
      {plane ? <Marker position={ll(plane)} icon={planeIcon(heading)} zIndexOffset={1200} /> : null}
    </MapContainer>
  );
}

function GoogleTrackMap({ trail, origin, dest, plane, heading, originCode, destCode, gmaps, lockKey, closeIn }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const bitsRef = useRef({});
  const fittedRef = useRef("");

  useEffect(() => {
    if (!elRef.current || !gmaps) return undefined;
    if (!mapRef.current) {
      mapRef.current = new gmaps.Map(elRef.current, {
        center: plane ? gll(plane) : origin ? gll(origin) : { lat: 22.5, lng: 78 },
        zoom: 6,
        mapTypeId: "roadmap",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy",
      });
    }
    const map = mapRef.current;
    Object.values(bitsRef.current).forEach((item) => item?.setMap?.(null));
    const bits = {};

    if (origin && trail[0]) {
      bits.lead = new gmaps.Polyline({
        path: [gll(origin), gll(trail[0])],
        strokeColor: "#60a5fa",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        geodesic: true,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2.4, strokeColor: "#60a5fa" }, offset: "0", repeat: "12px" }],
        map,
      });
    }
    if (trail.length > 1) {
      bits.trail = new gmaps.Polyline({
        path: trail.map(gll),
        strokeColor: "#1d4ed8",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        geodesic: true,
        map,
      });
    }
    if (plane && dest) {
      bits.remain = new gmaps.Polyline({
        path: [gll(plane), gll(dest)],
        strokeColor: "#F97211",
        strokeOpacity: 0.95,
        strokeWeight: 3,
        geodesic: true,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3, strokeColor: "#F97211" }, offset: "0", repeat: "11px" }],
        map,
      });
    }
    const labelIcon = (code) => ({
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="30"><rect x="1" y="1" rx="15" width="56" height="28" fill="#001438" stroke="#fff" stroke-width="2"/><text x="29" y="20" text-anchor="middle" fill="#fff" font-size="12" font-family="system-ui,sans-serif" font-weight="800">${code || ""}</text></svg>`
      )}`,
      scaledSize: new gmaps.Size(58, 30),
      anchor: new gmaps.Point(29, 15),
    });
    if (origin) {
      bits.origin = new gmaps.Marker({
        position: gll(origin),
        map,
        icon: labelIcon(originCode),
        title: originCode || "Origin",
        zIndex: 200,
      });
    }
    if (dest) {
      bits.dest = new gmaps.Marker({
        position: gll(dest),
        map,
        icon: labelIcon(destCode),
        title: destCode || "Destination",
        zIndex: 200,
      });
    }
    if (plane) {
      bits.plane = new gmaps.Marker({
        position: gll(plane),
        map,
        icon: gmapsPlaneIcon(gmaps, heading),
        title: "Last reported position",
        zIndex: 9999,
        optimized: false,
      });
    }
    bitsRef.current = bits;

    const fitKey = `${lockKey}:${closeIn ? "near" : "wide"}`;
    if (fittedRef.current !== fitKey) {
      fittedRef.current = fitKey;
      const bounds = new gmaps.LatLngBounds();
      const add = (pt) => pt && bounds.extend(gll(pt));
      if (closeIn) {
        trail.slice(-12).forEach(add);
        add(plane);
        add(dest);
      } else {
        add(origin);
        add(dest);
        add(plane);
        trail.forEach(add);
      }
      map.fitBounds(bounds, closeIn ? 72 : 48);
    }
    return bindMapResize(gmaps, map, elRef.current);
  }, [gmaps, trail, origin, dest, plane, heading, originCode, destCode, lockKey, closeIn]);

  return <div ref={elRef} className={styles.map} />;
}

function OsmAirportMap({ airport }) {
  const center = asLatLon(airport?.coord);
  const nearby = Array.isArray(airport?.nearby) ? airport.nearby : [];
  const code = airport?.iata || airport?.icao || "";
  if (!center && !nearby.length) {
    return (
      <MapEmpty
        title="No airport pin yet"
        copy="Board times still stand. We don’t invent a map location when the feed has none."
      />
    );
  }
  const start = center ? ll(center) : nearby[0] ? ll(asLatLon(nearby[0])) : [22.5, 78];
  return (
    <MapContainer key={code || "apt"} center={start} zoom={10} scrollWheelZoom className={styles.map} worldCopyJump>
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      {center ? <Marker position={ll(center)} icon={airportPin(code)} zIndexOffset={200} /> : null}
      {nearby.map((p, idx) => {
        const loc = asLatLon(p);
        if (!loc) return null;
        return (
          <Marker
            key={`${p.callsign || p.registration || "ac"}-${idx}`}
            position={ll(loc)}
            icon={planeIcon(p.heading, true)}
            zIndexOffset={p.on_ground ? 400 : 900}
          />
        );
      })}
    </MapContainer>
  );
}

function GoogleAirportMap({ airport, gmaps }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const bitsRef = useRef({});
  const fittedRef = useRef("");
  const lat = Number(airport?.coord?.lat);
  const lon = Number(airport?.coord?.lon);
  const code = airport?.iata || airport?.icao || "";
  const nearby = Array.isArray(airport?.nearby) ? airport.nearby : [];
  const nearbySig = nearby
    .map((p) => `${p.callsign || ""}:${p.lat}:${p.lon}:${p.heading}:${p.on_ground ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    if (!elRef.current || !gmaps) return undefined;
    const center = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    if (!mapRef.current) {
      mapRef.current = new gmaps.Map(elRef.current, {
        center: center ? gll(center) : { lat: 22.5, lng: 78 },
        zoom: 10,
        mapTypeId: "roadmap",
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy",
      });
    }
    const map = mapRef.current;
    Object.values(bitsRef.current).forEach((item) => {
      if (Array.isArray(item)) item.forEach((m) => m?.setMap?.(null));
      else item?.setMap?.(null);
    });
    const bits = {};
    if (center) {
      bits.apt = new gmaps.Marker({
        position: gll(center),
        map,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="30"><rect x="1" y="1" rx="15" width="56" height="28" fill="#001438" stroke="#fff" stroke-width="2"/><text x="29" y="20" text-anchor="middle" fill="#fff" font-size="12" font-family="system-ui,sans-serif" font-weight="800">${code || ""}</text></svg>`
          )}`,
          scaledSize: new gmaps.Size(58, 30),
          anchor: new gmaps.Point(29, 15),
        },
        title: code || "Airport",
        zIndex: 200,
      });
    }
    bits.planes = nearby
      .map((p) => {
        const loc = asLatLon(p);
        if (!loc) return null;
        return new gmaps.Marker({
          position: gll(loc),
          map,
          icon: {
            ...gmapsPlaneIcon(gmaps, p.heading),
            scale: p.on_ground ? 0.34 : 0.42,
            fillColor: p.on_ground ? "#E6B800" : "#FFCC00",
          },
          title: p.callsign || p.registration || "Nearby aircraft",
          zIndex: p.on_ground ? 400 : 900,
          optimized: false,
        });
      })
      .filter(Boolean);
    bitsRef.current = bits;
    const fitKey = `apt:${code}`;
    if (fittedRef.current !== fitKey && center) {
      fittedRef.current = fitKey;
      map.setCenter(gll(center));
      map.setZoom(10);
    }
    return bindMapResize(gmaps, map, elRef.current);
  }, [gmaps, lat, lon, code, nearbySig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={elRef} className={styles.map} />;
}

function FlightOnlyMap({ track, gmaps, useOsm }) {
  const trail = useMemo(
    () => (Array.isArray(track?.trail) ? track.trail.map(asLatLon).filter(Boolean) : []),
    [track]
  );
  const origin = asLatLon(track?.origin_coord);
  const dest = asLatLon(track?.destination_coord);
  const plane = asLatLon(track?.position);
  const heading = Number(track?.position?.heading);
  const remaining = Number(track?.remaining_km);
  const closeIn = Number.isFinite(remaining) && remaining > 0 && remaining < 80;
  const lockKey = `${track?.flight_iata || ""}-${track?.origin || ""}-${track?.destination || ""}-${track?.date || ""}`;
  const hasAnything = Boolean(plane || origin || dest || trail.length);

  if (!hasAnything) {
    return (
      <MapEmpty
        title="No map pin yet"
        copy="Track a live flight to plot position. If the feed has no pin, airport screens still win - we don’t invent one."
      />
    );
  }

  const shared = {
    trail,
    origin,
    dest,
    plane,
    heading,
    originCode: track?.origin || "",
    destCode: track?.destination || "",
    lockKey,
    closeIn,
  };

  return (
    <div className={styles.wrap}>
      {useOsm || !gmaps ? <OsmMap {...shared} /> : <GoogleTrackMap {...shared} gmaps={gmaps} />}
      <p className={styles.note}>Last-reported position only. Not a guaranteed GPS pin.</p>
    </div>
  );
}

export default function FlightTrackMap({ track = null, airport = null }) {
  const key = APP_CONFIG.GOOGLE_MAPS_API_KEY || "";
  const [gmaps, setGmaps] = useState(null);
  const [useOsm, setUseOsm] = useState(!key);

  useEffect(() => {
    if (!key) {
      setUseOsm(true);
      return undefined;
    }
    let alive = true;
    loadGoogleMaps(key)
      .then((maps) => {
        if (alive) setGmaps(maps);
      })
      .catch(() => {
        if (alive) setUseOsm(true);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  if (airport) {
    const hasApt = Boolean(asLatLon(airport.coord) || (airport.nearby || []).length);
    if (!hasApt) {
      return (
        <MapEmpty
          title="No airport pin yet"
          copy="Board times still stand. We don’t invent a map location when the feed has none."
        />
      );
    }
    if (key && !gmaps && !useOsm) {
      return <div className={styles.wrap}><div className={styles.map} /></div>;
    }
    return (
      <div className={styles.wrap}>
        {useOsm || !gmaps ? (
          <OsmAirportMap airport={airport} />
        ) : (
          <GoogleAirportMap airport={airport} gmaps={gmaps} />
        )}
        <p className={styles.note}>Nearby radar only. Not every aircraft, not a guaranteed GPS pin.</p>
      </div>
    );
  }

  return <FlightOnlyMap track={track} gmaps={gmaps} useOsm={useOsm} />;
}
