import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { FLIGHT_DEALS } from "@/constants/destinations";
import DealCard from "@/features/home/components/DealCard";
import "./DealsPage.css";

/**
 * Deals page — browse flight offers and jump into search.
 */
export default function DealsPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("all");

  const deals = useMemo(() => {
    const unique = [];
    const seen = new Set();
    for (const deal of FLIGHT_DEALS) {
      if (seen.has(deal.id.replace(/-2$/, ""))) continue;
      seen.add(deal.id.replace(/-2$/, ""));
      unique.push(deal);
    }
    if (category === "all") return unique;
    return unique.filter((d) =>
      d.destination.toLowerCase().includes(category)
    );
  }, [category]);

  return (
    <PageLayout>
      <section className="deals-page">
        <div className="deals-page__header">
          <h1>Travel Deals & Offers</h1>
          <p>Limited-time fares curated for your next trip.</p>
          <div className="deals-page__filters">
            {["all", "dubai", "singapore", "bangkok", "kool"].map((key) => (
              <button
                key={key}
                type="button"
                className={`deals-page__chip ${category === key ? "is-active" : ""}`}
                onClick={() => setCategory(key)}
              >
                {key === "all" ? "All deals" : key === "kool" ? "Kuala Lumpur" : key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="deals-page__grid">
          {deals.map((deal) => (
            <div key={deal.id} className="deals-page__card-wrap">
              <DealCard
                {...deal}
              />
              <button
                type="button"
                className="deals-page__book"
                onClick={() =>
                  navigate(
                    `/flights?from=${deal.fromCode}&to=${deal.toCode}`
                  )
                }
              >
                Book this deal
              </button>
            </div>
          ))}
        </div>

        {deals.length === 0 && (
          <p className="deals-page__empty">No deals in this category right now.</p>
        )}
      </section>
    </PageLayout>
  );
}
