import React, { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import PageTransitionLoader from "@/components/shared/PageTransitionLoader";

/**
 * Centralized route definitions with lazy-loaded pages.
 */

const HomePage = lazy(() => import("@/features/home"));
const FlightsPage = lazy(() => import("@/features/flights"));
const FlightOverviewPage = lazy(() => import("@/features/flights/FlightOverviewPage"));
const PassengerInfoPage = lazy(() => import("@/features/flights/PassengerInfoPage"));
const FlightBookingSuccessPage = lazy(() => import("@/features/flights/FlightBookingSuccessPage"));
const HotelsPage = lazy(() => import("@/features/hotels"));
const HotelDetailPage = lazy(() => import("@/features/hotels/HotelDetailPage"));
const HotelBookingPage = lazy(() => import("@/features/hotels/HotelBookingPage"));
const HotelGuestDetailsPage = lazy(() => import("@/features/hotels/HotelGuestDetailsPage"));
const HotelConfirmationPage = lazy(() => import("@/features/hotels/HotelConfirmationPage"));
const DestinationsPage = lazy(() => import("@/features/destinations"));
const DealsPage = lazy(() => import("@/features/deals"));
const BookingPage = lazy(() => import("@/features/booking"));
const LoginPage = lazy(() => import("@/features/auth"));
const ProfilePage = lazy(() => import("@/features/profile"));
const VeroPage = lazy(() => import("@/features/vero"));
const NotFoundPage = lazy(() => import("@/features/NotFoundPage"));

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader__spinner" />
    </div>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PageTransitionLoader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/flights" element={<FlightsPage />} />
        <Route path="/flights/overview" element={<FlightOverviewPage />} />
        <Route path="/flights/passenger-info" element={<PassengerInfoPage />} />
        <Route path="/flights/booking-success" element={<FlightBookingSuccessPage />} />
        <Route path="/hotels" element={<HotelsPage />} />
        <Route path="/hotel/:id" element={<HotelDetailPage />} />
        <Route path="/hotel/:id/booking" element={<HotelBookingPage />} />
        <Route path="/hotel/:id/guest-details" element={<HotelGuestDetailsPage />} />
        <Route path="/hotel/:id/confirmation" element={<HotelConfirmationPage />} />
        <Route path="/destinations" element={<DestinationsPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/booking/:type/:id" element={<BookingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/vero" element={<VeroPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
