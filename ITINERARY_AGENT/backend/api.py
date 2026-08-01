"""
FastAPI server — REST API for the AI Travel Itinerary Planner.

Exposes every endpoint the frontend SPA expects and drives the
LangGraph workflow per session using interrupt / resume.
"""

from __future__ import annotations

import os
import uuid
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from langgraph.types import Command

from backend.config import settings
from backend.graph.graph import get_graph
from backend.models.state import (
    AppState,
    TripRequirements,
    TripType,
    WorkflowStep,
)
from backend.services.itinerary_versioning import (
    build_comparison,
    compare_itineraries,
    save_itinerary_version,
    set_active_itinerary,
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="AI Travel Itinerary Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Session store
# ---------------------------------------------------------------------------

_sessions: Dict[str, dict] = {}

def _get_graph():
    return get_graph()

# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class SessionCreateResponse(BaseModel):
    session_id: str
    welcome_message: str

class ChatRequest(BaseModel):
    session_id: str
    message: str

class SubmitRequirementsRequest(BaseModel):
    session_id: str
    departure_city: Optional[str] = None
    destination: Optional[str] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    num_travelers: Optional[int] = None
    budget: Optional[float] = None
    trip_type: Optional[str] = None
    special_requests: Optional[str] = None

class FlightSearchRequest(BaseModel):
    session_id: str
    origin: Optional[str] = None
    destination: Optional[str] = None
    departure_date: Optional[str] = None
    num_passengers: Optional[int] = None
    max_price: Optional[float] = None

class FlightSelectRequest(BaseModel):
    session_id: str
    flight_id: str

class FlightPrebookRequest(BaseModel):
    session_id: str
    flight_id: str
    num_passengers: int = 1

class FlightPassengerDetailsRequest(BaseModel):
    """Passenger Details form payload submitted to the workflow."""
    session_id: str
    contact: Dict[str, Any]
    passengers: List[Dict[str, Any]]

class HotelSearchRequest(BaseModel):
    session_id: str
    destination: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    num_guests: Optional[int] = None
    max_price_per_night: Optional[float] = None
    decision: Optional[str] = None

class HotelSelectRequest(BaseModel):
    session_id: str
    hotel_id: str
    day_number: int = 1

class HotelPrebookBulkRequest(BaseModel):
    session_id: str
    selections: List[Dict[str, Any]] = Field(default_factory=list)
    decision: Optional[str] = None

class HotelRoomSelectRequest(BaseModel):
    session_id: str
    offer_index: int

class ItineraryDraftRequest(BaseModel):
    session_id: str

class ItineraryFinalRequest(BaseModel):
    session_id: str

class RegenerateRequest(BaseModel):
    session_id: str
    version_label: Optional[str] = None
    destination: Optional[str] = None
    budget: Optional[float] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    num_travelers: Optional[int] = None
    trip_type: Optional[str] = None
    special_requests: Optional[str] = None

class CompareVersionsRequest(BaseModel):
    session_id: str
    v1: int
    v2: int

class SetActiveVersionRequest(BaseModel):
    session_id: str
    version_number: int

# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------

def _build_response(state_snapshot, session_id: str):
    values = getattr(state_snapshot, "values", None) or state_snapshot
    if hasattr(values, "model_dump"):
        state = values.model_dump()
    elif isinstance(values, dict):
        state = values
    else:
        state = {}

    msg = state.get("current_assistant_message", "") or ""

    # Extract the pending interrupt — may be a plain string (chat prompt)
    # or a structured dict (e.g. passenger-details form / prebook confirmation).
    tasks = getattr(state_snapshot, "tasks", None) or ()
    interrupt_val = None
    payload = None
    for task in tasks:
        interrupts = getattr(task, "interrupts", None) or ()
        for iv in interrupts:
            val = getattr(iv, "value", None) or str(iv)
            if val:
                if isinstance(val, dict):
                    payload = val
                    interrupt_val = val.get("message") or ""
                else:
                    interrupt_val = str(val)
                break
        if interrupt_val is not None or payload is not None:
            break

    resp = {
        "session_id": session_id,
        "assistant_message": interrupt_val or msg,
        "workflow_step": state.get("workflow_step", "collect_requirements"),
        "ui_action": state.get("ui_action"),
        "trip_requirements": state.get("trip_requirements"),
    }

    # Structured interrupt payload (drives frontend modals / forms)
    if payload:
        resp["ui_payload"] = payload

    # Attach flight data (both names for frontend compatibility)
    flights = state.get("flight_search_results")
    if flights:
        resp["flight_results"] = flights
        resp["flights"] = flights
        resp["count"] = len(flights)

    # Attach hotel data (both names for frontend compatibility)
    hotels = state.get("hotel_search_results")
    if hotels:
        resp["hotel_results"] = hotels
        resp["hotels"] = hotels
        resp["hotel_count"] = len(hotels)
        resp["count"] = resp.get("count", len(hotels))

    # Attach per-night flow metadata
    resp["current_night"] = state.get("current_night", 1)
    resp["total_nights"] = len(state.get("hotel_night_segments") or []) or 1

    # Attach room offers for the currently selected hotel
    offers = state.get("hotel_room_offers")
    if offers:
        resp["room_offers"] = offers

    # Attach night selections + prebook results (frontend summary)
    selections = state.get("hotel_night_selections")
    if selections:
        resp["night_selections"] = selections
    prebooks = state.get("hotel_prebooks")
    if prebooks:
        resp["prebooks"] = prebooks

    # Attach version data
    versions = state.get("itinerary_versions")
    if versions:
        resp["versions"] = versions
        resp["active_version"] = state.get("active_itinerary_version", 0)
        resp["total_versions"] = len(versions)

    # Attach itinerary data (for chat response UI actions)
    draft = state.get("draft_itinerary")
    if draft:
        if hasattr(draft, "model_dump"):
            resp["draft_itinerary"] = draft.model_dump()
        else:
            resp["draft_itinerary"] = draft

    final = state.get("final_itinerary")
    if final:
        if hasattr(final, "model_dump"):
            resp["final_itinerary"] = final.model_dump()
        else:
            resp["final_itinerary"] = final

    # UI action hints — structured interrupt payloads take precedence
    step = state.get("workflow_step", "")
    step_str = step.value if hasattr(step, "value") else str(step)
    if payload and payload.get("type"):
        resp["ui_action"] = payload["type"]
    elif step_str == "draft_itinerary" and resp.get("draft_itinerary"):
        resp["ui_action"] = "show_draft_itinerary"
    elif step_str == "draft_confirm" and resp.get("draft_itinerary"):
        resp["ui_action"] = "show_draft_itinerary"
    elif step_str == "final_itinerary" or step_str == "completed":
        if resp.get("final_itinerary"):
            resp["ui_action"] = "show_final_itinerary"
    elif resp.get("flight_results"):
        if not resp.get("ui_action"):
            resp["ui_action"] = "show_flights"
    elif resp.get("hotel_results"):
        if not resp.get("ui_action"):
            resp["ui_action"] = "show_hotels"

    return resp

def _get_current_state(session):
    return session["graph"].get_state(session["config"])

def _require_session(session_id: str):
    if session_id not in _sessions:
        raise HTTPException(404, f"Session {session_id} not found")
    return _sessions[session_id]

# ---------------------------------------------------------------------------
# Static files + SPA fallback
# ---------------------------------------------------------------------------

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
async def serve_index():
    index = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return {"status": "ok"}

# ===========================================================================
# SESSION ENDPOINTS
# ===========================================================================

@app.post("/api/session/create", response_model=SessionCreateResponse)
async def create_session():
    thread_id = uuid.uuid4().hex
    session_id = uuid.uuid4().hex
    graph = _get_graph()
    config = {"configurable": {"thread_id": thread_id}}

    session = {"graph": graph, "config": config, "thread_id": thread_id}
    initial = AppState(session_id=session_id)
    try:
        result = _invoke_graph(session, initial_state=initial)
    except Exception:
        pass

    snap = graph.get_state(config)
    tasks = getattr(snap, "tasks", None) or ()
    welcome = ""
    for task in tasks:
        interrupts = getattr(task, "interrupts", None) or ()
        for iv in interrupts:
            val = getattr(iv, "value", None) or str(iv)
            if val:
                welcome = str(val)
                break

    session["session_id"] = session_id
    _sessions[session_id] = session

    return SessionCreateResponse(session_id=session_id, welcome_message=welcome or "Welcome! Plan your trip.")

@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    _sessions.pop(session_id, None)
    return {"status": "deleted"}

@app.get("/api/session/{session_id}/status")
async def get_session_status(session_id: str):
    session = _require_session(session_id)
    snap = _get_current_state(session)
    return _build_response(snap, session_id)

# ===========================================================================
# CHAT
# ===========================================================================

@app.post("/api/chat")
async def chat(req: ChatRequest):
    session = _require_session(req.session_id)
    try:
        result = _invoke_graph(session, resume_value=req.message)
    except Exception as exc:
        snap = _get_current_state(session)
        return _build_response(snap, req.session_id)
    snap = _get_current_state(session)
    resp = _build_response(snap, req.session_id)
    # Extract ui_action from last node's output if present
    if isinstance(result, dict) and result.get("ui_action"):
        resp["ui_action"] = result["ui_action"]
    return resp

# ===========================================================================
# REQUIREMENTS
# ===========================================================================

@app.post("/api/requirements/submit")
async def submit_requirements(req: SubmitRequirementsRequest):
    session = _require_session(req.session_id)
    body = _build_requirements_body(req)
    try:
        result = _invoke_graph(session, resume_value=body)
    except Exception as exc:
        snap = _get_current_state(session)
        return _build_response(snap, req.session_id)
    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

def _build_requirements_body(req: SubmitRequirementsRequest) -> str:
    parts = ["Please plan a trip."]
    if req.departure_city:
        parts.append(f"Departure city: {req.departure_city}.")
    if req.destination:
        parts.append(f"Destination: {req.destination}.")
    if req.departure_date:
        parts.append(f"Departure date: {req.departure_date}.")
    if req.return_date:
        parts.append(f"Return date: {req.return_date}.")
    if req.num_travelers:
        parts.append(f"Number of travelers: {req.num_travelers}.")
    if req.budget:
        parts.append(f"Budget: {req.budget} INR.")
    if req.trip_type:
        parts.append(f"Trip type: {req.trip_type}.")
    if req.special_requests:
        parts.append(f"Special requests: {req.special_requests}.")
    return " ".join(parts)

# ===========================================================================
# FLIGHTS
# ===========================================================================

@app.post("/api/flight/search")
async def search_flights(req: FlightSearchRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    # If graph is waiting for user_confirmation, auto-confirm with "yes"
    if step == "user_confirmation":
        try:
            result = _invoke_graph(session, resume_value="yes")
        except Exception:
            pass
        snap = _get_current_state(session)

    # The graph should now be at flight_ranking (or beyond)
    step = _get_step(snap)

    if step == "flight_ranking" or step == "flight_search":
        try:
            result = _invoke_graph(session, resume_value="yes")
        except Exception:
            pass
        snap = _get_current_state(session)

    resp = _build_response(snap, req.session_id)

    # If flights found, also run a second resume so the frontend
    # sees the ranked list ready for selection
    if resp.get("flight_results"):
        pass  # already has flights from state

    return resp

@app.post("/api/flight/select")
async def select_flight(req: FlightSelectRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    flights = _get_field(snap, "flight_search_results") or []

    idx = None
    for i, f in enumerate(flights):
        if getattr(f, "flight_id", None) == req.flight_id:
            idx = i
            break

    if idx is None:
        raise HTTPException(400, f"Flight {req.flight_id} not found in search results")

    try:
        result = _invoke_graph(session, resume_value=str(idx + 1))
    except Exception:
        pass
    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

@app.post("/api/flight/passenger-details")
async def submit_flight_passenger_details(req: FlightPassengerDetailsRequest):
    """
    Resume the workflow with the Passenger Details form payload.

    The graph (currently paused at `flight_passenger_details`) validates the
    data, then calls the real LiteAPI pre-booking API in `flight_prebook`.
    """
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    if step != "flight_passenger_details":
        raise HTTPException(
            409,
            "The workflow is not waiting for passenger details right now.",
        )

    try:
        _invoke_graph(
            session,
            resume_value={"contact": req.contact, "passengers": req.passengers},
        )
    except Exception as exc:
        raise HTTPException(500, f"Flight pre-booking failed: {exc}")

    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

@app.post("/api/flight/prebook")
async def prebook_flight(req: FlightPrebookRequest):
    """
    Compatibility endpoint — pre-booking now happens AFTER the Passenger
    Details form is collected (POST /api/flight/passenger-details).

    This endpoint drives the graph up to the passenger-details step so
    older clients still get a valid, in-flow response.
    """
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    # If the graph is showing ranked flights, select the requested one first
    if step == "flight_ranking":
        flights = _get_field(snap, "flight_search_results") or []
        idx = None
        for i, f in enumerate(flights):
            fid = f.get("flight_id") if isinstance(f, dict) else getattr(f, "flight_id", None)
            if fid == req.flight_id:
                idx = i
                break
        if idx is None:
            raise HTTPException(400, f"Flight {req.flight_id} not found")
        try:
            _invoke_graph(session, resume_value=str(idx + 1))
        except Exception:
            pass
        snap = _get_current_state(session)
        step = _get_step(snap)

    # From here the graph pauses at passenger details — no direct pre-book.
    resp = _build_response(snap, req.session_id)

    # Keep prebook data at top level for older frontends
    prebook = _get_field(snap, "flight_prebook")
    if prebook:
        prebook_id = (
            prebook.get("prebook_id") if isinstance(prebook, dict)
            else getattr(prebook, "prebook_id", None)
        )
        total_charged = (
            prebook.get("total_charged") if isinstance(prebook, dict)
            else getattr(prebook, "total_charged", None)
        )
        status = (
            prebook.get("status", "confirmed") if isinstance(prebook, dict)
            else getattr(prebook, "status", "confirmed")
        )
        resp["prebook_id"] = prebook_id
        resp["total_charged"] = total_charged
        resp["status"] = status
        resp["assistant_message"] = resp.get("assistant_message", "") or f"✅ Flight pre-booked! ID: {prebook_id}"
    return resp

# ===========================================================================
# HOTELS
# ===========================================================================

@app.post("/api/hotel/search")
async def search_hotels(req: HotelSearchRequest):
    session = _require_session(req.session_id)

    # Chain through "yes"-answering steps until we reach the hotel flow
    # (flight pre-booked → draft → hotel search) or the graph stops.
    yes_steps = ("user_confirmation", "collect_requirements", "flight_prebooked",
                 "draft_itinerary")
    for _ in range(6):
        snap = _get_current_state(session)
        step = _get_step(snap)
        if "draft" in step or step in yes_steps:
            try:
                _invoke_graph(session, resume_value="yes")
            except Exception:
                break
            continue
        break

    # If paused at hotel_search (error / no results / no rooms), resume with
    # the frontend's decision (retry / relax / skip / cancel)
    snap = _get_current_state(session)
    step = _get_step(snap)
    if step == "hotel_search":
        try:
            _invoke_graph(session, resume_value=(req.decision or "retry").strip().lower())
        except Exception:
            pass
    elif step == "hotel_ranking":
        # Paused after "no rooms" — any non-numeric resume re-prompts the
        # ranked hotel list for the current night.
        try:
            _invoke_graph(session, resume_value="show")
        except Exception:
            pass

    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

@app.post("/api/hotel/select")
async def select_hotel(req: HotelSelectRequest):
    """
    Select a hotel for the CURRENT night.

    Resumes the graph with the hotel's position in the current night's
    ranked list. The graph then pauses at the room-offer selection step,
    which is returned in the response (`ui_payload` / `room_offers`).
    """
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    if step not in ("hotel_ranking", "hotel_selection"):
        raise HTTPException(
            409,
            "The workflow is not waiting for a hotel selection right now.",
        )

    hotels = _get_field(snap, "hotel_search_results") or []

    idx = None
    for i, h in enumerate(hotels):
        hid = h.get("hotel_id") if isinstance(h, dict) else getattr(h, "hotel_id", None)
        if hid == req.hotel_id:
            idx = i
            break

    if idx is None:
        raise HTTPException(400, f"Hotel {req.hotel_id} not found in search results")

    try:
        result = _invoke_graph(session, resume_value=str(idx + 1))
    except Exception as exc:
        raise HTTPException(500, f"Hotel selection failed: {exc}")

    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

@app.post("/api/hotel/room/select")
async def select_hotel_room(req: "HotelRoomSelectRequest"):
    """
    Select a room offer for the current night's hotel.

    Resumes the graph with the offer's position (1-based). The graph then
    either starts the NEXT night (response contains the next night's hotel
    list) or shows the combined summary (`ui_payload` / `ui_action`).
    """
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    if step != "hotel_room_selection":
        raise HTTPException(
            409,
            "The workflow is not waiting for a room selection right now.",
        )

    try:
        result = _invoke_graph(session, resume_value=str(req.offer_index))
    except Exception as exc:
        raise HTTPException(500, f"Room selection failed: {exc}")

    snap = _get_current_state(session)
    return _build_response(snap, req.session_id)

@app.post("/api/hotel/prebook")
async def prebook_hotels(req: HotelPrebookBulkRequest):
    """
    Confirms the combined summary and runs the sequential pre-book flow.

    - At `hotel_summary`: resume with "yes" to confirm (or "no" to restart).
    - At `hotel_prebook` / `hotel_prebook_retry`: resume with the user's
      decision ("retry" / "skip" / "abort").
    """
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    step = _get_step(snap)

    decision = (req.decision or "").strip().lower() if req.decision else ""

    if step == "hotel_summary":
        resume = "yes" if decision in ("yes", "y", "confirm", "proceed") else "yes"
        try:
            result = _invoke_graph(session, resume_value=resume)
        except Exception:
            pass
        snap = _get_current_state(session)
        step = _get_step(snap)

    # Pre-book may have paused on a per-night error — apply the decision
    if step in ("hotel_prebook", "hotel_prebook_retry"):
        resume = decision or "retry"
        try:
            result = _invoke_graph(session, resume_value=resume)
        except Exception:
            pass
        snap = _get_current_state(session)

    resp = _build_response(snap, req.session_id)

    # Include prebook data (both names for frontend compatibility)
    prebooks = _get_field(snap, "hotel_prebooks") or {}
    if prebooks:
        resp["prebooks"] = {}
        for day, pb in prebooks.items():
            if isinstance(pb, dict):
                resp["prebooks"][day] = pb
            else:
                resp["prebooks"][day] = pb.model_dump() if hasattr(pb, "model_dump") else str(pb)

    selections = _get_field(snap, "hotel_night_selections") or []
    if selections:
        resp["prebook_results"] = [
            s.model_dump() if hasattr(s, "model_dump") else s
            for s in selections
        ]

    return resp

# ===========================================================================
# ITINERARY — draft & final
# ===========================================================================

@app.post("/api/itinerary/draft")
async def get_draft_itinerary(req: ItineraryDraftRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    draft = _get_field(snap, "draft_itinerary")
    if draft:
        if isinstance(draft, dict):
            return {"draft": draft}
        return {"draft": draft.model_dump()}
    # If no draft yet, resume the graph to generate it.
    # Graph is typically paused at FLIGHT_PREBOOKED (after pre-booking);
    # resuming with "yes" flows through node_flight_prebooked -> node_draft_itinerary
    # (which commits the draft) -> node_draft_confirm (which pauses).
    try:
        result = _invoke_graph(session, resume_value="yes")
    except Exception as exc:
        raise HTTPException(500, f"Itinerary generation failed: {exc}")
    snap = _get_current_state(session)
    draft = _get_field(snap, "draft_itinerary")
    if draft:
        if isinstance(draft, dict):
            return {"draft": draft}
        return {"draft": draft.model_dump()}
    step = _get_step(snap)
    if step == "flight_prebooked" or step == "draft_confirm":
        return {"draft": None, "assistant_message": "Draft generation is still in progress. Please try again in a moment."}
    return {"draft": None, "assistant_message": "No draft itinerary available yet."}

@app.post("/api/itinerary/final")
async def get_final_itinerary(req: ItineraryFinalRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    final = _get_field(snap, "final_itinerary")
    if final:
        if isinstance(final, dict):
            return {"final": final}
        return {"final": final.model_dump()}
    try:
        result = _invoke_graph(session, resume_value="yes")
    except Exception:
        pass
    snap = _get_current_state(session)
    final = _get_field(snap, "final_itinerary")
    if final:
        if isinstance(final, dict):
            return {"final": final}
        return {"final": final.model_dump()}
    return {"final": None, "assistant_message": "No final itinerary available yet."}

# ===========================================================================
# ITINERARY — versioning
# ===========================================================================

@app.get("/api/itinerary/{session_id}/versions")
async def get_versions(session_id: str):
    session = _require_session(session_id)
    snap = _get_current_state(session)
    versions = _get_field(snap, "itinerary_versions") or []
    active = _get_field(snap, "active_itinerary_version") or 0
    result = []
    for v in versions:
        if isinstance(v, dict):
            result.append(v)
        else:
            result.append(v.model_dump() if hasattr(v, "model_dump") else {"version_number": 0})
    return {
        "session_id": session_id,
        "versions": result,
        "active_version": active,
        "total_versions": len(result),
    }

@app.post("/api/itinerary/regenerate")
async def regenerate_itinerary(req: RegenerateRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    state_values = _get_values(snap)

    current_req = _get_field(snap, "trip_requirements") or {}
    if isinstance(current_req, dict):
        req_dict = dict(current_req)
    else:
        req_dict = current_req.model_dump() if hasattr(current_req, "model_dump") else {}

    # Apply overrides
    if req.destination is not None:
        req_dict["destination"] = req.destination
    if req.budget is not None:
        req_dict["budget"] = req.budget
    if req.departure_date is not None:
        req_dict["departure_date"] = req.departure_date
    if req.return_date is not None:
        req_dict["return_date"] = req.return_date
    if req.num_travelers is not None:
        req_dict["num_travelers"] = req.num_travelers
    if req.trip_type is not None:
        req_dict["trip_type"] = req.trip_type
    if req.special_requests is not None:
        req_dict["special_requests"] = req.special_requests

    updated_req = TripRequirements(**req_dict)
    old_req_dict = req_dict.copy()

    # Get flight info from current state
    flight = _get_field(snap, "selected_flight")

    # Create a modified AppState for regenerating
    from backend.agents.itinerary_agent import ItineraryAgent

    agent = ItineraryAgent()
    state_for_draft = AppState(
        session_id=req.session_id,
        trip_requirements=updated_req,
        selected_flight=flight,
        flight_prebook=_get_field(snap, "flight_prebook"),
    )
    # Copy over version history
    versions = _get_field(snap, "itinerary_versions") or []
    state_for_draft.itinerary_versions = versions

    try:
        new_draft = agent.generate_draft_itinerary(state_for_draft)
    except Exception as exc:
        raise HTTPException(500, f"Itinerary generation failed: {exc}")

    # Save as new version
    next_number = len(versions) + 1
    label = req.version_label or f"Edit #{next_number - 1}"

    updated_state = save_itinerary_version(state_for_draft, new_draft, label=label)
    updated_state = set_active_itinerary(updated_state, next_number)

    # Build comparison with previous active version
    prev_version = _get_field(snap, "active_itinerary_version") or 1
    comparison = None
    try:
        comparison = build_comparison(updated_state, prev_version, next_number)
    except Exception:
        comparison = None

    return {
        "session_id": req.session_id,
        "version_number": next_number,
        "version_label": label,
        "assistant_message": f"✨ **New version {next_number} generated!** Comparing with version {prev_version}...",
        "draft": new_draft.model_dump(),
        "comparison": comparison,
    }

@app.post("/api/itinerary/compare")
async def compare_versions(req: CompareVersionsRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    state_values = _get_values(snap)

    from backend.models.state import AppState as AS

    # Build a temporary AppState to use versioning service
    state_obj = AS(
        session_id=req.session_id,
        itinerary_versions=_get_field(snap, "itinerary_versions") or [],
        active_itinerary_version=_get_field(snap, "active_itinerary_version") or 0,
    )

    try:
        comparison = build_comparison(state_obj, req.v1, req.v2)
    except ValueError as exc:
        raise HTTPException(404, str(exc))

    changes = comparison.get("changes_count", 0)
    return {
        "session_id": req.session_id,
        "comparison": comparison,
        "changes_count": changes,
        "assistant_message": (
            f"📊 **Version {req.v1} vs Version {req.v2}** — "
            f"{changes} change{'s' if changes != 1 else ''} detected."
        ),
    }

@app.post("/api/itinerary/set-active")
async def set_active_version(req: SetActiveVersionRequest):
    session = _require_session(req.session_id)
    snap = _get_current_state(session)
    state_values = _get_values(snap)

    from backend.models.state import AppState as AS

    state_obj = AS(
        session_id=req.session_id,
        itinerary_versions=_get_field(snap, "itinerary_versions") or [],
        active_itinerary_version=_get_field(snap, "active_itinerary_version") or 0,
    )

    try:
        updated = set_active_itinerary(state_obj, req.version_number)
    except ValueError as exc:
        raise HTTPException(404, str(exc))

    # Persist the updated state back to the checkpointer
    session["graph"].update_state(
        session["config"],
        {
            "active_itinerary_version": req.version_number,
            "draft_itinerary": updated.draft_itinerary,
        },
    )

    draft = updated.draft_itinerary
    return {
        "session_id": req.session_id,
        "version_number": req.version_number,
        "assistant_message": f"✅ Version {req.version_number} is now active.",
        "draft": draft.model_dump() if draft and hasattr(draft, "model_dump") else (draft or {}),
    }

# ===========================================================================
# Helpers
# ===========================================================================

def _get_step(snap) -> str:
    values = _get_values(snap)
    step = values.get("workflow_step", "")
    return step.value if hasattr(step, "value") else str(step)

def _get_field(snap, field: str):
    values = _get_values(snap)
    return values.get(field)

def _get_values(snap) -> dict:
    values = getattr(snap, "values", None)
    if values is None:
        return {}
    if isinstance(values, dict):
        return values
    if hasattr(values, "model_dump"):
        return values.model_dump()
    return {}

def _invoke_graph(session, initial_state=None, resume_value=None):
    if initial_state is not None:
        return session["graph"].invoke(initial_state, session["config"])
    return session["graph"].invoke(Command(resume=resume_value), session["config"])
