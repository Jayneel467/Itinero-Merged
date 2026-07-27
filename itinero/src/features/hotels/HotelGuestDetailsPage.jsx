import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageLayout } from "@/components/layout";
import BookingStepper from './components/BookingStepper';
import GuestDetailsForm from './components/GuestDetailsForm';
import HotelBookingSummary from './components/HotelBookingSummary';
import styles from './HotelGuestDetailsPage.module.css';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-sdk')) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function HotelGuestDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const base = import.meta.env.BASE_URL;

  const summaryData = {
    hotelName: 'Atlantis The Palm',
    hotelImage: `${base}hotel_room.png`,
    location: 'Palm Jumeirah, Dubai, UAE',
    checkIn: { date: '12 May 2026', day: 'Mon' },
    checkOut: { date: '17 May 2026', day: 'Sat' },
    guests: 2,
    rooms: 1,
    nights: 5,
    roomsTotal: 129995,
    taxesTotal: 24665,
    totalPrice: 154660
  };

  const handlePayment = async () => {
    setIsLoading(true);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      alert('Razorpay SDK failed to load. Please check your internet connection.');
      setIsLoading(false);
      return;
    }

    const options = {
      // Use your actual Razorpay test key here
      key: 'rzp_test_YourKeyHere',
      amount: summaryData.totalPrice * 100, // in paise
      currency: 'INR',
      name: 'Itinero',
      description: `Hotel Booking — ${summaryData.hotelName}`,
      image: 'https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/5mm2143s_expires_30_days.png',
      // In production: pass order_id from your backend
      // order_id: 'order_xxxx',
      handler: function (response) {
        // Payment successful — navigate to confirmation
        navigate(`/hotel/${id || '123'}/confirmation`, {
          state: {
            paymentId: response.razorpay_payment_id,
            bookingData: summaryData
          }
        });
      },
      prefill: {
        name: 'Guest Name',
        email: 'guest@example.com',
        contact: '9999999999'
      },
      notes: {
        hotel: summaryData.hotelName,
        checkIn: summaryData.checkIn.date,
        checkOut: summaryData.checkOut.date
      },
      theme: {
        color: '#E86A10'
      },
      modal: {
        ondismiss: () => {
          setIsLoading(false);
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      alert(`Payment failed: ${response.error.description}`);
      setIsLoading(false);
    });
    rzp.open();
    setIsLoading(false);
  };

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        {/* Stepper */}
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={2} />
        </div>

        {/* Main Content */}
        <div className={styles.mainLayout}>
          <div className={styles.formColumn}>
            <GuestDetailsForm />
          </div>

          <div className={styles.sidebar}>
            <HotelBookingSummary
              bookingInfo={summaryData}
              buttonText={isLoading ? 'Opening Payment...' : 'Proceed to Payment'}
              onButtonClick={handlePayment}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
