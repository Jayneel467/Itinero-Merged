import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import styles from "../HotelDetailPage.module.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function InvalidateOnce({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
      map.setView([lat, lng], 15, { animate: false });
    }, 60);
    return () => window.clearTimeout(t);
  }, [map, lat, lng]);
  return null;
}

/**
 * Hotel detail map - live LiteAPI lat/lng via Leaflet (OSM tiles).
 * Replaces broken openstreetmap.org/export/embed iframes.
 */
export default function HotelLocationMap({ latitude, longitude, address, name }) {
  const lat = latitude != null ? Number(latitude) : null;
  const lng = longitude != null ? Number(longitude) : null;
  const hasCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;

  const label = [name, address].filter(Boolean).join(" - ") || "Hotel location";

  const osmLink = useMemo(() => {
    if (hasCoords) {
      return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
    }
    if (address) {
      return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`;
    }
    return null;
  }, [hasCoords, lat, lng, address]);

  return (
    <div className={styles.HotelLocationMap_mapContainer}>
      {hasCoords ? (
        <MapContainer
          key={`${lat},${lng}`}
          center={[lat, lng]}
          zoom={15}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <InvalidateOnce lat={lat} lng={lng} />
          <Marker position={[lat, lng]} />
        </MapContainer>
      ) : (
        <div
          className={styles.HotelLocationMap_mapImage}
          style={{
            background: "#eef2f6",
            display: "grid",
            placeItems: "center",
            color: "#667085",
            fontSize: 13,
            padding: 16,
            textAlign: "center",
            minHeight: 180,
            opacity: 1,
            filter: "none",
          }}
        >
          {address || "Map coordinates not in the live feed for this property."}
        </div>
      )}

      {osmLink ? (
        <div className={styles.HotelLocationMap_overlay} style={{ pointerEvents: "none" }}>
          <a
            className={styles.HotelLocationMap_viewMapBtn}
            href={osmLink}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${label} on map`}
            style={{ pointerEvents: "auto", marginTop: "auto", marginBottom: 12 }}
          >
            <MapPin size={14} className={styles.HotelLocationMap_btnIcon} />
            View on Map
          </a>
        </div>
      ) : null}
    </div>
  );
}
