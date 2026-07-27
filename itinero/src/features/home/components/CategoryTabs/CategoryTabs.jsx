import React from "react";
import { HERO_IMAGES } from "@/constants/images";
import "./CategoryTabs.css";

/**
 * Flights / Hotels / Packages tab switcher in the hero section.
 */
const CATEGORIES = [
  {
    id: "flights",
    label: "Flights",
    icon: HERO_IMAGES.flightsIcon,
    active: true,
  },
  {
    id: "hotels",
    label: "Hotels",
    icon: HERO_IMAGES.hotelsIcon,
    active: false,
  },
  {
    id: "packages",
    label: "Packages",
    icon: HERO_IMAGES.packagesIcon,
    active: false,
  },
];

export default function CategoryTabs() {
  return (
    <div className="category-tabs" id="category-tabs">
      <div className="category-tabs__list">
        {CATEGORIES.map((cat) => (
          <div className="category-tabs__item" key={cat.id}>
            <button
              className={`category-tabs__btn ${cat.active ? "category-tabs__btn--active" : ""}`}
              onClick={() => alert("Pressed!")}
            >
              <img
                src={cat.icon}
                className={`category-tabs__icon ${cat.active ? "category-tabs__icon--active" : ""}`}
                alt={cat.label}
              />
            </button>
            <span className="category-tabs__label">{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
