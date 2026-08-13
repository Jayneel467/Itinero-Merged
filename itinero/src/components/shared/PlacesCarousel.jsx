import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./PlacesCarousel.module.css";

/**
 * Auto-advancing image carousel for package / destination cards.
 * Only rotates through images that have actually loaded - avoids blank blue frames.
 */
export default function PlacesCarousel({
  slides = [],
  fallback = "",
  alt = "",
  className = "",
  autoMs = 3200,
  pauseOnHover = true,
}) {
  const list = (Array.isArray(slides) ? slides : []).filter(Boolean);
  const cover = String(fallback || "").trim();
  const isPlacesSrc = (src) => String(src || "").includes("/api/places/photo");
  // Always include cover in the mount list so it can paint while Places proxies load.
  const sources = (() => {
    if (!list.length) return cover ? [cover] : [];
    if (cover && !list.includes(cover)) return [...list, cover];
    return list;
  })();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dead, setDead] = useState(() => new Set());
  const [ready, setReady] = useState(() => new Set());

  const loadedPlaces = sources.filter(
    (src) => isPlacesSrc(src) && ready.has(src) && !dead.has(src)
  );
  const loaded = sources.filter((src) => ready.has(src) && !dead.has(src));
  const pending = sources.filter((src) => !ready.has(src) && !dead.has(src));
  // Prefer loaded Places; while waiting, keep catalog cover in the wait slot.
  // Never paint an unloaded Places proxy — that is the blank navy frame.
  const pendingCover = cover && !isPlacesSrc(cover) && pending.includes(cover) ? [cover] : [];
  const readyCover = cover && ready.has(cover) && !dead.has(cover) ? [cover] : [];
  const pendingNonPlaces = pending.filter((src) => !isPlacesSrc(src));
  const safe = loadedPlaces.length
    ? loadedPlaces
    : loaded.length
      ? loaded
      : readyCover.length
        ? readyCover
        : pendingCover.length
          ? pendingCover
          : pendingNonPlaces.length
            ? [pendingNonPlaces[0]]
            : [];
  const active = Math.min(idx, Math.max(0, safe.length - 1));

  useEffect(() => {
    setIdx(0);
    setDead(new Set());
    setReady(new Set());
  }, [sources.join("|"), cover]);

  useEffect(() => {
    if (idx > Math.max(0, safe.length - 1)) setIdx(0);
  }, [safe.length, idx]);

  useEffect(() => {
    if (safe.length < 2 || paused || !autoMs || loadedPlaces.length < 2) return undefined;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % safe.length);
    }, autoMs);
    return () => window.clearInterval(t);
  }, [safe.length, paused, autoMs, active, loadedPlaces.length]);

  if (!sources.length && !cover) {
    return <div className={`${styles.root} ${className}`} aria-hidden />;
  }

  const go = (dir, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (safe.length < 2) return;
    setIdx((i) => (i + dir + safe.length) % safe.length);
  };

  const markDead = (src) => {
    setDead((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  };

  const markReady = (src) => {
    setReady((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  };

  // Always mount source imgs so onLoad/onError can fire; only fade up loaded ones in rotation.
  const showList = sources.length ? sources : cover ? [cover] : [];
  // Eager-load cover first so wait-state paints immediately.
  const eagerSrc = cover && showList.includes(cover) ? cover : showList[0];

  return (
    <div
      className={`${styles.root} ${className}`}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
    >
      {showList.map((src) => {
        const on = safe[active] === src;
        return (
          <img
            key={src}
            src={src}
            alt={on ? alt : ""}
            className={`${styles.slide} ${on ? styles.slideOn : ""}`}
            loading={src === eagerSrc ? "eager" : "lazy"}
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth > 0) markReady(src);
              else markDead(src);
            }}
            onError={() => markDead(src)}
          />
        );
      })}

      {safe.length > 1 && loadedPlaces.length > 1 ? (
        <>
          <button
            type="button"
            className={`${styles.nav} ${styles.prev}`}
            aria-label="Previous photo"
            onClick={(e) => go(-1, e)}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            className={`${styles.nav} ${styles.next}`}
            aria-label="Next photo"
            onClick={(e) => go(1, e)}
          >
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
          <div className={styles.dots} role="tablist" aria-label="Photos">
            {safe.map((src, i) => (
              <button
                key={`dot-${src}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                className={i === active ? styles.dotOn : styles.dot}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIdx(i);
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
