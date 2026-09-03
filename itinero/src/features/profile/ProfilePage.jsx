import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  Bookmark,
  Briefcase,
  Building2,
  Bus,
  CheckCircle2,
  ChevronRight,
  Compass,
  CreditCard,
  Gift,
  Globe2,
  Hotel,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageSquareHeart,
  Package,
  Pencil,
  Plane,
  Radar,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  UserCheck,
  UserRound,
  Users,
  X,
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

export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuthOptional();
  const veroUi = useVeroUiOptional();
  const tripsCtx = useTripsOptional();
  const { currency, symbol } = useCurrency();
  const { languageName } = useLanguage();
  const home = useHomeLocationOptional();
  const user = auth?.user || readLocalUser();

  const tabParam = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(tabParam);

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
    const t = searchParams.get("tab");
    if (t && ["overview", "details", "travellers", "preferences", "security"].includes(t)) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

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
      memberId: user.id ? String(user.id).slice(-8).toUpperCase() : "MEM-2026",
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
  const recentTrips = useMemo(() => [...trips].slice(0, 4), [trips]);

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
      setSaveErr("Name cannot be empty.");
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
      setSaveMsg(res?.message || "Profile updated successfully.");
      setEditing(false);
      setTimeout(() => setSaveMsg(""), 4000);
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
    setSaveMsg(
      auth?.isAuthenticated
        ? "Preferences saved to your account."
        : "Preferences saved on this device."
    );
    persistAccountToServer({ prefs: next });
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const hubLinks = [
    {
      to: "/trips",
      title: "My trips",
      copy: "Bookings, tickets, cancel & refunds",
      Icon: Briefcase,
      color: "blue",
    },
    {
      to: "/plus",
      title: "Vero credits",
      copy: "Free daily · buy packs anytime",
      Icon: Sparkles,
      color: "amber",
    },
    {
      to: "/rewards",
      title: "Itinero Rewards",
      copy: "Points balance, earn & redeem",
      Icon: Gift,
      color: "orange",
    },
    {
      to: "/saved",
      title: "Saved",
      copy: "Wishlist & bookmark collections",
      Icon: Bookmark,
      color: "indigo",
    },
    {
      to: "/notifications",
      title: "Alerts",
      copy: "Price drops & trip updates",
      Icon: Bell,
      color: "sky",
    },
    {
      to: "/help",
      title: "Help & support",
      copy: "Vero + email assistance",
      Icon: LifeBuoy,
      color: "emerald",
    },
    {
      to: "/feedback",
      title: "Feedback",
      copy: "Ideas, bugs & suggestions",
      Icon: MessageSquareHeart,
      color: "rose",
    },
  ];

  const tabs = [
    { id: "overview", label: "Overview", Icon: LayoutDashboard },
    { id: "details", label: "Personal Details", Icon: UserRound },
    { id: "travellers", label: "Travellers", Icon: Users, count: travellersCount },
    { id: "preferences", label: "Preferences", Icon: SlidersHorizontal },
    { id: "security", label: "Account & Security", Icon: ShieldCheck },
  ];

  return (
    <PageLayout>
      <div className="profile-hub">
        {/* Top Hero Banner */}
        <div className="profile-hero">
          <div className="profile-hero__glass">
            <div className="profile-hero__main">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar">
                  {display.initials}
                </div>
                {display.signedIn && (
                  <span className="profile-avatar__badge" title="Verified Member">
                    <CheckCircle2 size={16} />
                  </span>
                )}
              </div>

              <div className="profile-info">
                <div className="profile-info__header">
                  <h1 className="profile-name">{display.name}</h1>
                  <span className={`profile-tier ${display.signedIn ? "profile-tier--active" : ""}`}>
                    {display.signedIn ? "Member" : "Guest"}
                  </span>
                </div>
                <div className="profile-meta-row">
                  {display.email && (
                    <span className="profile-meta-item">
                      <Globe2 size={14} /> {display.email}
                    </span>
                  )}
                  {phone && (
                    <span className="profile-meta-item">
                      <Users size={14} /> +91 {phone}
                    </span>
                  )}
                  {display.memberId && (
                    <span className="profile-meta-item profile-meta-item--id">
                      ID: {display.memberId}
                    </span>
                  )}
                </div>
              </div>

              <div className="profile-hero__actions">
                <button
                  type="button"
                  className="profile-btn profile-btn--vero"
                  onClick={() => openVero("Help me with my trip plan.")}
                >
                  <Sparkles size={16} />
                  <span>Ask Vero</span>
                </button>
                <button
                  type="button"
                  className="profile-btn profile-btn--trips"
                  onClick={() => navigate("/trips")}
                >
                  <Briefcase size={16} />
                  <span>My trips</span>
                </button>
                {display.signedIn ? (
                  <button
                    type="button"
                    className="profile-btn profile-btn--logout"
                    onClick={handleLogout}
                    title="Sign out"
                  >
                    <LogOut size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="profile-btn profile-btn--primary"
                    onClick={() => navigate("/login")}
                  >
                    Sign in
                  </button>
                )}
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="profile-metrics-bar">
              <Link
                to="/trips"
                className="metric-card metric-card--clickable"
              >
                <div className="metric-icon metric-icon--blue">
                  <Briefcase size={18} />
                </div>
                <div className="metric-data">
                  <span className="metric-val">{trips.length}</span>
                  <span className="metric-lbl">Total Trips</span>
                </div>
              </Link>

              <Link
                to="/trips"
                className="metric-card metric-card--clickable"
              >
                <div className="metric-icon metric-icon--green">
                  <CalendarBadge size={18} />
                </div>
                <div className="metric-data">
                  <span className="metric-val">{upcoming.length}</span>
                  <span className="metric-lbl">Upcoming</span>
                </div>
              </Link>

              <Link
                to="/saved"
                className="metric-card metric-card--clickable"
              >
                <div className="metric-icon metric-icon--indigo">
                  <Bookmark size={18} />
                </div>
                <div className="metric-data">
                  <span className="metric-val">{savedItems.length}</span>
                  <span className="metric-lbl">Saved Places</span>
                </div>
              </Link>

              <button
                type="button"
                className="metric-card metric-card--clickable text-left"
                onClick={() => handleTabChange("travellers")}
              >
                <div className="metric-icon metric-icon--orange">
                  <Users size={18} />
                </div>
                <div className="metric-data">
                  <span className="metric-val">{travellersCount}</span>
                  <span className="metric-lbl">Saved Travellers</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <nav className="profile-tabs" aria-label="Account Tabs">
          {tabs.map(({ id, label, Icon, count }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                className={`profile-tab-btn ${isActive ? "profile-tab-btn--active" : ""}`}
                onClick={() => handleTabChange(id)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {typeof count === "number" && (
                  <span className="tab-pill-badge">{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Alerts / Feedback Message */}
        {saveMsg && (
          <div className="profile-toast profile-toast--success">
            <CheckCircle2 size={18} />
            <span>{saveMsg}</span>
          </div>
        )}
        {saveErr && (
          <div className="profile-toast profile-toast--error">
            <X size={18} />
            <span>{saveErr}</span>
          </div>
        )}

        {/* Tab Content Panels */}
        <div className="profile-tab-content">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="tab-panel tab-panel--overview">
              {/* Upcoming Spotlight Card */}
              {nextTrip ? (
                <div className="spotlight-card">
                  <div className="spotlight-card__body">
                    <span className="spotlight-badge">Next Upcoming Trip</span>
                    <h3 className="spotlight-title">{tripTitle(nextTrip)}</h3>
                    <p className="spotlight-meta">
                      <span>Status: <strong className="capitalize">{tripStatus(nextTrip)}</strong></span>
                      {nextTrip.departDate && (
                        <span>· Departure: <strong>{nextTrip.departDate}</strong></span>
                      )}
                    </p>
                  </div>
                  <Link
                    to={`/trips/${nextTrip.id}`}
                    className="spotlight-action"
                  >
                    <span>View details</span>
                    <ChevronRight size={18} />
                  </Link>
                </div>
              ) : (
                <div className="spotlight-card spotlight-card--empty">
                  <div className="spotlight-card__body">
                    <span className="spotlight-badge spotlight-badge--soft">Next Adventure</span>
                    <h3 className="spotlight-title">No upcoming trips planned yet</h3>
                    <p className="spotlight-meta">
                      Explore destinations, check flight fares, or let Vero craft your personalized itinerary.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="spotlight-action spotlight-action--cta"
                    onClick={() => openVero("Plan an exciting upcoming getaway for me.")}
                  >
                    <Sparkles size={16} />
                    <span>Plan with Vero</span>
                  </button>
                </div>
              )}

              {/* Split Panels: Recent Trips & Saved */}
              <div className="overview-dual-grid">
                <div className="hub-box">
                  <div className="hub-box__head">
                    <h3>Recent Trips</h3>
                    <Link
                      to="/trips"
                      className="hub-box__see-all"
                    >
                      See all <ChevronRight size={14} />
                    </Link>
                  </div>
                  {recentTrips.length ? (
                    <div className="mini-item-list">
                      {recentTrips.map((t) => (
                        <Link
                          key={t.id}
                          to={`/trips/${t.id}`}
                          className="mini-item"
                        >
                          <div className="mini-item__icon">
                            <Plane size={16} />
                          </div>
                          <div className="mini-item__info">
                            <p className="mini-item__title">{tripTitle(t)}</p>
                            <p className="mini-item__sub">{t.departDate || "Trip draft"}</p>
                          </div>
                          <span className={`status-pill status-pill--${tripStatus(t)}`}>
                            {tripStatus(t)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="hub-box__empty">
                      <Briefcase size={28} />
                      <p>Your bookings and itineraries will appear here.</p>
                      <Link
                        to="/flights"
                        className="btn-link"
                      >
                        Search flights
                      </Link>
                    </div>
                  )}
                </div>

                <div className="hub-box">
                  <div className="hub-box__head">
                    <h3>Saved Collections</h3>
                    <Link
                      to="/saved"
                      className="hub-box__see-all"
                    >
                      See all <ChevronRight size={14} />
                    </Link>
                  </div>
                  {savedItems.length ? (
                    <div className="mini-item-list">
                      {savedItems.slice(0, 4).map((row) => (
                        <Link
                          key={row.id}
                          to={row.url || "/explore"}
                          className="mini-item"
                        >
                          <div className="mini-item__icon mini-item__icon--indigo">
                            <Bookmark size={16} />
                          </div>
                          <div className="mini-item__info">
                            <p className="mini-item__title">{row.title}</p>
                            <p className="mini-item__sub">{row.subtitle || row.type || "Saved idea"}</p>
                          </div>
                          <ChevronRight size={16} className="text-slate-400" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="hub-box__empty">
                      <Bookmark size={28} />
                      <p>Bookmark hotels & places from Explore to save them.</p>
                      <Link
                        to="/explore"
                        className="btn-link"
                      >
                        Explore places
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Hub Quick Navigation Grid */}
              <div className="hub-services-card">
                <div className="hub-services-card__head">
                  <h3 className="section-title">Account Shortcuts & Services</h3>
                  <p className="section-subtitle">Manage bookings, credits, alerts, and settings.</p>
                </div>
                <div className="hub-grid">
                  {hubLinks.map(({ to, title, copy, Icon, color }) => (
                    <Link
                      key={to}
                      to={to}
                      className="hub-tile"
                    >
                      <div className={`hub-tile__icon hub-tile__icon--${color}`}>
                        <Icon size={20} strokeWidth={2.2} />
                      </div>
                      <div className="hub-tile__content">
                        <p className="hub-tile__title">{title}</p>
                        <p className="hub-tile__copy">{copy}</p>
                      </div>
                      <ChevronRight size={16} className="hub-tile__chevron" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAL DETAILS */}
          {activeTab === "details" && (
            <div className="tab-panel">
              <div className="profile-card">
                <div className="profile-card__head">
                  <div>
                    <h3 className="card-title">Personal Information</h3>
                    <p className="card-subtitle">Manage your personal details and contact info.</p>
                  </div>
                  {!editing ? (
                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil size={15} />
                      <span>Edit Details</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="edit-btn edit-btn--cancel"
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

                <div className="card-fields-grid">
                  <div className="form-field-row">
                    <div className="field-label">
                      <UserRound size={17} />
                      <span>Full Name</span>
                    </div>
                    {editing ? (
                      <input
                        className="form-input"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 80))}
                        placeholder="Your full name"
                      />
                    ) : (
                      <span className="field-value">{name || "-"}</span>
                    )}
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Globe2 size={17} />
                      <span>Email Address</span>
                    </div>
                    <span className="field-value">{display.email || "-"}</span>
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Users size={17} />
                      <span>Mobile Number</span>
                    </div>
                    {editing ? (
                      <div className="phone-input-wrap">
                        <span className="phone-prefix">+91</span>
                        <input
                          className="form-input form-input--phone"
                          inputMode="numeric"
                          value={phone}
                          onChange={(e) =>
                            setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                          }
                          placeholder="10-digit mobile"
                        />
                      </div>
                    ) : (
                      <span className="field-value">
                        {phone ? `+91 ${phone}` : "Not added yet"}
                      </span>
                    )}
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Bell size={17} />
                      <span>Email Subscriptions</span>
                    </div>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={newsletter}
                        disabled={!editing && !display.signedIn}
                        onChange={(e) => setNewsletter(e.target.checked)}
                      />
                      <span className="switch-text">Receive deal updates and trip inspiration</span>
                    </label>
                  </div>
                </div>

                {editing && (
                  <div className="card-footer-actions">
                    <button
                      type="button"
                      className="save-btn"
                      disabled={busy}
                      onClick={saveProfile}
                    >
                      {busy ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TRAVELLERS */}
          {activeTab === "travellers" && (
            <div className="tab-panel">
              <div className="profile-card">
                <div className="profile-card__head">
                  <div>
                    <h3 className="card-title">Saved Travellers</h3>
                    <p className="card-subtitle">
                      Pre-filled details for faster flight and hotel checkout.
                    </p>
                  </div>
                  <span className="counter-badge">
                    {travellersCount}/{MAX_TRAVELLERS} Saved
                  </span>
                </div>
                <TravellersSection />
              </div>
            </div>
          )}

          {/* TAB 4: PREFERENCES & TASTES */}
          {activeTab === "preferences" && (
            <div className="tab-panel">
              <div className="profile-card">
                <div className="profile-card__head">
                  <div>
                    <h3 className="card-title">Regional & Trip Settings</h3>
                    <p className="card-subtitle">
                      Customise your currency, home airport, and travel notifications.
                    </p>
                  </div>
                  {!editingPrefs ? (
                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() => setEditingPrefs(true)}
                    >
                      <Pencil size={15} />
                      <span>Edit Settings</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="edit-btn edit-btn--cancel"
                      onClick={() => {
                        setEditingPrefs(false);
                        setPrefs(loadAccountPrefs());
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="quick-selectors-row">
                  <button
                    type="button"
                    className="selector-pill-card"
                    onClick={() => openRegional("currency")}
                  >
                    <div className="selector-icon selector-icon--orange">
                      <CreditCard size={18} />
                    </div>
                    <div className="selector-text">
                      <span className="selector-title">Currency</span>
                      <span className="selector-val">{symbol} {currency}</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>

                  <button
                    type="button"
                    className="selector-pill-card"
                    onClick={() => openRegional("language")}
                  >
                    <div className="selector-icon selector-icon--sky">
                      <Languages size={18} />
                    </div>
                    <div className="selector-text">
                      <span className="selector-title">Language</span>
                      <span className="selector-val">{languageName || "English"}</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                </div>

                <div className="card-fields-grid mt-6">
                  <div className="form-field-row">
                    <div className="field-label">
                      <MapPin size={17} />
                      <span>Home Airport (IATA)</span>
                    </div>
                    {editingPrefs ? (
                      <input
                        className="form-input"
                        value={prefs.homeAirport}
                        onChange={(e) =>
                          setPrefs((p) => ({
                            ...p,
                            homeAirport: e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z]/g, "")
                              .slice(0, 3),
                          }))
                        }
                        placeholder="e.g. BOM, DEL"
                        maxLength={3}
                      />
                    ) : (
                      <span className="field-value">{prefs.homeAirport || "Not configured"}</span>
                    )}
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Building2 size={17} />
                      <span>Home City</span>
                    </div>
                    {editingPrefs ? (
                      <input
                        className="form-input"
                        value={prefs.homeCity}
                        onChange={(e) =>
                          setPrefs((p) => ({
                            ...p,
                            homeCity: e.target.value.slice(0, 40),
                          }))
                        }
                        placeholder="e.g. Mumbai"
                      />
                    ) : (
                      <span className="field-value">{prefs.homeCity || "Not configured"}</span>
                    )}
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Bell size={17} />
                      <span>Price Drop Alerts</span>
                    </div>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={Boolean(prefs.priceAlerts)}
                        disabled={!editingPrefs}
                        onChange={(e) =>
                          setPrefs((p) => ({ ...p, priceAlerts: e.target.checked }))
                        }
                      />
                      <span className="switch-text">Notify me when watched fares drop</span>
                    </label>
                  </div>

                  <div className="form-field-row">
                    <div className="field-label">
                      <Plane size={17} />
                      <span>Trip Reminders</span>
                    </div>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        checked={Boolean(prefs.tripReminders)}
                        disabled={!editingPrefs}
                        onChange={(e) =>
                          setPrefs((p) => ({ ...p, tripReminders: e.target.checked }))
                        }
                      />
                      <span className="switch-text">Check-in and departure notifications</span>
                    </label>
                  </div>
                </div>

                {/* Travel Vibe Interests */}
                <div className="interests-subcard">
                  <h4 className="subcard-title">Travel Tastes & Vibes</h4>
                  <p className="subcard-copy">
                    Select your favorite travel styles to get tailored recommendations on Explore and Vero.
                  </p>
                  <ProfileInterests />
                </div>

                {/* GST / Invoice Details */}
                <div className="invoice-subcard">
                  <h4 className="subcard-title">Business Invoicing (Optional)</h4>
                  <div className="card-fields-grid">
                    <div className="form-field-row">
                      <div className="field-label">
                        <Building2 size={17} />
                        <span>Company Name</span>
                      </div>
                      {editingPrefs ? (
                        <input
                          className="form-input"
                          value={prefs.companyName}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              companyName: e.target.value.slice(0, 80),
                            }))
                          }
                          placeholder="Registered company name"
                        />
                      ) : (
                        <span className="field-value">{prefs.companyName || "-"}</span>
                      )}
                    </div>
                    <div className="form-field-row">
                      <div className="field-label">
                        <CreditCard size={17} />
                        <span>GSTIN</span>
                      </div>
                      {editingPrefs ? (
                        <input
                          className="form-input"
                          value={prefs.gstin}
                          onChange={(e) =>
                            setPrefs((p) => ({
                              ...p,
                              gstin: e.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9]/g, "")
                                .slice(0, 15),
                            }))
                          }
                          placeholder="15-digit GSTIN"
                          maxLength={15}
                        />
                      ) : (
                        <span className="field-value">{prefs.gstin || "-"}</span>
                      )}
                    </div>
                  </div>
                </div>

                {editingPrefs && (
                  <div className="card-footer-actions">
                    <button
                      type="button"
                      className="save-btn"
                      onClick={savePrefs}
                    >
                      Save Preferences
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNT & SECURITY */}
          {activeTab === "security" && (
            <div className="tab-panel">
              <div className="profile-card">
                <div className="profile-card__head">
                  <div>
                    <h3 className="card-title">Account & Security</h3>
                    <p className="card-subtitle">Manage your session, sync state, and legal policies.</p>
                  </div>
                </div>

                <div className="security-status-card">
                  <div className="security-status-icon">
                    <ShieldCheck size={24} />
                  </div>
                  <div className="security-status-info">
                    <h4>Account Sync Status</h4>
                    <p>
                      {display.signedIn
                        ? "Your account is secured and synchronized with Itinero Cloud."
                        : "You are currently browsing as a Guest. Sign in to back up your trips and preferences."}
                    </p>
                  </div>
                </div>

                <div className="legal-links-list">
                  <Link to="/terms" className="legal-link-row">
                    <span>Terms of Use</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link to="/privacy" className="legal-link-row">
                    <span>Privacy Policy</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link to="/cancellation" className="legal-link-row">
                    <span>Cancellation & Refund Policy</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>

                {display.signedIn && (
                  <div className="logout-danger-zone">
                    <button
                      type="button"
                      className="logout-btn"
                      onClick={handleLogout}
                    >
                      <LogOut size={16} />
                      <span>Sign Out from this Device</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <RegionalModal
        isOpen={regionalOpen}
        onClose={() => setRegionalOpen(false)}
        defaultTab={regionalTab}
      />
    </PageLayout>
  );
}

function CalendarBadge({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  );
}
