import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageSquareHeart, Send } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { useAuthOptional } from "@/features/auth/hooks/useAuth";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import styles from "./FeedbackPage.module.css";

const CATEGORIES = [
  { id: "idea", label: "Idea" },
  { id: "bug", label: "Bug" },
  { id: "booking", label: "Booking" },
  { id: "payment", label: "Payment" },
  { id: "vero", label: "Vero" },
  { id: "other", label: "Other" },
];

export default function FeedbackPage() {
  const location = useLocation();
  const auth = useAuthOptional();
  const veroUi = useVeroUiOptional();
  const [category, setCategory] = useState("idea");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(auth?.user?.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (auth?.user?.email) setEmail(auth.user.email);
  }, [auth?.user?.email]);
  useEffect(() => {
    veroUi?.setPageContext?.({
      screen: "feedback",
      feedback: { category },
    });
    return () => veroUi?.clearPageContext?.();
  }, [category, veroUi]);

  async function onSubmit(e) {
    e?.preventDefault?.();
    setErr("");
    setBusy(true);
    setDone(null);
    try {
      const res = await api.post(ENDPOINTS.FEEDBACK, {
        message,
        email: email.trim() || undefined,
        category,
        rating: rating > 0 ? rating : undefined,
        page_path: location.pathname || "/feedback",
      });
      if (!res?.ok) {
        throw new Error(res?.message || res?.error || "Could not send feedback.");
      }
      setDone(res);
      setMessage("");
      setRating(0);
    } catch (ex) {
      setErr(ex?.message || "Could not send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout>
      <div className={styles.page}>
        <header className={styles.head}>
          <p className={styles.kicker}>Product</p>
          <h1 className={styles.title}>Feedback</h1>
          <p className={styles.lede}>
            Tell us what worked, what broke, or what you want next. Booking disputes still go
            through <Link to="/help">Help</Link>.
          </p>
        </header>

        {done ? (
          <div className={styles.success} role="status">
            <MessageSquareHeart size={22} aria-hidden />
            <div>
              <strong>{done.message || "Thanks — we got your feedback."}</strong>
              {done.feedbackId ? (
                <p className={styles.fine}>Reference {done.feedbackId}</p>
              ) : null}
            </div>
            <button type="button" className={styles.ghost} onClick={() => setDone(null)}>
              Send another
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={onSubmit}>
            <fieldset className={styles.fieldset}>
              <legend>Category</legend>
              <div className={styles.chips} role="group" aria-label="Feedback category">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={category === c.id ? styles.chipOn : styles.chip}
                    onClick={() => setCategory(c.id)}
                    aria-pressed={category === c.id}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>How was Itinero? (optional)</legend>
              <div className={styles.stars} role="group" aria-label="Rating out of 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={rating >= n ? styles.starOn : styles.star}
                    onClick={() => setRating((prev) => (prev === n ? 0 : n))}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    aria-pressed={rating >= n}
                  >
                    ★
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.label} htmlFor="fb-message">
              Your feedback
            </label>
            <textarea
              id="fb-message"
              className={styles.textarea}
              rows={6}
              maxLength={4000}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should we fix or build?"
            />

            <label className={styles.label} htmlFor="fb-email">
              Email (optional — if you want a reply)
            </label>
            <input
              id="fb-email"
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
            />

            {err ? (
              <p className={styles.err} role="alert">
                {err}
              </p>
            ) : null}

            <button type="submit" className={styles.primary} disabled={busy || message.trim().length < 10}>
              <Send size={16} aria-hidden />
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}

        <p className={styles.hint}>
          Need a refund or booking fix? Start at <Link to="/help">Help</Link> or{" "}
          <Link to="/trips">My Trips</Link>.
        </p>
      </div>
    </PageLayout>
  );
}
