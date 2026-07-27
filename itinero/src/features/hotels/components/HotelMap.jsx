import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './HotelMap.module.css';

// Fix Leaflet's default icon path issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom price marker icon function
const createPriceIcon = (price, isActive) => {
  const html = `
    <div class="${styles.priceMarker} ${isActive ? styles.priceMarkerActive : ''}">
      <span>₹${price.toLocaleString('en-IN')}</span>
    </div>
  `;
  return L.divIcon({
    html,
    className: '', // Clear default Leaflet classes
    iconSize: [60, 30],
    iconAnchor: [30, 30], // Anchor at bottom center
    popupAnchor: [0, -30],
  });
};

export const HotelMap = ({ hotels }) => {
  // Center map on Bengaluru
  const center = [12.9716, 77.5946];

  return (
    <div className={styles.mapContainer}>
      <MapContainer center={center} zoom={11} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {hotels.map((hotel) => (
          <Marker 
            key={hotel.id} 
            position={[hotel.lat, hotel.lng]}
            icon={createPriceIcon(hotel.pricePerNight, false)}
          >
            <Popup className={styles.customPopup}>
              <div className={styles.popupCard}>
                <div className={styles.popupImageContainer}>
                  <img src={hotel.image} alt={hotel.name} className={styles.popupImage} />
                  <button className={styles.popupFavoriteBtn}>
                    <svg width="20" height="18" viewBox="0 0 20 18" fill="none" stroke="white" strokeWidth="2"><path d="M10 18l-1.45-1.32C3.4 11.93 0 8.84 0 5.5 0 2.42 2.42 0 5.5 0 7.24 0 8.91.81 10 2.09 11.09.81 12.76 0 14.5 0 17.58 0 20 2.42 20 5.5c0 3.34-3.4 6.43-8.55 11.18L10 18z"/></svg>
                  </button>
                  <div className={styles.popupPagination}>
                    <span></span><span></span><span></span><span></span>
                  </div>
                </div>
                <div className={styles.popupDetails}>
                  <h4 className={styles.popupName}>{hotel.name}</h4>
                  <div className={styles.popupRating}>
                    <div className={styles.stars}>★★★★★</div>
                    <span className={styles.ratingText}>{hotel.rating} {hotel.ratingText}</span>
                  </div>
                  <div className={styles.popupFooter}>
                    <div className={styles.popupPrice}>
                      <span className={styles.currency}>₹</span> {hotel.pricePerNight.toLocaleString('en-IN')}
                    </div>
                    <button className={styles.viewDealBtn}>View Deal</button>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
