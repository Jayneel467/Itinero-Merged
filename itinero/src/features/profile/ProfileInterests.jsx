import React, { useEffect, useState } from "react";
import { HOME_VIBES } from "@/features/explore/data/catalog";
import { interestService } from "@/services/interestTracker";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";

/**
 * Profile travel tastes — vibes + mail frequency for Marketing OS.
 */
export default function ProfileInterests() {
  const auth = useAuthOptional();
  const home = useHomeLocationOptional();
  const [vibes, setVibes] = useState([]);
  const [freq, setFreq] = useState("daily");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    interestService
      .get()
      .then((res) => {
        const list = res?.interests?.vibes || [];
        setVibes(
          list.map((v) => (typeof v === "string" ? v : v?.id)).filter(Boolean)
        );
        setFreq(res?.interests?.mail_frequency || "daily");
      })
      .catch(() => {});
  }, [auth?.isAuthenticated]);

  function toggle(id) {
    setVibes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 8)
    );
  }

  async function save() {
    if (!auth?.isAuthenticated) {
      setMsg("Sign in to save tastes.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await interestService.put({
        vibes: vibes.map((id) => ({ id, weight: 2 })),
        mail_frequency: freq,
        home_airport: home?.airportCode || undefined,
        home_city: home?.city || undefined,
        home_country: home?.countryCode || undefined,
      });
      setMsg("Tastes saved — digests will follow these.");
    } catch (err) {
      setMsg(err?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!auth?.isAuthenticated ? (
        <p style={{ marginBottom: 12, fontSize: 13, color: "#64748b" }}>
          Sign in to save vibes and email frequency. Guests can still unsubscribe from any marketing mail.
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {HOME_VIBES.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => toggle(v.id)}
            style={{
              border: vibes.includes(v.id) ? "2px solid #f97316" : "1px solid #e2e8f0",
              borderRadius: 999,
              padding: "8px 12px",
              background: vibes.includes(v.id) ? "#fff7ed" : "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              color: "#001439",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
        Email frequency{" "}
        <select
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          style={{ marginLeft: 8, padding: "6px 8px", borderRadius: 8 }}
        >
          <option value="daily">Daily digest</option>
          <option value="weekly">Weekly</option>
          <option value="off">Off</option>
        </select>
      </label>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        style={{
          border: 0,
          borderRadius: 12,
          padding: "10px 16px",
          background: "#f97316",
          color: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {busy ? "Saving…" : "Save tastes"}
      </button>
      {msg ? <p style={{ marginTop: 8, fontSize: 13, color: "#64748b" }}>{msg}</p> : null}
    </div>
  );
}
