import React, { useEffect, useState } from "react";
import { HOME_VIBES } from "@/features/explore/data/catalog";
import { interestService } from "@/services/interestTracker";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import styles from "./TasteModal.module.css";

const SEEN_KEY = "itinero_taste_modal_seen_v1";

/**
 * Soft post-login taste capture — vibes for mail + site personalization.
 */
export default function TasteModal() {
  const auth = useAuthOptional();
  const user = auth?.user;
  const isAuthenticated = auth?.isAuthenticated;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [isAuthenticated, user]);

  if (!open) return null;

  function toggle(id) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id]
    );
  }

  async function save() {
    setSaving(true);
    try {
      await interestService.put({
        vibes: picked.map((id) => ({ id, weight: 3 })),
        mail_frequency: "daily",
      });
      localStorage.setItem(SEEN_KEY, "1");
      setOpen(false);
    } catch {
      localStorage.setItem(SEEN_KEY, "1");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function skip() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="taste-title">
      <div className={styles.card}>
        <p className={styles.eyebrow}>Welcome aboard</p>
        <h2 id="taste-title" className={styles.title}>
          What trips excite you?
        </h2>
        <p className={styles.sub}>Pick up to 5 — we’ll tune Explore, deals, and your emails.</p>
        <div className={styles.grid}>
          {HOME_VIBES.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`${styles.chip} ${picked.includes(v.id) ? styles.chipOn : ""}`}
              onClick={() => toggle(v.id)}
            >
              <img src={v.image} alt="" />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.skip} onClick={skip}>
            Later
          </button>
          <button
            type="button"
            className={styles.save}
            disabled={!picked.length || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save tastes"}
          </button>
        </div>
      </div>
    </div>
  );
}
