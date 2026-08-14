import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";
import { interestService, trackInterestEvent } from "@/services/interestTracker";
import "./DealsPage.css";

const FALLBACK_ROUTES = [
  { from: "AMD", city: "Ahmedabad", to: "DXB", destination: "Dubai" },
  { from: "BOM", city: "Mumbai", to: "DEL", destination: "New Delhi" },
  { from: "DEL", city: "Delhi", to: "BLR", destination: "Bengaluru" },
  { from: "BOM", city: "Mumbai", to: "DXB", destination: "Dubai" },
  { from: "BLR", city: "Bengaluru", to: "DEL", destination: "New Delhi" },
  { from: "BOM", city: "Mumbai", to: "LHR", destination: "London" },
  { from: "DEL", city: "Delhi", to: "BKK", destination: "Bangkok" },
  { from: "BOM", city: "Mumbai", to: "SIN", destination: "Singapore" },
];

/**
 * Live near-term fares + promo codes. Never invents a price.
 */
export default function DealsPage() {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const home = useHomeLocationOptional();
  const [category, setCategory] = useState("all");
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    interestService
      .offers()
      .then((res) => setOffers(res?.offers || []))
      .catch(() => setOffers([]));
  }, []);

  const homeFrom = (home?.airportCode || "").toUpperCase();
  const routes = useMemo(() => {
    if (!homeFrom) return FALLBACK_ROUTES;
    const dests = [
      { to: "DXB", destination: "Dubai" },
      { to: "DEL", destination: "New Delhi" },
      { to: "BOM", destination: "Mumbai" },
      { to: "BLR", destination: "Bengaluru" },
      { to: "LHR", destination: "London" },
      { to: "BKK", destination: "Bangkok" },
      { to: "SIN", destination: "Singapore" },
    ].filter((x) => x.to !== homeFrom);
    return dests.map((d, i) => ({
      from: homeFrom,
      city: home?.city || homeFrom,
      to: d.to,
      destination: d.destination,
      id: `${homeFrom}-${d.to}-${i}`,
    }));
  }, [homeFrom, home?.city]);

  const { byKey, loading } = useLiveRoutePrices({
    routes: routes.map((d) => ({ from: d.from, to: d.to })),
    enabled: true,
  });

  const chips = useMemo(() => {
    const names = ["all", ...new Set(routes.map((r) => r.destination.toLowerCase()))];
    return names;
  }, [routes]);

  const visible = useMemo(() => {
    if (category === "all") return routes;
    return routes.filter((d) => d.destination.toLowerCase() === category);
  }, [routes, category]);

  const openLiveSearch = (deal) => {
    const key = routeKey(deal.from, deal.to);
    const fare = byKey[key];
    const depart =
      fare?.bestDate ||
      sampleNearTermDates(1)[0] ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 21);
        return d.toISOString().slice(0, 10);
      })();
    trackInterestEvent("deal_click", {
      city: deal.destination,
      from: deal.from,
      to: deal.to,
    });
    const params = new URLSearchParams({
      from: deal.from,
      to: deal.to,
      fromCity: deal.city,
      toCity: deal.destination,
      depart,
      adults: "1",
      children: "0",
      infants: "0",
      cabin: "Economy",
      trip: "One way",
    });
    navigate(`/flights?${params.toString()}`);
  };

  return (
    <PageLayout>
      <section className="deals-page">
        <div className="deals-page__header">
          <h1>Travel ideas</h1>
          <p>
            Live from-fares on popular routes. Promo codes (if any) sit first. Search to lock a real ticket —
            we never invent a price here.
          </p>
          {offers.length ? (
            <div className="deals-page__offers">
              {offers.slice(0, 4).map((o) => (
                <div key={o.id} className="deals-page__offer">
                  <p className="deals-page__offerKicker">OFFER</p>
                  <h3>{o.title}</h3>
                  <p>{o.copy}</p>
                  {o.code ? <p className="deals-page__offerCode">{o.code}</p> : null}
                  <Link
                    to="/packages"
                    onClick={() => trackInterestEvent("deal_click", { code: o.code })}
                    className="deals-page__offerLink"
                  >
                    Browse packages →
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
          <div className="deals-page__filters">
            {chips.map((key) => (
              <button
                key={key}
                type="button"
                className={`deals-page__chip ${category === key ? "is-active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {key === "all" ? "All routes" : key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="deals-page__grid">
          {visible.map((deal) => {
            const key = routeKey(deal.from, deal.to);
            const fare = byKey[key];
            const isLoading = Boolean(loading[key]) || fare === undefined;
            const min = fare?.minPrice;
            const hasPrice = typeof min === "number" && min > 0;
            return (
              <article key={deal.id || key} className="deals-page__liveCard">
                <p className="deals-page__liveFrom">{deal.city}</p>
                <p className="deals-page__liveRoute">
                  {deal.from} → {deal.to}
                </p>
                <p className="deals-page__liveDest">{deal.destination}</p>
                <p className="deals-page__livePrice">
                  {isLoading
                    ? "Checking fares…"
                    : hasPrice
                      ? `From ${formatMoney(Math.round(min))}`
                      : "Search live fares"}
                </p>
                <p className="deals-page__liveHint">
                  {isLoading
                    ? "Pulling near-term calendar"
                    : hasPrice
                      ? "Lowest near-term fare found"
                      : "Open search for today’s price"}
                </p>
                <button type="button" className="deals-page__book" onClick={() => openLiveSearch(deal)}>
                  Search this route
                </button>
              </article>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className="deals-page__empty">No routes in this filter. Try All routes, or open Flights.</p>
        )}
      </section>
    </PageLayout>
  );
}
