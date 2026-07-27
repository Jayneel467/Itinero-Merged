import React, { useState } from "react";
import { SPECIAL_FARES } from "@/constants/destinations";
import "./SpecialFares.css";

/**
 * Special fare pill buttons: Student, Senior Citizen, Armed Force.
 */
export default function SpecialFares() {
  const [activeFare, setActiveFare] = useState(null);

  const toggleFare = (fare) => {
    setActiveFare(activeFare === fare ? null : fare);
  };

  return (
    <div className="special-fares" id="special-fares">
      <span className="special-fares__label">Special Fares (optional) :</span>
      {SPECIAL_FARES.map((fare) => (
        <button
          key={fare}
          className={`special-fares__pill ${activeFare === fare ? 'special-fares__pill--active' : ''}`}
          onClick={() => toggleFare(fare)}
        >
          <span>{fare}</span>
        </button>
      ))}
    </div>
  );
}
