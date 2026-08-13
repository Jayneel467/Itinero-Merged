import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Itinero - Discover More Everywhere | Flights, Hotels & AI Travel",
  description:
    "Plan your perfect trip with Itinero. Book flights, hotels, and travel packages with AI-powered assistance. Discover trending destinations and unbeatable deals.",
  keywords: [
    "travel",
    "flights",
    "hotels",
    "booking",
    "AI travel",
    "Itinero",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
