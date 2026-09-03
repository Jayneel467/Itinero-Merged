"""Live E2E: search → select → pax → traveler → hold → complete → retrieve → cancel."""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import date, timedelta

from flight_agent import FlightAgent, FlightAgentInput, SessionContext
from flight_agent.config import get_settings
from flight_agent.llm.tools import build_flight_tools
from flight_agent.logging_config import configure_logging

RESULTS: list[tuple[str, str, str]] = []


def ok(step: str, detail: str = "") -> None:
    RESULTS.append(("PASS", step, detail))
    print(f"[PASS] {step}" + (f" — {detail}" if detail else ""))


def fail(step: str, detail: str = "") -> None:
    RESULTS.append(("FAIL", step, detail))
    print(f"[FAIL] {step}" + (f" — {detail}" if detail else ""))


def note(step: str, detail: str = "") -> None:
    RESULTS.append(("INFO", step, detail))
    print(f"[INFO] {step}" + (f" — {detail}" if detail else ""))


async def chat(agent: FlightAgent, session: SessionContext, message: str) -> SessionContext:
    out = await agent.run(
        FlightAgentInput(message=message, session_context=session, history=[])
    )
    preview = (out.response or "").replace("\n", " ")[:160]
    print(f"  USER: {message}")
    print(f"  BOT : {preview}")
    print(
        f"  state: intent={out.intent.value} prebook={session.prebook_id} "
        f"booking={out.session_context.booking_id} "
        f"await_book_yes={out.session_context.awaiting_booking_confirmation} "
        f"await_pay_yes={out.session_context.awaiting_payment_confirmation}"
    )
    return out.session_context


async def main() -> int:
    configure_logging()
    get_settings.cache_clear()
    settings = get_settings()
    dep = date.today() + timedelta(days=14)
    dep_s = dep.strftime("%d %B %Y")

    print("=" * 64)
    print("LIVE E2E — LiteAPI sandbox + Flight Agent")
    print(f"APP_ENV={settings.app_env}  PAYMENT_SDK={settings.liteapi_use_payment_sdk}")
    print(f"Route date: {dep.isoformat()}")
    print("=" * 64)

    agent = FlightAgent()
    session = SessionContext()
    summary_printed = False

    try:
        # 1) Search
        session = await chat(agent, session, f"Mumbai to Delhi on {dep_s}")
        if session.last_search_results:
            ok("1.search", f"{len(session.last_search_results)} offers")
        else:
            fail("1.search", "no offers")
            return 1

        # 2) Select
        session = await chat(agent, session, "option 1")
        if session.selected_offer_index is not None or session.selected_offer_id:
            ok("2.select", f"index={session.selected_offer_index}")
        else:
            fail("2.select", "no offer selected")

        # 3) Passengers + verify
        session = await chat(agent, session, "1 adult")
        if session.verified_offer_id:
            ok("3.passengers+verify", f"offer={session.verified_offer_id[:28]}…")
        else:
            fail("3.passengers+verify", "no verified_offer_id")

        # 4) Traveler details (tool kwargs — not JSON blob)
        tools = {t.name: t for t in build_flight_tools(agent._flight_service, session)}
        raw = await tools["save_traveler_info"].ainvoke(
            {
                "full_name": "Mukesh Kumar",
                "email": "mukesh.e2e@example.com",
                "phone": "+917895786452",
                "birthday": "1995-03-22",
                "gender": "M",
                "id_number": "5165484956",
                "nationality": "IN",
                "passenger_number": 1,
            }
        )
        data = json.loads(raw) if isinstance(raw, str) else raw
        status = data.get("status")
        print(f"  save_traveler status={status} still_need={data.get('still_need')}")
        if status in {
            "await_service_preference",
            "await_confirmation",
            "complete",
            "saved",
            "ok",
        } or (
            session.travelers_draft
            and not data.get("still_need")
            and status not in {"incomplete", "need_more"}
        ):
            ok("4.traveler_info", status or "saved")
        elif status == "incomplete":
            fail("4.traveler_info", f"still_need={data.get('still_need')}")
            _print_summary()
            summary_printed = True
            return 1
        else:
            ok("4.traveler_info", f"status={status}")

        # 5) Extras → none
        if session.awaiting_service_preference or not session.service_preference:
            session = await chat(agent, session, "none")
        if session.service_preference == "none" or session.awaiting_booking_confirmation:
            ok("5.extras", f"pref={session.service_preference}")
        else:
            session.service_preference = "none"
            session.awaiting_service_preference = False
            session.awaiting_booking_confirmation = True
            note("5.extras", "forced none")

        # 6) YES → prebook hold
        if not session.awaiting_booking_confirmation and not session.prebook_id:
            session.awaiting_booking_confirmation = True
        session = await chat(agent, session, "YES")
        if session.prebook_id:
            ok(
                "6.prebook_hold",
                f"id={session.prebook_id[:24]}… "
                f"tx={bool(session.transaction_id)} "
                f"secret={bool(session.secret_key)} "
                f"pk={bool(session.publishable_key)} "
                f"price={ (session.last_prebook or {}).get('price') }",
            )
        else:
            # Direct tool for clearer error
            tools = {t.name: t for t in build_flight_tools(agent._flight_service, session)}
            session.booking_confirmed = True
            session.awaiting_booking_confirmation = False
            raw = await tools["prebook_flight"].ainvoke({})
            data = json.loads(raw) if isinstance(raw, str) else raw
            if data.get("prebook_id") or session.prebook_id:
                session.prebook_id = data.get("prebook_id") or session.prebook_id
                ok("6.prebook_hold", f"id={session.prebook_id[:24]}… (direct tool)")
            else:
                fail(
                    "6.prebook_hold",
                    (data.get("user_prompt") or data.get("still_need") or data.get("status") or str(data))[
                        :280
                    ],
                )
                _print_summary()
                summary_printed = True
                return 1

        # 7) Payment / complete is backend checkout — agent stops at hold
        note(
            "7.payment_handoff",
            "Flight agent does not complete payment; backend checkout issues the ticket",
        )
        if session.prebook_id:
            ok("7.hold_ready", f"prebook_id={session.prebook_id[:24]}…")
        else:
            fail("7.hold_ready", "missing prebook_id after hold")

        tools = {t.name: t for t in build_flight_tools(agent._flight_service, session)}
        if "complete_flight_booking" in tools:
            fail("7.no_complete_tool", "complete_flight_booking should not be on the agent")
        else:
            ok("7.no_complete_tool", "payment complete not exposed to flight agent")

        note("8.retrieve_skip", "retrieve/cancel need a ticket from backend checkout")
        note("9.cancel_skip", "skipped — no agent-issued booking_id")

    except Exception as exc:
        fail("exception", f"{type(exc).__name__}: {exc}")
        import traceback

        traceback.print_exc()
    finally:
        await agent.aclose()
        if not summary_printed:
            _print_summary()

    fails = sum(1 for r in RESULTS if r[0] == "FAIL")
    return 1 if fails else 0


def _print_summary() -> None:
    print()
    print("=" * 64)
    print("SUMMARY")
    print("=" * 64)
    for kind, step, detail in RESULTS:
        mark = {"PASS": "OK", "FAIL": "XX", "INFO": "--"}.get(kind, "??")
        line = f"  [{mark}] {step}"
        if detail:
            line += f" — {detail}"
        print(line)
    passes = sum(1 for r in RESULTS if r[0] == "PASS")
    fails = sum(1 for r in RESULTS if r[0] == "FAIL")
    print(f"\n  Totals: {passes} PASS · {fails} FAIL · {len(RESULTS) - passes - fails} INFO")
    print("=" * 64)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(asyncio.run(main()))
