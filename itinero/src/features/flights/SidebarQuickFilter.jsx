import React from "react";
import LetVeroFilter from "@/components/LetVeroFilter/LetVeroFilter";

/** Flights sidebar - Let Vero Filter over current results. */
export default function SidebarQuickFilter({ onFilter, onClear }) {
  return (
    <LetVeroFilter
      subtitle="Describe the flight you want."
      placeholder='Try: "non-stop under 25000", "stop at Pattaya", "no Middle East layover"'
      buttonLabel="Ask Vero"
      onApply={onFilter}
      onClear={onClear}
    />
  );
}
