import React from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { EXPLORE_CATALOG, HOME_VIBES } from "@/features/explore/data/catalog";
import { trackInterestEvent } from "@/services/interestTracker";
import styles from "./ExploreVibes.module.css";

const VIBES = HOME_VIBES.map((v) => ({
  ...v,
  count: EXPLORE_CATALOG.filter((d) => (d.themes || []).includes(v.id)).length,
}));

/**
 * Skyscanner-style inspiration - mood tiles into Explore, not another fare dump.
 */
export default function ExploreVibes() {
  const navigate = useNavigate();

  return (
    <section className={styles.section} aria-labelledby="explore-vibes-heading">
      <ScrollReveal delay={0.1}>
        <div className={styles.head}>
          <div>
            <h2 id="explore-vibes-heading" className={styles.title}>
              Get inspired
            </h2>
            <p className={styles.sub}>Pick a vibe — hiking, biking, beaches, and more on Explore.</p>
          </div>
          <button type="button" className={styles.more} onClick={() => navigate("/explore")}>
            Explore everywhere
          </button>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.15}>
        <div className={styles.grid}>
          {VIBES.map((vibe) => (
            <button
              key={vibe.id}
              type="button"
              className={styles.tile}
              onClick={() => {
                trackInterestEvent("vibe_tap", { vibe: vibe.id, theme: vibe.id });
                navigate(`/explore?theme=${encodeURIComponent(vibe.id)}`);
              }}
            >
              <img src={vibe.image} alt="" loading="lazy" />
              <span className={styles.shade} />
              <span className={styles.meta}>
                <strong>{vibe.label}</strong>
                <em>{vibe.count} places</em>
              </span>
            </button>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
