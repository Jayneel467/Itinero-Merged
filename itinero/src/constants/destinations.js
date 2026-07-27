/**
 * Data constants for home page sections.
 * Easy to update or fetch from an API in the future.
 */

import {
  DESTINATION_IMAGES,
  DEAL_IMAGES,
  FEATURE_IMAGES,
  TESTIMONIAL_IMAGES,
} from "./images";

// ─── Trending Destinations ───────────────────────────────
export const TRENDING_DESTINATIONS = [
  {
    id: "bali",
    city: "Bali",
    country: "Indonesia",
    image: DESTINATION_IMAGES.bali,
    arrowIcon: DESTINATION_IMAGES.baliArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "new-york",
    city: "New York",
    country: "USA",
    image: DESTINATION_IMAGES.newYork,
    arrowIcon: DESTINATION_IMAGES.newYorkArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "darjeeling",
    city: "Darjeeling",
    country: "Darjeeling",
    image: DESTINATION_IMAGES.darjeeling,
    arrowIcon: DESTINATION_IMAGES.darjeelingArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "japan",
    city: "Japan",
    country: "Japan",
    image: DESTINATION_IMAGES.japan,
    arrowIcon: DESTINATION_IMAGES.japanArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  // Dummy data for slider
  {
    id: "bali-2",
    city: "Bali",
    country: "Indonesia",
    image: DESTINATION_IMAGES.bali,
    arrowIcon: DESTINATION_IMAGES.baliArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "new-york-2",
    city: "New York",
    country: "USA",
    image: DESTINATION_IMAGES.newYork,
    arrowIcon: DESTINATION_IMAGES.newYorkArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "darjeeling-2",
    city: "Darjeeling",
    country: "Darjeeling",
    image: DESTINATION_IMAGES.darjeeling,
    arrowIcon: DESTINATION_IMAGES.darjeelingArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
  {
    id: "japan-2",
    city: "Japan",
    country: "Japan",
    image: DESTINATION_IMAGES.japan,
    arrowIcon: DESTINATION_IMAGES.japanArrow,
    flightFrom: "$499",
    hotelFrom: "$59",
  },
];

// ─── Flight Deals ────────────────────────────────────────
export const FLIGHT_DEALS = [
  {
    id: "amd-dxb",
    discount: "-20%",
    city: "Ahmedabad",
    fromCode: "AMD",
    toCode: "DXB",
    destination: "Dubai",
    currentPrice: "₹12,450",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowAMD,
  },
  {
    id: "bom-sin",
    discount: "-20%",
    city: "Mumbai",
    fromCode: "BOH",
    toCode: "SIN",
    destination: "Singapore",
    currentPrice: "₹14,850",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowBOM,
  },
  {
    id: "del-bkk",
    discount: "-20%",
    city: "Delhi",
    fromCode: "DEL",
    toCode: "BKK",
    destination: "Bangkok",
    currentPrice: "₹12,450",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowDEL,
  },
  {
    id: "blr-kul",
    discount: "-20%",
    city: "Bangalore",
    fromCode: "BLR",
    toCode: "KUL",
    destination: "Kool Lumpur",
    currentPrice: "₹13,199",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowBLR,
  },
  // Dummy data for slider
  {
    id: "amd-dxb-2",
    discount: "-20%",
    city: "Ahmedabad",
    fromCode: "AMD",
    toCode: "DXB",
    destination: "Dubai",
    currentPrice: "₹12,450",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowAMD,
  },
  {
    id: "bom-sin-2",
    discount: "-20%",
    city: "Mumbai",
    fromCode: "BOH",
    toCode: "SIN",
    destination: "Singapore",
    currentPrice: "₹14,850",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowBOM,
  },
  {
    id: "del-bkk-2",
    discount: "-20%",
    city: "Delhi",
    fromCode: "DEL",
    toCode: "BKK",
    destination: "Bangkok",
    currentPrice: "₹12,450",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowDEL,
  },
  {
    id: "blr-kul-2",
    discount: "-20%",
    city: "Bangalore",
    fromCode: "BLR",
    toCode: "KUL",
    destination: "Kool Lumpur",
    currentPrice: "₹13,199",
    originalPrice: "₹20,000",
    dates: "12 May - 20 May",
    arrowIcon: DEAL_IMAGES.arrowBLR,
  },
];

// ─── Special Fares ───────────────────────────────────────
export const SPECIAL_FARES = ["Student", "Senior Citizen", "Armed Force"];

// ─── Why Choose Itinero — Features ───────────────────────
export const FEATURES = [
  {
    id: "plan-ai",
    title: "Plan with AI",
    description: "Get travel questions answered",
    image: "/itinero/icon/image 1.svg",
  },
  {
    id: "best-time",
    title: "Best Time to Travel",
    description: "Know when to save",
    image: "/itinero/icon/image 2.svg",
  },
  {
    id: "explore",
    title: "Explore",
    description: "See destinations on your budget",
    image: "/itinero/icon/image 3.svg",
  },
  {
    id: "trips",
    title: "Trips",
    description: "Keep all your plans in one place",
    image: "/itinero/icon/image 4.svg",
  },
  // Dummy data for slider
  {
    id: "plan-ai-2",
    title: "Plan with AI",
    description: "Get travel questions answered",
    image: FEATURE_IMAGES.planAi,
  },
  {
    id: "best-time-2",
    title: "Best Time to Travel",
    description: "Know when to save",
    image: FEATURE_IMAGES.bestTime,
  },
  {
    id: "explore-2",
    title: "Explore",
    description: "See destinations on your budget",
    image: FEATURE_IMAGES.explore,
  },
  {
    id: "trips-2",
    title: "Trips",
    description: "Keep all your plans in one place",
    image: FEATURE_IMAGES.trips,
  },
];

// ─── Testimonials ────────────────────────────────────────
export const TESTIMONIALS = [
  {
    id: "sophia",
    name: "Sophia Mitchell",
    location: "New York, USA",
    rating: 5,
    review:
      '" Itinero made our honeymoon\nabsolutely perfect. Every detail\nwas seamless & stress-free."',
    avatar: TESTIMONIAL_IMAGES.sophiaAvatar,
    starIcon: TESTIMONIAL_IMAGES.sophiaStar,
    quoteIcon: TESTIMONIAL_IMAGES.sophiaQuote,
  },
  {
    id: "james",
    name: "James Carter",
    location: "London, UK",
    rating: 5,
    review:
      '"The best travel platform I\'ve used.\nLuxury stays, great prices, and \nincredible support"',
    avatar: TESTIMONIAL_IMAGES.jamesAvatar,
    starIcon: TESTIMONIAL_IMAGES.jamesStar,
    quoteIcon: TESTIMONIAL_IMAGES.jamesQuote,
  },
  {
    id: "emily",
    name: "Emily Watson",
    location: "Sydney, Australia",
    rating: 5,
    review:
      '"From booking to the entire journey\neverything was beyond \nexpectations"',
    avatar: TESTIMONIAL_IMAGES.emilyAvatar,
    starIcon: TESTIMONIAL_IMAGES.emilyStar,
    quoteIcon: TESTIMONIAL_IMAGES.emilyQuote,
  },
  // Dummy data for slider
  {
    id: "sophia-2",
    name: "Sophia Mitchell",
    location: "New York, USA",
    rating: 5,
    review:
      '" Itinero made our honeymoon\nabsolutely perfect. Every detail\nwas seamless & stress-free."',
    avatar: TESTIMONIAL_IMAGES.sophiaAvatar,
    starIcon: TESTIMONIAL_IMAGES.sophiaStar,
    quoteIcon: TESTIMONIAL_IMAGES.sophiaQuote,
  },
  {
    id: "james-2",
    name: "James Carter",
    location: "London, UK",
    rating: 5,
    review:
      '"The best travel platform I\'ve used.\nLuxury stays, great prices, and \nincredible support"',
    avatar: TESTIMONIAL_IMAGES.jamesAvatar,
    starIcon: TESTIMONIAL_IMAGES.jamesStar,
    quoteIcon: TESTIMONIAL_IMAGES.jamesQuote,
  },
  {
    id: "emily-2",
    name: "Emily Watson",
    location: "Sydney, Australia",
    rating: 5,
    review:
      '"From booking to the entire journey\neverything was beyond \nexpectations"',
    avatar: TESTIMONIAL_IMAGES.emilyAvatar,
    starIcon: TESTIMONIAL_IMAGES.emilyStar,
    quoteIcon: TESTIMONIAL_IMAGES.emilyQuote,
  },
];

// ─── Travel Planning Links ───────────────────────────────
export const TRAVEL_LINKS = [
  { city: "London" },
  { city: "Dubai" },
  { city: "Bengaluru" },
  { city: "Toronto" },
  { city: "New Delhi" },
  { city: "Bangkok" },
  { city: "Melbourne" },
  { city: "Chicago" },
  { city: "Mumbai" },
  { city: "San Francisco" },
  { city: "Atlanta" },
  { city: "Singapore" },
  { city: "New York" },
  { city: "Hyderabad" },
  { city: "Phuket City" },
  { city: "Kochi" },
  { city: "Chennai" },
  { city: "Sydney" },
  { city: "Kolkata" },
  { city: "India" },
  { city: "United States" },
  { city: "Thailand" },
  { city: "Germany" },
];

export const MOCK_TRAVEL_DETAILS = {
  hotels: [
    { name: "Nx London Hostel", price: "₹ 2,652+" },
    { name: "Palmers Lodge Swiss Cottage", price: "₹ 4,792+" },
    { name: "Ramada London North M1", price: "₹ 6,247+" },
    { name: "Ibis Budget London Whitechapel", price: "₹ 8,972+" },
    { name: "easyHotel London Victoria", price: "₹ 9,027+" },
  ],
  flights: [
    { name: "Flight New Delhi - London (DEL - LON)", price: "₹ 14,823+" },
    { name: "Flight Mumbai - London (BOM - LON)", price: "₹ 18,789+" },
    { name: "Flight Hyderabad - London (HYD - LON)", price: "₹ 21,244+" },
    { name: "Flight Bengaluru - London (BLR - LON)", price: "₹ 22,566+" },
    { name: "Flight Indore - London (IDR - LON)", price: "₹ 56,178+" },
  ]
};
