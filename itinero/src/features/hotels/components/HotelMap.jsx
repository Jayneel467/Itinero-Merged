import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import styles from "./HotelMap.module.css";
import { useCurrency, getCurrencyMeta } from "@/context/CurrencyContext";
import { APP_CONFIG } from "@/app/config";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/** Normalize LiteAPI + UI hotel coords (latitude/longitude or lat/lng). */
export function hotelCoords(hotel) {
  if (!hotel || typeof hotel !== "object") return null;
  const lat = Number(hotel.latitude ?? hotel.lat);
  const lng = Number(hotel.longitude ?? hotel.lng ?? hotel.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

const createPriceIcon = (price, isActive, currencyCode = APP_CONFIG.DEFAULT_CURRENCY) => {
  const meta = getCurrencyMeta(currencyCode);
  const amount = Number(price);
  const label = Number.isFinite(amount)
    ? `${meta.symbol}${amount.toLocaleString(meta.locale || "en-IN")}`
    : "-";
  const html = `
    <div class="${styles.priceMarker} ${isActive ? styles.priceMarkerActive : ""}">
      <span>${label}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: "",
    iconSize: [60, 30],
    iconAnchor: [30, 30],
    popupAnchor: [0, -30],
  });
};

function MapEffects({ points, visible, fallbackCenter }) {
  const map = useMap();

  useEffect(() => {
    if (!visible) return undefined;
    const t = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 13, { animate: false });
      } else if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds.pad(0.18), { animate: false, maxZoom: 14 });
      } else if (fallbackCenter) {
        map.setView(fallbackCenter, 11, { animate: false });
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [map, visible, points, fallbackCenter]);

  return null;
}

/**
 * Results map - pins from live LiteAPI hotel latitude/longitude.
 */
export function HotelMap({
  hotels,
  visible = true,
  center,
  activeHotelId = null,
  onViewDeal,
}) {
  const { currency, symbol } = useCurrency();
  const list = Array.isArray(hotels) ? hotels : [];

  const pinned = useMemo(() => {
    return list
      .map((hotel) => {
        const coords = hotelCoords(hotel);
        if (!coords) return null;
        return { hotel, ...coords };
      })
      .filter(Boolean);
  }, [list]);

  const fallbackCenter = useMemo(() => {
    if (center && Number.isFinite(Number(center[0])) && Number.isFinite(Number(center[1]))) {
      return [Number(center[0]), Number(center[1])];
    }
    if (pinned.length) return [pinned[0].lat, pinned[0].lng];
    return [20.5937, 78.9629]; // India fallback - never Bangalore-hardcode when we have pins
  }, [center, pinned]);

  const mapKey = `${visible ? "on" : "off"}-${pinned.length}-${fallbackCenter[0].toFixed(3)}`;

  if (!visible) {
    return <div className={styles.mapContainer} aria-hidden />;
  }

  return (
    <div className={styles.mapContainer}>
      {pinned.length === 0 ? (
        <div className={styles.mapEmpty}>
          Map pins need coordinates from this search. Try another search - some properties omit lat/lng.
        </div>
      ) : (
        <MapContainer
          key={mapKey}
          center={fallbackCenter}
          zoom={11}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEffects
            points={pinned}
            visible={visible}
            fallbackCenter={fallbackCenter}
          />
          {pinned.map(({ hotel, lat, lng }) => (
            <Marker
              key={hotel.id}
              position={[lat, lng]}
              icon={createPriceIcon(
                hotel.pricePerNight,
                String(activeHotelId) === String(hotel.id),
                currency
              )}
            >
              <Popup className={styles.customPopup}>
                <div className={styles.popupCard}>
                  {hotel.image ? (
                    <div className={styles.popupImageContainer}>
                      <img
                        src={hotel.image}
                        alt=""
                        className={styles.popupImage}
                      />
                    </div>
                  ) : null}
                  <div className={styles.popupDetails}>
                    <h4 className={styles.popupName}>{hotel.name}</h4>
                    <div className={styles.popupRating}>
                      {hotel.rating != null && hotel.rating !== "" ? (
                        <span className={styles.ratingText}>
                          {hotel.rating}
                          {hotel.ratingText ? ` · ${hotel.ratingText}` : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.popupFooter}>
                      <div className={styles.popupPrice}>
                        <span className={styles.currency}>{symbol}</span>{" "}
                        {hotel.pricePerNight != null
                          ? Number(hotel.pricePerNight).toLocaleString()
                          : "-"}
                      </div>
                      {typeof onViewDeal === "function" ? (
                        <button
                          className={styles.viewDealBtn}
                          type="button"
                          onClick={() => onViewDeal(hotel)}
                        >
                          View Deal
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}

export default HotelMap;
