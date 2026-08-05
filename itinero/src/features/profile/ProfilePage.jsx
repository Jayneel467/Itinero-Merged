import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import "./ProfilePage.css";

function readUser() {
  try {
    const raw = localStorage.getItem("userdata");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed || null;
  } catch {
    return null;
  }
}

/**
 * User profile — shows signed-in account details and trip shortcuts.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => readUser());

  const display = useMemo(() => {
    if (!user) {
      return {
        name: "Guest Traveller",
        email: "Sign in to sync bookings",
        phone: "—",
        initials: "G",
      };
    }
    const name =
      user.name ||
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      "Itinero Member";
    return {
      name,
      email: user.email || "No email on file",
      phone: user.mobileNumber || user.phone || "No phone on file",
      initials: name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("userdata");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("itinero_auth_token");
    setUser(null);
    navigate("/login");
  };

  return (
    <PageLayout>
      <section className="profile-page">
        <div className="profile-page__card">
          <div className="profile-page__avatar" aria-hidden>
            {display.initials}
          </div>
          <div>
            <h1>My Profile</h1>
            <p className="profile-page__name">{display.name}</p>
            <p className="profile-page__meta">{display.email}</p>
            <p className="profile-page__meta">{display.phone}</p>
          </div>
        </div>

        <div className="profile-page__grid">
          <Link className="profile-page__tile" to="/flights">
            <strong>Flights</strong>
            <span>Search and book flights</span>
          </Link>
          <Link className="profile-page__tile" to="/hotels">
            <strong>Hotels</strong>
            <span>Find stays for your trip</span>
          </Link>
          <Link className="profile-page__tile" to="/deals">
            <strong>Deals</strong>
            <span>Browse current offers</span>
          </Link>
          <Link className="profile-page__tile" to="/vero">
            <strong>Ask Vero</strong>
            <span>Plan with your AI travel buddy</span>
          </Link>
        </div>

        <div className="profile-page__actions">
          {!user ? (
            <button type="button" onClick={() => navigate("/login")}>
              Sign in
            </button>
          ) : (
            <button type="button" className="is-danger" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
