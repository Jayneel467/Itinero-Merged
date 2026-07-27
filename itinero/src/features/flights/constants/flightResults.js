/**
 * Mock flight results data for the flights page.
 * Matches the approved UI design exactly.
 */

export const AIRLINES = {
  emirates: {
    name: "Emirates",
    code: "EK 203",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Emirates_logo.svg/300px-Emirates_logo.svg.png",
  },
  etihad: {
    name: "Etihad",
    code: "EY 203",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Etihad-airways-logo.svg/300px-Etihad-airways-logo.svg.png",
  },
  qatar: {
    name: "Qatar",
    code: "EK 203",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/4/43/Qatar_Airways_Logo.svg/300px-Qatar_Airways_Logo.svg.png",
  },
  american: {
    name: "American airlines",
    code: "EK 203",
    logo: "https://upload.wikimedia.org/wikipedia/en/thumb/2/23/American_Airlines_logo_2013.svg/300px-American_Airlines_logo_2013.svg.png",
  },
  indigo: {
    name: "IndiGo",
    code: "6E 1393",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IndiGo_Airlines_logo.svg/300px-IndiGo_Airlines_logo.svg.png",
  },
};

export const MOCK_FLIGHTS = [
  {
    id: 1,
    airline: AIRLINES.emirates,
    badge: "Best Value",
    departure: { time: "08:45", airport: "JFK", date: "20 Jul" },
    arrival: { time: "20:05", airport: "LHR", date: "20 Jul" },
    duration: "1h 40m",
    stops: "Direct",
    baggage: { cabin: "7kg", checked: "30kg" },
    price: 5762,
    currency: "₹",
    perPerson: true,
    details: {
      flightInfo: {
        aircraft: "Airbus A320",
        flightNumber: "IndiGo 6E 1393",
      },
      amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
    },
  },
  {
    id: 2,
    airline: AIRLINES.etihad,
    badge: "Best Value",
    departure: { time: "08:45", airport: "JFK", date: "20 Jul" },
    arrival: { time: "20:05", airport: "LHR", date: "20 Jul" },
    duration: "1h 40m",
    stops: "Direct",
    baggage: { cabin: "7kg", checked: "30kg" },
    price: 5762,
    currency: "₹",
    perPerson: true,
    details: {
      flightInfo: {
        aircraft: "Airbus A320",
        flightNumber: "IndiGo 6E 1393",
      },
      amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
    },
  },
  {
    id: 3,
    airline: AIRLINES.qatar,
    badge: "Best Value",
    departure: { time: "08:45", airport: "JFK", date: "20 Jul" },
    arrival: { time: "20:05", airport: "LHR", date: "20 Jul" },
    duration: "1h 40m",
    stops: "Direct",
    baggage: { cabin: "7kg" },
    price: 5762,
    currency: "₹",
    perPerson: true,
    expanded: true,
    details: {
      flightInfo: {
        aircraft: "Airbus A320",
        flightNumber: "IndiGo 6E 1393",
      },
      amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
    },
  },
  {
    id: 4,
    airline: AIRLINES.american,
    badge: "Best Value",
    departure: { time: "08:45", airport: "JFK", date: "20 Jul" },
    arrival: { time: "20:05", airport: "LHR", date: "20 Jul" },
    duration: "1h 40m",
    stops: "Direct",
    baggage: { cabin: "7kg", checked: "30kg" },
    price: 5762,
    currency: "₹",
    perPerson: true,
    expanded: true,
    hasLayover: true,
    layover: {
      airport: "Dubai International Airport",
      transitTime: "3 hr 00 min transit time",
      arrivalTime: "06:45",
      departureTime: "09:45",
    },
    segments: [
      {
        departure: { time: "08:45", airport: "BOM", date: "20 Jul" },
        arrival: { time: "20:05", airport: "DXB", date: "31 Jul" },
        duration: "1h 40m",
        stops: "Direct",
        flightInfo: {
          aircraft: "Airbus A320",
          flightNumber: "IndiGo 6E 1393",
        },
        amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
      },
      {
        departure: { time: "08:45", airport: "DXB", date: "31 Jul" },
        arrival: { time: "20:05", airport: "JFK", date: "20 Jul" },
        duration: "1h 40m",
        stops: "Direct",
        flightInfo: {
          aircraft: "Airbus A320",
          flightNumber: "IndiGo 6E 1393",
        },
        amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
      },
    ],
    details: {
      flightInfo: {
        aircraft: "Airbus A320",
        flightNumber: "IndiGo 6E 1393",
      },
      amenities: ["Free Wi-Fi", "TV", "Mini Bar"],
    },
  },
];

export const DATE_PRICES = [
  { day: "Fri", date: "18 Jul", price: "₹5,812", active: false },
  { day: "Sat", date: "19 Jul", price: "₹5,290", active: false },
  { day: "Sun", date: "20 Jul", price: "₹5,925", active: false },
  { day: "Mon", date: "21 Jul", price: "₹5,762", active: true },
  { day: "Tue", date: "22 Jul", price: "₹6,349", active: false },
  { day: "Wed", date: "23 Jul", price: "₹4,290", active: false },
  { day: "Thu", date: "24 Jul", price: "₹6,227", active: false },
];

export const FILTER_AIRLINES = [
  { name: "Emirates", count: 45 },
  { name: "Qatar Airways", count: 38 },
  { name: "Lufthansa", count: 37 },
  { name: "Air India", count: 78 },
  { name: "British Airways", count: 24 },
];
