import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { hotelService } from "../services/hotelService";
import { LoadingState } from "@/components/shared";
import styles from "../HotelDetailPage.module.css";

/**
 * Live guest reviews from LiteAPI GET /data/reviews - no invented quotes.
 */
export default function HotelReviews({ hotelId, rating, ratingText, reviewCount }) {
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(Number(reviewCount) || 0);
  const [loading, setLoading] = useState(Boolean(hotelId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hotelId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    hotelService.getReviews(hotelId, 20).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res?.ok) {
        setReviews([]);
        setError(res?.message || "");
        return;
      }
      setReviews(Array.isArray(res.reviews) ? res.reviews : []);
      setTotal(Number(res.total) || (res.reviews?.length ?? 0));
    });
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  const score = rating != null && Number(rating) > 0 ? Number(rating) : null;
  const count = total || Number(reviewCount) || 0;

  return (
    <div style={{ padding: "8px 0" }}>
      <h2 className={styles.HotelAmenitiesGrid_sectionTitle}>Guest reviews</h2>

      {(score != null || count > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <div
            style={{
              background: "#001439",
              color: "#fff",
              fontWeight: 800,
              fontSize: 22,
              borderRadius: 10,
              padding: "10px 14px",
              minWidth: 56,
              textAlign: "center",
            }}
          >
            {score != null ? score.toFixed(1) : "-"}
          </div>
          <div>
            <div
              style={{
                fontWeight: 700,
                color: "#001439",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Star size={16} fill="#F97211" color="#F97211" />
              {ratingText || "Rated"}
            </div>
            {count > 0 && (
              <div style={{ color: "#667085", fontSize: 13, marginTop: 4 }}>
                Based on {count.toLocaleString()} review{count === 1 ? "" : "s"}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState
          title="Loading guest reviews"
          message="Pulling live guest reviews…"
          skeleton="lines"
          count={2}
        />
      ) : null}

      {!loading && reviews.length === 0 ? (
        <p style={{ color: "#667085", fontSize: 14, marginTop: 16 }}>
          {error ||
            "Individual guest reviews aren’t available for this property in the live feed."}
        </p>
      ) : null}

      {!loading && reviews.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 14 }}>
          {reviews.map((r, i) => (
            <li
              key={`${r.name}-${r.date}-${i}`}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "14px 16px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <strong style={{ color: "#001439" }}>{r.name || "Guest"}</strong>
                <span style={{ color: "#667085", fontSize: 13 }}>
                  {r.score != null ? `${Number(r.score).toFixed(1)}/10` : ""}
                  {r.date ? ` · ${r.date}` : ""}
                </span>
              </div>
              {r.headline ? (
                <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14 }}>{r.headline}</p>
              ) : null}
              {r.pros ? (
                <p style={{ margin: "0 0 4px", fontSize: 13, color: "#344054" }}>{r.pros}</p>
              ) : null}
              {r.cons ? (
                <p style={{ margin: 0, fontSize: 13, color: "#667085" }}>{r.cons}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
