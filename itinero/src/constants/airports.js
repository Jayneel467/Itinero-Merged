/**
 * Common airports for the search pickers.
 * Codes are IATA — used directly against LiteAPI via supervisor.
 */
export const AIRPORTS = [
  {
    id: "bom",
    city: "Mumbai",
    state: "Maharashtra, India",
    name: "Chhatrapati Shivaji Maharaj",
    code: "BOM",
  },
  {
    id: "del",
    city: "New Delhi",
    state: "Delhi, India",
    name: "Indira Gandhi",
    code: "DEL",
  },
  {
    id: "blr",
    city: "Bengaluru",
    state: "Karnataka, India",
    name: "Kempegowda",
    code: "BLR",
  },
  {
    id: "amd",
    city: "Ahmedabad",
    state: "Gujarat, India",
    name: "Sardar Vallabhbhai Patel",
    code: "AMD",
  },
  {
    id: "stv",
    city: "Surat",
    state: "Gujarat, India",
    name: "Surat",
    code: "STV",
  },
  {
    id: "hyd",
    city: "Hyderabad",
    state: "Telangana, India",
    name: "Rajiv Gandhi",
    code: "HYD",
  },
  {
    id: "maa",
    city: "Chennai",
    state: "Tamil Nadu, India",
    name: "Chennai International",
    code: "MAA",
  },
  {
    id: "ccu",
    city: "Kolkata",
    state: "West Bengal, India",
    name: "Netaji Subhas Chandra Bose",
    code: "CCU",
  },
  {
    id: "goi",
    city: "Goa",
    state: "Goa, India",
    name: "Goa International (Dabolim)",
    code: "GOI",
  },
  {
    id: "dxb",
    city: "Dubai",
    state: "UAE",
    name: "Dubai International",
    code: "DXB",
  },
  {
    id: "lon",
    city: "London",
    state: "UK",
    name: "Heathrow",
    code: "LHR",
  },
  {
    id: "nyc",
    city: "New York",
    state: "USA",
    name: "John F. Kennedy",
    code: "JFK",
  },
  {
    id: "cdg",
    city: "Paris",
    state: "France",
    name: "Charles de Gaulle",
    code: "CDG",
  },
  {
    id: "nrt",
    city: "Tokyo",
    state: "Japan",
    name: "Narita",
    code: "NRT",
  },
  {
    id: "dps",
    city: "Bali",
    state: "Indonesia",
    name: "Ngurah Rai",
    code: "DPS",
  },
  {
    id: "ixb",
    city: "Bagdogra",
    state: "West Bengal, India",
    name: "Bagdogra (Darjeeling region)",
    code: "IXB",
  },
  {
    id: "urt",
    city: "Surat Thani",
    state: "Thailand",
    name: "Surat Thani",
    code: "URT",
  },
  {
    id: "usm",
    city: "Ko Samui",
    state: "Thailand",
    name: "Ko Samui",
    code: "USM",
  },
  {
    id: "sub",
    city: "Surabaya",
    state: "East Java, Indonesia",
    name: "Juanda",
    code: "SUB",
  },
];

export function findAirportByCode(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  return AIRPORTS.find((a) => a.code === c) || null;
}
