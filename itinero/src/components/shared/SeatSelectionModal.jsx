import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './SeatSelectionModal.module.css';

export default function SeatSelectionModal({ isOpen, onClose, onConfirm, initialSeat }) {
  const [selectedSeat, setSelectedSeat] = useState(initialSeat || '14A');

  // Realistic Flight Layout Configuration (Airbus A320 style)
  const flightLayout = [
    { type: 'section', label: 'Business Class' },
    { type: 'row', id: 1, config: ['A', 'C', 'D', 'F'], class: 'business' },
    { type: 'row', id: 2, config: ['A', 'C', 'D', 'F'], class: 'business' },
    { type: 'row', id: 3, config: ['A', 'C', 'D', 'F'], class: 'business' },
    { type: 'divider', label: 'Galley & Lavatory' },
    { type: 'row', id: 4, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'premium' },
    { type: 'row', id: 5, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'premium' },
    { type: 'row', id: 6, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 7, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 8, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 9, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 10, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'divider', label: 'Emergency Exit' },
    { type: 'row', id: 11, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'premium' },
    { type: 'row', id: 12, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'premium' },
    { type: 'row', id: 14, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 15, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
    { type: 'row', id: 16, config: ['A', 'B', 'C', 'D', 'E', 'F'], class: 'standard' },
  ];

  // Generate seat status randomly, but keep selected seat available
  const [seatData] = useState(() => {
    const data = {};
    flightLayout.forEach(item => {
      if (item.type === 'row') {
        data[item.id] = {};
        item.config.forEach(col => {
          const isInitial = `${item.id}${col}` === initialSeat;
          data[item.id][col] = isInitial ? item.class : (Math.random() > 0.7 ? 'occupied' : item.class);
        });
      }
    });
    return data;
  });

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSeatClick = (seatId, status) => {
    if (status !== 'occupied') {
      setSelectedSeat(seatId);
    }
  };

  const getSeatType = (seatCode) => {
    if (!seatCode) return '';
    const col = seatCode.slice(-1);
    if (col === 'A' || col === 'F') return 'Window';
    if (col === 'C' || col === 'D') return 'Aisle';
    return 'Middle';
  };

  const getSeatPrice = (seatId) => {
    if (!seatId) return 0;
    const rowId = parseInt(seatId.match(/\d+/)[0]);
    const rowItem = flightLayout.find(r => r.type === 'row' && r.id === rowId);
    if (!rowItem) return 0;
    if (rowItem.class === 'business') return 2500;
    if (rowItem.class === 'premium') return 850;
    return 250; // Standard
  };

  const selectedPrice = selectedSeat ? getSeatPrice(selectedSeat) : 0;
  const selectedType = getSeatType(selectedSeat);

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        
        {/* Left Side: Interactive Airplane Map (Mobile Responsive) */}
        <div className={styles.airplaneSection}>
          <div className={styles.fuselageContainer}>
            <div className={styles.cockpit}>
              <div className={styles.cockpitWindow}></div>
            </div>
            
            <div className={styles.fuselage}>
              <div className={styles.wingLeft}></div>
              <div className={styles.wingRight}></div>

              {flightLayout.map((item, index) => {
                if (item.type === 'section' || item.type === 'divider') {
                  return (
                    <div key={index} className={styles.divider}>
                      <span>{item.label}</span>
                    </div>
                  );
                }

                if (item.type === 'row') {
                  const mid = Math.ceil(item.config.length / 2);
                  const leftGroup = item.config.slice(0, mid);
                  const rightGroup = item.config.slice(mid);

                  return (
                    <div key={item.id} className={styles.seatRow}>
                      {/* Left Group */}
                      <div className={styles.seatGroup}>
                        {leftGroup.map(col => {
                          const seatId = `${item.id}${col}`;
                          const status = seatData[item.id]?.[col] || 'occupied';
                          const isSelected = selectedSeat === seatId;
                          
                          return (
                            <div key={seatId} className={styles.seatWrapper}>
                              <div 
                                className={`${styles.seat} ${styles[item.class]} ${styles[status]} ${isSelected ? styles.selected : ''}`}
                                onClick={() => handleSeatClick(seatId, status)}
                              >
                                {status === 'occupied' && <span className={styles.cross}>×</span>}
                              </div>
                              {status !== 'occupied' && (
                                <div className={styles.tooltip}>
                                  {seatId} {getSeatType(seatId)} 
                                  <span className={styles.ttPrice}>+ ₹{getSeatPrice(seatId)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Aisle */}
                      <div className={styles.rowNumber}>{item.id}</div>
                      
                      {/* Right Group */}
                      <div className={styles.seatGroup}>
                        {rightGroup.map(col => {
                          const seatId = `${item.id}${col}`;
                          const status = seatData[item.id]?.[col] || 'occupied';
                          const isSelected = selectedSeat === seatId;
                          
                          return (
                            <div key={seatId} className={styles.seatWrapper}>
                              <div 
                                className={`${styles.seat} ${styles[item.class]} ${styles[status]} ${isSelected ? styles.selected : ''}`}
                                onClick={() => handleSeatClick(seatId, status)}
                              >
                                {status === 'occupied' && <span className={styles.cross}>×</span>}
                              </div>
                              {status !== 'occupied' && (
                                <div className={styles.tooltip}>
                                  {seatId} {getSeatType(seatId)} 
                                  <span className={styles.ttPrice}>+ ₹{getSeatPrice(seatId)}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Selection Summary */}
        <div className={styles.summarySection}>
          <div className={styles.summaryHeader}>
            <div className={styles.title}>Seat Selection</div>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.boxAvailable}`}></div> Standard
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.boxPremium}`}></div> Premium
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.boxBusiness}`}></div> Business
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.boxSelected}`}></div> Selected
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendBox} ${styles.boxOccupied}`}></div> Occupied
            </div>
          </div>

          <div className={styles.selectedSeatCard}>
            {selectedSeat ? (
              <>
                <div className={styles.sscHeader}>Selected Seat</div>
                <div className={styles.sscSeatNo}>{selectedSeat}</div>
                <div className={styles.sscType}>{selectedType}</div>
                <div className={styles.sscPrice}>₹{selectedPrice}</div>
              </>
            ) : (
              <div className={styles.sscEmpty}>No seat selected</div>
            )}
          </div>

          <div className={styles.footer}>
            <button 
              className={styles.confirmBtn}
              disabled={!selectedSeat}
              onClick={() => onConfirm(selectedSeat, selectedPrice, selectedType)}
            >
              Confirm Selection
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
