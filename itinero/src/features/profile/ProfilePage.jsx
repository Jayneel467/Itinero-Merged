import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  Bus,
  ChevronRight,
  Compass,
  CreditCard,
  Gift,
  Globe2,
  Hotel,
  Languages,
  LifeBuoy,
  MessageSquareHeart,
  MapPin,
  Package,
  Plane,
  Radar,
  ShieldCheck,
  Sparkles,
  TrainFront,
  UserRound,
  Users,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import RegionalModal from "@/components/shared/RegionalModal";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useLanguage } from "@/context/LanguageContext";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { readLocalUser } from "@/features/auth/session";
import { listSaved, onSavedChange } from "@/features/account/savedService";
import ProfileInterests from "@/features/profile/ProfileInterests";
import {
  MAX_TRAVELLERS,
  loadSavedPaxStore,
} from "@/features/booking/utils/savedTravellers";
import { useTripsOptional } from "@/features/trips";
import { loadAccountPrefs, saveAccountPrefs } from "./accountPrefs";
import { hydrateAccountFromServer, persistAccountToServer } from "./accountSync";
import TravellersSection from "./TravellersSection";
import "./ProfilePage.css";

function tripTitle(t) {
  return t?.title || t?.routeLabel || t?.summary || "Trip";
}

function tripStatus(t) {
  return String(t?.status || "draft").toLowerCase();
}

function isUpcoming(t) {
  const st = tripStatus(t);
  if (["cancelled", "abandoned", "failed"].includes(st)) return false;
  const date =
    t?.departDate ||
    t?.legs?.[0]?.departDate ||
    t?.checkIn ||
    t?.hotel?.checkIn ||
    "";
  if (!date) return ["confirmed", "held", "paid", "draft"].includes(st);
  try {
    const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d >= today;
  } catch {
    return true;
  }
}

/**
 * Best-in-class account hub - trips, travellers, prefs, saved, support.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const veroUi = useVeroUiOptional();
  const tripsCtx = useTripsOptional();
  const { currency, symbol, setCurrency } = useCurrency();
  const { language, languageName, languageFlag, setLanguage } = useLanguage();
  const home = useHomeLocationOptional();
  const user = auth?.user || readLocalUser();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newsletter, setNewsletter] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [regionalOpen, setRegionalOpen] = useState(false);
  const [regionalTab, setRegionalTab] = useState("currency");
  const [prefs, setPrefs] = useState(() => loadAccountPrefs());
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [paxTick, setPaxTick] = useState(0);
  const [savedTick, setSavedTick] = useState(0);

  const trips = tripsCtx?.trips || [];

  useEffect(() => {
    if (!user) {
      setName("");
      setPhone("");
      setNewsletter(true);
      return;
    }
    setName(user.name || user.displayName || "");
    setPhone(String(user.mobileNumber || user.phone || "").replace(/\D/g, "").slice(-10));
    setNewsletter(user.newsletter !== false);
  }, [user]);

  useEffect(() => {
    if (!auth?.isAuthenticated) return undefined;
    let cancelled = false;
    hydrateAccountFromServer().then(() => {
      if (cancelled) return;
      setPrefs(loadAccountPrefs());
      setPaxTick((n) => n + 1);
      setSavedTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [auth?.isAuthenticated]);

  useEffect(() => {
    veroUi?.setPageContext?.({
      screen: "profile",
      profile: {
        name: user?.name || null,
        email: user?.email || null,
        signed_in: Boolean(user?.id || user?.email),
      },
    });
    return () => veroUi?.clearPageContext?.();
  }, [user, veroUi]);

  useEffect(() => {
    const onFocus = () => {
      setPaxTick((n) => n + 1);
      setSavedTick((n) => n + 1);
      tripsCtx?.refresh?.();
    };
    window.addEventListener("focus", onFocus);
    const stopSaved = onSavedChange(() => setSavedTick((n) => n + 1));
    return () => {
      window.removeEventListener("focus", onFocus);
      stopSaved();
    };
  }, [tripsCtx]);

  const display = useMemo(() => {
    if (!user) {
      return { name: "Guest traveller", email: "", initials: "G", signedIn: false };
    }
    const full =
      user.name ||
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      "Itinero member";
    return {
      name: full,
      email: user.email || "",
      initials: full
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      signedIn: true,
      memberId: user.id ? String(user.id).slice(-8).toUpperCase() : null,
    };
  }, [user]);

  const travellersCount = useMemo(() => {
    void paxTick;
    return loadSavedPaxStore().passengers.length;
  }, [paxTick]);

  const savedItems = useMemo(() => {
    void savedTick;
    return listSaved();
  }, [savedTick]);

  const upcoming = useMemo(
    () =>
      [...trips]
        .filter(isUpcoming)
        .sort((a, b) =>
          String(a.departDate || a.updatedAt || "").localeCompare(
            String(b.departDate || b.updatedAt || "")
          )
        ),
    [trips]
  );

  const nextTrip = upcoming[0] || null;
  const recentTrips = useMemo(() => [...trips].slice(0, 3), [trips]);
  const langLabel = languageName;

  const stats = [
    { label: "Trips", value: trips.length, to: "/trips" },
    { label: "Upcoming", value: upcoming.length, to: "/trips" },
    { label: "Saved", value: savedItems.length, to: "/saved" },
    { label: "Travellers", value: travellersCount, to: "#travellers" },
  ];

  const handleLogout = async () => {
    if (auth?.logout) await auth.logout();
    navigate("/login");
  };

  const openVero = (prompt) => {
    if (veroUi?.openVero) {
      veroUi.openVero(
        prompt
          ? { prompt, source: "profile", forceNew: true }
          : { source: "profile" }
      );
      return;
    }
    navigate("/vero");
  };

  const openRegional = (tab) => {
    setRegionalTab(tab);
    setRegionalOpen(true);
  };

  const saveProfile = async () => {
    if (!auth?.updateProfile) {
      setSaveErr("Sign in again to update your profile.");
      return;
    }
    if (!name.trim()) {
      setSaveErr("Name can’t be empty.");
      return;
    }
    setBusy(true);
    setSaveErr("");
    setSaveMsg("");
    try {
      const res = await auth.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        newsletter,
      });
      setSaveMsg(res?.message || "Saved.");
      setEditing(false);
    } catch (err) {
      setSaveErr(err?.message || "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = () => {
    const next = saveAccountPrefs({
      homeAirport: String(prefs.homeAirport || "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 3),
      homeCity: String(prefs.homeCity || "").trim().slice(0, 40),
      priceAlerts: Boolean(prefs.priceAlerts),
      tripReminders: Boolean(prefs.tripReminders),
      gstin: String(prefs.gstin || "").trim().toUpperCase().slice(0, 15),
      companyName: String(prefs.companyName || "").trim().slice(0, 80),
      invoiceEmail: String(prefs.invoiceEmail || "").trim().slice(0, 120),
    });
    setPrefs(next);
    setEditingPrefs(false);
    setSaveMsg(auth?.isAuthenticated ? "Travel preferences saved to your account." : "Travel preferences saved on this device.");
    persistAccountToServer({ prefs: next });
  };

  const products = [
    { to: "/flights", title: "Flights", copy: "Live fares worldwide", Icon: Plane, tone: "toneOrange" },
    { to: "/hotels", title: "Hotels", copy: "Stays for every trip", Icon: Hotel, tone: "toneNavy" },
    {
      to: "/trains",
      title: "Trains",
      copy: "IRCTC corridors · India",
      Icon: TrainFront,
      tone: "toneMint",
      indiaOnly: true,
    },
    { to: "/transits", title: "Transits", copy: "Bus, metro, city GO", Icon: Bus, tone: "toneSky" },
    { to: "/packages", title: "Packages", copy: "Curated getaways", Icon: Package, tone: "toneOrange" },
    { to: "/explore", title: "Explore", copy: "Dream destinations", Icon: Compass, tone: "toneNavy" },
    { to: "/flights/track", title: "Flight track", copy: "Live status", Icon: Radar, tone: "toneSky" },
    { to: "/events", title: "Events", copy: "What’s on nearby", Icon: Gift, tone: "toneMint" },
  ].filter(
    (p) =>
      !p.indiaOnly ||
      isTrainsMarket({
        countryCode: home?.countryCode,
        passportCountry: home?.passportCountry,
      })
  );

  const hubLinks = [
    { to: "/trips", title: "My trips", copy: "Bookings, tickets, cancel & refunds", Icon: Briefcase, tone: "toneOrange" },
    { to: "/plus", title: "Vero credits", copy: "Free daily · buy packs anytime", Icon: Sparkles, tone: "toneOrange" },
    { to: "/rewards", title: "Itinero Rewards", copy: "Points balance, earn & redeem", Icon: Sparkles, tone: "toneOrange" },
    { to: "/saved", title: "Saved", copy: "Ideas you want to come back to", Icon: Bookmark, tone: "toneNavy" },
    { to: "/notifications", title: "Alerts", copy: "Price drops and trip reminders", Icon: Bell, tone: "toneSky" },
    { to: "/help", title: "Help & support", copy: "Vero + email - no fake 24/7 phone", Icon: LifeBuoy, tone: "toneMint" },
    { to: "/feedback", title: "Feedback", copy: "Ideas, bugs, and product notes", Icon: MessageSquareHeart, tone: "toneSky" },
  ];

  return (
    <PageLayout>
      <section className="profile-page">
        <header className="hero">
          <p className="kicker">Account</p>
          <div className="heroMain">
            <div className="avatar" aria-hidden>
              {display.initials}
            </div>
            <div className="identityBody">
              <h1 className="heroTitle">
                {display.signedIn ? display.name.split(" ")[0] : "Guest"}
              </h1>
              {display.email ? <p className="meta">{display.email}</p> : null}
              {phone ? <p className="meta">+91 {phone}</p> : null}
              <p className="heroLede">
                {display.signedIn
                  ? "Your trips, travellers, and preferences."
                  : "Sign in to sync profile details across devices."}
              </p>
            </div>
            <div className="heroCtas">
              <Link className="btnPrimary" to="/trips">
                My trips
              </Link>
              <button
                type="button"
                className="btnSoft"
                onClick={() =>
                  openVero(
                    "I'm on my account page. Help me with trips, travellers, or the next booking - open the right page on the left when needed."
                  )
                }
              >
                Ask Vero
              </button>
              {!display.signedIn ? (
                <button type="button" className="btnSoft" onClick={() => navigate("/login")}>
                  Sign in
                </button>
              ) : null}
            </div>
          </div>

          <div className="stats" aria-label="Account summary">
            {stats.map((s, i) => (
              <React.Fragment key={s.label}>
                {i > 0 ? <span className="statSep" aria-hidden>·</span> : null}
                {s.to.startsWith("#") ? (
                  <a className="stat" href={s.to}>
                    <strong>{s.value}</strong> {s.label.toLowerCase()}
                  </a>
                ) : (
                  <Link className="stat" to={s.to}>
                    <strong>{s.value}</strong> {s.label.toLowerCase()}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>
        </header>

        {!display.signedIn ? (
          <p className="guestNote">
            Sign in to sync travellers and preferences across devices. Trips on this browser stay available either way.
          </p>
        ) : (
          <p className="guestNote">Travellers and travel preferences sync to your signed-in account.</p>
        )}

        <nav className="jumpNav" aria-label="Account sections">
          {[
            ["#overview", "Overview"],
            ["#details", "Details"],
            ["#travellers", "Travellers"],
            ["#preferences", "Preferences"],
            ["#security", "Security"],
            ["#explore", "Book"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="jumpPill">
              {label}
            </a>
          ))}
        </nav>

        <div id="overview" className="section">
          <div className="sectionHead">
            <h2 className="sectionTitle">Overview</h2>
          </div>

          {nextTrip ? (
            <Link to={`/trips/${nextTrip.id}`} className="spotlight">
              <div>
                <p className="spotlightKicker">Next trip</p>
                <p className="spotlightTitle">{tripTitle(nextTrip)}</p>
                <p className="spotlightMeta">
                  {tripStatus(nextTrip)}
                  {nextTrip.departDate ? ` · ${nextTrip.departDate}` : ""}
                </p>
              </div>
              <span className="spotlightCta">
                Open <ChevronRight size={16} aria-hidden />
              </span>
            </Link>
          ) : (
            <div className="spotlight emptySpot">
              <div>
                <p className="spotlightKicker">Next trip</p>
                <p className="spotlightTitle">Nothing upcoming yet</p>
                <p className="spotlightMeta">Book flights, hotels, or ask Vero to plan.</p>
              </div>
              <button type="button" className="btnPrimary" onClick={() => openVero("Plan my next trip.")}>
                Plan with Vero
              </button>
            </div>
          )}

          <div className="splitGrid">
            <div className="panel">
              <div className="panelHead">
                <h3>Recent trips</h3>
                <Link to="/trips">See all</Link>
              </div>
              {recentTrips.length ? (
                <ul className="miniList">
                  {recentTrips.map((t) => (
                    <li key={t.id}>
                      <Link to={`/trips/${t.id}`}>
                        <strong>{tripTitle(t)}</strong>
                        <span>{tripStatus(t)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="emptyCopy">Your bookings will show up here.</p>
              )}
            </div>

            <div className="panel">
              <div className="panelHead">
                <h3>Saved</h3>
                <Link to="/saved">See all</Link>
              </div>
              {savedItems.length ? (
                <ul className="miniList">
                  {savedItems.slice(0, 3).map((row) => (
                    <li key={row.id}>
                      <Link to={row.url || "/explore"}>
                        <strong>{row.title}</strong>
                        <span>{row.subtitle || row.type}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="emptyCopy">
                  Bookmark destinations from Explore - they land here.
                </p>
              )}
            </div>
          </div>

          <div className="list hubList">
            {hubLinks.map(({ to, title, copy, Icon, tone }) => (
              <Link key={to} to={to} className="linkRow">
                <span className={`iconTile ${tone}`}>
                  <Icon size={20} strokeWidth={2.2} aria-hidden />
                </span>
                <span>
                  <p className="linkTitle">{title}</p>
                  <p className="linkCopy">{copy}</p>
                </span>
                <ChevronRight className="chevron" size={18} aria-hidden />
              </Link>
            ))}
          </div>
        </div>

        {display.signedIn ? (
          <div id="details" className="section">
            <div className="sectionHead">
              <h2 className="sectionTitle">Personal details</h2>
              {!editing ? (
                <button type="button" className="textBtn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  className="textBtn"
                  onClick={() => {
                    setEditing(false);
                    setSaveErr("");
                    setName(user?.name || user?.displayName || "");
                    setPhone(
                      String(user?.mobileNumber || user?.phone || "")
                        .replace(/\D/g, "")
                        .slice(-10)
                    );
                  }}
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="detailCard">
              <div className="detailRow">
                <span className="detailLabel">
                  <UserRound size={16} aria-hidden /> Name
                </span>
                {editing ? (
                  <input
                    className="detailInput"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 80))}
                    placeholder="Your name"
                  />
                ) : (
                  <span className="detailValue">{name || "-"}</span>
                )}
              </div>
              <div className="detailRow">
                <span className="detailLabel">
                  <Globe2 size={16} aria-hidden /> Email
                </span>
                <span className="detailValue">{display.email || "-"}</span>
              </div>
              <div className="detailRow">
                <span className="detailLabel">
                  <Users size={16} aria-hidden /> Mobile
                </span>
                {editing ? (
                  <input
                    className="detailInput"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile (optional)"
                  />
                ) : (
                  <span className="detailValue">{phone ? `+91 ${phone}` : "Not added yet"}</span>
                )}
              </div>
              {editing ? (
                <div className="detailActions">
                  <button type="button" className="btnPrimary" disabled={busy} onClick={saveProfile}>
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              ) : null}
              {saveMsg ? <p className="okNote">{saveMsg}</p> : null}
              {saveErr ? <p className="errNote">{saveErr}</p> : null}
            </div>
          </div>
        ) : null}

        <div id="travellers" className="section">
          <div className="sectionHead">
            <h2 className="sectionTitle">Travellers</h2>
            <span className="sectionHint">
              {travellersCount}/{MAX_TRAVELLERS} saved
            </span>
          </div>
          <TravellersSection />
        </div>

        <div id="preferences" className="section">
          <div className="sectionHead">
            <h2 className="sectionTitle">Preferences</h2>
            {!editingPrefs ? (
              <button type="button" className="textBtn" onClick={() => setEditingPrefs(true)}>
                Edit
              </button>
            ) : (
              <button type="button" className="textBtn" onClick={() => { setEditingPrefs(false); setPrefs(loadAccountPrefs()); }}>
                Cancel
              </button>
            )}
          </div>

          <div className="list">
            <button type="button" className="linkRow" onClick={() => openRegional("currency")}>
              <span className="iconTile toneOrange">
                <CreditCard size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <span>
                <p className="linkTitle">Currency</p>
                <p className="linkCopy">
                  {symbol} {currency} · fares and stays
                </p>
              </span>
              <ChevronRight className="chevron" size={18} aria-hidden />
            </button>
            <button type="button" className="linkRow" onClick={() => openRegional("language")}>
              <span className="iconTile toneSky">
                <Languages size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <span>
                <p className="linkTitle">Language</p>
                <p className="linkCopy">{langLabel}</p>
              </span>
              <ChevronRight className="chevron" size={18} aria-hidden />
            </button>
          </div>

          <div className="detailCard prefsCard">
            <div className="detailRow">
              <span className="detailLabel">
                <MapPin size={16} aria-hidden /> Home airport
              </span>
              {editingPrefs ? (
                <input
                  className="detailInput"
                  value={prefs.homeAirport}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      homeAirport: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3),
                    }))
                  }
                  placeholder="BOM"
                  maxLength={3}
                />
              ) : (
                <span className="detailValue">{prefs.homeAirport || "Not set"}</span>
              )}
            </div>
            <div className="detailRow">
              <span className="detailLabel">
                <Building2 size={16} aria-hidden /> Home city
              </span>
              {editingPrefs ? (
                <input
                  className="detailInput"
                  value={prefs.homeCity}
                  onChange={(e) => setPrefs((p) => ({ ...p, homeCity: e.target.value.slice(0, 40) }))}
                  placeholder="Mumbai"
                />
              ) : (
                <span className="detailValue">{prefs.homeCity || "Not set"}</span>
              )}
            </div>

            <label className="toggleRow inCard">
              <span className="toggleCopy">
                <p className="linkTitle">Price alerts</p>
                <p className="linkCopy">Watch routes you care about</p>
              </span>
              <input
                type="checkbox"
                checked={Boolean(prefs.priceAlerts)}
                disabled={!editingPrefs}
                onChange={(e) => setPrefs((p) => ({ ...p, priceAlerts: e.target.checked }))}
              />
            </label>
            <label className="toggleRow inCard">
              <span className="toggleCopy">
                <p className="linkTitle">Trip reminders</p>
                <p className="linkCopy">Check-in and departure nudges</p>
              </span>
              <input
                type="checkbox"
                checked={Boolean(prefs.tripReminders)}
                disabled={!editingPrefs}
                onChange={(e) => setPrefs((p) => ({ ...p, tripReminders: e.target.checked }))}
              />
            </label>
            {display.signedIn ? (
              <label className="toggleRow inCard">
                <span className="toggleCopy">
                  <p className="linkTitle">Deal emails</p>
                  <p className="linkCopy">itinero favourites and trip ideas</p>
                </span>
                <input
                  type="checkbox"
                  checked={newsletter}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setNewsletter(next);
                    if (!auth?.updateProfile) return;
                    try {
                      await auth.updateProfile({ newsletter: next });
                      setSaveMsg(next ? "Deal emails on." : "Deal emails off.");
                    } catch (err) {
                      setNewsletter(!next);
                      setSaveErr(err?.message || "Could not update.");
                    }
                  }}
                />
              </label>
            ) : null}

            <div id="interests" className="section" style={{ marginTop: 8 }}>
              <div className="sectionHead">
                <h2 className="sectionTitle">Travel tastes</h2>
              </div>
              <p className="linkCopy" style={{ marginBottom: 12 }}>
                Powers your digest emails and Explore ranking. Pick vibes you love.
              </p>
              <ProfileInterests />
            </div>

            <p className="prefsSubhead">Invoice (optional)</p>
            <div className="detailRow">
              <span className="detailLabel">Company</span>
              {editingPrefs ? (
                <input
                  className="detailInput"
                  value={prefs.companyName}
                  onChange={(e) => setPrefs((p) => ({ ...p, companyName: e.target.value.slice(0, 80) }))}
                  placeholder="Company name"
                />
              ) : (
                <span className="detailValue">{prefs.companyName || "-"}</span>
              )}
            </div>
            <div className="detailRow">
              <span className="detailLabel">GSTIN</span>
              {editingPrefs ? (
                <input
                  className="detailInput"
                  value={prefs.gstin}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15),
                    }))
                  }
                  placeholder="15-character GSTIN"
                />
              ) : (
                <span className="detailValue">{prefs.gstin || "-"}</span>
              )}
            </div>
            <div className="detailRow">
              <span className="detailLabel">Invoice email</span>
              {editingPrefs ? (
                <input
                  className="detailInput"
                  type="email"
                  value={prefs.invoiceEmail}
                  onChange={(e) => setPrefs((p) => ({ ...p, invoiceEmail: e.target.value.slice(0, 120) }))}
                  placeholder="accounts@company.com"
                />
              ) : (
                <span className="detailValue">{prefs.invoiceEmail || "-"}</span>
              )}
            </div>

            {editingPrefs ? (
              <div className="detailActions">
                <button type="button" className="btnPrimary" onClick={savePrefs}>
                  Save preferences
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div id="security" className="section">
          <div className="sectionHead">
            <h2 className="sectionTitle">Payments & security</h2>
          </div>
          <div className="list">
            <div className="infoRow">
              <span className="iconTile toneNavy">
                <CreditCard size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <span>
                <p className="linkTitle">Payment methods</p>
                <p className="linkCopy">
                  UPI and cards are entered securely at checkout. We don’t store card numbers on this page.
                </p>
              </span>
            </div>
            <div className="infoRow">
              <span className="iconTile toneMint">
                <ShieldCheck size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <span>
                <p className="linkTitle">Sign-in</p>
                <p className="linkCopy">
                  {display.signedIn
                    ? "Protected with email OTP. No password to leak."
                    : "Use email OTP when you’re ready."}
                </p>
              </span>
            </div>
            <div className="infoRow isMuted">
              <span className="iconTile toneSky">
                <Globe2 size={20} strokeWidth={2.2} aria-hidden />
              </span>
              <span>
                <p className="linkTitle">Google</p>
                <p className="linkCopy">One-tap Google sign-in is next.</p>
              </span>
              <span className="soonPill">Soon</span>
            </div>
          </div>
        </div>

        <div id="explore" className="section">
          <div className="sectionHead">
            <h2 className="sectionTitle">Book & explore</h2>
          </div>
          <div className="productGrid">
            {products.map(({ to, title, copy, Icon, tone }) => (
              <Link key={to} to={to} className="productCard">
                <span className={`iconTile ${tone}`}>
                  <Icon size={18} strokeWidth={2.2} aria-hidden />
                </span>
                <strong>{title}</strong>
                <span>{copy}</span>
              </Link>
            ))}
            <button
              type="button"
              className="productCard"
              onClick={() => openVero("Plan something great for me.")}
            >
              <span className="iconTile toneOrange">
                <Sparkles size={18} strokeWidth={2.2} aria-hidden />
              </span>
              <strong>Ask Vero</strong>
              <span>Your travel agent</span>
            </button>
          </div>
        </div>

        <div className="actions">
          {!display.signedIn ? (
            <button type="button" className="btnPrimary" onClick={() => navigate("/login")}>
              Sign in
            </button>
          ) : (
            <>
              <Link className="btnGhost" to="/help">
                Help & support
              </Link>
              <button type="button" className="btnSignOut" onClick={handleLogout}>
                Sign out
              </button>
            </>
          )}
        </div>
      </section>

      <RegionalModal
        isOpen={regionalOpen}
        onClose={() => setRegionalOpen(false)}
        defaultTab={regionalTab}
        selectedLanguage={language}
        onSelectLanguage={(code) => {
          setLanguage(code);
          setRegionalOpen(false);
        }}
        selectedCurrency={currency}
        onSelectCurrency={(code) => {
          setCurrency(code);
          setRegionalOpen(false);
        }}
      />
    </PageLayout>
  );
}
