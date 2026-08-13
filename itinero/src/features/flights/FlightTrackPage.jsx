import React from "react";
import { useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import FlightTrackPanel from "./components/FlightTrackPanel";
import styles from "./FlightTrackPage.module.css";

export default function FlightTrackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const flight = String(searchParams.get("flight") || "").trim();
  const date = String(searchParams.get("date") || "").trim();
  const airport = String(searchParams.get("airport") || "").trim();

  return (
    <PageLayout showFooter={false} className={styles.main}>
      <div className={styles.page}>
        <FlightTrackPanel
          initialFlight={flight}
          initialDate={date}
          initialAirport={airport}
          onQueryChange={({ flight: nextFlight, date: nextDate, airport: nextAirport }) => {
            const next = new URLSearchParams();
            if (nextFlight) next.set("flight", nextFlight);
            if (nextDate && nextFlight) next.set("date", nextDate);
            if (nextAirport) next.set("airport", nextAirport);
            setSearchParams(next, { replace: true });
          }}
        />
      </div>
    </PageLayout>
  );
}
