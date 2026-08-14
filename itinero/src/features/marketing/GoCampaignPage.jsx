import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { interestService, trackInterestEvent } from "@/services/interestTracker";
import { captureAttributionFromUrl } from "@/services/attribution";
import styles from "./GoCampaignPage.module.css";

const FALLBACK = {
  headline: "Discover more, everywhere",
  sub: "Flights, stays, and ready trips with Itinero.",
  image:
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=80",
  cta_label: "Start exploring",
  cta_path: "/explore",
  secondary_label: "Sign up free",
  secondary_path: "/login",
  lead_label: "Get weekend trip ideas by email",
  offer_code: "WELCOME10",
};

/**
 * Acquisition landing — /go index or /go/:slug
 */
export default function GoCampaignPage() {
  const { slug } = useParams();
  const [campaign, setCampaign] = useState(FALLBACK);
  const [landings, setLandings] = useState([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    captureAttributionFromUrl();
    if (!slug) {
      document.title = "Trip ideas | Itinero";
      interestService
        .goList()
        .then((res) => setLandings(Array.isArray(res?.campaigns) ? res.campaigns : []))
        .catch(() => setLandings([]));
      trackInterestEvent("page_view", { page: "go_index" });
      return;
    }
    document.title = `${campaign.headline || "Itinero"} | Itinero`;
    interestService
      .goCampaign(slug)
      .then((res) => {
        if (res?.campaign) {
          setCampaign(res.campaign);
          document.title = `${res.campaign.headline} | Itinero`;
          const og = document.querySelector('meta[property="og:title"]');
          if (og) og.setAttribute("content", res.campaign.headline);
        }
      })
      .catch(() => {});
    trackInterestEvent("page_view", { page: "go", slug });
  }, [slug]);

  async function onLead(e) {
    e.preventDefault();
    setMsg("");
    try {
      const attr = captureAttributionFromUrl();
      await interestService.subscribe({
        email,
        vibes: campaign.vibes || [],
        acq_source: attr.acq_source || "go",
        acq_medium: attr.acq_medium || "landing",
        acq_campaign: campaign.utm_campaign || slug || "go_index",
        landing_path: slug ? `/go/${slug}` : "/go",
      });
      setMsg("You’re in — check your inbox for trip ideas.");
      setEmail("");
    } catch (err) {
      setMsg(err?.message || "Could not subscribe. Try again.");
    }
  }

  if (!slug) {
    return (
      <PageLayout>
        <section className={styles.index}>
          <p className={styles.kicker}>Itinero campaigns</p>
          <h1>Pick a trip idea</h1>
          <p className={styles.indexLead}>
            Weekend hills, beaches, and classic loops. Open a landing, or leave your email for ideas.
          </p>
          <div className={styles.indexGrid}>
            {landings.map((c) => (
              <Link key={c.slug} className={styles.indexCard} to={`/go/${c.slug}`}>
                <span
                  className={styles.indexThumb}
                  style={{ backgroundImage: `url(${c.image})` }}
                />
                <strong>{c.headline}</strong>
                <span>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section
        className={styles.hero}
        style={{
          backgroundImage: `linear-gradient(180deg,rgba(0,20,57,.55),rgba(0,20,57,.75)), url(${campaign.image})`,
        }}
      >
        <div className={styles.inner}>
          <p className={styles.eyebrow}>Itinero</p>
          <h1 className={styles.title}>{campaign.headline}</h1>
          <p className={styles.sub}>{campaign.sub}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} to={campaign.cta_path || "/explore"}>
              {campaign.cta_label || "Explore"}
            </Link>
            <Link className={styles.secondary} to={campaign.secondary_path || "/login"}>
              {campaign.secondary_label || "Sign up"}
            </Link>
          </div>
          {campaign.offer_code ? (
            <p className={styles.offer}>
              Use code <strong>{campaign.offer_code}</strong> on packages
            </p>
          ) : null}
          <form className={styles.lead} onSubmit={onLead}>
            <label htmlFor="go-email" className={styles.leadLabel}>
              {campaign.lead_label || "Get weekend trip ideas by email"}
            </label>
            <div className={styles.leadRow}>
              <input
                id="go-email"
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit">Send ideas</button>
            </div>
            {msg ? <p className={styles.msg}>{msg}</p> : null}
          </form>
        </div>
      </section>
    </PageLayout>
  );
}
