/**
 * SEO metadata for each page.
 * Used by PageLayout or individual pages to set document title and meta tags.
 *
 * Usage:
 *   import { SEO_META } from '@/constants/seo';
 *   document.title = SEO_META.HOME.title;
 */

export const SEO_META = {
  HOME: {
    title: "Itinero — Discover More Everywhere | Flights, Hotels & AI Travel",
    description:
      "Plan your perfect trip with Itinero. Book flights, hotels, and travel packages with AI-powered assistance. Discover trending destinations and unbeatable deals.",
    keywords: "travel, flights, hotels, booking, AI travel, Itinero, vacation, deals",
  },
  FLIGHTS: {
    title: "Search Flights — Itinero",
    description:
      "Compare and book the cheapest flights worldwide. Find the best deals on domestic and international flights with Itinero.",
    keywords: "cheap flights, flight booking, airline tickets, flight deals",
  },
  HOTELS: {
    title: "Book Hotels & Stays — Itinero",
    description:
      "Find and book hotels, resorts, and vacation rentals at the best prices. Trusted reviews and unbeatable rates.",
    keywords: "hotel booking, hotels near me, cheap hotels, resort deals",
  },
  DESTINATIONS: {
    title: "Explore Destinations — Itinero",
    description:
      "Discover trending travel destinations around the world. Get inspired for your next adventure with curated travel guides.",
    keywords: "travel destinations, trending places, vacation ideas, travel guide",
  },
  DEALS: {
    title: "Travel Deals & Offers — Itinero",
    description:
      "Grab exclusive travel deals on flights, hotels, and packages. Limited-time offers and seasonal discounts.",
    keywords: "travel deals, flight offers, hotel discounts, vacation packages",
  },
  BOOKING: {
    title: "Complete Your Booking — Itinero",
    description: "Securely complete your travel booking with Itinero.",
  },
  LOGIN: {
    title: "Sign In — Itinero",
    description: "Sign in to your Itinero account to manage bookings, trips, and preferences.",
  },
  REGISTER: {
    title: "Create Account — Itinero",
    description: "Join Itinero to unlock exclusive deals, save trips, and get personalized AI travel recommendations.",
  },
  PROFILE: {
    title: "My Profile — Itinero",
    description: "Manage your Itinero profile, preferences, and saved trips.",
  },
  VERO: {
    title: "Ask Vero — AI Travel Buddy | Itinero",
    description:
      "Chat with Vero, your AI travel companion. Get personalized trip recommendations, travel tips, and instant booking assistance.",
  },
};
