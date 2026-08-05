import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { PageLayout } from "@/components/layout";
import BookingStepper from './components/BookingStepper';
import HotelRoomCard from './components/HotelRoomCard';
import HotelBookingSummary from './components/HotelBookingSummary';
import { Modal } from '@/components/ui/Modal';
import CustomDatePicker from '@/components/ui/DatePicker/CustomDatePicker';
import { Calendar as CalendarIcon } from 'lucide-react';
import { hotelService } from './services/hotelService';
import styles from './HotelBookingPage.module.css';

const CustomModalDateInput = React.forwardRef(({ value, onClick, isOpen }, ref) => (
  <div 
    className={`w-full border rounded-lg p-3 transition-colors flex items-center justify-between ${isOpen ? 'border-[#F97211] ring-2 ring-[#F97211]/20' : 'border-gray-200 hover:border-gray-300'}`}
    onClick={onClick} 
    ref={ref}
    style={{ cursor: 'pointer' }}
  >
    <span className="text-[#001439] font-medium text-sm">{value || 'Select Date'}</span>
    <CalendarIcon size={16} className={isOpen ? 'text-[#F97211]' : 'text-gray-400'} />
  </div>
));

function toDate(v, fallbackDays = 0) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.slice(0, 10) + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + fallbackDays * 86400000);
}

function toYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function HotelBookingPage() {
  const [currentStep] = useState(1);
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const base = import.meta.env.BASE_URL;

  const initialHotel = location.state?.hotel || null;

  const [checkIn, setCheckIn] = useState(() => toDate(searchParams.get('checkIn') || location.state?.checkIn, 0));
  const [checkOut, setCheckOut] = useState(() => toDate(searchParams.get('checkOut') || location.state?.checkOut, 3));
  const [roomsCount, setRoomsCount] = useState(() => Number(searchParams.get('rooms') || location.state?.rooms || 1));
  const [adults, setAdults] = useState(() => Number(searchParams.get('guests') || location.state?.guests || 2));
  const [children, setChildren] = useState(0);

  const [rooms, setRooms] = useState([]);
  const [hotelMeta, setHotelMeta] = useState(initialHotel);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configuringRoomId, setConfiguringRoomId] = useState(null);
  const [modalCheckIn, setModalCheckIn] = useState(checkIn);
  const [modalCheckOut, setModalCheckOut] = useState(checkOut);
  const [modalRooms, setModalRooms] = useState(roomsCount);
  const [modalAdults, setModalAdults] = useState(adults);
  const [modalChildren, setModalChildren] = useState(children);

  const loadRates = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    const res = await hotelService.getRates(id, {
      check_in: toYmd(checkIn),
      check_out: toYmd(checkOut),
      guests: adults + children,
      rooms: roomsCount,
      currency: 'INR',
    });
    const list = Array.isArray(res.rooms) ? res.rooms : [];
    const withImages = list.map((r) => ({
      ...r,
      image: r.image || `${base}hotel_room.png`,
      taxes: Number(r.taxes) || 0,
      price: Number(r.price) || 0,
    }));
    setRooms(withImages);
    if (res.hotel) setHotelMeta((prev) => ({ ...prev, ...res.hotel }));
    if (withImages.length) {
      setSelectedRoomId(withImages[0].id);
    } else {
      setSelectedRoomId(null);
      setError(res.message || 'No live room rates for these dates.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, toYmd(checkIn), toYmd(checkOut), adults, children, roomsCount]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || rooms[0],
    [rooms, selectedRoomId]
  );
  const configuringRoom = rooms.find((r) => r.id === configuringRoomId) || selectedRoom;

  const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));

  const summaryData = selectedRoom
    ? {
        hotelName: hotelMeta?.name || 'Hotel',
        hotelImage: selectedRoom.image || hotelMeta?.image || `${base}hotel_room.png`,
        location: hotelMeta?.location || '',
        checkIn: {
          date: checkIn.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          day: checkIn.toLocaleDateString('en-US', { weekday: 'short' }),
        },
        checkOut: {
          date: checkOut.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          day: checkOut.toLocaleDateString('en-US', { weekday: 'short' }),
        },
        guests: adults + children,
        rooms: roomsCount,
        nights,
        roomsTotal: (selectedRoom.price || 0) * nights * roomsCount,
        taxesTotal: (selectedRoom.taxes || 0) * roomsCount,
        totalPrice:
          selectedRoom.totalPrice != null
            ? Number(selectedRoom.totalPrice) * roomsCount
            : (selectedRoom.price || 0) * nights * roomsCount + (selectedRoom.taxes || 0) * roomsCount,
      }
    : {
        hotelName: hotelMeta?.name || 'Hotel',
        hotelImage: hotelMeta?.image || `${base}hotel_room.png`,
        location: hotelMeta?.location || '',
        checkIn: { date: '', day: '' },
        checkOut: { date: '', day: '' },
        guests: adults + children,
        rooms: roomsCount,
        nights,
        roomsTotal: 0,
        taxesTotal: 0,
        totalPrice: 0,
      };

  const handleSelectRoom = (roomId) => {
    setConfiguringRoomId(roomId);
    setModalCheckIn(checkIn);
    setModalCheckOut(checkOut);
    setModalRooms(roomsCount);
    setModalAdults(adults);
    setModalChildren(children);
    setIsConfigOpen(true);
  };

  const handleConfirmConfig = () => {
    setSelectedRoomId(configuringRoomId);
    setCheckIn(modalCheckIn);
    setCheckOut(modalCheckOut);
    setRoomsCount(modalRooms);
    setAdults(modalAdults);
    setChildren(modalChildren);
    setSearchParams({
      checkIn: toYmd(modalCheckIn),
      checkOut: toYmd(modalCheckOut),
      guests: String(modalAdults + modalChildren),
      rooms: String(modalRooms),
    });
    setIsConfigOpen(false);
  };

  const handleContinue = () => {
    if (!selectedRoom) return;
    navigate(`/hotel/${id}/guest-details`, {
      state: {
        hotel: hotelMeta,
        room: selectedRoom,
        checkIn: toYmd(checkIn),
        checkOut: toYmd(checkOut),
        guests: adults + children,
        rooms: roomsCount,
        offerId: selectedRoom.offerId,
      },
    });
  };

  const formatModalDate = (date) =>
    date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={currentStep} />
        </div>

        <div className={styles.mainLayout}>
          <div className={styles.roomsList}>
            {loading && (
              <p style={{ padding: 24, color: '#6b635c' }}>Loading live LiteAPI room rates…</p>
            )}
            {!loading && error && (
              <p style={{ padding: 24, color: '#b45309' }}>{error}</p>
            )}
            {!loading &&
              rooms.map((room) => (
                <HotelRoomCard
                  key={room.id}
                  room={room}
                  onSelect={() => handleSelectRoom(room.id)}
                  isSelected={room.id === selectedRoomId}
                />
              ))}
          </div>

          <div className={styles.sidebar}>
            <HotelBookingSummary
              bookingInfo={summaryData}
              onButtonClick={handleContinue}
              buttonText={selectedRoom ? 'Continue' : 'Select a room'}
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title={`Configure Booking: ${configuringRoom?.title || 'Room'}`}
      >
        <div className="p-6 bg-white flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative z-50">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Check In</label>
              <CustomDatePicker
                selected={modalCheckIn}
                onChange={(date) => {
                  setModalCheckIn(date);
                  if (date >= modalCheckOut) {
                    setModalCheckOut(new Date(date.getTime() + 86400000));
                  }
                }}
                minDate={new Date()}
                customInput={<CustomModalDateInput />}
                wrapperClassName="relative w-full"
              />
            </div>
            <div className="relative z-40">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Check Out</label>
              <CustomDatePicker
                selected={modalCheckOut}
                onChange={(date) => setModalCheckOut(date)}
                minDate={new Date(modalCheckIn.getTime() + 86400000)}
                customInput={<CustomModalDateInput />}
                wrapperClassName="relative w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm">
              Rooms
              <input
                type="number"
                min={1}
                className="mt-1 w-full border rounded-lg p-2"
                value={modalRooms}
                onChange={(e) => setModalRooms(Number(e.target.value) || 1)}
              />
            </label>
            <label className="text-sm">
              Adults
              <input
                type="number"
                min={1}
                className="mt-1 w-full border rounded-lg p-2"
                value={modalAdults}
                onChange={(e) => setModalAdults(Number(e.target.value) || 1)}
              />
            </label>
            <label className="text-sm">
              Children
              <input
                type="number"
                min={0}
                className="mt-1 w-full border rounded-lg p-2"
                value={modalChildren}
                onChange={(e) => setModalChildren(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <p className="text-sm text-gray-500">
            Preview: {formatModalDate(modalCheckIn)} → {formatModalDate(modalCheckOut)}. Confirming
            reloads live rates from LiteAPI.
          </p>

          <button
            type="button"
            className="w-full bg-[#F97211] text-white font-semibold rounded-xl py-3"
            onClick={handleConfirmConfig}
          >
            Apply & reload live rates
          </button>
        </div>
      </Modal>
    </PageLayout>
  );
}
