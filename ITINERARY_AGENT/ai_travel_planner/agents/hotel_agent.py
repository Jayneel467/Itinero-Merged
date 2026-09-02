"""
Hotel Agent
===========
An independent LLM-powered agent that handles all hotel-related operations:
  - search_hotels()
  - filter_hotels()
  - recommend_hotels()
  - select_hotel()
  - prebook_hotel()

Architecture
------------
The Hotel Agent is a *worker* agent.  It never speaks to the user directly.
It receives a rich natural-language instruction from the Itinerary Agent,
searches live LiteAPI rates, and returns a structured HotelAgentResponse.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import date, datetime, timedelta
from typing import Any

# ── Resolve general_agent package so we can reach the real LiteAPI provider ──
_ITINERARY_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_PROJECT_ROOT = os.path.dirname(_ITINERARY_ROOT)
for _p in [_PROJECT_ROOT, _ITINERARY_ROOT]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ai_travel_planner.state.models import (
    AgentResponseStatus,
    HotelAgentResponse,
    HotelOption,
    HotelPrebook,
    HotelPrebookResponse,
    HotelSearchParams,
    MealPlan,
)
from ai_travel_planner.utils.config import get_settings
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("agents.hotel_agent")


# ─────────────────────────────────────────────────────────────────────────────
# Prompt Templates
# ─────────────────────────────────────────────────────────────────────────────

_HOTEL_AGENT_SYSTEM_PROMPT = """\
You are an expert Hotel Search Agent for an AI Travel Planning system.

Your responsibilities:
1. Parse the natural-language instruction you receive from the Itinerary Agent.
2. Work only with live hotel rates already provided — never invent prices or names.
3. Apply the requested filters (budget, star rating, meal plan, amenities, cancellation policy).
4. Rank results by value score (price + rating + amenities + location + user preferences).
5. Identify the single best-value recommendation.
6. Return a structured JSON response conforming EXACTLY to the schema provided.

Hotel Data Generation Rules:
- Generate between 5 and 8 hotel options.
- Use realistic hotel names appropriate for the destination (mix of brands and boutique hotels).
- Star ratings: spread across 3★, 4★, and 5★ options.
- Prices: realistic for the destination and star rating with ±25% variation.
- Locations: use realistic area names within the city (e.g., "Baga Beach", "Calangute", "Panaji").
- Distance from city center: 0.5 km to 8 km.
- Amenities: pick from [Swimming Pool, Free WiFi, Spa, Gym, Restaurant, Bar, Beach Access,
  Airport Shuttle, Parking, Room Service, Kids Club, Business Center, Rooftop Pool].
- Room types: Standard Room, Deluxe Room, Superior Room, Sea View Room, Suite, Villa.
- Meal plans: Room Only, Breakfast Included, Half Board, Full Board, All Inclusive.
- Cancellation policies: "Non-refundable", "Free cancellation until 48h before check-in",
  "Free cancellation until 24h before check-in", "Free cancellation until 7 days before check-in".
- Rank score: 0–10 float; higher = better value.
- Mark exactly one hotel as recommended=true (the highest-ranked one).
- check_in_time: "14:00" or "15:00"; check_out_time: "11:00" or "12:00".

Always respond with valid JSON only. No markdown fences, no extra text.

Response schema:
{
  "status": "success" | "not_found" | "error",
  "action_performed": "<string>",
  "summary": "<one-sentence human-readable summary>",
  "hotels": [ <HotelOption objects> ],
  "recommended_hotel_id": "<hotel_id of best option>",
  "total_results": <int>,
  "filters_applied": { <key: value> },
  "errors": [],
  "suggested_next_action": "<string>"
}

HotelOption schema:
{
  "hotel_id": "HT-XXXXXXXX",
  "name": "<hotel name>",
  "star_rating": <float 1-5>,
  "location": "<full address or area>",
  "area": "<neighbourhood / beach / zone name>",
  "distance_from_center_km": <float>,
  "amenities": ["<amenity>", ...],
  "room_type": "<room type>",
  "meal_plan": "Room Only" | "Breakfast Included" | "Half Board" | "Full Board" | "All Inclusive",
  "cancellation_policy": "<policy string>",
  "check_in_time": "HH:MM",
  "check_out_time": "HH:MM",
  "price_per_night": <float>,
  "total_price": <float>,
  "nights": <int>,
  "rank_score": <float 0-10>,
  "recommended": <bool>,
  "image_description": "<one sentence visual description>"
}
"""

_HOTEL_PREBOOK_SYSTEM_PROMPT = """\
You are an expert Hotel Pre-Booking Agent.

You receive a pre-booking instruction with the selected hotel details, check-in/check-out dates,
and guest information. Generate a realistic pre-booking confirmation record.

Rules:
- Generate a unique prebook_id in the format "HPB-XXXXXXXXXX" (10 hex chars, uppercase).
- booking_expiry = instruction_timestamp + 45 minutes.
- booking_status = "Pre-booked (Pending Confirmation)".
- total_price = price_per_night * number_of_nights.

Always respond with valid JSON only. No markdown fences, no extra text.

Response schema:
{
  "status": "success" | "error",
  "action_performed": "prebook_hotel",
  "summary": "<human-readable confirmation sentence>",
  "prebook": {
    "prebook_id": "HPB-XXXXXXXXXX",
    "hotel_id": "<hotel_id>",
    "check_in": "YYYY-MM-DD",
    "check_out": "YYYY-MM-DD",
    "room_type": "<room type>",
    "guests": { "adults": <int>, "children": <int> },
    "total_price": <float>,
    "currency": "INR",
    "booking_status": "Pre-booked (Pending Confirmation)",
    "booking_expiry": "YYYY-MM-DDTHH:MM:SS"
  },
  "errors": [],
  "suggested_next_action": "Proceed to final itinerary"
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Hotel Agent
# ─────────────────────────────────────────────────────────────────────────────


class HotelAgent:
    """
    LLM-powered Hotel Agent.

    All public methods accept a natural-language instruction string (as sent by
    the Itinerary Agent) plus optional structured hints, and return Pydantic
    models so the Itinerary Agent always gets type-safe data.
    """

    def __init__(self) -> None:
        settings = get_settings()
        kwargs = {
            "model": settings.hotel_agent_model,
            "temperature": settings.hotel_agent_temperature,
            "api_key": settings.openai_api_key,
        }
        if getattr(settings, "openai_base_url", None):
            kwargs["base_url"] = settings.openai_base_url
        self._llm = ChatOpenAI(**kwargs)
        logger.info("HotelAgent initialised with model=%s", settings.hotel_agent_model)

    # ── Public interface ──────────────────────────────────────────────────────

    def search_hotels(
        self,
        instruction: str,
        search_params: HotelSearchParams | None = None,
        day_label: str = "",
    ) -> HotelAgentResponse:
        """
        Search hotels based on a natural-language instruction.

        Tries real LiteAPI data first. Returns an honest empty response if
        LiteAPI fails — never invents hotel rates.
        """
        logger.info("HotelAgent.search_hotels called [%s]", day_label or "no label")
        logger.debug("Instruction: %s", instruction)

        # ── Attempt real LiteAPI fetch ─────────────────────────────────────────
        if search_params is not None:
            real_hotels = self._fetch_real_hotels(search_params)
            if real_hotels:
                logger.info("HotelAgent: using real LiteAPI data (%d results) [%s]", len(real_hotels), day_label)
                return self._build_response_from_hotels(real_hotels, instruction, search_params, day_label)
            logger.warning("HotelAgent: real LiteAPI returned no results — no dummy fallback [%s]", day_label)

        return HotelAgentResponse(
            status=AgentResponseStatus.NOT_FOUND,
            action_performed="search_hotels",
            summary=(
                "I couldn't find live hotel rates for that search right now. "
                "Try different dates or a nearby city — I won't invent prices."
            ),
            hotels=[],
            total_results=0,
            errors=["No live LiteAPI results"],
            suggested_next_action="Retry with different dates or city",
            raw_instruction=instruction,
            day_label=day_label or "",
        )

    def filter_hotels(
        self,
        instruction: str,
        existing_hotels: list[HotelOption],
        day_label: str = "",
    ) -> HotelAgentResponse:
        """Apply additional filters to an existing list of hotel options."""
        logger.info(
            "HotelAgent.filter_hotels called (%d options) [%s]",
            len(existing_hotels),
            day_label,
        )

        hotels_json = json.dumps(
            [h.model_dump(mode="json") for h in existing_hotels], default=str
        )
        full_instruction = (
            f"{instruction}\n\n"
            f"Apply the filters to the following hotels and return only matching ones:\n"
            f"{hotels_json}"
        )
        raw_json = self._call_llm(_HOTEL_AGENT_SYSTEM_PROMPT, full_instruction)
        return self._parse_search_response(raw_json, instruction, None, day_label)

    def recommend_hotels(
        self,
        instruction: str,
        hotels: list[HotelOption],
        day_label: str = "",
    ) -> HotelAgentResponse:
        """Rank hotels and identify the single best recommendation."""
        logger.info(
            "HotelAgent.recommend_hotels called (%d options) [%s]",
            len(hotels),
            day_label,
        )

        hotels_json = json.dumps(
            [h.model_dump(mode="json") for h in hotels], default=str
        )
        full_instruction = (
            f"{instruction}\n\n"
            f"Rank these hotels and identify the best recommendation:\n"
            f"{hotels_json}"
        )
        raw_json = self._call_llm(_HOTEL_AGENT_SYSTEM_PROMPT, full_instruction)
        return self._parse_search_response(raw_json, instruction, None, day_label)

    def select_hotel(
        self,
        hotel: HotelOption,
        check_in: date,
        check_out: date,
        guests: dict[str, int],
    ) -> HotelAgentResponse:
        """Confirm a user-selected hotel and calculate the total stay price."""
        logger.info("HotelAgent.select_hotel: %s", hotel.hotel_id)

        nights = max((check_out - check_in).days, 1)
        total = hotel.price_per_night * nights

        updated_hotel = hotel.model_copy(
            update={"total_price": total, "nights": nights, "recommended": True}
        )

        return HotelAgentResponse(
            status=AgentResponseStatus.SUCCESS,
            action_performed="select_hotel",
            summary=(
                f"{hotel.name} selected for {nights} night(s) "
                f"({check_in} → {check_out}). "
                f"Total: ₹{total:,.0f}."
            ),
            hotels=[updated_hotel],
            recommended_hotel=updated_hotel,
            selected_hotel=updated_hotel,
            total_results=1,
            suggested_next_action="Confirm hotel pre-booking",
            raw_instruction="select_hotel",
        )

    def prebook_hotel(
        self,
        instruction: str,
        hotel: HotelOption,
        check_in: date,
        check_out: date,
        guests: dict[str, int],
        day_label: str = "",
        *,
        allowed_offer_ids: set[str] | list[str] | None = None,
    ) -> HotelPrebookResponse:
        """Hold the selected hotel on LiteAPI. Never invent a fake HPB- id.

        Offer must be in ``allowed_offer_ids`` (this day's search results).
        Agency CREDIT holds are blocked unless sandbox key + explicit allow flag.
        """
        logger.info("HotelAgent.prebook_hotel: %s [%s]", hotel.hotel_id, day_label)

        nights = max((check_out - check_in).days, 1)
        total = hotel.price_per_night * nights
        offer_id = (getattr(hotel, "offer_id", None) or "").strip()

        allowed = {
            str(x).strip()
            for x in (allowed_offer_ids or [])
            if str(x).strip()
        }
        if not offer_id:
            return HotelPrebookResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="prebook_hotel",
                summary=f"I couldn't hold {hotel.name} — missing a live offer id from search.",
                errors=["Missing offer_id"],
                suggested_next_action="Search hotels again",
            )
        if not allowed or offer_id not in allowed:
            logger.warning(
                "HotelAgent: rejecting unbound offer_id=%s day=%s (allowed=%s)",
                offer_id[:24],
                day_label,
                len(allowed),
            )
            return HotelPrebookResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="prebook_hotel",
                summary=(
                    "That hotel offer is not from this search session. "
                    "Please search again and pick a listed option."
                ),
                errors=["offer_id not bound to session search"],
                suggested_next_action="Search hotels again",
            )

        try:
            import os
            from general_agent.providers import liteapi_provider

            app_env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").lower()
            use_sdk = (os.getenv("LITEAPI_USE_PAYMENT_SDK") or "true").lower() in {
                "1",
                "true",
                "yes",
            }
            # Production always captures via Payment SDK — never agency CREDIT holds.
            if app_env in {"production", "prod"}:
                use_sdk = True
            elif not use_sdk:
                # Non-prod CREDIT only with sandbox LiteAPI key + explicit opt-in.
                key = (
                    os.getenv("LITEAPI_KEY")
                    or os.getenv("LITEAPI_API_KEY")
                    or os.getenv("API_KEY")
                    or ""
                ).strip()
                allow_credit = (os.getenv("ITINERO_ALLOW_AGENCY_CREDIT") or "").lower() in {
                    "1",
                    "true",
                    "yes",
                }
                if not (key.startswith("sand_") and allow_credit):
                    logger.warning(
                        "HotelAgent: blocked agency CREDIT prebook "
                        "(set LITEAPI_USE_PAYMENT_SDK=true or sand_* + ITINERO_ALLOW_AGENCY_CREDIT=1)"
                    )
                    return HotelPrebookResponse(
                        status=AgentResponseStatus.ERROR,
                        action_performed="prebook_hotel",
                        summary=(
                            "Hotel hold is blocked in this environment without Payment SDK. "
                            "Enable LITEAPI_USE_PAYMENT_SDK=true, or use a sandbox key with "
                            "ITINERO_ALLOW_AGENCY_CREDIT=1 for local testing only."
                        ),
                        errors=["agency CREDIT prebook blocked"],
                        suggested_next_action="Enable Payment SDK or sandbox credit flag",
                    )

            body = liteapi_provider.prebook_hotel_rate(
                {"offerId": offer_id, "usePaymentSdk": use_sdk}
            )
            data = body.get("data") if isinstance(body, dict) else body
            if not isinstance(data, dict):
                data = {}
            prebook_id = str(data.get("prebookId") or data.get("id") or offer_id)
            expiry = datetime.now() + timedelta(minutes=45)
            updated = hotel.model_copy(update={"total_price": total, "nights": nights})
            prebook = HotelPrebook(
                prebook_id=prebook_id,
                hotel=updated,
                check_in=check_in,
                check_out=check_out,
                room_type=hotel.room_type,
                guests=guests,
                total_price=total,
                currency="INR",
                booking_status="Held (Pending Confirmation)",
                booking_expiry=expiry,
                day_label=day_label,
            )
            return HotelPrebookResponse(
                status=AgentResponseStatus.SUCCESS,
                action_performed="prebook_hotel",
                summary=(
                    f"{hotel.name} held for {nights} night(s). "
                    f"Hold id: {prebook.prebook_id}."
                ),
                prebook=prebook,
                suggested_next_action="Proceed to final itinerary",
            )
        except Exception as exc:
            logger.warning("HotelAgent: live hotel prebook failed: %s", exc)

        return HotelPrebookResponse(
            status=AgentResponseStatus.ERROR,
            action_performed="prebook_hotel",
            summary=(
                f"I couldn't hold {hotel.name} just now. "
                "Complete booking on the left — I won't invent a fake hold."
            ),
            errors=["Live hotel prebook unavailable"],
            suggested_next_action="Book on the hotels page or retry",
        )

    def _call_llm(self, system_prompt: str, user_instruction: str) -> str:
        """Invoke the LLM and return the raw text response."""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_instruction),
        ]
        try:
            response = self._llm.invoke(messages)
            content = str(response.content).strip()
            # Strip markdown fences if the model wraps them anyway
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            logger.debug("HotelAgent LLM raw response (first 300 chars): %s", content[:300])
            return content
        except Exception as exc:
            logger.error("HotelAgent LLM call failed: %s", exc)
            raise

    # ── Real LiteAPI integration ──────────────────────────────────────────────

    def _fetch_real_hotels(self, params: HotelSearchParams) -> list[HotelOption]:
        """
        Call the real LiteAPI via general_agent's providers and map the
        results to HotelOption Pydantic models.

        Returns an empty list on any failure so the caller can fall back.
        """
        try:
            from general_agent.providers import liteapi_provider
            from general_agent.exceptions import ProviderRequestError
        except ImportError as exc:
            logger.warning("HotelAgent: could not import liteapi_provider: %s", exc)
            return []

        try:
            location = params.location or ""
            if not location or not params.check_in or not params.check_out:
                return []

            parts = [p.strip() for p in location.split(",") if p.strip()]
            city_name = parts[0] if parts else location
            country_code = ""
            if len(parts) > 1 and len(parts[-1]) == 2 and parts[-1].isalpha():
                country_code = parts[-1].upper()
            if not country_code:
                try:
                    from general_agent.services import location_resolver
                except ImportError:
                    from services import location_resolver
                country_code = location_resolver.resolve_country_code(location) or "IN"

            nights = max((params.check_out - params.check_in).days, 1)

            payload = {
                "checkin": str(params.check_in),
                "checkout": str(params.check_out),
                "currency": "INR",
                "guestNationality": "IN",
                "occupancies": [{"adults": params.adults or 1}],
                "cityName": city_name,
                "countryCode": country_code,
                "maxRatesPerHotel": 1,
                "includeHotelData": True,
                "limit": 20,
            }
            if params.min_star_rating:
                payload["minRating"] = params.min_star_rating

            body = liteapi_provider.search_hotel_rates(payload)
            rate_entries = body.get("data") or []
            if not rate_entries:
                return []

            hotel_meta = {h.get("id"): h for h in body.get("hotels", [])}

            raw_results: list[dict] = []
            for entry in rate_entries:
                hotel_id = entry.get("hotelId")
                room_types = entry.get("roomTypes") or []
                if not room_types:
                    continue

                cheapest = None
                for rt in room_types:
                    rt_offer = rt.get("offerId") or rt.get("offer_id")
                    for rate in rt.get("rates", []):
                        total_arr = rate.get("retailRate", {}).get("total", [])
                        amount = total_arr[0].get("amount") if total_arr else None
                        if amount is None:
                            continue
                        if cheapest is None or amount < cheapest["amount"]:
                            cheapest = {
                                "amount": amount,
                                "room_name": rate.get("name", "Room"),
                                "board": rate.get("boardName", ""),
                                "refundable": rate.get("cancellationPolicies", {}).get("refundableTag") == "RFN",
                                "offer_id": (
                                    rt_offer
                                    or rate.get("offerId")
                                    or rate.get("offer_id")
                                    or rate.get("rateId")
                                ),
                            }
                if cheapest is None:
                    continue
                if params.max_budget_per_night and cheapest["amount"] > params.max_budget_per_night:
                    continue

                meta = hotel_meta.get(hotel_id, {})
                raw_results.append({
                    "name": meta.get("name", "Hotel"),
                    "address": meta.get("address", ""),
                    "rating": meta.get("rating", 3.0),
                    "price_per_night": cheapest["amount"],
                    "total_price": cheapest["amount"] * nights,
                    "nights": nights,
                    "room_name": cheapest["room_name"],
                    "board": cheapest["board"],
                    "refundable": cheapest["refundable"],
                    "offer_id": cheapest.get("offer_id"),
                    "liteapi_hotel_id": hotel_id,
                    "image_url": meta.get("main_photo") or meta.get("thumbnail") or "",
                    "hotel_images": [
                        img.get("urlHd") or img.get("url")
                        for img in (meta.get("hotelImages") or [])[:6]
                        if isinstance(img, dict) and (img.get("urlHd") or img.get("url"))
                    ],
                })

            if not raw_results:
                return []

            raw_results.sort(key=lambda h: h["price_per_night"])
            raw_results = raw_results[:6]  # cap at 6 options

            return self._map_liteapi_to_hotel_options(raw_results, params)

        except Exception as exc:
            logger.warning("HotelAgent: real hotel fetch failed: %s", exc)
            return []

    def _map_liteapi_to_hotel_options(
        self,
        raw_results: list[dict],
        params: HotelSearchParams,
    ) -> list[HotelOption]:
        """Map raw LiteAPI hotel dicts to HotelOption Pydantic models."""
        options: list[HotelOption] = []

        board_map = {
            "room only": MealPlan.ROOM_ONLY,
            "breakfast": MealPlan.BREAKFAST,
            "half board": MealPlan.HALF_BOARD,
            "full board": MealPlan.FULL_BOARD,
            "all inclusive": MealPlan.ALL_INCLUSIVE,
        }
        max_price = max(h.get("price_per_night", 1) for h in raw_results) or 1

        for i, h in enumerate(raw_results):
            price = float(h.get("price_per_night", 0))
            nights = int(h.get("nights", 1))
            rating = float(h.get("rating") or 3.0)
            board_raw = (h.get("board") or "").lower()
            meal_plan = MealPlan.BREAKFAST  # default
            for k, v in board_map.items():
                if k in board_raw:
                    meal_plan = v
                    break

            cancel_policy = (
                "Free cancellation" if h.get("refundable") else "Non-refundable"
            )

            rank_score = round(10 * (1 - price / max_price), 2)

            hid = str(h.get("liteapi_hotel_id") or "").strip()
            options.append(HotelOption(
                hotel_id=hid or f"HT-{uuid.uuid4().hex[:8].upper()}",
                name=h.get("name", "Hotel"),
                star_rating=min(max(rating, 1.0), 5.0),
                location=h.get("address", params.location or ""),
                area=params.location.split(",")[0] if params.location else "City Center",
                distance_from_center_km=1.5,
                amenities=["Free WiFi", "Air Conditioning", "Room Service"],
                room_type=h.get("room_name", "Standard Room"),
                meal_plan=meal_plan,
                cancellation_policy=cancel_policy,
                check_in_time="14:00",
                check_out_time="12:00",
                price_per_night=price,
                total_price=round(price * nights, 2),
                nights=nights,
                rank_score=rank_score,
                recommended=(i == 0),
                image_url=str(h.get("image_url") or ""),
                hotel_images=[str(u) for u in (h.get("hotel_images") or []) if u],
                offer_id=h.get("offer_id"),
            ))

        return options

    def _build_response_from_hotels(
        self,
        hotels: list[HotelOption],
        instruction: str,
        search_params: HotelSearchParams | None,
        day_label: str,
    ) -> HotelAgentResponse:
        """Build a HotelAgentResponse directly from a list of HotelOption objects."""
        if not hotels:
            return HotelAgentResponse(
                status=AgentResponseStatus.NOT_FOUND,
                action_performed="search_hotels",
                summary="No hotels found.",
                errors=["No results from real API."],
                day_label=day_label,
                raw_instruction=instruction,
            )
        recommended = max(hotels, key=lambda h: h.rank_score)
        hotels_with_rec = [
            h.model_copy(update={"recommended": h.hotel_id == recommended.hotel_id})
            for h in hotels
        ]
        return HotelAgentResponse(
            status=AgentResponseStatus.SUCCESS,
            action_performed="search_hotels",
            summary=f"Found {len(hotels_with_rec)} real hotels for {day_label}.",
            search_params=search_params,
            hotels=hotels_with_rec,
            recommended_hotel=recommended,
            total_results=len(hotels_with_rec),
            suggested_next_action="Present options to user",
            day_label=day_label,
            raw_instruction=instruction,
        )



    # ── Instruction enrichment ────────────────────────────────────────────────

    @staticmethod
    def _enrich_search_instruction(
        instruction: str,
        params: HotelSearchParams | None,
    ) -> str:
        """Append structured hints to the natural-language instruction."""
        if params is None:
            return instruction
        hints = (
            f"\n\nStructured parameters for accuracy:\n"
            f"  Location: {params.location}\n"
            f"  Check-in: {params.check_in}\n"
            f"  Check-out: {params.check_out}\n"
            f"  Adults: {params.adults}\n"
            f"  Children: {params.children}\n"
            f"  Max Budget Per Night: {params.max_budget_per_night}\n"
            f"  Min Star Rating: {params.min_star_rating}\n"
            f"  Meal Plan: {params.meal_plan.value}\n"
            f"  Free Cancellation Required: {params.free_cancellation}\n"
            f"  Required Amenities: {', '.join(params.amenities_required) or 'None'}\n"
            f"  Room Type Preference: {params.room_type_preference or 'Any'}\n"
        )
        return instruction + hints

    # ── Response parsers ──────────────────────────────────────────────────────

    def _parse_search_response(
        self,
        raw_json: str,
        original_instruction: str,
        search_params: HotelSearchParams | None,
        day_label: str,
    ) -> HotelAgentResponse:
        """Parse raw LLM JSON into a validated HotelAgentResponse."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.error("HotelAgent JSON parse error: %s\nRaw: %s", exc, raw_json[:500])
            return HotelAgentResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="search_hotels",
                summary="Failed to parse hotel search response.",
                errors=[str(exc)],
                suggested_next_action="Retry the search",
                raw_instruction=original_instruction,
                day_label=day_label,
            )

        hotels: list[HotelOption] = []
        recommended_hotel: HotelOption | None = None
        recommended_id = data.get("recommended_hotel_id", "")

        for raw_hotel in data.get("hotels", []):
            try:
                # Normalise meal_plan string to MealPlan enum value
                if "meal_plan" in raw_hotel:
                    raw_hotel["meal_plan"] = self._normalise_meal_plan(raw_hotel["meal_plan"])
                hotel = HotelOption(**raw_hotel)
                if not hotel.total_price:
                    hotel = hotel.model_copy(update={"total_price": hotel.price_per_night})
                hotels.append(hotel)
                if hotel.hotel_id == recommended_id:
                    recommended_hotel = hotel
            except Exception as e:
                logger.warning("Skipping malformed hotel record: %s", e)

        # Fallback: pick highest rank_score as recommendation
        if not recommended_hotel and hotels:
            recommended_hotel = max(hotels, key=lambda h: h.rank_score)
            recommended_hotel = recommended_hotel.model_copy(update={"recommended": True})
            hotels = [
                (
                    h.model_copy(update={"recommended": True})
                    if h.hotel_id == recommended_hotel.hotel_id
                    else h
                )
                for h in hotels
            ]

        status_str = data.get("status", "success")
        try:
            status = AgentResponseStatus(status_str)
        except ValueError:
            status = AgentResponseStatus.SUCCESS

        return HotelAgentResponse(
            status=status if hotels else AgentResponseStatus.NOT_FOUND,
            action_performed=data.get("action_performed", "search_hotels"),
            summary=data.get("summary", f"Found {len(hotels)} hotels."),
            search_params=search_params,
            hotels=hotels,
            recommended_hotel=recommended_hotel,
            total_results=len(hotels),
            filters_applied=data.get("filters_applied", {}),
            errors=data.get("errors", []),
            suggested_next_action=data.get(
                "suggested_next_action", "Present hotel options to user"
            ),
            raw_instruction=original_instruction,
            day_label=day_label,
        )

    def _parse_prebook_response(
        self,
        raw_json: str,
        hotel: HotelOption,
        check_in: date,
        check_out: date,
        guests: dict[str, int],
        total_price: float,
        day_label: str,
    ) -> HotelPrebookResponse:
        """Parse raw LLM JSON into a validated HotelPrebookResponse."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.error("HotelAgent prebook JSON parse error: %s", exc)
            return HotelPrebookResponse(
                status=AgentResponseStatus.ERROR,
                summary="Hotel pre-booking failed — invalid response.",
                errors=[str(exc)],
            )

        prebook_data = data.get("prebook", {})

        # Parse expiry
        expiry_str = prebook_data.get("booking_expiry")
        if expiry_str:
            try:
                expiry = datetime.fromisoformat(expiry_str)
            except ValueError:
                expiry = datetime.now() + timedelta(minutes=45)
        else:
            expiry = datetime.now() + timedelta(minutes=45)

        nights = max((check_out - check_in).days, 1)
        updated_hotel = hotel.model_copy(
            update={"total_price": total_price, "nights": nights}
        )

        prebook = HotelPrebook(
            prebook_id=prebook_data.get(
                "prebook_id", f"HPB-{uuid.uuid4().hex[:10].upper()}"
            ),
            hotel=updated_hotel,
            check_in=check_in,
            check_out=check_out,
            room_type=prebook_data.get("room_type", hotel.room_type),
            guests=guests,
            total_price=total_price,
            currency=prebook_data.get("currency", "INR"),
            booking_status=prebook_data.get(
                "booking_status", "Pre-booked (Pending Confirmation)"
            ),
            booking_expiry=expiry,
            day_label=day_label,
        )

        status_str = data.get("status", "success")
        try:
            status = AgentResponseStatus(status_str)
        except ValueError:
            status = AgentResponseStatus.SUCCESS

        return HotelPrebookResponse(
            status=status,
            action_performed="prebook_hotel",
            summary=data.get(
                "summary",
                f"{hotel.name} pre-booked for {nights} night(s). "
                f"Prebook ID: {prebook.prebook_id}.",
            ),
            prebook=prebook,
            errors=data.get("errors", []),
            suggested_next_action=data.get(
                "suggested_next_action", "Proceed to final itinerary"
            ),
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _normalise_meal_plan(raw: str) -> str:
        """Map common free-form meal plan strings to valid MealPlan enum values."""
        mapping: dict[str, str] = {
            "room only": MealPlan.ROOM_ONLY.value,
            "ro": MealPlan.ROOM_ONLY.value,
            "breakfast": MealPlan.BREAKFAST.value,
            "breakfast included": MealPlan.BREAKFAST.value,
            "bb": MealPlan.BREAKFAST.value,
            "bed and breakfast": MealPlan.BREAKFAST.value,
            "half board": MealPlan.HALF_BOARD.value,
            "hb": MealPlan.HALF_BOARD.value,
            "full board": MealPlan.FULL_BOARD.value,
            "fb": MealPlan.FULL_BOARD.value,
            "all inclusive": MealPlan.ALL_INCLUSIVE.value,
            "ai": MealPlan.ALL_INCLUSIVE.value,
        }
        normalised = mapping.get(raw.strip().lower())
        return normalised if normalised else MealPlan.BREAKFAST.value
