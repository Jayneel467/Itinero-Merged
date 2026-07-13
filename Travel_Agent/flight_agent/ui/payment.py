"""Stripe Payment Element helpers for the Streamlit demo."""

from __future__ import annotations

import html
from typing import Any

import streamlit as st
import streamlit.components.v1 as components

from flight_agent.config import get_settings
from flight_agent.models.agent import SessionContext


def _publishable_key(session: SessionContext) -> str:
    settings = get_settings()
    return (
        (session.publishable_key or "").strip()
        or (settings.stripe_publishable_key or "").strip()
        or ((session.last_prebook or {}).get("publishable_key") or "").strip()
    )


def should_show_payment_panel(session: SessionContext) -> bool:
    """True when the fare is held and card payment is required."""
    settings = get_settings()
    if not settings.liteapi_use_payment_sdk:
        return False
    if session.booking_id:
        return False
    if not session.awaiting_payment_confirmation:
        return False
    if not session.secret_key or not session.transaction_id:
        return False
    return True


def render_payment_panel(session: SessionContext) -> None:
    """Show Stripe card form + issue-ticket button after prebook hold."""
    if not should_show_payment_panel(session):
        return

    prebook = session.last_prebook or {}
    price = prebook.get("price")
    currency = (prebook.get("currency") or "INR").upper()
    amount_label = f"{currency} {price}" if price is not None else "held fare"
    pk = _publishable_key(session)
    secret = (session.secret_key or "").strip()

    st.divider()
    st.subheader("Pay for your flight")
    st.caption(f"Amount due: **{amount_label}** · Card payment via LiteAPI / Stripe")

    if session.payment_captured:
        st.success("Card payment succeeded. Click **Issue ticket** to finish booking.")
    elif not pk:
        st.warning(
            "Payment SDK is on, but no Stripe publishable key was returned. "
            "Set `STRIPE_PUBLISHABLE_KEY` in `.env`, or ask LiteAPI to enable Payment SDK keys on your account."
        )
        st.code(
            "Test card (when keys work): 4242 4242 4242 4242 · any future expiry · any CVC",
            language=None,
        )
    else:
        _render_stripe_elements(pk, secret, amount_label)
        st.caption("Sandbox test card: `4242 4242 4242 4242` · any future MM/YY · any CVC · any ZIP")

    col1, col2 = st.columns(2)
    with col1:
        if st.button("Mark payment done", use_container_width=True, disabled=session.payment_captured):
            session.payment_captured = True
            st.rerun()
    with col2:
        if st.button("Issue ticket", type="primary", use_container_width=True):
            st.session_state["_issue_ticket"] = True
            st.rerun()


def _render_stripe_elements(publishable_key: str, client_secret: str, amount_label: str) -> None:
    """Embed Stripe Card Element; user pays inside the iframe."""
    pk = html.escape(publishable_key, quote=True)
    secret = html.escape(client_secret, quote=True)
    label = html.escape(amount_label, quote=True)
    components.html(
        f"""
<!DOCTYPE html>
<html>
<head>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    body {{
      font-family: "Segoe UI", system-ui, sans-serif;
      margin: 0;
      padding: 4px 0 8px;
      color: #1a1a1a;
    }}
    #card-element {{
      border: 1px solid #c9cdd4;
      padding: 14px 12px;
      border-radius: 8px;
      background: #fff;
    }}
    #pay {{
      margin-top: 12px;
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      background: #0b5fff;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
    }}
    #pay:disabled {{ opacity: 0.6; cursor: default; }}
    #status {{ margin-top: 10px; font-size: 14px; min-height: 1.2em; }}
    .ok {{ color: #0a7a3e; font-weight: 600; }}
    .err {{ color: #b00020; }}
  </style>
</head>
<body>
  <div id="card-element"></div>
  <button id="pay" type="button">Pay {label}</button>
  <div id="status"></div>
  <script>
    (async function () {{
      const statusEl = document.getElementById("status");
      const payBtn = document.getElementById("pay");
      try {{
        const stripe = Stripe("{pk}");
        const elements = stripe.elements();
        const card = elements.create("card", {{
          style: {{
            base: {{ fontSize: "16px", color: "#1a1a1a", "::placeholder": {{ color: "#8891a0" }} }}
          }}
        }});
        card.mount("#card-element");
        payBtn.addEventListener("click", async function () {{
          payBtn.disabled = true;
          statusEl.className = "";
          statusEl.textContent = "Processing payment…";
          const result = await stripe.confirmCardPayment("{secret}", {{
            payment_method: {{ card: card }}
          }});
          if (result.error) {{
            statusEl.className = "err";
            statusEl.textContent = result.error.message || "Payment failed.";
            payBtn.disabled = false;
            return;
          }}
          const pi = result.paymentIntent;
          if (pi && (pi.status === "succeeded" || pi.status === "processing")) {{
            statusEl.className = "ok";
            statusEl.textContent =
              "Payment successful. Click “Mark payment done”, then “Issue ticket” below.";
            payBtn.textContent = "Paid";
          }} else {{
            statusEl.className = "err";
            statusEl.textContent = "Unexpected status: " + (pi && pi.status);
            payBtn.disabled = false;
          }}
        }});
      }} catch (e) {{
        statusEl.className = "err";
        statusEl.textContent = (e && e.message) || "Could not load Stripe.";
        payBtn.disabled = true;
      }}
    }})();
  </script>
</body>
</html>
        """,
        height=220,
    )


def payment_panel_snapshot(session: SessionContext) -> dict[str, Any]:
    """Debug-friendly snapshot of payment UI state."""
    return {
        "show": should_show_payment_panel(session),
        "payment_captured": session.payment_captured,
        "has_secret": bool(session.secret_key),
        "has_publishable": bool(_publishable_key(session)),
        "transaction_id": (session.transaction_id or "")[:16],
    }
