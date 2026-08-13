import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { TRENDING_DESTINATIONS } from "@/constants/destinations";
import DestinationCard from "@/features/home/components/DestinationCard";
import "./DestinationsPage.css";

/**
 * Destinations explorer - grid of trending cities with search + filter.
 */
export default function DestinationsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const destinations = useMemo(() => {
    const unique = [];
    const seen = new Set();
    for (const item of TRENDING_DESTINATIONS) {
      const key = `${item.city}-${item.country}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    const q = query.trim().toLowerCase();
    if (!q) return unique;
    return unique.filter(
      (d) =>
        d.city.toLowerCase().includes(q) ||
        d.country.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <PageLayout>
      <section className="destinations-page">
        <div className="destinations-page__header">
          <h1>Explore Destinations</h1>
          <p>Find your next city escape - flights and stays from one place.</p>
          <input
            className="destinations-page__search"
            type="search"
            placeholder="Search cities or countries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search destinations"
          />
        </div>

        <div className="destinations-page__grid">
          {destinations.map((dest) => (
            <button
              key={dest.id}
              type="button"
              className="destinations-page__card-btn"
              onClick={() =>
                navigate(`/hotels?city=${encodeURIComponent(dest.city)}`)
              }
            >
              <DestinationCard {...dest} />
            </button>
          ))}
        </div>

        {destinations.length === 0 && (
          <p className="destinations-page__empty">No destinations match your search.</p>
        )}
      </section>
    </PageLayout>
  );
}
