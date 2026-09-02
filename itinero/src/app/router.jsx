import React, { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import PageTransitionLoader from "@/components/shared/PageTransitionLoader";
import VeroChatWidget from "@/components/chat/VeroChatWidget";
import { useVeroUiOptional } from "@/context/VeroUiContext";

/**
 * Centralized route definitions with lazy-loaded pages.
 */

const HomePage = lazy(() => import("@/features/home"));
const FlightsPage = lazy(() => import("@/features/flights"));
const FlightTrackPage = lazy(() => import("@/features/flights/FlightTrackPage"));
const PassengerInfoPage = lazy(() => import("@/features/flights/PassengerInfoPage"));
const FlightPaymentPage = lazy(() => import("@/features/flights/FlightPaymentPage"));
const FlightBookingSuccessPage = lazy(() => import("@/features/flights/FlightBookingSuccessPage"));
const HotelsPage = lazy(() => import("@/features/hotels"));
const HotelDetailPage = lazy(() => import("@/features/hotels/HotelDetailPage"));
const HotelBookingPage = lazy(() => import("@/features/hotels/HotelBookingPage"));
const HotelGuestDetailsPage = lazy(() => import("@/features/hotels/HotelGuestDetailsPage"));
const HotelPaymentPage = lazy(() => import("@/features/hotels/HotelPaymentPage"));
const HotelConfirmationPage = lazy(() => import("@/features/hotels/HotelConfirmationPage"));
const PackagesPage = lazy(() => import("@/features/packages"));
const EventsPage = lazy(() => import("@/features/events"));
const EventDetailPage = lazy(() => import("@/features/events/EventDetailPage"));
const TrainsPage = lazy(() => import("@/features/trains"));
const TrainBookingPage = lazy(() => import("@/features/trains/TrainBookingPage"));
const TrainBookingSuccessPage = lazy(() => import("@/features/trains/TrainBookingSuccessPage"));
const BusesPage = lazy(() => import("@/features/buses"));
const BusBookingPage = lazy(() => import("@/features/buses/BusBookingPage"));
const BusBookingSuccessPage = lazy(() => import("@/features/buses/BusBookingSuccessPage"));
const PackageDetailPage = lazy(() => import("@/features/packages/PackageDetailPage"));
const PackageCheckoutPage = lazy(() => import("@/features/packages/PackageCheckoutPage"));
const PackageConfirmationPage = lazy(() => import("@/features/packages/PackageConfirmationPage"));
const ExplorePage = lazy(() => import("@/features/explore"));
const ExploreDetailPage = lazy(() => import("@/features/explore/ExploreDetailPage"));
const TripsPage = lazy(() => import("@/features/trips"));
const TripDetailPage = lazy(() => import("@/features/trips/TripDetailPage"));
const DealsPage = lazy(() => import("@/features/deals"));
const LoginPage = lazy(() => import("@/features/auth"));
const ProfilePage = lazy(() => import("@/features/profile"));
const SavedPage = lazy(() => import("@/features/account/SavedPage"));
const HelpPage = lazy(() => import("@/features/account/HelpPage"));
const FeedbackPage = lazy(() => import("@/features/account/FeedbackPage"));
const TermsOfUsePage = lazy(() =>
  import("@/features/account/LegalPages").then((m) => ({ default: m.TermsOfUsePage }))
);
const PrivacyPolicyPage = lazy(() =>
  import("@/features/account/LegalPages").then((m) => ({ default: m.PrivacyPolicyPage }))
);
const CancellationPolicyPage = lazy(() =>
  import("@/features/account/LegalPages").then((m) => ({
    default: m.CancellationPolicyPage,
  }))
);
const NotificationsPage = lazy(() => import("@/features/account/NotificationsPage"));
const RewardsPage = lazy(() => import("@/features/account/RewardsPage"));
const PlusPage = lazy(() => import("@/features/billing/PlusPage"));
const VeroPage = lazy(() => import("@/features/vero"));
const GoCampaignPage = lazy(() => import("@/features/marketing/GoCampaignPage"));
const MarketingAdminPage = lazy(() => import("@/features/marketing/MarketingAdminPage"));
const NotFoundPage = lazy(() => import("@/features/NotFoundPage"));

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader__spinner" />
    </div>
  );
}

function LegacyBookingRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/trips/${id}` : "/trips"} replace />;
}

function LegacyBusesRedirect({ to = "/transits" }) {
  const loc = useLocation();
  return <Navigate to={`${to}${loc.search}${loc.hash}`} replace />;
}

function PersistentVero() {
  const location = useLocation();
  const veroUi = useVeroUiOptional();
  const hideWidget =
    !veroUi ||
    location.pathname === "/vero" ||
    location.pathname.startsWith("/vero/") ||
    location.pathname === "/login";
  const docked = Boolean(veroUi?.isOpen) && !hideWidget;

  useEffect(() => {
    document.documentElement.toggleAttribute("data-vero-open", docked);
    return () => document.documentElement.removeAttribute("data-vero-open");
  }, [docked]);

  if (hideWidget) return null;
  return (
    <VeroChatWidget
      isOpen={veroUi.isOpen}
      onOpen={veroUi.openVero}
      onClose={veroUi.closeVero}
    />
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
      <PageTransitionLoader />
      <PersistentVero />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/flights" element={<FlightsPage />} />
        <Route path="/flights/track" element={<FlightTrackPage />} />
        <Route path="/flights/overview" element={<Navigate to="/flights" replace />} />
        <Route path="/flights/passenger-info" element={<PassengerInfoPage />} />
        <Route path="/flights/payment" element={<FlightPaymentPage />} />
        <Route path="/flights/booking-success" element={<FlightBookingSuccessPage />} />
        <Route path="/hotels" element={<HotelsPage />} />
        <Route path="/homes" element={<Navigate to="/hotels" replace />} />
        <Route path="/hotel/:id" element={<HotelDetailPage />} />
        <Route path="/hotel/:id/booking" element={<HotelBookingPage />} />
        <Route path="/hotel/:id/guest-details" element={<HotelGuestDetailsPage />} />
        <Route path="/hotel/:id/payment" element={<HotelPaymentPage />} />
        <Route path="/hotel/:id/confirmation" element={<HotelConfirmationPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/trains" element={<TrainsPage />} />
        <Route path="/trains/book" element={<TrainBookingPage />} />
        <Route path="/trains/book/done" element={<TrainBookingSuccessPage />} />
        <Route path="/transits" element={<BusesPage />} />
        <Route path="/transits/book" element={<BusBookingPage />} />
        <Route path="/transits/book/done" element={<BusBookingSuccessPage />} />
        <Route path="/buses" element={<LegacyBusesRedirect to="/transits" />} />
        <Route path="/buses/book" element={<LegacyBusesRedirect to="/transits/book" />} />
        <Route path="/buses/book/done" element={<LegacyBusesRedirect to="/transits/book/done" />} />
        <Route path="/packages/confirmation/:bookingId" element={<PackageConfirmationPage />} />
        <Route path="/packages/:slug/checkout" element={<PackageCheckoutPage />} />
        <Route path="/packages/:slug" element={<PackageDetailPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/explore/:slug" element={<ExploreDetailPage />} />
        <Route path="/destinations" element={<Navigate to="/explore" replace />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/booking" element={<Navigate to="/trips" replace />} />
        <Route path="/booking/:type/:id" element={<LegacyBookingRedirect />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/go" element={<GoCampaignPage />} />
        <Route path="/go/:slug" element={<GoCampaignPage />} />
        <Route path="/explore/theme/:theme" element={<ExplorePage />} />
        <Route path="/admin/marketing" element={<MarketingAdminPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/plus" element={<PlusPage />} />
        <Route path="/pricing" element={<Navigate to="/plus" replace />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/support" element={<Navigate to="/help" replace />} />
        <Route path="/terms" element={<TermsOfUsePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/cancellation" element={<CancellationPolicyPage />} />
        <Route path="/refunds" element={<Navigate to="/cancellation" replace />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/vero" element={<VeroPage />} />
        <Route path="/itinero-one" element={<Navigate to="/" replace />} />
        <Route path="/one" element={<Navigate to="/" replace />} />
        <Route path="/one/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
