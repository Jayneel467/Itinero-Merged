import React, { useState } from "react";

const PREVIEW_COUNT = 5;

/**
 * In-chat restaurant / venue cards from structured `places[]` on chat responses.
 */
export default function VeroPlaceCards({ places }) {
  const [expanded, setExpanded] = useState(false);

  const list = Array.isArray(places)
    ? places.filter((p) => p && typeof p === "object" && p.name)
    : [];

  if (!list.length) return null;

  const visible = expanded ? list : list.slice(0, PREVIEW_COUNT);
  const hidden = Math.max(0, list.length - PREVIEW_COUNT);

  return (
    <div className="vero-places">
      <div className="vero-places__meta">
        <span>
          {list.length} place{list.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="vero-places__list">
        {visible.map((place, i) => (
          <li key={`${place.name}-${i}`} className="vero-place-card">
            <div className="vero-place-card__main">
              <div className="vero-place-card__title-row">
                <strong className="vero-place-card__name">{place.name}</strong>
                {place.open_now === true && (
                  <span className="vero-place-card__badge vero-place-card__badge--open">
                    Open
                  </span>
                )}
                {place.open_now === false && (
                  <span className="vero-place-card__badge vero-place-card__badge--closed">
                    Closed
                  </span>
                )}
              </div>
              <div className="vero-place-card__meta">
                {place.rating != null && place.rating !== "" && (
                  <span className="vero-place-card__rating">
                    {formatRating(place.rating)}
                    <span aria-hidden>★</span>
                    {place.rating_count ? (
                      <em>({formatCount(place.rating_count)})</em>
                    ) : null}
                  </span>
                )}
                {place.type ? <span>{place.type}</span> : null}
                {place.price ? <span>{place.price}</span> : null}
              </div>
              {(place.area || place.address) && (
                <p className="vero-place-card__area" title={place.address || place.area}>
                  {place.area || shortenAddress(place.address)}
                </p>
              )}
            </div>
            {(place.maps_url || place.website_url) && (
              <div className="vero-place-card__actions">
                {place.maps_url ? (
                  <a
                    className="vero-place-card__chip"
                    href={place.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Maps
                  </a>
                ) : null}
                {place.website_url ? (
                  <a
                    className="vero-place-card__chip vero-place-card__chip--ghost"
                    href={place.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Website
                  </a>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="vero-places__more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `View ${hidden} more`}
        </button>
      )}
    </div>
  );
}

function formatRating(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return String(rating);
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function formatCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(v);
}

function shortenAddress(address) {
  if (!address) return "";
  const parts = String(address)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts.slice(0, 2).join(", ");
  return parts[0] || address;
}
