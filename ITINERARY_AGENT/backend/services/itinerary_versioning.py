"""
Itinerary Versioning Service.

Provides reusable, pure functions for:
  - save_itinerary_version()   — append a new immutable version to state
  - get_active_itinerary()     — return the DraftItinerary for the active version
  - set_active_itinerary()     — mark a version number as active
  - compare_itineraries()      — diff two DraftItinerary objects
  - build_comparison()         — rich structured comparison dict for the UI

Design principles:
  - Never mutate AppState in place; always return a new copy.
  - No duplicate generation logic — callers supply the DraftItinerary.
  - All comparison logic lives here; routes and agents stay thin.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.models.state import AppState, DraftItinerary, ItineraryVersion, TripRequirements


# ---------------------------------------------------------------------------
# Labels for auto-naming versions
# ---------------------------------------------------------------------------

_VERSION_LABELS = {
    1: "Original",
    2: "First Edit",
    3: "Second Edit",
    4: "Third Edit",
    5: "Fourth Edit",
}


def _version_label(version_number: int, existing_versions: List[ItineraryVersion]) -> str:
    """Generate a human-readable label for a new version."""
    return _VERSION_LABELS.get(version_number, f"Edit #{version_number - 1}")


# ---------------------------------------------------------------------------
# Core versioning functions
# ---------------------------------------------------------------------------

def save_itinerary_version(
    state: AppState,
    itinerary: DraftItinerary,
    label: Optional[str] = None,
) -> AppState:
    """
    Append a new immutable version to state.itinerary_versions.

    - Never overwrites an existing version.
    - Sets draft_itinerary to the new version's itinerary.
    - Does NOT set active_itinerary_version — caller does that after comparison.

    Returns a new AppState with updated versions list and draft_itinerary.
    """
    next_number = len(state.itinerary_versions) + 1
    auto_label  = label or _version_label(next_number, state.itinerary_versions)

    version = ItineraryVersion(
        version_number    = next_number,
        label             = auto_label,
        created_at        = datetime.now(timezone.utc).isoformat(),
        itinerary         = itinerary,
        trip_requirements = state.trip_requirements.model_dump(),
    )

    new_versions = state.itinerary_versions + [version]
    return state.model_copy(update={
        "itinerary_versions": new_versions,
        "draft_itinerary":    itinerary,
    })


def get_active_itinerary(state: AppState) -> Optional[DraftItinerary]:
    """
    Return the DraftItinerary for state.active_itinerary_version.

    Falls back to state.draft_itinerary if no version is active yet.
    Returns None if neither exists.
    """
    if state.active_itinerary_version > 0:
        version = _find_version(state, state.active_itinerary_version)
        if version:
            return version.itinerary
    return state.draft_itinerary


def set_active_itinerary(state: AppState, version_number: int) -> AppState:
    """
    Mark version_number as the active itinerary.

    Also updates draft_itinerary to reflect the active version so the
    hotel agent always receives the correct itinerary.

    Raises ValueError if version_number does not exist.
    """
    version = _find_version(state, version_number)
    if version is None:
        raise ValueError(
            f"Version {version_number} does not exist. "
            f"Available: {[v.version_number for v in state.itinerary_versions]}"
        )

    return state.model_copy(update={
        "active_itinerary_version": version_number,
        "draft_itinerary":          version.itinerary,
    })


def _find_version(state: AppState, version_number: int) -> Optional[ItineraryVersion]:
    for v in state.itinerary_versions:
        if v.version_number == version_number:
            return v
    return None


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def compare_itineraries(
    v1: DraftItinerary,
    v2: DraftItinerary,
    v1_req: Optional[Dict[str, Any]] = None,
    v2_req: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Produce a structured diff between two DraftItinerary objects.

    Returns a rich dict consumed by build_comparison() and the frontend.
    """
    v1_req = v1_req or {}
    v2_req = v2_req or {}

    # ── Budget ──────────────────────────────────────────────────────────
    # Prefer trip_requirements.budget (user-set value) over estimated_budget
    v1_budget = v1_req.get("budget") or v1.estimated_budget or 0
    v2_budget = v2_req.get("budget") or v2.estimated_budget or 0
    budget_diff = v2_budget - v1_budget

    # ── Duration ────────────────────────────────────────────────────────
    v1_days = len(v1.days)
    v2_days = len(v2.days)

    # ── Hotel ────────────────────────────────────────────────────────────
    def _hotel_label(days_list: list) -> str:
        stays = [d.hotel_stay for d in days_list if d.hotel_stay and "TBD" not in d.hotel_stay]
        if stays:
            return stays[0]
        return "Hotel TBD"

    v1_hotel = _hotel_label(v1.days)
    v2_hotel = _hotel_label(v2.days)

    # ── Activities ───────────────────────────────────────────────────────
    def _all_activities(days_list: list) -> List[str]:
        acts = []
        for d in days_list:
            for field in ("sightseeing", "morning", "mid_morning",
                          "afternoon_activities", "evening_activities"):
                val = getattr(d, field, "")
                if val and val.strip():
                    acts.append(val.strip())
        return acts

    v1_acts = _all_activities(v1.days)
    v2_acts = _all_activities(v2.days)

    v1_acts_set = _normalise_set(v1_acts)
    v2_acts_set = _normalise_set(v2_acts)
    added_acts   = [a for a in v2_acts if _norm(a) not in v1_acts_set]
    removed_acts = [a for a in v1_acts if _norm(a) not in v2_acts_set]

    # ── Restaurants ──────────────────────────────────────────────────────
    def _all_restaurants(days_list: list) -> List[str]:
        names = []
        for d in days_list:
            for r in (d.restaurants or []):
                if r.name:
                    names.append(r.name)
        return names

    v1_rests = _all_restaurants(v1.days)
    v2_rests = _all_restaurants(v2.days)
    v1_rests_set = _normalise_set(v1_rests)
    v2_rests_set = _normalise_set(v2_rests)
    added_rests   = [r for r in v2_rests if _norm(r) not in v1_rests_set]
    removed_rests = [r for r in v1_rests if _norm(r) not in v2_rests_set]

    # ── Transport ────────────────────────────────────────────────────────
    def _all_transports(days_list: list) -> List[str]:
        modes = []
        for d in days_list:
            for td in (d.travel_details or []):
                if td.transport:
                    modes.append(td.transport.strip())
        return list(set(modes))

    v1_transports = _all_transports(v1.days)
    v2_transports = _all_transports(v2.days)

    # ── Daily costs ──────────────────────────────────────────────────────
    def _avg_daily_cost(days_list: list) -> float:
        costs = []
        for d in days_list:
            if d.daily_cost:
                dc = d.daily_cost
                costs.append((dc.food or 0) + (dc.transport or 0) + (dc.tickets or 0) + (dc.shopping or 0))
        return round(sum(costs) / len(costs), 0) if costs else 0.0

    v1_daily = _avg_daily_cost(v1.days)
    v2_daily = _avg_daily_cost(v2.days)

    # ── Destination ──────────────────────────────────────────────────────
    # Use each version's own trip_requirements snapshot for destination
    v1_dest = v1_req.get("destination") or _extract_dest(v1)
    v2_dest = v2_req.get("destination") or _extract_dest(v2)

    # ── Budget breakdown comparison ───────────────────────────────────────
    v1_bb = v1.budget_breakdown
    v2_bb = v2.budget_breakdown

    # ── Trip requirements delta ───────────────────────────────────────────
    req_changes: Dict[str, Dict[str, Any]] = {}
    comparable_req_fields = [
        "budget", "destination", "departure_date", "return_date",
        "num_travelers", "trip_type",
    ]
    for field in comparable_req_fields:
        old_val = v1_req.get(field)
        new_val = v2_req.get(field)
        if old_val != new_val and (old_val is not None or new_val is not None):
            req_changes[field] = {"from": old_val, "to": new_val}

    # ── Airport transfer ─────────────────────────────────────────────────
    def _has_airport_transfer(days_list: list) -> bool:
        for d in days_list:
            for td in (d.travel_details or []):
                if "airport" in (td.from_place or "").lower() or "airport" in (td.to_place or "").lower():
                    return True
            if "airport" in (d.travel_time or "").lower():
                return True
        return False

    v1_airport_transfer = _has_airport_transfer(v1.days)
    v2_airport_transfer = _has_airport_transfer(v2.days)

    # ── Budget benefits analysis ─────────────────────────────────────────
    benefits = []
    budget_increased = budget_diff > 0

    if budget_increased:
        # ── 1. Hotel Quality Detection ────────────────────────────────────
        if _norm(v1_hotel) != _norm(v2_hotel):
            v1_lower = v1_hotel.lower()
            v2_lower = v2_hotel.lower()

            # Room type keywords (higher = better)
            room_tiers = {
                "standard": 1, "basic": 1, "economy": 1,
                "family": 2, "twin": 2, "double": 2,
                "deluxe": 3, "premium": 3, "superior": 3,
                "executive": 4, "club": 4, "suite": 4,
                "luxury": 5, "presidential": 5, "penthouse": 5, "royal": 5,
            }
            # Hotel brand tiers (known brands = higher)
            brand_tiers = {
                "heritage": 2, "boutique": 2, "inn": 2, "lodge": 2, "resort": 3,
                "marriott": 5, "hyatt": 5, "hilton": 5, "radisson": 4,
                "oberoi": 5, "taj": 5, "leela": 5, "itc": 5,
            }

            def _hotel_quality_score(name: str) -> int:
                score = 0
                for kw, tier in room_tiers.items():
                    if kw in name:
                        score = max(score, tier)
                for kw, tier in brand_tiers.items():
                    if kw in name:
                        score = max(score, tier)
                return score

            v1_score = _hotel_quality_score(v1_lower)
            v2_score = _hotel_quality_score(v2_lower)

            # Extract room type from hotel name
            def _extract_room_type(name: str) -> str:
                for kw in ["presidential suite", "penthouse", "luxury suite", "deluxe suite",
                            "suite", "deluxe", "premium", "executive", "family", "twin", "double", "standard"]:
                    if kw in name.lower():
                        return kw.title()
                return ""

            v1_room = _extract_room_type(v1_hotel)
            v2_room = _extract_room_type(v2_hotel)

            if v2_score > v1_score:
                desc = f"Upgraded from {v1_hotel} to {v2_hotel}"
                if v1_room and v2_room and v1_room != v2_room:
                    desc = f"Room upgraded: {v1_room} → {v2_room} at {v2_hotel}"
                benefits.append({"icon": "🏨", "title": "Hotel Upgrade", "description": desc, "type": "upgrade"})
            else:
                benefits.append({"icon": "🏨", "title": "Hotel Changed", "description": f"Changed from {v1_hotel} to {v2_hotel}", "type": "change"})

        # ── 2. Budget Breakdown Comparison ────────────────────────────────
        v1_bb = v1.budget_breakdown
        v2_bb = v2.budget_breakdown
        if v1_bb and v2_bb:
            bb_categories = [
                ("flights", "✈️", "Flights"),
                ("hotel", "🏨", "Hotel"),
                ("food", "🍽️", "Food & Dining"),
                ("transport", "🚗", "Transport"),
                ("activities", "🎡", "Activities"),
                ("shopping", "🛍️", "Shopping"),
            ]
            for key, icon, label in bb_categories:
                old_val = getattr(v1_bb, key, 0) or 0
                new_val = getattr(v2_bb, key, 0) or 0
                diff_val = new_val - old_val
                if diff_val > 500:  # Only show significant increases (>₹500)
                    benefits.append({
                        "icon": icon,
                        "title": f"{label} Budget Increased",
                        "description": f"{label} budget: ₹{old_val:,.0f} → ₹{new_val:,.0f} (+₹{diff_val:,.0f})",
                        "type": "upgrade"
                    })

        # ── 3. Activity Quality Detection (even when count same) ──────────
        acts_diff = len(v2_acts) - len(v1_acts)
        if acts_diff > 0:
            benefits.append({
                "icon": "🎡",
                "title": "More Activities",
                "description": f"Added {acts_diff} extra activities ({len(v1_acts)} → {len(v2_acts)})",
                "type": "upgrade"
            })
        elif acts_diff == 0 and len(v1_acts) > 0:
            # Counts same — check if activity names improved
            premium_keywords = ["private", "exclusive", "vip", "premium", "guided", "luxury", "helicopter", "yacht", "cruise", "spa"]
            v1_premium_count = sum(1 for a in v1_acts if any(k in a.lower() for k in premium_keywords))
            v2_premium_count = sum(1 for a in v2_acts if any(k in a.lower() for k in premium_keywords))
            if v2_premium_count > v1_premium_count:
                new_premium = [a for a in v2_acts if any(k in a.lower() for k in premium_keywords) and not any(k in a.lower() for k in premium_keywords)]
                # Find activities only in v2
                v2_set = _normalise_set(v2_acts)
                added_acts = [a for a in v2_acts if _norm(a) not in _normalise_set(v1_acts)]
                premium_added = [a for a in added_acts if any(k in a.lower() for k in premium_keywords)]
                if premium_added:
                    benefits.append({
                        "icon": "🎡",
                        "title": "Premium Activities Added",
                        "description": f"Added {len(premium_added)} premium experience(s): {premium_added[0][:60]}{'...' if len(premium_added[0]) > 60 else ''}",
                        "type": "upgrade"
                    })
            # Smart summary: per-activity budget
            act_budget_diff = (v2_budget - v1_budget) / max(len(v2_acts), 1)
            if act_budget_diff > 500:
                benefits.append({
                    "icon": "✨",
                    "title": "Higher Per-Activity Budget",
                    "description": f"Each activity now has ~₹{act_budget_diff:,.0f} more budget for better experiences",
                    "type": "upgrade"
                })

        # ── 4. Restaurant Quality Detection (even when count same) ────────
        rests_diff = len(v2_rests) - len(v1_rests)
        if rests_diff > 0:
            benefits.append({
                "icon": "🍽️",
                "title": "More Dining Options",
                "description": f"Added {rests_diff} more restaurants ({len(v1_rests)} → {len(v2_rests)})",
                "type": "upgrade"
            })
        elif rests_diff == 0 and len(v1_rests) > 0:
            # Counts same — check if restaurant names improved
            premium_food_keywords = ["fine dining", "gourmet", "premium", "luxury", "michelin", "rooftop", "specialty", "cuisine"]
            v1_premium_food = sum(1 for r in v1_rests if any(k in r.lower() for k in premium_food_keywords))
            v2_premium_food = sum(1 for r in v2_rests if any(k in r.lower() for k in premium_food_keywords))
            if v2_premium_food > v1_premium_food:
                added_rests = [r for r in v2_rests if _norm(r) not in _normalise_set(v1_rests)]
                premium_rests = [r for r in added_rests if any(k in r.lower() for k in premium_food_keywords)]
                if premium_rests:
                    benefits.append({
                        "icon": "🍽️",
                        "title": "Premium Dining Added",
                        "description": f"Added premium restaurant: {premium_rests[0][:60]}",
                        "type": "upgrade"
                    })
            # Smart summary: per-restaurant budget
            rest_budget_diff = (v2_budget - v1_budget) / max(len(v2_rests), 1)
            if rest_budget_diff > 500:
                benefits.append({
                    "icon": "✨",
                    "title": "Higher Per-Restaurant Budget",
                    "description": f"Each restaurant now has ~₹{rest_budget_diff:,.0f} more budget for better dining",
                    "type": "upgrade"
                })

        # ── Transport upgrade ─────────────────────────────────────────────
        if set(v1_transports) != set(v2_transports):
            v1_t_set = set(t.lower() for t in v1_transports)
            v2_t_set = set(t.lower() for t in v2_transports)
            premium_transport = {"private cab", "suv", "sedan", "luxury car", "ola premium", "uber premier", "shikara"}
            added_premium = v2_t_set - v1_t_set
            premium_added = [t for t in added_premium if any(p in t for p in premium_transport)]
            if premium_added:
                benefits.append({
                    "icon": "🚗",
                    "title": "Better Transport",
                    "description": f"Upgraded transport: {', '.join(t.title() for t in premium_added)}",
                    "type": "upgrade"
                })
            elif v2_t_set != v1_t_set:
                added_new = v2_t_set - v1_t_set
                if added_new:
                    benefits.append({
                        "icon": "🚗",
                        "title": "Transport Options Changed",
                        "description": f"Added: {', '.join(t.title() for t in added_new)}",
                        "type": "change"
                    })

        # ── Airport transfer added ────────────────────────────────────────
        if not v1_airport_transfer and v2_airport_transfer:
            benefits.append({
                "icon": "✈️",
                "title": "Airport Transfer Added",
                "description": "Now includes convenient airport transfer",
                "type": "upgrade"
            })

        # ── Budget per person increase ────────────────────────────────────
        v1_per_person = round(v1_budget / max(v1_req.get("num_travelers", 1), 1))
        v2_per_person = round(v2_budget / max(v2_req.get("num_travelers", 1), 1))
        per_person_diff = v2_per_person - v1_per_person
        if per_person_diff > 0:
            benefits.append({
                "icon": "💰",
                "title": "More Per Person Budget",
                "description": f"Per person budget increased by ₹{per_person_diff:,.0f} (₹{v1_per_person:,.0f} → ₹{v2_per_person:,.0f})",
                "type": "upgrade"
            })

    elif budget_diff < 0:
        benefits.append({
            "icon": "📉",
            "title": "Budget Reduced",
            "description": f"Budget decreased by ₹{abs(budget_diff):,.0f} — some features may be adjusted",
            "type": "downgrade"
        })

    return {
        # ── Summary table fields ──────────────────────────────────────────
        "budget": {
            "v1": v1_budget,
            "v2": v2_budget,
            "diff": budget_diff,
            "changed": budget_diff != 0,
        },
        "destination": {
            "v1": v1_dest,
            "v2": v2_dest,
            "changed": _norm(v1_dest) != _norm(v2_dest),
        },
        "days": {
            "v1": v1_days,
            "v2": v2_days,
            "diff": v2_days - v1_days,
            "changed": v1_days != v2_days,
        },
        "hotel": {
            "v1": v1_hotel,
            "v2": v2_hotel,
            "changed": _norm(v1_hotel) != _norm(v2_hotel),
        },
        "activities_count": {
            "v1": len(v1_acts),
            "v2": len(v2_acts),
            "diff": len(v2_acts) - len(v1_acts),
            "changed": len(v1_acts) != len(v2_acts),
        },
        "restaurants_count": {
            "v1": len(v1_rests),
            "v2": len(v2_rests),
            "diff": len(v2_rests) - len(v1_rests),
            "changed": len(v1_rests) != len(v2_rests),
        },
        "transport": {
            "v1": ", ".join(v1_transports) or "N/A",
            "v2": ", ".join(v2_transports) or "N/A",
            "changed": set(v1_transports) != set(v2_transports),
        },
        "airport_transfer": {
            "v1": v1_airport_transfer,
            "v2": v2_airport_transfer,
            "changed": v1_airport_transfer != v2_airport_transfer,
        },
        "daily_cost_avg": {
            "v1": v1_daily,
            "v2": v2_daily,
            "diff": v2_daily - v1_daily,
            "changed": v1_daily != v2_daily,
        },
        # ── Detailed change lists ─────────────────────────────────────────
        "added_activities":   added_acts[:10],
        "removed_activities": removed_acts[:10],
        "added_restaurants":  added_rests[:8],
        "removed_restaurants": removed_rests[:8],
        # ── Budget breakdown delta ────────────────────────────────────────
        "budget_breakdown": {
            "v1": v1_bb.model_dump() if v1_bb else None,
            "v2": v2_bb.model_dump() if v2_bb else None,
        },
        # ── Requirements delta ────────────────────────────────────────────
        "req_changes": req_changes,
        # ── Budget benefits analysis ──────────────────────────────────────
        "budget_benefits": benefits,
    }


def build_comparison(
    state: AppState,
    v1_number: int,
    v2_number: int,
) -> Dict[str, Any]:
    """
    High-level helper called by the API route.

    Resolves two version numbers from state, runs compare_itineraries(),
    and wraps the result with version metadata for the frontend.

    Raises ValueError if either version doesn't exist.
    """
    v1_obj = _find_version(state, v1_number)
    v2_obj = _find_version(state, v2_number)

    if v1_obj is None:
        raise ValueError(f"Version {v1_number} not found.")
    if v2_obj is None:
        raise ValueError(f"Version {v2_number} not found.")

    diff = compare_itineraries(
        v1_obj.itinerary,
        v2_obj.itinerary,
        v1_req=v1_obj.trip_requirements or {},
        v2_req=v2_obj.trip_requirements or {},
    )

    # Build summary card counts for the UI
    changes_count = sum(
        1 for key in ("budget", "destination", "days", "hotel",
                      "activities_count", "restaurants_count",
                      "transport", "airport_transfer")
        if diff.get(key, {}).get("changed", False)
    )

    return {
        "v1": {
            "version_number": v1_obj.version_number,
            "label":          v1_obj.label,
            "created_at":     v1_obj.created_at,
            "itinerary":      v1_obj.itinerary.model_dump(),
            "trip_requirements": v1_obj.trip_requirements,
        },
        "v2": {
            "version_number": v2_obj.version_number,
            "label":          v2_obj.label,
            "created_at":     v2_obj.created_at,
            "itinerary":      v2_obj.itinerary.model_dump(),
            "trip_requirements": v2_obj.trip_requirements,
        },
        "diff":          diff,
        "changes_count": changes_count,
        "active_version": state.active_itinerary_version,
    }


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _norm(s: Any) -> str:
    """Normalise a string for loose comparison."""
    return str(s or "").lower().strip()


def _normalise_set(items: List[str]) -> set:
    return {_norm(i) for i in items}


def _extract_dest(itin: DraftItinerary) -> str:
    """Best-effort destination extraction from the itinerary trip_summary."""
    summary = itin.trip_summary or ""
    # Pattern: "X-day ... trip to Destination for"
    import re
    m = re.search(r"trip to ([A-Za-z\s]+)\s+for", summary, re.IGNORECASE)
    if m:
        return m.group(1).strip().title()
    return summary.split(" to ")[-1].split(" for ")[0].strip().title() if " to " in summary else ""
