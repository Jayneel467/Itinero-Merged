import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageLayout } from "@/components/layout";
import BookingStepper from './components/BookingStepper';
import HotelRoomCard from './components/HotelRoomCard';
import HotelBookingSummary from './components/HotelBookingSummary';
import { Modal } from '@/components/ui/Modal';
import CustomDatePicker from '@/components/ui/DatePicker/CustomDatePicker';
import { Calendar as CalendarIcon } from 'lucide-react';
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

export default function HotelBookingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Dummy data based on the design
  const base = import.meta.env.BASE_URL;
  
  const rooms = [
    {
      id: 1,
      title: 'Deluxe Room',
      image: `${base}hotel_room.png`,
      bedType: 'King Bed',
      capacity: 2,
      size: '220sq ft',
      view: 'City View',
      floor: 'High Floor',
      freeCancellation: true,
      freeBreakfast: true,
      payAtHotel: true,
      roomsLeft: 2,
      price: 2599,
      taxes: 4679
    },
    {
      id: 2,
      title: 'Executive Room',
      image: `${base}hotel_room.png`,
      bedType: 'King Bed',
      capacity: 2,
      size: '220sq ft',
      view: 'Sea View',
      floor: 'Balcony',
      freeCancellation: true,
      freeBreakfast: true,
      payAtHotel: true,
      roomsLeft: null,
      price: 2999,
      taxes: 4679
    },
    {
      id: 3,
      title: 'Family Suite',
      image: `${base}hotel_room.png`,
      bedType: 'King Bed',
      capacity: 2,
      size: '220sq ft',
      view: 'Ocean View',
      floor: 'High Floor',
      freeCancellation: true,
      freeBreakfast: true,
      payAtHotel: true,
      roomsLeft: null,
      price: 4599,
      taxes: 4679
    }
  ];

  const [selectedRoomId, setSelectedRoomId] = useState(1); // Default to first room
  const [checkIn, setCheckIn] = useState(new Date());
  const [checkOut, setCheckOut] = useState(new Date(Date.now() + 86400000 * 3)); // default 3 nights
  const [roomsCount, setRoomsCount] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  // Modal open state
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configuringRoomId, setConfiguringRoomId] = useState(null);

  // Modal temporary state
  const [modalCheckIn, setModalCheckIn] = useState(new Date());
  const [modalCheckOut, setModalCheckOut] = useState(new Date(Date.now() + 86400000 * 3));
  const [modalRooms, setModalRooms] = useState(1);
  const [modalAdults, setModalAdults] = useState(2);
  const [modalChildren, setModalChildren] = useState(0);

  const selectedRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0];
  const configuringRoom = rooms.find(r => r.id === configuringRoomId) || rooms[0];

  const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));

  const summaryData = {
    hotelName: 'Atlantis The Palm',
    hotelImage: selectedRoom.image,
    location: 'Palm Jumeirah, Dubai, UAE',
    checkIn: { 
      date: checkIn.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 
      day: checkIn.toLocaleDateString('en-US', { weekday: 'short' }) 
    },
    checkOut: { 
      date: checkOut.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), 
      day: checkOut.toLocaleDateString('en-US', { weekday: 'short' }) 
    },
    guests: adults + children,
    rooms: roomsCount,
    nights: nights,
    roomsTotal: selectedRoom.price * nights * roomsCount,
    taxesTotal: selectedRoom.taxes * roomsCount,
    totalPrice: (selectedRoom.price * nights * roomsCount) + (selectedRoom.taxes * roomsCount)
  };

  const handleSelectRoom = (roomId) => {
    setConfiguringRoomId(roomId);
    // Pre-populate modal with current selection details
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
    setIsConfigOpen(false);
  };

  const handleContinue = () => {
    navigate(`/hotel/${id || '123'}/guest-details`);
  };

  // Helper formatting for dates in Modal preview
  const formatModalDate = (date) => {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        {/* Stepper Block */}
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={currentStep} />
        </div>
        
        {/* Main Content Layout */}
        <div className={styles.mainLayout}>
          <div className={styles.roomsList}>
            {rooms.map(room => (
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
            />
          </div>
        </div>
      </div>

      {/* Booking Configuration Modal */}
      <Modal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
        title={`Configure Booking: ${configuringRoom?.title || 'Room'}`}
      >
        <div className="p-6 bg-white flex flex-col gap-6">
          
          {/* Dates Row */}
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

          {/* Guests Section */}
          <div className="flex flex-col gap-4 border-t border-gray-100 pt-5">
            <h4 className="text-sm font-bold text-[#001439] mb-1">Guests & Rooms</h4>
            
            {/* Rooms Selector */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-700 text-sm">Rooms</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setModalRooms(prev => Math.max(1, prev - 1))} 
                  disabled={modalRooms <= 1} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  -
                </button>
                <span className="font-bold text-[#001439] w-4 text-center">{modalRooms}</span>
                <button 
                  onClick={() => setModalRooms(prev => prev + 1)} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Adults Selector */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-700 text-sm">Adults</span>
                <span className="block text-xs text-gray-400">Ages 13 or above</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setModalAdults(prev => Math.max(1, prev - 1))} 
                  disabled={modalAdults <= 1} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  -
                </button>
                <span className="font-bold text-[#001439] w-4 text-center">{modalAdults}</span>
                <button 
                  onClick={() => setModalAdults(prev => prev + 1)} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Children Selector */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-gray-700 text-sm">Children</span>
                <span className="block text-xs text-gray-400">Ages 0 - 12</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setModalChildren(prev => Math.max(0, prev - 1))} 
                  disabled={modalChildren <= 0} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  -
                </button>
                <span className="font-bold text-[#001439] w-4 text-center">{modalChildren}</span>
                <button 
                  onClick={() => setModalChildren(prev => prev + 1)} 
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Confirm Button */}
          <button 
            onClick={handleConfirmConfig}
            className="mt-4 w-full py-3 bg-[#E86A10] hover:bg-[#d15a0c] text-white rounded-lg font-bold transition-colors shadow-md hover:shadow-lg"
          >
            Confirm & Select Room
          </button>
        </div>
      </Modal>
    </PageLayout>
  );
}
