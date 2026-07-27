import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageLayout } from "@/components/layout";
import BookingStepper from './components/BookingStepper';
import {
  CheckCircle, Download, Share2, MapPin, Calendar, Users, Bed,
  Phone, Mail, Clock, ArrowRight, Home
} from 'lucide-react';
import styles from './HotelConfirmationPage.module.css';

export default function HotelConfirmationPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const base = import.meta.env.BASE_URL;

  // Fallback data if navigated directly
  const paymentId = state?.paymentId || 'pay_TestDemoID12345';
  const bookingData = state?.bookingData || {
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

  const bookingRef = `ITN-HTL-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        {/* Stepper */}
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={4} />
        </div>

        <div className={styles.mainLayout}>
          {/* Left — Confirmation Details */}
          <div className={styles.confirmationColumn}>

            {/* Success Banner */}
            <div className={styles.successBanner}>
              <div className={styles.successIconWrap}>
                <CheckCircle size={48} className={styles.successIcon} />
              </div>
              <div>
                <h1 className={styles.successTitle}>Booking Confirmed! 🎉</h1>
                <p className={styles.successSubtitle}>
                  Your room has been successfully booked. A confirmation email has been sent to your registered address.
                </p>
              </div>
            </div>

            {/* Booking Reference */}
            <div className={styles.refCard}>
              <div className={styles.refBlock}>
                <span className={styles.refLabel}>Booking Reference</span>
                <span className={styles.refValue}>{bookingRef}</span>
              </div>
              <div className={styles.refDivider} />
              <div className={styles.refBlock}>
                <span className={styles.refLabel}>Payment ID</span>
                <span className={styles.refValue}>{paymentId}</span>
              </div>
              <div className={styles.refDivider} />
              <div className={styles.refBlock}>
                <span className={styles.refLabel}>Status</span>
                <span className={styles.statusBadge}>Confirmed</span>
              </div>
            </div>

            {/* Hotel Info Card */}
            <div className={styles.hotelCard}>
              <img
                src={bookingData.hotelImage}
                alt={bookingData.hotelName}
                className={styles.hotelImage}
              />
              <div className={styles.hotelContent}>
                <h2 className={styles.hotelName}>{bookingData.hotelName}</h2>
                <div className={styles.hotelLocation}>
                  <MapPin size={14} />
                  <span>{bookingData.location}</span>
                </div>

                <div className={styles.bookingDetails}>
                  <div className={styles.detailItem}>
                    <Calendar size={16} className={styles.detailIcon} />
                    <div>
                      <span className={styles.detailLabel}>Check-in</span>
                      <span className={styles.detailValue}>{bookingData.checkIn.date} ({bookingData.checkIn.day})</span>
                    </div>
                  </div>
                  <div className={styles.detailDivider} />
                  <div className={styles.detailItem}>
                    <Calendar size={16} className={styles.detailIcon} />
                    <div>
                      <span className={styles.detailLabel}>Check-out</span>
                      <span className={styles.detailValue}>{bookingData.checkOut.date} ({bookingData.checkOut.day})</span>
                    </div>
                  </div>
                  <div className={styles.detailDivider} />
                  <div className={styles.detailItem}>
                    <Bed size={16} className={styles.detailIcon} />
                    <div>
                      <span className={styles.detailLabel}>Room</span>
                      <span className={styles.detailValue}>Deluxe Room · {bookingData.nights} Nights</span>
                    </div>
                  </div>
                  <div className={styles.detailDivider} />
                  <div className={styles.detailItem}>
                    <Users size={16} className={styles.detailIcon} />
                    <div>
                      <span className={styles.detailLabel}>Guests</span>
                      <span className={styles.detailValue}>{bookingData.guests} Adults</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Important Info */}
            <div className={styles.infoCard}>
              <h3 className={styles.infoTitle}>Important Information</h3>
              <div className={styles.infoList}>
                <div className={styles.infoItem}>
                  <Clock size={16} className={styles.infoIcon} />
                  <span>Check-in from <strong>2:00 PM</strong> · Check-out by <strong>12:00 PM</strong></span>
                </div>
                <div className={styles.infoItem}>
                  <Phone size={16} className={styles.infoIcon} />
                  <span>Hotel contact: <strong>+971 4 426 2000</strong></span>
                </div>
                <div className={styles.infoItem}>
                  <Mail size={16} className={styles.infoIcon} />
                  <span>Confirmation email sent to your registered address</span>
                </div>
                <div className={styles.infoItem}>
                  <CheckCircle size={16} className={styles.infoIcon} />
                  <span>Free cancellation until <strong>10 May 2026</strong></span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={styles.actions}>
              <button className={styles.downloadBtn}>
                <Download size={18} /> Download Voucher
              </button>
              <button className={styles.shareBtn}>
                <Share2 size={18} /> Share Booking
              </button>
              <button className={styles.homeBtn} onClick={() => navigate('/')}>
                <Home size={18} /> Back to Home
              </button>
            </div>
          </div>

          {/* Right — Price Summary */}
          <div className={styles.summaryColumn}>
            <div className={styles.summaryCard}>
              <h3 className={styles.summaryTitle}>Payment Summary</h3>

              <div className={styles.summaryRow}>
                <span>Room Charges ({bookingData.nights} Nights)</span>
                <span>₹{bookingData.roomsTotal.toLocaleString()}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Taxes & Fees</span>
                <span>₹{bookingData.taxesTotal.toLocaleString()}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryTotal}>
                <span>Amount Paid</span>
                <span className={styles.summaryTotalPrice}>₹{bookingData.totalPrice.toLocaleString()}</span>
              </div>
              <div className={styles.paidBadge}>
                <CheckCircle size={16} /> Paid via Razorpay
              </div>
              <div className={styles.paymentId}>
                Payment ID: {paymentId}
              </div>
            </div>

            {/* Explore More */}
            <div className={styles.exploreCard}>
              <h3 className={styles.exploreTitle}>Explore More</h3>
              <p className={styles.exploreText}>Discover activities and experiences near your hotel</p>
              <button className={styles.exploreBtn} onClick={() => navigate('/hotels')}>
                Browse More Hotels <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
