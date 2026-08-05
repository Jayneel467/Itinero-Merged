import React from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout";

export default function NotFoundPage() {
  return (
    <PageLayout>
      <section
        style={{
          minHeight: "60vh",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          padding: "48px 24px",
        }}
      >
        <div>
          <p style={{ color: "#e86a10", fontWeight: 700, marginBottom: 8 }}>404</p>
          <h1 style={{ margin: "0 0 12px", color: "#140f0a" }}>Page not found</h1>
          <p style={{ color: "#6b635c", marginBottom: 24 }}>
            That route doesn’t exist. Head home or search flights and hotels.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/"
              style={{
                background: "#e86a10",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              Go home
            </Link>
            <Link
              to="/flights"
              style={{
                background: "#140f0a",
                color: "#fff",
                textDecoration: "none",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              Search flights
            </Link>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
