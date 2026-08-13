import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { FLIGHT_DEALS } from "@/constants/destinations";
import DealCard from "@/features/home/components/DealCard";
import { interestService, trackInterestEvent } from "@/services/interestTracker";
import "./DealsPage.css";

/**
 * Deals page - marketing offers + flight deal cards.
 */
export default function DealsPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("all");
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    interestService
      .offers()
      .then((res) => setOffers(res?.offers || []))
      .catch(() => setOffers([]));
  }, []);

  const deals = useMemo(() => {
    const unique = [];
    const seen = new Set();
    for (const deal of FLIGHT_DEALS) {
      if (seen.has(deal.id.replace(/-2$/, ""))) continue;
      seen.add(deal.id.replace(/-2$/, ""));
      unique.push(deal);
    }
    if (category === "all") return unique;
    return unique.filter((d) => d.destination.toLowerCase().includes(category));
  }, [category]);

  return (
    <PageLayout>
      <section className="deals-page">
        <div className="deals-page__header">
          <h1>Travel Deals & Offers</h1>
          <p>Promo codes for packages plus limited-time fare ideas.</p>
          {offers.length ? (
            <div className="deals-page__offers" style={{ display: "grid", gap: 12, margin: "16px 0 8px" }}>
              {offers.slice(0, 4).map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 16,
                    padding: 16,
                    background: "#fff8f3",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.08em" }}>
                    OFFER
                  </p>
                  <h3 style={{ margin: "6px 0", color: "#001439" }}>{o.title}</h3>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{o.copy}</p>
                  <p style={{ margin: "10px 0 0", fontWeight: 800, letterSpacing: "0.06em" }}>{o.code}</p>
                  <Link
                    to="/packages"
                    onClick={() => trackInterestEvent("deal_click", { code: o.code })}
                    style={{ display: "inline-block", marginTop: 10, fontWeight: 700, color: "#f97316" }}
                  >
                    Browse packages →
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
          <div className="deals-page__filters">
            {["all", "dubai", "singapore", "bangkok", "kool"].map((key) => (
              <button
                key={key}
                type="button"
                className={`deals-page__chip ${category === key ? "is-active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {key === "all"
                  ? "All deals"
                  : key === "kool"
                    ? "Kuala Lumpur"
                    : key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="deals-page__grid">
          {deals.map((deal) => (
            <div key={deal.id} className="deals-page__card-wrap">
              <DealCard {...deal} />
              <button
                type="button"
                className="deals-page__book"
                onClick={() => {
                  trackInterestEvent("deal_click", {
                    city: deal.destination,
                    from: deal.fromCode,
                    to: deal.toCode,
                  });
                  navigate(`/flights?from=${deal.fromCode}&to=${deal.toCode}`);
                }}
              >
                Book this deal
              </button>
            </div>
          ))}
        </div>

        {deals.length === 0 && (
          <p className="deals-page__empty">
            No flight deals in this category — try Hiking or Beach on Explore, or another filter.
          </p>
        )}
      </section>
    </PageLayout>
  );
}
