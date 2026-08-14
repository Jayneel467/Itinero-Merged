import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import {
  MAX_TRAVELLERS,
  TRAVELLER_TYPES,
  emptyTraveller,
  loadSavedPaxStore,
  removeTraveller,
  saveSavedPaxStore,
  travellerDisplayName,
  travellerInitials,
  travellerTypeLabel,
  upsertTraveller,
} from "@/features/booking/utils/savedTravellers";
import { useBillingOptional } from "@/features/billing/BillingContext";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { hydrateAccountFromServer, persistAccountToServer } from "@/features/profile/accountSync";

const TITLES = ["Mr", "Ms", "Mrs", "Mx"];
const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "X", label: "Other / prefer not to say" },
];

function formatDob(iso) {
  if (!iso) return "";
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const blankForm = () => emptyTraveller(0);

/**
 * Manage on-device travellers used to prefill flight checkout.
 */
export default function TravellersSection() {
  const billing = useBillingOptional();
  const auth = useAuthOptional();
  const travellerCap = billing?.travellerLimit || MAX_TRAVELLERS;
  const [store, setStore] = useState(() => loadSavedPaxStore());
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(blankForm);
  const [error, setError] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMsg, setContactMsg] = useState("");

  useEffect(() => {
    const next = loadSavedPaxStore();
    setStore(next);
    setContactEmail(next.email || "");
    setContactPhone(next.phone || "");
  }, []);

  useEffect(() => {
    if (!auth?.isAuthenticated) return undefined;
    let cancelled = false;
    hydrateAccountFromServer().then(() => {
      if (cancelled) return;
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [auth?.isAuthenticated]);

  const refresh = () => {
    const next = loadSavedPaxStore();
    setStore(next);
    setContactEmail(next.email || "");
    setContactPhone(next.phone || "");
  };

  const openAdd = () => {
    setError("");
    setDraft(blankForm());
    setFormOpen(true);
  };

  const openEdit = (pax) => {
    setError("");
    setDraft({ ...blankForm(), ...pax });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setError("");
    setDraft(blankForm());
  };

  const saveDraft = (e) => {
    e?.preventDefault?.();
    try {
      upsertTraveller(draft, { max: travellerCap });
      refresh();
      persistAccountToServer();
      closeForm();
    } catch (err) {
      setError(err?.message || "Could not save traveller.");
    }
  };

  const onRemove = (id) => {
    if (!window.confirm("Remove this traveller from saved details?")) return;
    removeTraveller(id);
    refresh();
    persistAccountToServer();
    if (draft.id === id) closeForm();
  };

  const saveContact = () => {
    saveSavedPaxStore({
      email: contactEmail.trim(),
      phone: contactPhone.trim(),
    });
    refresh();
    persistAccountToServer();
    setContactMsg(auth?.isAuthenticated ? "Contact saved to your account." : "Contact saved for checkout.");
    setTimeout(() => setContactMsg(""), 2500);
  };

  const travellers = store.passengers || [];
  const atCap = travellers.length >= travellerCap;

  return (
    <div className="detailCard travellersCard">
      <p className="emptyCopy travellersIntro">
        Saved travellers prefill flight checkout. You can add up to {travellerCap}
        {auth?.isAuthenticated ? " — they sync with your account." : " on this device."}
      </p>

      {travellers.length ? (
        <ul className="travellerCards">
          {travellers.map((pax) => {
            const full = travellerDisplayName(pax);
            const bits = [
              travellerTypeLabel(pax.passengerType),
              pax.dob ? `DOB ${formatDob(pax.dob)}` : null,
              pax.nationality ? pax.nationality : null,
            ].filter(Boolean);
            return (
              <li key={pax.id} className="travellerCard">
                <div className="travellerAvatar" aria-hidden>
                  {travellerInitials(pax)}
                </div>
                <div className="travellerBody">
                  <p className="travellerName">
                    {pax.title ? `${pax.title} ` : ""}
                    {full}
                  </p>
                  <p className="travellerMeta">{bits.join(" · ")}</p>
                  {pax.documentNumber ? (
                    <p className="travellerMeta">
                      Doc ···{String(pax.documentNumber).slice(-4)}
                    </p>
                  ) : null}
                </div>
                <div className="travellerActions">
                  <button
                    type="button"
                    className="iconBtn"
                    aria-label={`Edit ${full}`}
                    onClick={() => openEdit(pax)}
                  >
                    <Pencil size={16} strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className="iconBtn isDanger"
                    aria-label={`Remove ${full}`}
                    onClick={() => onRemove(pax.id)}
                  >
                    <Trash2 size={16} strokeWidth={2.2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="travellerEmpty">
          <UserRound size={22} strokeWidth={2} aria-hidden />
          <p>No travellers saved yet. Add family or friends for faster booking.</p>
        </div>
      )}

      <div className="detailActions">
        <button
          type="button"
          className="btnPrimary"
          onClick={openAdd}
          disabled={atCap || formOpen}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden />
          {atCap ? "Limit reached" : "Add traveller"}
        </button>
        <Link className="btnGhost" to="/flights">
          Book a flight
        </Link>
      </div>

      {formOpen ? (
        <form className="travellerForm" onSubmit={saveDraft}>
          <p className="travellerFormTitle">
            {draft.id && travellers.some((t) => t.id === draft.id)
              ? "Edit traveller"
              : "New traveller"}
          </p>
          <div className="travellerFormGrid">
            <label>
              Title
              <select
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              >
                {TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={draft.passengerType}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, passengerType: Number(e.target.value) }))
                }
              >
                {TRAVELLER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              First name
              <input
                required
                value={draft.firstName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, firstName: e.target.value.slice(0, 40) }))
                }
                placeholder="First name"
                autoComplete="given-name"
              />
            </label>
            <label>
              Last name
              <input
                value={draft.lastName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, lastName: e.target.value.slice(0, 40) }))
                }
                placeholder="Last name"
                autoComplete="family-name"
              />
            </label>
            <label>
              Gender
              <select
                value={draft.gender}
                onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
              >
                <option value="">Select</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date of birth
              <input
                type="date"
                value={draft.dob || ""}
                onChange={(e) => setDraft((d) => ({ ...d, dob: e.target.value }))}
              />
            </label>
            <label>
              Nationality
              <input
                value={draft.nationality}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    nationality: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                placeholder="IN"
                maxLength={2}
              />
            </label>
            <label>
              Passport / ID (optional)
              <input
                value={draft.documentNumber}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, documentNumber: e.target.value.slice(0, 24) }))
                }
                placeholder="Document number"
                autoComplete="off"
              />
            </label>
          </div>
          {error ? <p className="errNote">{error}</p> : null}
          <div className="detailActions">
            <button type="submit" className="btnPrimary">
              Save traveller
            </button>
            <button type="button" className="btnGhost" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="travellerContact">
        <p className="travellerFormTitle">Checkout contact</p>
        <p className="emptyCopy">Used as the booking contact email / mobile.</p>
        <div className="travellerFormGrid">
          <label>
            Email
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value.slice(0, 120))}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </label>
          <label>
            Mobile
            <input
              inputMode="numeric"
              value={contactPhone}
              onChange={(e) =>
                setContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10-digit mobile"
              autoComplete="tel"
            />
          </label>
        </div>
        <div className="detailActions">
          <button type="button" className="btnGhost" onClick={saveContact}>
            Save contact
          </button>
        </div>
        {contactMsg ? <p className="okNote">{contactMsg}</p> : null}
      </div>
    </div>
  );
}
