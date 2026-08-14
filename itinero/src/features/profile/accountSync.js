/**
 * Signed-in copy of travellers, prefs, and Saved hearts. Local storage stays the cache.
 */
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { loadSavedPaxStore, saveSavedPaxStore } from "@/features/booking/utils/savedTravellers";
import { listSaved, mergeSavedLists, replaceSaved } from "@/features/account/savedService";
import { loadAccountPrefs, saveAccountPrefs } from "./accountPrefs";

function signedIn() {
  try {
    return Boolean(localStorage.getItem("itinero_auth_token"));
  } catch {
    return false;
  }
}

function prefsLookEmpty(prefs) {
  if (!prefs || typeof prefs !== "object") return true;
  return !prefs.homeAirport && !prefs.gstin && !prefs.companyName && !prefs.invoiceEmail;
}

export async function hydrateAccountFromServer() {
  if (!signedIn()) return { ok: false, reason: "guest" };
  try {
    const res = await api.get(ENDPOINTS.ACCOUNT.STATE);
    if (!res?.ok) return { ok: false, reason: res?.error || "unavailable" };
    const localPax = loadSavedPaxStore();
    const localPrefs = loadAccountPrefs();
    const localSaved = listSaved();
    const serverTravellers = Array.isArray(res.travellers) ? res.travellers : [];
    const serverPrefs = res.prefs && typeof res.prefs === "object" ? res.prefs : {};
    const serverContact = res.contact && typeof res.contact === "object" ? res.contact : {};
    const serverSaved = Array.isArray(res.saved) ? res.saved : [];
    const mergedSaved = mergeSavedLists(localSaved, serverSaved);
    replaceSaved(mergedSaved, { persist: false });
    const serverEmpty =
      serverTravellers.length === 0 &&
      prefsLookEmpty(serverPrefs) &&
      !serverContact.email &&
      !serverContact.phone &&
      serverSaved.length === 0;
    const localHas =
      (localPax.passengers || []).length > 0 ||
      !prefsLookEmpty(localPrefs) ||
      localPax.email ||
      localPax.phone ||
      localSaved.length > 0;
    if (serverEmpty && localHas) {
      return persistAccountToServer();
    }
    if (serverTravellers.length || serverContact.email || serverContact.phone) {
      saveSavedPaxStore({
        passengers: serverTravellers.length ? serverTravellers : localPax.passengers,
        email: serverContact.email || localPax.email,
        phone: serverContact.phone || localPax.phone,
      });
    }
    if (!prefsLookEmpty(serverPrefs) || Object.keys(serverPrefs).length) {
      saveAccountPrefs(serverPrefs);
    }
    if (mergedSaved.length !== serverSaved.length) {
      return persistAccountToServer();
    }
    return { ok: true, synced: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function persistAccountToServer(patch = {}) {
  if (!signedIn()) return { ok: false, reason: "guest" };
  const localPax = loadSavedPaxStore();
  const localPrefs = loadAccountPrefs();
  try {
    return await api.put(ENDPOINTS.ACCOUNT.STATE, {
      travellers: patch.travellers ?? localPax.passengers,
      prefs: patch.prefs ?? localPrefs,
      contact: {
        email: patch.email ?? localPax.email,
        phone: patch.phone ?? localPax.phone,
      },
      saved: patch.saved ?? listSaved(),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
}
