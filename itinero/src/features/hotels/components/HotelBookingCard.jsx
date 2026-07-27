import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShieldCheck, Calendar as CalendarIcon, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import CustomDatePicker from '@/components/ui/DatePicker/CustomDatePicker';
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

export default function HotelBookingCard() {
  const navigate = useNavigate();
  const { id } = useParams();

  // State
  const [checkIn, setCheckIn] = useState(new Date());
  const [checkOut, setCheckOut] = useState(new Date(Date.now() + 86400000 * 3)); // 3 days from now
  
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [showGuests, setShowGuests] = useState(false);

  // Refs for click outside
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

  const handleBookRoom = () => {
    navigate(`/hotel/${id || '123'}/booking`);
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
        <span className={styles.HotelBookingCard_bestPriceText}>Best Price Guaranteed</span>
      </div>

      <div className={styles.HotelBookingCard_dateInputs}>
        {/* Check In */}
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

      {/* Guests Dropdown */}
      <div className="relative" ref={guestsRef}>
        <label className={styles.HotelBookingCard_label}>Guests & Rooms</label>
        <div 
          className={`${styles.HotelBookingCard_inputBox} ${showGuests ? 'ring-2 ring-[#F97211]/30 border-[#F97211]' : ''}`}
          onClick={() => setShowGuests(!showGuests)}
        >
          <span className={styles.HotelBookingCard_guestsText}>{adults + children} Guests, {rooms} Room</span>
          {showGuests ? <ChevronUp size={14} className={styles.HotelBookingCard_chevronIcon} /> : <ChevronDown size={14} className={styles.HotelBookingCard_chevronIcon} />}
        </div>

        {/* Guests Popover */}
        {showGuests && (
          <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-[16px] shadow-[0_15px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-5 z-50 flex flex-col gap-4">
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[#001439]">Rooms</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => updateGuest('rooms', 'sub')} disabled={rooms <= 1} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] disabled:opacity-30 hover:bg-gray-50"><Minus size={14} /></button>
                <span className="font-bold w-4 text-center">{rooms}</span>
                <button onClick={() => updateGuest('rooms', 'add')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] hover:bg-gray-50"><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[#001439]">Adults</div>
                <div className="text-xs text-gray-500">Ages 13 or above</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => updateGuest('adults', 'sub')} disabled={adults <= 1} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] disabled:opacity-30 hover:bg-gray-50"><Minus size={14} /></button>
                <span className="font-bold w-4 text-center">{adults}</span>
                <button onClick={() => updateGuest('adults', 'add')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] hover:bg-gray-50"><Plus size={14} /></button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-[#001439]">Children</div>
                <div className="text-xs text-gray-500">Ages 0 - 12</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => updateGuest('children', 'sub')} disabled={children <= 0} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] disabled:opacity-30 hover:bg-gray-50"><Minus size={14} /></button>
                <span className="font-bold w-4 text-center">{children}</span>
                <button onClick={() => updateGuest('children', 'add')} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#001439] hover:bg-gray-50"><Plus size={14} /></button>
              </div>
            </div>
            
            <button 
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
          <span className={styles.HotelBookingCard_price}>$265</span>
          <span className={styles.HotelBookingCard_perNight}>per night</span>
        </div>
        <div className={styles.HotelBookingCard_totalPrice}>
          $797 total<br/>
          Includes taxes & Fees
        </div>
      </div>

      <button className={styles.HotelBookingCard_bookBtn} onClick={handleBookRoom}>Book Room</button>
      
      <div className={styles.HotelBookingCard_freeCancellation}>
        Free cancellation
      </div>
    </div>
  );
}
