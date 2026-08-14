import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Mail, Sparkles } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { LEGAL, supportMailto } from "@/constants/legal";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useBillingOptional } from "./BillingContext";
import { billingService } from "./billingService";
import styles from "./PlusPage.module.css";

const PACK_RANK = { starter: 1, traveler: 2, explorer: 3, pro: 4 };

function formatPeriodEnd(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function PlusPage() {
  const auth = useAuthOptional();
  const billing = useBillingOptional();
  const navigate = useNavigate();
  const { currency } = useCurrency();
  const [params] = useSearchParams();
  const checkout = params.get("checkout") || "";
  const sessionId = params.get("session_id") || "";
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const signedIn = Boolean(auth?.isAuthenticated && auth?.user?.id);
  const billCur = currency === "INR" ? "INR" : "USD";

  useEffect(() => {
    let cancelled = false;
    billingService.plans(billCur).then((res) => {
      if (!cancelled) setCatalog(res);
    });
    return () => {
      cancelled = true;
    };
  }, [billCur]);

  useEffect(() => {
    if (checkout === "cancel") {
      setNote("Checkout cancelled. Free daily credits still work.");
      return undefined;
    }
    if (checkout !== "success") return undefined;
    let cancelled = false;
    setNote("Thanks — adding credits to your wallet…");
    const finish = async () => {
      let ok = !sessionId;
      let added = 0;
      if (sessionId && signedIn) {
        try {
          const out = await billingService.completeCheckout(sessionId);
          ok = Boolean(out?.ok);
          added = Number(out?.credits || 0);
        } catch {
          ok = false;
        }
      }
      if (!cancelled) {
        await billing?.refresh?.();
        setNote(
          ok
            ? added
              ? `${added} credits added to your wallet.`
              : "You're all set. Credits are in your wallet."
            : "Thanks — Stripe is confirming. Refresh in a moment if the balance hasn’t updated."
        );
      }
    };
    finish();
    return () => {
      cancelled = true;
    };
  }, [checkout, sessionId, signedIn, billing]);

  const allPlans = catalog?.plans || catalog?.packs || [];
  const freePlan = allPlans.find((p) => p.id === "free" || p.plan === "free");
  const paidPlans = allPlans.filter((p) => p.id !== "free" && p.plan !== "free");
  const credits = catalog?.creditExplainer;

  const startCheckout = async (packId) => {
    setError("");
    if (!signedIn) {
      navigate("/login?next=/plus");
      return;
    }
    if (!packId || packId === "free") {
      navigate("/vero");
      return;
    }
    setBusy(packId);
    try {
      const out = await billingService.checkout({ packId, currency: billCur, interval: "month" });
      if (out?.upgraded) {
        await billing?.refresh?.();
        setNote(out.message || "Switched to a larger pack.");
        return;
      }
      if (out?.url) {
        window.location.assign(out.url);
        return;
      }
      setError(out?.message || "Could not start checkout.");
    } catch (err) {
      setError(err?.message || "Could not start checkout.");
    } finally {
      setBusy("");
    }
  };

  const configured = catalog?.billingConfigured !== false;

  const wallet = useMemo(() => {
    const c = billing?.credits;
    if (!c) return null;
    const daily = typeof c.dailyRemaining === "number" ? c.dailyRemaining : c.remaining;
    const bal = typeof c.walletBalance === "number" ? c.walletBalance : 0;
    const allow = c.allowance;
    return { daily, bal, allow, total: c.remaining ?? daily + bal };
  }, [billing?.credits]);

  const hasAutocard = Boolean(billing?.hasAutocard);
  const activePackId = billing?.activePackId || "";
  const activePackName = billing?.activePackName || "";
  const activeRank = PACK_RANK[activePackId] || 0;
  const periodEnd = formatPeriodEnd(billing?.currentPeriodEnd);

  const openPortal = async () => {
    setError("");
    setBusy("portal");
    try {
      const out = await billingService.portal();
      if (out?.url) {
        window.location.assign(out.url);
        return;
      }
      setError(out?.message || "Could not open billing portal.");
    } catch (err) {
      setError(err?.message || "Could not open billing portal.");
    } finally {
      setBusy("");
    }
  };

  const packButton = (p) => {
    const rank = PACK_RANK[p.id] || 0;
    const isCurrent = Boolean(activeRank && rank && rank === activeRank);
    const isLower = Boolean(activeRank && rank && rank < activeRank);
    const isUpgrade = Boolean(activeRank && rank && rank > activeRank);
    const locked = isCurrent || isLower;
    return { isCurrent, isLower, isUpgrade, locked };
  };

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <p className={styles.kicker}>Billing</p>
        <h1>Vero credits</h1>
        <p className={styles.lead}>
          {catalog?.copy ||
            "Free daily credits for every traveler. Need more? Pick a pack. Search and book never need credits."}
        </p>

        <section className={styles.panel} aria-label="Credit balance">
          <p className={styles.panelLabel}>Balance</p>
          {wallet ? (
            <div className={styles.balanceRow}>
              <div>
                <strong>{wallet.daily}{wallet.allow != null ? `/${wallet.allow}` : ""}</strong>
                <span>Free today</span>
              </div>
              <div>
                <strong>{wallet.bal}</strong>
                <span>Wallet</span>
              </div>
              <div>
                <strong>{wallet.total}</strong>
                <span>Total left</span>
              </div>
            </div>
          ) : (
            <p className={styles.panelCopy}>
              {freePlan?.blurb || "Vero is free every day. Get extra credits when you need them."}
            </p>
          )}
          {credits ? (
            <p className={styles.panelHint}>
              Chat / plan = {credits.chatCost} · live search via Vero = {credits.liveSearchCost}.{" "}
              {credits.rule}
            </p>
          ) : null}
          <Link to="/vero" className={styles.textLink}>
            <Sparkles size={14} aria-hidden /> Talk to Vero
          </Link>
        </section>

        {hasAutocard ? (
          <section className={styles.panel} aria-label="Current pack">
            <div className={styles.panelHead}>
              <p className={styles.panelLabel}>Current pack</p>
              <button
                type="button"
                className={styles.linkish}
                onClick={openPortal}
                disabled={!!busy}
              >
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </button>
            </div>
            <p className={styles.currentName}>
              <CreditCard size={18} aria-hidden />
              {activePackName || "Active pack"}
            </p>
            <p className={styles.panelCopy}>
              {billing?.cancelAtPeriodEnd
                ? periodEnd
                  ? `Service ends ${periodEnd}.`
                  : "Set to stop at period end."
                : periodEnd
                  ? `Next refresh ${periodEnd}. Same or smaller packs stay locked this cycle.`
                  : "Same or smaller packs stay locked this cycle. Switch up for more credits."}
            </p>
          </section>
        ) : null}

        {catalog?.stripeMode === "test" ? (
          <p className={styles.ops}>Sandbox billing — test checkout uses test cards only.</p>
        ) : null}
        {note ? <p className={styles.note}>{note}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <h2 className={styles.sectionTitle}>Packs</h2>
        <div className={styles.grid}>
          {paidPlans.map((p) => {
            const { isCurrent, isUpgrade, locked } = packButton(p);
            return (
              <article
                key={p.id}
                className={`${styles.card} ${p.highlighted ? styles.highlight : ""} ${isCurrent ? styles.current : ""}`}
                data-plan={p.plan || p.id}
              >
                <div className={styles.cardTop}>
                  <p className={styles.planKicker}>{p.name}</p>
                  {isCurrent ? (
                    <span className={styles.badge}>Current</span>
                  ) : p.badge ? (
                    <span className={styles.badge}>{p.badge}</span>
                  ) : null}
                </div>
                <p className={styles.price}>
                  <strong>{p.price?.formatted || "—"}</strong>
                  {p.credits ? <span>· {p.credits} credits</span> : null}
                </p>
                {p.perCredit?.formatted ? (
                  <p className={styles.effective}>{p.perCredit.formatted}</p>
                ) : null}
                {p.blurb ? <p className={styles.blurb}>{p.blurb}</p> : null}
                <ul>
                  {(p.features || []).map((f) => (
                    <li key={f}>
                      <Check size={14} aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={p.highlighted && !locked ? styles.cta : styles.ghostBtn}
                  onClick={() => startCheckout(p.id)}
                  disabled={!!busy || !configured || locked}
                >
                  {!configured
                    ? "Billing not configured yet"
                    : !signedIn
                      ? "Sign in to buy"
                      : locked
                        ? isCurrent
                          ? "This pack"
                          : `Smaller than ${activePackName || "current"}`
                        : busy === p.id
                          ? isUpgrade
                            ? "Switching…"
                            : "Redirecting…"
                          : isUpgrade
                            ? `Switch to ${p.name}`
                            : p.cta || "Buy credits"}
                </button>
              </article>
            );
          })}
          <article className={`${styles.card} ${styles.ultra}`}>
            <div className={styles.cardTop}>
              <p className={styles.planKicker}>itinero ultra</p>
              <span className={styles.badge}>Custom</span>
            </div>
            <p className={styles.price}>
              <strong>Talk to us</strong>
            </p>
            <p className={styles.blurb}>
              Need more than Pro — teams, high volume, or a custom pack. We set it up by email.
            </p>
            <ul>
              <li>
                <Check size={14} aria-hidden />
                Custom credit volume
              </li>
              <li>
                <Check size={14} aria-hidden />
                Credits never expire
              </li>
              <li>
                <Check size={14} aria-hidden />
                Reach us at {LEGAL.supportEmail}
              </li>
            </ul>
            <a
              className={styles.cta}
              href={supportMailto({
                subject: "Itinero Ultra credits",
                body: "Hi Itinero — I need more Vero credits than the Pro pack.",
              })}
            >
              <Mail size={14} aria-hidden /> Email {LEGAL.supportEmail}
            </a>
          </article>
        </div>

        <p className={styles.fine}>
          Vero stays free every day. Credits stay in your wallet.{" "}
          {hasAutocard ? (
            <>
              <button type="button" className={styles.linkish} onClick={openPortal} disabled={!!busy}>
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </button>
              {" · "}
            </>
          ) : null}
          <Link to="/rewards">Rewards</Link>
          {" · "}
          <Link to="/terms">Terms</Link>
        </p>
      </div>
    </PageLayout>
  );
}
