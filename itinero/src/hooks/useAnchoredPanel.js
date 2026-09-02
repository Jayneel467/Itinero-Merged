import { useLayoutEffect, useState } from "react";

/**
 * Fixed-position a desktop dropdown against an anchor, flipping above when
 * there isn’t room below (e.g. home hero search bar at the bottom of the viewport).
 * On mobile (< md) returns undefined so full-screen sheet classes can take over.
 * Width is always clamped so iPad portrait never overflows with a 780px panel.
 */
export function useAnchoredPanel(
  anchorRef,
  open,
  { width = 780, estimatedHeight = 440, offsetX = -24, align = "left" } = {}
) {
  const [style, setStyle] = useState(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return undefined;
    }

    const place = () => {
      if (typeof window === "undefined") return;
      if (window.matchMedia("(max-width: 767px)").matches) {
        setStyle(undefined);
        return;
      }
      const el = anchorRef?.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const gap = 12;
      const margin = 16;
      const panelWidth = Math.min(width, Math.max(240, window.innerWidth - margin * 2));
      const spaceBelow = window.innerHeight - r.bottom - gap;
      const spaceAbove = r.top - gap;
      // Flip above when there isn't room below (e.g. hero section on initial page load)
      const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

      let left;
      if (align === "right") {
        left = Math.min(window.innerWidth - margin - panelWidth, Math.max(margin, r.right - panelWidth));
      } else {
        left = Math.min(window.innerWidth - margin - panelWidth, Math.max(margin, r.left + offsetX));
      }

      const availableHeight = openUp ? spaceAbove - margin : spaceBelow - margin;

      setStyle({
        position: "fixed",
        left,
        width: panelWidth,
        maxWidth: `calc(100vw - ${margin * 2}px)`,
        zIndex: 220,
        maxHeight: Math.max(200, Math.min(availableHeight, estimatedHeight + 40)),
        overflowY: "auto",
        ...(openUp
          ? { bottom: window.innerHeight - r.top + gap, top: "auto" }
          : { top: r.bottom + gap, bottom: "auto" }),
      });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, width, estimatedHeight, offsetX, align]);

  return style;
}
