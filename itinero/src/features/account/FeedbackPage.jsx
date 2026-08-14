import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Bug,
  CreditCard,
  Lightbulb,
  Mail,
  MessageCircle,
  Receipt,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { LEGAL, supportMailto } from "@/constants/legal";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import styles from "./FeedbackPage.module.css";

const CATEGORIES = [
  { id: "idea", label: "Idea", Icon: Lightbulb },
  { id: "bug", label: "Bug", Icon: Bug },
  { id: "booking", label: "Booking", Icon: Receipt },
  { id: "payment", label: "Payment", Icon: CreditCard },
  { id: "vero", label: "Vero", Icon: Sparkles },
  { id: "other", label: "Other", Icon: MessageCircle },
];

const MIN_CHARS = 10;
const MAX_CHARS = 4000;

export default function FeedbackPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const auth = useAuthOptional();
  const veroUi = useVeroUiOptional();
  const initialCat = CATEGORIES.some((c) => c.id === params.get("category"))
    ? params.get("category")
    : "idea";
  const [category, setCategory] = useState(initialCat);
  const [rating, setRating] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
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

  const chars = message.trim().length;
  const tooShort = chars > 0 && chars < MIN_CHARS;
  const canSend = chars >= MIN_CHARS && !busy;

  const starLabel = useMemo(() => {
    const n = hoverStar || rating;
    if (!n) return "Optional";
    return `${n} of 5`;
  }, [hoverStar, rating]);

  async function onSubmit(e) {
    e?.preventDefault?.();
    if (!canSend) return;
    setErr("");
    setBusy(true);
    setDone(null);
    try {
      const res = await api.post(ENDPOINTS.FEEDBACK, {
        message: message.trim(),
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

  function resetForm() {
    setDone(null);
    setErr("");
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
          <section className={styles.success} role="status">
            <p className={styles.successKicker}>Received</p>
            <h2>{done.message || "Thanks — we got your feedback."}</h2>
            {done.feedbackId ? (
              <p className={styles.ref}>
                Reference <strong>{done.feedbackId}</strong>
              </p>
            ) : null}
            <p className={styles.successCopy}>
              {email.trim()
                ? "If we need more detail, we’ll reply to the email you left."
                : "No reply needed unless you send another note with an email."}
            </p>
            <div className={styles.successActions}>
              <button type="button" className={styles.ghost} onClick={resetForm}>
                Send another
              </button>
              <Link to="/help" className={styles.ghostLink}>
                Open Help
              </Link>
            </div>
          </section>
        ) : (
          <form className={styles.card} onSubmit={onSubmit}>
            <fieldset className={styles.fieldset}>
              <legend>Category</legend>
              <div className={styles.chips} role="group" aria-label="Feedback category">
                {CATEGORIES.map((c) => {
                  const { Icon } = c;
                  const on = category === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={on ? styles.chipOn : styles.chip}
                      onClick={() => setCategory(c.id)}
                      aria-pressed={on}
                    >
                      <Icon size={15} strokeWidth={2.2} aria-hidden />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>
                How was Itinero? <span className={styles.optional}>{starLabel}</span>
              </legend>
              <div
                className={styles.stars}
                role="radiogroup"
                aria-label="Rating out of 5"
                onMouseLeave={() => setHoverStar(0)}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = (hoverStar || rating) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      className={filled ? styles.starOn : styles.star}
                      onClick={() => setRating((prev) => (prev === n ? 0 : n))}
                      onMouseEnter={() => setHoverStar(n)}
                      onFocus={() => setHoverStar(n)}
                      onBlur={() => setHoverStar(0)}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      aria-checked={rating === n}
                    >
                      <Star size={26} strokeWidth={1.8} fill={filled ? "currentColor" : "none"} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className={styles.label} htmlFor="fb-message">
              Your feedback
            </label>
            <textarea
              id="fb-message"
              className={styles.textarea}
              rows={6}
              maxLength={MAX_CHARS}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should we fix or build?"
            />
            <p className={`${styles.count} ${tooShort ? styles.countWarn : ""}`}>
              {tooShort
                ? `A bit more — ${MIN_CHARS - chars} more character${MIN_CHARS - chars === 1 ? "" : "s"}`
                : `${chars} / ${MAX_CHARS}`}
            </p>

            <label className={styles.label} htmlFor="fb-email">
              Email <span className={styles.optional}>optional — if you want a reply</span>
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

            <button type="submit" className={styles.primary} disabled={!canSend}>
              <Send size={16} aria-hidden />
              {busy ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}

        <section className={styles.contact} aria-label="Email support">
          <h2>Prefer email?</h2>
          <p>
            {LEGAL.supportHours}. {LEGAL.supportSla}. Booking refunds still start in Help or My
            Trips.
          </p>
          <a
            className={styles.emailBtn}
            href={supportMailto({
              subject: "Itinero feedback",
              body: "Category:\nWhat happened:\n",
            })}
          >
            <Mail size={16} strokeWidth={2.2} aria-hidden />
            {LEGAL.supportEmail}
          </a>
        </section>

        <p className={styles.hint}>
          Need a refund or booking fix? Start at <Link to="/help">Help</Link> or{" "}
          <Link to="/trips">My Trips</Link>.
        </p>
      </div>
    </PageLayout>
  );
}
