import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import { RotateCw } from "lucide-react";
import { PlacesPhotoImg } from "@/components/shared";
import styles from "./ExploreMap.module.css";

const EARTH_DAY =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
const EARTH_TOPO =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png";
const EARTH_NIGHT_SKY =
  "https://unpkg.com/three-globe@2.31.1/example/img/night-sky.png";

function boundsAround(lat, lng, pad = 18) {
  return {
    north: Math.min(85, lat + pad),
    south: Math.max(-85, lat - pad),
    east: Math.min(180, lng + pad),
    west: Math.max(-180, lng - pad),
  };
}

function pickNext(pool, recentIds) {
  const fresh = pool.filter((d) => !recentIds.includes(d.id));
  const list = fresh.length ? fresh : pool;
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildArcs(pins, focus, { dense = false } = {}) {
  if (!pins.length) return [];
  const hub = focus || pins[Math.floor(pins.length / 3)] || pins[0];
  const limit = dense ? 12 : 5;
  const others = pins.filter((d) => d.id !== hub.id).slice(0, limit);
  return others.map((d, i) => ({
    startLat: hub.lat,
    startLng: hub.lng,
    endLat: d.lat,
    endLng: d.lng,
    color: i % 2 === 0 ? ["rgba(249,114,17,0.85)", "rgba(255,212,181,0.15)"] : ["rgba(125,211,252,0.7)", "rgba(224,242,254,0.1)"],
  }));
}

/**
 * Google-Earth-style spin: globe rotates, then lands on a new place each spin.
 */
export default function ExploreMap({
  destinations = [],
  prices = {},
  formatMoney,
  selectedId = null,
  onSelect,
  onBoundsChange,
}) {
  const wrapRef = useRef(null);
  const globeRef = useRef(null);
  const recentRef = useRef([]);
  const spinTimer = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(null);
  const [activeId, setActiveId] = useState(selectedId);

  const pins = useMemo(
    () =>
      destinations.filter(
        (d) => d.lat != null && d.lng != null && Number.isFinite(d.lat) && Number.isFinite(d.lng)
      ),
    [destinations]
  );

  useEffect(() => {
    setActiveId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(320, Math.floor(r.width)),
        h: Math.max(380, Math.floor(r.height)),
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls?.();
    if (controls) {
      controls.autoRotate = !spinning && !landed;
      controls.autoRotateSpeed = spinning ? 14 : 0.55;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 140;
      controls.maxDistance = 520;
    }
  }, [spinning, landed, size.w]);

  useEffect(() => {
    return () => {
      window.clearTimeout(spinTimer.current);
    };
  }, []);

  const landOn = useCallback(
    (dest, { spinMs = 1600, flyMs = 2100 } = {}) => {
      if (!dest || spinning) return;
      const g = globeRef.current;
      if (!g) return;

      setSpinning(true);
      setLanded(null);
      setActiveId(dest.id);

      const controls = g.controls?.();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 14 + Math.random() * 8;
      }

      const cur = g.pointOfView?.() || { altitude: 2.4 };
      g.pointOfView(
        {
          lat: (cur.lat || 0) + (Math.random() * 50 - 25),
          lng: (cur.lng || 0) + 100 + Math.random() * 140,
          altitude: 2.75,
        },
        Math.min(1000, spinMs)
      );

      window.clearTimeout(spinTimer.current);
      spinTimer.current = window.setTimeout(() => {
        if (controls) {
          controls.autoRotate = false;
          controls.autoRotateSpeed = 0.55;
        }
        g.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 1.15 }, flyMs);
        window.setTimeout(() => {
          setLanded(dest);
          setSpinning(false);
          onBoundsChange?.(boundsAround(dest.lat, dest.lng));
          recentRef.current = [dest.id, ...recentRef.current.filter((id) => id !== dest.id)].slice(
            0,
            8
          );
        }, flyMs + 40);
      }, spinMs);
    },
    [spinning, onBoundsChange]
  );

  const spin = useCallback(() => {
    const next = pickNext(pins, recentRef.current);
    if (next) landOn(next);
  }, [pins, landOn]);

  const focusDest = landed || pins.find((d) => d.id === activeId) || null;

  const pointsData = useMemo(
    () =>
      pins.map((d) => ({
        ...d,
        color: d.id === focusDest?.id ? "#F97211" : "rgba(255,255,255,0.92)",
        altitude: d.id === focusDest?.id ? 0.1 : 0.018,
        radius: d.id === focusDest?.id ? 0.62 : 0.26,
      })),
    [pins, focusDest]
  );

  const labelsData = useMemo(() => (focusDest ? [focusDest] : []), [focusDest]);

  const arcsData = useMemo(
    () => buildArcs(pins, focusDest || pins[0], { dense: spinning }),
    [pins, focusDest, spinning]
  );

  const ringsData = useMemo(() => {
    if (!focusDest) return [];
    return [
      {
        lat: focusDest.lat,
        lng: focusDest.lng,
        maxR: 4.5,
        propagationSpeed: 2.2,
        repeatPeriod: 900,
      },
    ];
  }, [focusDest]);

  const priceLabel = (d) => {
    const price = prices[d.iata];
    if (typeof price === "number" && formatMoney) {
      return formatMoney(price).replace(/\.00$/, "");
    }
    return d.iata || d.city;
  };

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${styles.embedded} ${spinning ? styles.isSpinning : ""} ${landed ? styles.hasLanded : ""}`}
    >
      <div className={styles.glow} aria-hidden />
      <div className={styles.vignette} aria-hidden />

      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        backgroundImageUrl={EARTH_NIGHT_SKY}
        globeImageUrl={EARTH_DAY}
        bumpImageUrl={EARTH_TOPO}
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="#93c5fd"
        atmosphereAltitude={0.16}
        animateIn
        waitForGlobeReady
        pointsData={pointsData}
        pointLat="lat"
        pointLng="lng"
        pointAltitude="altitude"
        pointRadius="radius"
        pointColor="color"
        pointLabel={(d) => `${d.city}${d.country ? `, ${d.country}` : ""}`}
        onPointClick={(d) => {
          if (!d || spinning) return;
          landOn(d, { spinMs: 700, flyMs: 1400 });
        }}
        labelsData={labelsData}
        labelLat="lat"
        labelLng="lng"
        labelText={(d) => d.city}
        labelSize={1.7}
        labelDotRadius={0.5}
        labelColor={() => "#ffffff"}
        labelAltitude={0.024}
        labelResolution={2}
        arcsData={arcsData}
        arcColor="color"
        arcDashLength={0.4}
        arcDashGap={0.7}
        arcDashAnimateTime={spinning ? 800 : 4200}
        arcAltitudeAutoScale={0.4}
        arcStroke={0.45}
        ringsData={ringsData}
        ringColor={() => (t) => `rgba(249,114,17,${Math.sqrt(1 - t)})`}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
        onGlobeReady={() => {
          const g = globeRef.current;
          if (!g) return;
          g.pointOfView({ lat: 20, lng: 55, altitude: 1.85 }, 0);
          const controls = g.controls?.();
          if (controls) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.55;
          }
        }}
      />

      <div className={styles.hud}>
        <div className={`${styles.spinWrap} ${spinning ? styles.spinWrapActive : ""}`}>
          <span className={styles.spinRing} aria-hidden />
          <span className={styles.spinRing} aria-hidden />
          <button
            type="button"
            className={styles.spinBtn}
            onClick={spin}
            disabled={spinning || pins.length === 0}
          >
            <RotateCw size={18} className={spinning ? styles.spinIconActive : styles.spinIcon} aria-hidden />
            <span>{spinning ? "Finding your place…" : "Give it a spin"}</span>
          </button>
        </div>
        <p className={styles.hudHint}>
          {spinning
            ? "Hang on - locking onto a destination"
            : pins.length
              ? `${pins.length} places ready · each spin lands somewhere new`
              : "No places match these filters"}
        </p>
      </div>

      {landed ? (
        <div className={styles.landCard} role="status">
          <PlacesPhotoImg
            city={landed.city}
            country={landed.country}
            fallback={landed.image}
            alt=""
            className={styles.landImg}
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(landed.id)}/400/280`;
            }}
          />
          <div className={styles.landBody}>
            <p className={styles.landKicker}>You landed in</p>
            <strong>
              {landed.city}
              {landed.country ? `, ${landed.country}` : ""}
            </strong>
            <span>{priceLabel(landed)}</span>
            <div className={styles.landActions}>
              <button type="button" className={styles.landPrimary} onClick={() => onSelect?.(landed)}>
                Explore
              </button>
              <button type="button" className={styles.landGhost} onClick={spin} disabled={spinning}>
                Spin again
              </button>
            </div>
          </div>
          <button
            type="button"
            className={styles.landClose}
            aria-label="Dismiss"
            onClick={() => setLanded(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
