import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Calendar as CalendarIcon, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import CustomDatePicker from '@/components/ui/DatePicker/CustomDatePicker';
import { hotelService } from '../services/hotelService';
import styles from '../HotelDetailPage.module.css';

const CustomDateInput = React.forwardRef(({ value, onClick, isOpen }, ref) => (
  <div 
    className={`${styles.HotelBookingCard_inputBox} ${isOpen ? 'ring-2 ring-[#F97211]/30 border-[#F97211]' : ''}`} 
    onClick={onClick} 
    ref={ref}
    style={{ cursor: 'pointer' }}
  >
    <span className={styles.HotelBookingCard_dateText}>{value || 'Select Date'}</span>
    <CalendarIcon size={14} className={isOpen ? 'text-[#F97211]' : styles.HotelBookingCard_calendarIcon} />
  </div>
));

function toYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function HotelBookingCard() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const [checkIn, setCheckIn] = useState(() => {
    const v = searchParams.get('checkIn');
    return v ? new Date(v + 'T12:00:00') : new Date();
  });
  const [checkOut, setCheckOut] = useState(() => {
    const v = searchParams.get('checkOut');
    return v ? new Date(v + 'T12:00:00') : new Date(Date.now() + 86400000 * 3);
  });
  
  const [rooms, setRooms] = useState(Number(searchParams.get('rooms') || 1));
  const [adults, setAdults] = useState(Number(searchParams.get('guests') || 2));
  const [children, setChildren] = useState(0);
  const [showGuests, setShowGuests] = useState(false);
  const [minNight, setMinNight] = useState(null);
  const [total, setTotal] = useState(null);
  const [loadingPrice, setLoadingPrice] = useState(false);

  const guestsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (guestsRef.current && !guestsRef.current.contains(event.target)) {
        setShowGuests(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setLoadingPrice(true);
      const res = await hotelService.getRates(id, {
        check_in: toYmd(checkIn),
        check_out: toYmd(checkOut),
        guests: adults + children,
        rooms,
        currency: 'INR',
      });
      if (cancelled) return;
      const first = (res.rooms || [])[0];
      if (first) {
        setMinNight(first.pricePerNight || first.price || null);
        setTotal(first.totalPrice || null);
      } else {
        setMinNight(null);
        setTotal(null);
      }
      setLoadingPrice(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, checkIn, checkOut, adults, children, rooms]);

  const handleBookRoom = () => {
    const qs = new URLSearchParams({
      checkIn: toYmd(checkIn),
      checkOut: toYmd(checkOut),
      guests: String(adults + children),
      rooms: String(rooms),
    });
    navigate(`/hotel/${id}/booking?${qs.toString()}`);
  };

  const updateGuest = (type, op) => {
    if (type === 'rooms') {
      setRooms(prev => op === 'add' ? prev + 1 : Math.max(1, prev - 1));
    }
    if (type === 'adults') {
      setAdults(prev => op === 'add' ? prev + 1 : Math.max(1, prev - 1));
    }
    if (type === 'children') {
      setChildren(prev => op === 'add' ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  return (
    <div className={styles.HotelBookingCard_card}>
      <div className={styles.HotelBookingCard_bestPrice}>
        <ShieldCheck size={18} className={styles.HotelBookingCard_shieldIcon} />
        <span className={styles.HotelBookingCard_bestPriceText}>Live LiteAPI rates</span>
      </div>

      <div className={styles.HotelBookingCard_dateInputs}>
        <div className="flex-1">
          <label className={styles.HotelBookingCard_label}>Check In</label>
          <CustomDatePicker
            selected={checkIn}
            onChange={(date) => {
              setCheckIn(date);
              if (date >= checkOut) {
                setCheckOut(new Date(date.getTime() + 86400000));
              }
            }}
            minDate={new Date()}
            customInput={<CustomDateInput />}
            wrapperClassName="relative w-full"
          />
        </div>

        <div className="flex-1">
          <label className={styles.HotelBookingCard_label}>Check Out</label>
          <CustomDatePicker
            selected={checkOut}
            onChange={(date) => setCheckOut(date)}
            minDate={new Date(checkIn.getTime() + 86400000)}
            customInput={<CustomDateInput />}
            wrapperClassName="relative w-full"
          />
        </div>
      </div>

      <div className="relative" ref={guestsRef}>
        <label className={styles.HotelBookingCard_label}>Guests & Rooms</label>
        <div 
          className={`${styles.HotelBookingCard_inputBox} ${showGuests ? 'ring-2 ring-[#F97211]/30 border-[#F97211]' : ''}`}
          onClick={() => setShowGuests(!showGuests)}
        >
          <span className={styles.HotelBookingCard_guestsText}>{adults + children} Guests, {rooms} Room</span>
          {showGuests ? <ChevronUp size={14} className={styles.HotelBookingCard_chevronIcon} /> : <ChevronDown size={14} className={styles.HotelBookingCard_chevronIcon} />}
        </div>

        {showGuests && (
          <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-[16px] shadow-[0_15px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-50 flex flex-col gap-4">
            {[
              ['rooms', 'Rooms', rooms, 1],
              ['adults', 'Adults', adults, 1],
              ['children', 'Children', children, 0],
            ].map(([key, label, val, min]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="font-bold text-[#001439]">{label}</div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => updateGuest(key, 'sub')} disabled={val <= min} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] disabled:opacity-30 hover:bg-gray-50"><Minus size={14} /></button>
                  <span className="font-bold w-4 text-center">{val}</span>
                  <button type="button" onClick={() => updateGuest(key, 'add')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] hover:bg-gray-50"><Plus size={14} /></button>
                </div>
              </div>
            ))}
            <button 
              type="button"
              onClick={() => setShowGuests(false)}
              className="mt-2 w-full py-2 bg-[#001439] text-white rounded-lg font-bold hover:bg-[#000d26] transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div className={styles.HotelBookingCard_priceSection}>
        <div className={styles.HotelBookingCard_priceRow}>
          <span className={styles.HotelBookingCard_price}>
            {loadingPrice ? '…' : minNight != null ? `₹${Number(minNight).toLocaleString()}` : '—'}
          </span>
          <span className={styles.HotelBookingCard_perNight}>per night from</span>
        </div>
        <div className={styles.HotelBookingCard_totalPrice}>
          {total != null ? `₹${Number(total).toLocaleString()} total` : 'Select dates for live total'}
          <br />
          Includes taxes & Fees
        </div>
      </div>

      <button className={styles.HotelBookingCard_bookBtn} type="button" onClick={handleBookRoom}>
        See live rooms
      </button>
      
      <div className={styles.HotelBookingCard_freeCancellation}>
        Prices from LiteAPI — never invented
      </div>
    </div>
  );
}
