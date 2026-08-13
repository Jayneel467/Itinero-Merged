import React, { useEffect, useState } from "react";
import { PageLayout } from "@/components/layout";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import styles from "./MarketingAdminPage.module.css";

/**
 * Lite internal marketing dashboard — stats, offers, segments.
 * Auth via X-Marketing-Token (MARKETING_ADMIN_TOKEN) or open in local dev.
 */
export default function MarketingAdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem("itinero_mkt_token") || "");
  const [stats, setStats] = useState(null);
  const [offers, setOffers] = useState([]);
  const [segments, setSegments] = useState([]);
  const [error, setError] = useState("");
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewMsg, setPreviewMsg] = useState("");

  const headers = token ? { "X-Marketing-Token": token } : {};

  async function load() {
    setError("");
    try {
      localStorage.setItem("itinero_mkt_token", token);
      const [s, o, seg] = await Promise.all([
        api.get(ENDPOINTS.MARKETING.ADMIN_STATS, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_OFFERS, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_SEGMENTS, undefined, { headers }),
      ]);
      setStats(s);
      setOffers(o?.offers || []);
      setSegments(seg?.segments || []);
    } catch (err) {
      setError(err?.message || "Failed to load — check admin token.");
    }
  }

  useEffect(() => {
    document.title = "Marketing admin | Itinero";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendPreview(template) {
    setPreviewMsg("");
    try {
      await api.post(
        "/api/internal/marketing/preview",
        { template, to_email: previewEmail },
        { headers }
      );
      setPreviewMsg(`Preview queued for ${template}`);
    } catch (err) {
      setPreviewMsg(err?.message || "Preview failed");
    }
  }

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Marketing OS</h1>
        <p className={styles.sub}>Sends, opens, clicks, offers, and segments.</p>
        <div className={styles.row}>
          <input
            className={styles.input}
            placeholder="Admin token (optional in local dev)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="button" className={styles.btn} onClick={load}>
            Refresh
          </button>
        </div>
        {error ? <p className={styles.err}>{error}</p> : null}

        <section className={styles.card}>
          <h2>Last 30 days</h2>
          <pre className={styles.pre}>{JSON.stringify(stats?.totals || {}, null, 2)}</pre>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Sent</th>
                <th>Opens</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.sends || []).map((r) => (
                <tr key={r.campaign}>
                  <td>{r.campaign}</td>
                  <td>{r.sent}</td>
                  <td>{r.opens}</td>
                  <td>{r.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.card}>
          <h2>Offers</h2>
          <ul className={styles.list}>
            {offers.map((o) => (
              <li key={o.id}>
                <strong>{o.code}</strong> — {o.title}{" "}
                <em>({o.active ? "active" : "off"})</em>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h2>Segments</h2>
          <ul className={styles.list}>
            {segments.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong>
                <pre className={styles.pre}>{JSON.stringify(s.rules)}</pre>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h2>Preview email</h2>
          <div className={styles.row}>
            <input
              className={styles.input}
              type="email"
              placeholder="you@company.com"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
            />
          </div>
          <div className={styles.row}>
            {["signup_spark", "signup_trip_idea", "signup_offer", "daily_digest", "booking_more_like"].map(
              (t) => (
                <button key={t} type="button" className={styles.btn} onClick={() => sendPreview(t)}>
                  {t}
                </button>
              )
            )}
          </div>
          {previewMsg ? <p>{previewMsg}</p> : null}
        </section>
      </div>
    </PageLayout>
  );
}
