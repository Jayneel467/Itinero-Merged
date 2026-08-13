import React, { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import BookingStepper from "./components/BookingStepper";
import GuestDetailsForm from "./components/GuestDetailsForm";
import HotelAddonsPanel from "./components/HotelAddonsPanel";
import HotelBookingSummary from "./components/HotelBookingSummary";
import { useCurrency } from "@/context/CurrencyContext";
import styles from "./HotelGuestDetailsPage.module.css";

function formatDay(iso) {
  if (!iso) return { date: "-", day: "" };
  try {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    return {
      date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      day: d.toLocaleDateString("en-IN", { weekday: "short" }),
    };
  } catch {
    return { date: String(iso), day: "" };
  }
}

function nightsBetween(checkIn, checkOut) {
  try {
    const a = new Date(`${String(checkIn).slice(0, 10)}T12:00:00`);
    const b = new Date(`${String(checkOut).slice(0, 10)}T12:00:00`);
    return Math.max(1, Math.round((b - a) / 86400000));
  } catch {
    return 1;
  }
}

export default function HotelGuestDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { state } = useLocation();
  const { formatMoney } = useCurrency();

  const hotel = state?.hotel || {};
  const room = state?.room || {};
  const offerId = state?.offerId || room?.offerId || "";
  const checkIn = state?.checkIn || state?.check_in || "";
  const checkOut = state?.checkOut || state?.check_out || "";
  const guests = Number(state?.guests || state?.adults || 2) || 2;
  const roomsCount = Number(state?.rooms || 1) || 1;

  const [guest, setGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    ageAgreed: false,
  });
  const [voucherCode, setVoucherCode] = useState("");
  const [addonsSelection, setAddonsSelection] = useState({ uberUsd: 0, esimPackageId: null, addons: [] });
  const [error, setError] = useState("");

  const nights = nightsBetween(checkIn, checkOut);
  const roomTotal = Number(room?.totalPrice ?? room?.price ?? hotel?.totalPrice ?? 0);
  const taxesTotal = Number(room?.taxes ?? room?.taxAmount ?? 0);
  const taxesIncluded =
    taxesTotal > 0 && roomTotal > 0 && taxesTotal < roomTotal && roomTotal - taxesTotal > 0;
  const roomBase = taxesIncluded ? Math.max(0, roomTotal - taxesTotal) : roomTotal;

  const summaryData = useMemo(() => {
    const cin = formatDay(checkIn);
    const cout = formatDay(checkOut);
    return {
      hotelName: hotel?.name || hotel?.hotelName || "Hotel",
      hotelImage:
        hotel?.mainImage ||
        hotel?.image ||
        (Array.isArray(hotel?.images) ? hotel.images[0] : null) ||
        room?.image ||
        `${import.meta.env.BASE_URL}hotel_room.png`,
      location: hotel?.location || hotel?.city || hotel?.address || "",
      checkIn: cin,
      checkOut: cout,
      checkInIso: checkIn,
      checkOutIso: checkOut,
      guests,
      rooms: roomsCount,
      nights,
      roomName: room?.roomName || room?.name || "Room",
      roomsTotal: roomBase,
      taxesTotal: taxesIncluded ? taxesTotal : 0,
      totalPrice: roomTotal,
      starRating: Number(hotel?.starRating || hotel?.stars || hotel?.rating || 0) || 0,
      offerId,
    };
  }, [
    hotel,
    room,
    checkIn,
    checkOut,
    guests,
    roomsCount,
    nights,
    roomBase,
    taxesTotal,
    taxesIncluded,
    roomTotal,
    offerId,
  ]);

  function validateGuest() {
    if (!guest.firstName.trim() || !guest.lastName.trim()) {
      return "Enter guest first and last name.";
    }
    if (!guest.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) {
      return "Enter a valid email.";
    }
    const phone = guest.phone.replace(/\D/g, "");
    if (phone.length < 8) return "Enter a valid phone number.";
    if (!guest.ageAgreed) return "Confirm the guest is 18+ to continue.";
    if (!offerId) return "Missing room offer - go back and pick a room again.";
    return null;
  }

  function goToPayment() {
    const vErr = validateGuest();
    if (vErr) {
      setError(vErr);
      return;
    }
    setError("");
    navigate(`/hotel/${id || "stay"}/payment`, {
      state: {
        hotel,
        room,
        offerId,
        checkIn,
        checkOut,
        guests,
        rooms: roomsCount,
        guest: {
          ...guest,
          firstName: guest.firstName.trim(),
          lastName: guest.lastName.trim(),
          email: guest.email.trim(),
          phone: guest.phone.replace(/\D/g, ""),
        },
        voucherCode: voucherCode.trim(),
        addons: addonsSelection.addons || [],
        summaryData,
      },
    });
  }

  if (!offerId) {
    return (
      <PageLayout>
        <div className={styles.pageContainer}>
          <p className={styles.alertError}>
            Missing room offer. Go back to the hotel and select a room again.
          </p>
          <button type="button" className={styles.payButton} onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={2} />
        </div>

        {error ? (
          <div role="alert" className={styles.alertError}>
            {error}
          </div>
        ) : null}

        <div className={styles.mainLayout}>
          <div className={styles.formColumn}>
            <GuestDetailsForm value={guest} onChange={setGuest} />
            <div className={styles.voucherBlock}>
              <label htmlFor="hotel-voucher" className={styles.voucherLabel}>
                Voucher code (optional)
              </label>
              <input
                id="hotel-voucher"
                className={styles.voucherInput}
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                placeholder="Enter promo code"
              />
            </div>
            <HotelAddonsPanel
              hotel={hotel}
              checkIn={checkIn}
              checkOut={checkOut}
              value={addonsSelection}
              onChange={setAddonsSelection}
            />
          </div>
          <div className={styles.summaryColumn}>
            <HotelBookingSummary
              bookingInfo={summaryData}
              showContinue
              buttonText={`Continue to payment · ${formatMoney(roomTotal)}`}
              onButtonClick={goToPayment}
              chargeHint="Next: hold the room and pay securely"
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
