import React, { useState } from 'react';
import { Wifi, Waves, Sparkles, Dumbbell, Utensils, Car, Pill, ConciergeBell, Briefcase, Tv, Coffee, Wind, Shield, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import styles from '../HotelDetailPage.module.css';

const ICON_MAP = [
  { re: /wifi|internet|wlan/i, icon: Wifi },
  { re: /pool|swim/i, icon: Waves },
  { re: /spa|wellness|sauna/i, icon: Sparkles },
  { re: /fitness|gym|workout/i, icon: Dumbbell },
  { re: /restaurant|dining|breakfast|meal|food/i, icon: Utensils },
  { re: /airport|shuttle|transfer|parking|car/i, icon: Car },
  { re: /pharmacy|doctor|medical/i, icon: Pill },
  { re: /room service|concierge|housekeeping/i, icon: ConciergeBell },
  { re: /business|meeting|conference/i, icon: Briefcase },
  { re: /tv|television/i, icon: Tv },
  { re: /coffee|tea|kettle/i, icon: Coffee },
  { re: /air.?cond|ac\b|climate/i, icon: Wind },
  { re: /safe|security|front desk|24/i, icon: Shield },
];

function iconFor(label) {
  for (const row of ICON_MAP) {
    if (row.re.test(label)) return row.icon;
  }
  return Check;
}

/**
 * Live LiteAPI hotelFacilities - never invent amenities.
 */
export default function HotelAmenitiesGrid({ facilities = [] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const items = (Array.isArray(facilities) ? facilities : [])
    .map((f) => String(f || '').trim())
    .filter(Boolean);

  if (!items.length) {
    return (
      <div className={styles.HotelAmenitiesGrid_container}>
        <h2 className={styles.HotelAmenitiesGrid_sectionTitle}>Amenities</h2>
        <p style={{ color: '#667085', fontSize: 14, margin: 0 }}>
          Facility list isn’t in the live feed for this property yet.
        </p>
      </div>
    );
  }

  const visible = items.slice(0, 10);

  return (
    <>
      <div className={styles.HotelAmenitiesGrid_container}>
        <div className={styles.HotelAmenitiesGrid_titleRow}>
          <h2 className={styles.HotelAmenitiesGrid_sectionTitle}>Amenities</h2>
          {items.length > 10 && (
            <button
              type="button"
              className={styles.HotelAmenitiesGrid_viewAllBtn}
              onClick={() => setIsModalOpen(true)}
            >
              View All ({items.length})
            </button>
          )}
        </div>
        <div className={styles.HotelAmenitiesGrid_grid}>
          {visible.map((label, index) => {
            const Icon = iconFor(label);
            return (
              <div key={`${label}-${index}`} className={styles.HotelAmenitiesGrid_amenityCard}>
                <div className={styles.HotelAmenitiesGrid_iconCircle}>
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <span className={styles.HotelAmenitiesGrid_label}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="All Hotel Amenities"
      >
        <div className="flex flex-col gap-3 p-6 max-h-[70vh] overflow-y-auto">
          {items.map((label, idx) => {
            const Icon = iconFor(label);
            return (
              <div key={`${label}-${idx}`} className="flex items-center gap-3 text-gray-700">
                <div className="w-10 h-10 rounded-full bg-[#F97211]/10 text-[#F97211] flex items-center justify-center shrink-0">
                  <Icon size={20} strokeWidth={1.5} />
                </div>
                <span className="font-medium text-sm">{label}</span>
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
