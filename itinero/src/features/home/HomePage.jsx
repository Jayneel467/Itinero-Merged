import React from "react";
import { PageLayout } from "@/components/layout";
import {
  HeroSection,
  AiTravelBuddy,
  TrendingDestinations,
  FlightDeals,
  WhyChoose,
  Testimonials,
  TravelLinks,
} from "./components";
import "./HomePage.css";

/**
 * Home page — assembles all sections in the correct order.
 * Uses PageLayout for consistent Navbar/Footer wrapping.
 * NO wrapper gap/padding — each section carries its own mb-[...] from Figma.
 */
export default function HomePage() {
  return (
    <PageLayout>
      {/* Hero + Search */}
      <HeroSection />

      {/* Where Will you go next */}
      <WhyChoose />

      {/* Trending Destinations */}
      <TrendingDestinations />

      {/* Flight Deals */}
      <FlightDeals />

      {/* AI Travel Buddy Promo (Your Journey, Our Priority) */}
      <AiTravelBuddy />

      {/* Testimonials */}
      <Testimonials />

      {/* Travel Planning Links */}
      <TravelLinks />
    </PageLayout>
  );
}
