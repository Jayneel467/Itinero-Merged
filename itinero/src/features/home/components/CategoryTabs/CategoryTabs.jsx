import React from "react";
import { useNavigate } from "react-router-dom";
import { HERO_IMAGES } from "@/constants/images";
import "./CategoryTabs.css";

const CATEGORIES = [
  { id: "flights", label: "Flights", icon: HERO_IMAGES.flightsIcon, to: "/flights" },
  { id: "hotels", label: "Hotels", icon: HERO_IMAGES.hotelsIcon, to: "/hotels" },
  { id: "packages", label: "Packages", icon: HERO_IMAGES.packagesIcon, to: "/packages" },
];

export default function CategoryTabs() {
  const navigate = useNavigate();
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <div className="category-tabs" id="category-tabs">
      <div className="category-tabs__list">
        {CATEGORIES.map((cat) => {
          const active = path === cat.to || path.startsWith(`${cat.to}/`);
          return (
            <div className="category-tabs__item" key={cat.id}>
              <button
                type="button"
                className={`category-tabs__btn ${active ? "category-tabs__btn--active" : ""}`}
                onClick={() => navigate(cat.to)}
              >
                <img
                  src={cat.icon}
                  className={`category-tabs__icon ${active ? "category-tabs__icon--active" : ""}`}
                  alt={cat.label}
                />
              </button>
              <span className="category-tabs__label">{cat.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
