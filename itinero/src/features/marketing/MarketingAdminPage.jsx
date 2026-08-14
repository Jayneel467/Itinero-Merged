import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import styles from "./MarketingAdminPage.module.css";

const PREVIEW_TEMPLATES = [
  "signup_spark",
  "signup_trip_idea",
  "signup_offer",
  "daily_digest",
  "booking_more_like",
];

/**
 * Internal marketing console — journeys, queue, previews, broadcasts, offers.
 * Auth via X-Marketing-Token (MARKETING_ADMIN_TOKEN). Open in local sandbox.
 */
export default function MarketingAdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem("itinero_mkt_token") || "");
  const [stats, setStats] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [offers, setOffers] = useState([]);
  const [segments, setSegments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [previewEmail, setPreviewEmail] = useState("");
  const [broadcastSeg, setBroadcastSeg] = useState("seg_newsletter");
  const [broadcastTpl, setBroadcastTpl] = useState("daily_digest");
  const [offerForm, setOfferForm] = useState({
    code: "",
    title: "",
    copy: "",
    discount_value: 10,
  });

  const headers = token ? { "X-Marketing-Token": token } : {};

  const load = useCallback(async () => {
    setError("");
    try {
      localStorage.setItem("itinero_mkt_token", token);
      const [s, o, seg, cat, q] = await Promise.all([
        api.get(ENDPOINTS.MARKETING.ADMIN_STATS, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_OFFERS, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_SEGMENTS, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_CATALOG, undefined, { headers }),
        api.get(ENDPOINTS.MARKETING.ADMIN_QUEUE, { limit: 40 }, { headers }),
      ]);
      setStats(s);
      setOffers(o?.offers || []);
      setSegments(seg?.segments || []);
      setCatalog(cat);
      setQueue(q?.runs || []);
    } catch (err) {
      setError(err?.message || "Failed to load — check admin token.");
    }
  }, [token]);

  useEffect(() => {
    document.title = "Marketing admin | Itinero";
    load();
  }, [load]);

  async function runDue(withDigests) {
    setBusy(withDigests ? "digests" : "due");
    setNote("");
    try {
      const res = await api.post(
        `${ENDPOINTS.MARKETING.ADMIN_RUN_DUE}?digests=${withDigests ? "true" : "false"}&drain=true`,
        {},
        { headers }
      );
      setNote(
        `Processed ${res?.processed ?? 0} journey steps` +
          (res?.digests ? ` · digest sent ${res.digests.sent || 0}` : "")
      );
      await load();
    } catch (err) {
      setNote(err?.message || "Run failed");
    }
    setBusy("");
  }

  async function sendPreview(template) {
    setNote("");
    if (!previewEmail.trim()) {
      setNote("Enter a preview email first.");
      return;
    }
    setBusy(`preview-${template}`);
    try {
      await api.post(
        ENDPOINTS.MARKETING.ADMIN_PREVIEW,
        { template, to_email: previewEmail.trim() },
        { headers }
      );
      setNote(`Preview queued: ${template} → ${previewEmail.trim()}`);
    } catch (err) {
      setNote(err?.message || "Preview failed");
    }
    setBusy("");
  }

  async function sendBroadcast() {
    setNote("");
    if (!window.confirm(`Send ${broadcastTpl} to segment ${broadcastSeg}? Caps still apply.`)) {
      return;
    }
    setBusy("broadcast");
    try {
      const res = await api.post(
        ENDPOINTS.MARKETING.ADMIN_BROADCAST,
        { template: broadcastTpl, segment_id: broadcastSeg, limit: 25 },
        { headers }
      );
      setNote(
        `Broadcast ${res?.template}: sent ${res?.sent || 0}, skipped ${res?.skipped || 0}, errors ${res?.errors || 0}`
      );
      await load();
    } catch (err) {
      setNote(err?.message || "Broadcast failed");
    }
    setBusy("");
  }

  async function toggleOffer(offer) {
    setBusy(`offer-${offer.id}`);
    try {
      await api.post(
        ENDPOINTS.MARKETING.ADMIN_OFFERS,
        {
          id: offer.id,
          code: offer.code,
          title: offer.title,
          copy: offer.copy,
          image_url: offer.image_url,
          targets: offer.targets,
          discount_type: offer.discount_type || "percent",
          discount_value: offer.discount_value,
          currency: offer.currency || "INR",
          active: !offer.active,
        },
        { headers }
      );
      await load();
    } catch (err) {
      setNote(err?.message || "Could not update offer");
    }
    setBusy("");
  }

  async function createOffer(e) {
    e.preventDefault();
    setBusy("offer-new");
    try {
      await api.post(
        ENDPOINTS.MARKETING.ADMIN_OFFERS,
        {
          code: offerForm.code.trim().toUpperCase(),
          title: offerForm.title.trim(),
          copy: offerForm.copy.trim(),
          discount_type: "percent",
          discount_value: Number(offerForm.discount_value) || 0,
          currency: "INR",
          active: true,
        },
        { headers }
      );
      setOfferForm({ code: "", title: "", copy: "", discount_value: 10 });
      await load();
      setNote("Offer saved.");
    } catch (err) {
      setNote(err?.message || "Could not save offer");
    }
    setBusy("");
  }

  const totals = stats?.totals || {};
  const journeys = catalog?.journeys || [];
  const landings = catalog?.landings || [];

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <p className={styles.kicker}>Internal</p>
        <h1 className={styles.title}>Marketing OS</h1>
        <p className={styles.sub}>
          Journeys, landing pages, offers, and SMTP sends. Daily cron also drains the queue and checks fare watches.
        </p>

        <div className={styles.row}>
          <input
            className={styles.input}
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <button type="button" className={styles.btn} onClick={load}>
            Refresh
          </button>
          <button type="button" className={styles.btnGhost} onClick={() => runDue(false)} disabled={!!busy}>
            {busy === "due" ? "Running…" : "Run due jobs"}
          </button>
          <button type="button" className={styles.btn} onClick={() => runDue(true)} disabled={!!busy}>
            {busy === "digests" ? "Running…" : "Run due + digests"}
          </button>
        </div>
        {error ? <p className={styles.err}>{error}</p> : null}
        {note ? <p className={styles.ok}>{note}</p> : null}

        <section className={styles.metrics}>
          <div>
            <span>Sent (30d)</span>
            <strong>{totals.sent || 0}</strong>
          </div>
          <div>
            <span>Opens</span>
            <strong>{totals.opens || 0}</strong>
          </div>
          <div>
            <span>Clicks</span>
            <strong>{totals.clicks || 0}</strong>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Campaigns (30 days)</h2>
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
              {(stats?.sends || []).length ? (
                (stats.sends || []).map((r) => (
                  <tr key={r.campaign}>
                    <td>{r.campaign}</td>
                    <td>{r.sent}</td>
                    <td>{r.opens}</td>
                    <td>{r.clicks}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No sends in the last 30 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className={styles.card}>
          <h2>Journeys</h2>
          <ul className={styles.journeyList}>
            {journeys.map((j) => (
              <li key={j.id}>
                <strong>{j.name}</strong>
                <span>{j.trigger}</span>
                <em>{(j.steps || []).join(" · ")}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.card}>
          <h2>Queue ({queue.length} pending)</h2>
          {queue.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Journey</th>
                  <th>Step</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.due_at || "").slice(0, 16).replace("T", " ")}</td>
                    <td>{r.workflow}</td>
                    <td>{r.step}</td>
                    <td>{r.lead_email || r.user_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>Nothing pending. New signups and searches enqueue here.</p>
          )}
        </section>

        <section className={styles.card}>
          <h2>Landing pages</h2>
          <ul className={styles.list}>
            {landings.map((c) => (
              <li key={c.slug}>
                <Link to={`/go/${c.slug}`}>{c.headline}</Link>
                <code>/go/{c.slug}</code>
                {c.offer_code ? <em>{c.offer_code}</em> : null}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            Index: <Link to="/go">/go</Link>
          </p>
        </section>

        <section className={styles.card}>
          <h2>Broadcast</h2>
          <p className={styles.muted}>Sends a live template to a segment. Daily/weekly caps still apply. Max 25 this click.</p>
          <div className={styles.row}>
            <select
              className={styles.input}
              value={broadcastSeg}
              onChange={(e) => setBroadcastSeg(e.target.value)}
            >
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className={styles.input}
              value={broadcastTpl}
              onChange={(e) => setBroadcastTpl(e.target.value)}
            >
              {PREVIEW_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="button" className={styles.btn} onClick={sendBroadcast} disabled={!!busy}>
              {busy === "broadcast" ? "Sending…" : "Send to segment"}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Offers</h2>
          <ul className={styles.list}>
            {offers.map((o) => (
              <li key={o.id}>
                <strong>{o.code}</strong> — {o.title}{" "}
                <em>({o.active ? "active" : "off"})</em>
                <button
                  type="button"
                  className={styles.linkish}
                  onClick={() => toggleOffer(o)}
                  disabled={!!busy}
                >
                  {o.active ? "Turn off" : "Turn on"}
                </button>
              </li>
            ))}
          </ul>
          <form className={styles.offerForm} onSubmit={createOffer}>
            <input
              className={styles.input}
              placeholder="CODE"
              value={offerForm.code}
              onChange={(e) => setOfferForm((f) => ({ ...f, code: e.target.value }))}
              required
            />
            <input
              className={styles.input}
              placeholder="Title"
              value={offerForm.title}
              onChange={(e) => setOfferForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <input
              className={styles.input}
              type="number"
              min="1"
              max="40"
              value={offerForm.discount_value}
              onChange={(e) => setOfferForm((f) => ({ ...f, discount_value: e.target.value }))}
            />
            <input
              className={styles.input}
              placeholder="Copy travellers see"
              value={offerForm.copy}
              onChange={(e) => setOfferForm((f) => ({ ...f, copy: e.target.value }))}
            />
            <button type="submit" className={styles.btn} disabled={!!busy}>
              Save offer
            </button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>Preview to inbox</h2>
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
            {PREVIEW_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.btnGhost}
                onClick={() => sendPreview(t)}
                disabled={!!busy}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
