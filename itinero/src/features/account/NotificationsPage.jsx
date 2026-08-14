import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { useBillingOptional } from "@/features/billing/BillingContext";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { AIRPORTS, findAirportByCode } from "@/constants/airports";
import { useTripsOptional } from "@/features/trips";
import {
  loadAccountPrefs,
  saveAccountPrefs,
} from "@/features/profile/accountPrefs";
import { hydrateAccountFromServer, persistAccountToServer } from "@/features/profile/accountSync";
import {
  addWatch,
  clearFeed,
  formatMoney,
  listFeed,
  listWatches,
  markAlertsRead,
  refreshAllWatches,
  refreshWatch,
  removeWatch,
  syncTripReminders,
} from "./alertService";
import styles from "./AccountPages.module.css";

const SUGGEST = ["BOM", "DEL", "BLR", "HYD", "MAA", "GOI", "DXB", "SIN"]
  .map((code) => findAirportByCode(code) || AIRPORTS.find((a) => a.code === code))
  .filter(Boolean);

export default function NotificationsPage() {
  const { currency } = useCurrency();
  const billing = useBillingOptional();
  const watchLimit = billing?.watchLimit || 8;
  const veroUi = useVeroUiOptional();
  const tripsCtx = useTripsOptional();
  const [prefs, setPrefs] = useState(() => loadAccountPrefs());
  const [watches, setWatches] = useState(() => listWatches());
  const [feed, setFeed] = useState(() => listFeed());
  const [origin, setOrigin] = useState("BOM");
  const [destination, setDestination] = useState("DEL");
  const [formError, setFormError] = useState("");
  const [note, setNote] = useState("");
  const [checkingId, setCheckingId] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);

  const reload = useCallback(() => {
    setWatches(listWatches());
    setFeed(listFeed());
  }, []);

  useEffect(() => {
    markAlertsRead();
    const trips = tripsCtx?.trips || [];
    syncTripReminders(trips);
    import("./alertService")
      .then((m) => m.syncWatchesWithServer?.())
      .then(() => reload())
      .catch(() => reload());
    hydrateAccountFromServer().then((r) => {
      if (r?.ok) setPrefs(loadAccountPrefs());
    });
  }, [tripsCtx?.trips, reload]);

  useEffect(() => {
    veroUi?.setPageContext?.({
      screen: "notifications",
      alerts: {
        watches: watches.length,
        feed: feed.length,
        priceAlerts: Boolean(prefs.priceAlerts),
        tripReminders: Boolean(prefs.tripReminders),
        routes: watches.slice(0, 4).map((w) => `${w.origin}→${w.destination}`),
      },
    });
    return () => veroUi?.clearPageContext?.();
  }, [watches, feed, prefs, veroUi]);

  const patch = (key, value) => {
    const next = saveAccountPrefs({ [key]: value });
    setPrefs(next);
    setNote("Saved.");
    persistAccountToServer({ prefs: next });
  };

  const onAddWatch = async (e) => {
    e.preventDefault();
    setFormError("");
    const res = addWatch({ origin, destination, currency, limit: watchLimit });
    if (!res.ok) {
      setFormError(res.error);
      return;
    }
    reload();
    setNote("Route added - checking live fare…");
    setCheckingId(res.watch.id);
    await refreshWatch(res.watch.id);
    setCheckingId(null);
    reload();
    setNote("Watch is live with a real fare snapshot.");
  };

  const onCheckOne = async (id) => {
    setCheckingId(id);
    setNote("");
    const res = await refreshWatch(id);
    setCheckingId(null);
    reload();
    if (!res.ok) setNote(res.error || "Check failed.");
    else if (res.alert) setNote("Price drop logged.");
    else setNote("Checked - no drop since last snapshot.");
  };

  const onCheckAll = async () => {
    if (!watches.length) return;
    setCheckingAll(true);
    setNote("Checking live fares…");
    const res = await refreshAllWatches();
    setCheckingAll(false);
    reload();
    if (!res.ok) setNote(res.error || "Check failed.");
    else {
      const drops = (res.results || []).filter((r) => r.alert).length;
      setNote(
        drops
          ? `${drops} drop${drops === 1 ? "" : "s"} found.`
          : "Checked all watches - no new drops."
      );
    }
  };

  const airportOptions = useMemo(() => {
    const codes = new Set(SUGGEST.map((a) => a.code));
    const extra = AIRPORTS.filter((a) => a.code && !codes.has(a.code)).slice(0, 40);
    return [...SUGGEST, ...extra];
  }, []);

  return (
    <PageLayout>
      <div className={styles.page}>
        <p className={styles.kicker}>Account</p>
        <h1 className={styles.title}>Alerts</h1>
        <p className={styles.lede}>
          Watch routes with live min fares. Trip reminders use your bookings. We never invent gates
          or boarding status. You can watch up to {watchLimit} route{watchLimit === 1 ? "" : "s"}.
          Need more runway for Vero? <Link to="/plus">Buy credits</Link>.
        </p>

        <section className={styles.prefBlock}>
          <label className={styles.prefRow}>
            <span>
              <strong>Price alerts</strong>
              <span className={styles.prefCopy}>Check watched routes for real fare drops</span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(prefs.priceAlerts)}
              onChange={(e) => patch("priceAlerts", e.target.checked)}
            />
          </label>
          <label className={styles.prefRow}>
            <span>
              <strong>Trip reminders</strong>
              <span className={styles.prefCopy}>Nudge when a booking is within 3 days</span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(prefs.tripReminders)}
              onChange={(e) => {
                patch("tripReminders", e.target.checked);
                if (e.target.checked) {
                  syncTripReminders(tripsCtx?.trips || []);
                  reload();
                }
              }}
            />
          </label>
        </section>

        <section className={styles.watchSection}>
          <div className={styles.sectionHead}>
            <h2>Price watches</h2>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={!prefs.priceAlerts || !watches.length || checkingAll}
              onClick={onCheckAll}
            >
              {checkingAll ? <Loader2 size={15} className={styles.spin} /> : <RefreshCw size={15} />}
              Check all
            </button>
          </div>

          {!prefs.priceAlerts ? (
            <p className={styles.inlineNote}>Turn on Price alerts to add and check watches.</p>
          ) : (
            <form className={styles.watchForm} onSubmit={onAddWatch}>
              <label>
                <span>From</span>
                <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {airportOptions.map((a) => (
                    <option key={`o-${a.code}`} value={a.code}>
                      {a.city} ({a.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>To</span>
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  {airportOptions.map((a) => (
                    <option key={`d-${a.code}`} value={a.code}>
                      {a.city} ({a.code})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={styles.btn}>
                <Plus size={16} aria-hidden /> Watch
              </button>
            </form>
          )}
          {formError ? <p className={styles.errNote}>{formError}</p> : null}

          {watches.length ? (
            <ul className={styles.watchList}>
              {watches.map((w) => (
                <li key={w.id} className={styles.watchRow}>
                  <div>
                    <strong>
                      {w.origin} → {w.destination}
                    </strong>
                    <p>
                      {typeof w.lastPrice === "number"
                        ? `Live min ${formatMoney(w.lastPrice, w.currency)}`
                        : "Not checked yet"}
                      {w.bestDate ? ` · ${w.bestDate}` : ""}
                      {w.lastCheckedAt
                        ? ` · checked ${new Date(w.lastCheckedAt).toLocaleString()}`
                        : ""}
                    </p>
                    {w.lastError ? <p className={styles.errNote}>{w.lastError}</p> : null}
                  </div>
                  <div className={styles.watchActions}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      disabled={!prefs.priceAlerts || checkingId === w.id}
                      onClick={() => onCheckOne(w.id)}
                    >
                      {checkingId === w.id ? (
                        <Loader2 size={14} className={styles.spin} />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Check
                    </button>
                    <Link
                      className={styles.btnGhost}
                      to={`/flights?from=${w.origin}&to=${w.destination}${
                        w.bestDate ? `&depart=${w.bestDate}` : ""
                      }`}
                    >
                      Search
                    </Link>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label="Remove watch"
                      onClick={() => {
                        removeWatch(w.id);
                        reload();
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : prefs.priceAlerts ? (
            <p className={styles.inlineNote}>No watches yet - add a route above.</p>
          ) : null}
        </section>

        <section className={styles.feedSection}>
          <div className={styles.sectionHead}>
            <h2>Activity</h2>
            {feed.length ? (
              <button
                type="button"
                className={styles.textBtn}
                onClick={() => {
                  clearFeed();
                  reload();
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className={styles.inlineNote}>Fare-drop watches sync with your account. This activity list stays on this device.</p>

          {feed.length ? (
            <ul className={styles.feedList}>
              {feed.map((a) => (
                <li key={a.id} className={styles.feedItem}>
                  <div className={styles.feedIcon} aria-hidden>
                    <Bell size={16} />
                  </div>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.body}</p>
                    <p className={styles.feedMeta}>
                      {a.at ? new Date(a.at).toLocaleString() : ""}
                      {a.url ? (
                        <>
                          {" · "}
                          <Link to={a.url}>Open</Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.inlineNote}>
              No alerts yet. Add a watch and hit Check - drops and trip reminders show up here.
            </p>
          )}
        </section>

        {note ? <p className={styles.okNote}>{note}</p> : null}
      </div>
    </PageLayout>
  );
}
