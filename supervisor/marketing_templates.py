"""Superb marketing email HTML modules (Itinero brand)."""

from __future__ import annotations

import html
from typing import Any

from supervisor.email_templates import (
    _NAVY,
    _ORANGE,
    _INK,
    _MUTED,
    _LINE,
    _BG,
    _CREAM,
    _SITE,
    _email_brand_header,
    _email_marketing_footer,
    _email_vero_strip,
    _attach_inline_brand,
)
from email.message import EmailMessage

SITE = _SITE


def track_url(send_id: str, target: str, api_base: str = "") -> str:
    base = (api_base or SITE).rstrip("/")
    from urllib.parse import quote

    return f"{base}/api/marketing/r/{send_id}?u={quote(target, safe='')}"


def open_pixel_url(send_id: str, api_base: str = "") -> str:
    base = (api_base or SITE).rstrip("/")
    return f"{base}/api/marketing/o/{send_id}.gif"


def _btn(label: str, href: str) -> str:
    return f"""<table role="presentation" cellspacing="0" cellpadding="0" style="margin:4px 0 0;">
  <tr>
    <td align="center" style="background:{_ORANGE};border-radius:12px;">
      <a href="{html.escape(href)}" style="display:inline-block;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
        {html.escape(label)}
      </a>
    </td>
  </tr>
</table>"""


def _dest_card(card: dict[str, Any], href: str, *, index: int = 0) -> str:
    img = html.escape(str(card.get("image") or ""))
    city = html.escape(str(card.get("city") or card.get("title") or "Destination"))
    blurb = html.escape(str(card.get("blurb") or card.get("subtitle") or ""))
    fare = html.escape(str(card.get("fare_hint") or ""))
    n = index + 1
    fare_html = (
        f'<span style="font-size:13px;font-weight:700;color:{_ORANGE};">{fare}</span>'
        if fare
        else ""
    )
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border:1px solid {_LINE};border-radius:14px;overflow:hidden;">
  <tr>
    <td style="position:relative;">
      <a href="{html.escape(href)}" style="text-decoration:none;color:inherit;">
        <img src="{img}" alt="{city}" width="504" style="display:block;width:100%;max-width:504px;height:168px;object-fit:cover;border:0;" />
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 14px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td valign="top" style="padding-right:10px;">
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{_ORANGE};">#{n}</p>
            <p style="margin:0;font-size:17px;font-weight:800;color:{_NAVY};">{city}</p>
            <p style="margin:4px 0 0;font-size:13px;line-height:1.45;color:{_MUTED};">{blurb}</p>
            {f'<p style="margin:6px 0 0;">{fare_html}</p>' if fare_html else ""}
          </td>
          <td valign="middle" align="right" width="88">
            <a href="{html.escape(href)}" style="display:inline-block;padding:8px 12px;font-size:12px;font-weight:700;color:{_ORANGE};text-decoration:none;border:1px solid {_ORANGE};border-radius:999px;">
              Open →
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""


def _vibe_tiles(vibes: list[dict[str, Any]], send_id: str, api_base: str) -> str:
    cells = []
    for v in vibes[:3]:
        label = html.escape(str(v.get("label") or v.get("id") or ""))
        href = track_url(send_id, str(v.get("href") or f"{SITE}/explore"), api_base)
        img = html.escape(str(v.get("image") or ""))
        cells.append(
            f"""<td width="33%" valign="top" style="padding:4px;">
  <a href="{html.escape(href)}" style="text-decoration:none;">
    <img src="{img}" alt="{label}" width="150" style="display:block;width:100%;height:100px;object-fit:cover;border-radius:12px;border:0;" />
    <p style="margin:8px 0 0;font-size:13px;font-weight:700;color:{_NAVY};text-align:center;">{label}</p>
  </a>
</td>"""
        )
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>{''.join(cells)}</tr></table>"""


def _shell(
    *,
    preheader: str,
    title: str,
    body_inner: str,
    send_id: str = "",
    api_base: str = "",
    unsub_url: str = "",
    prefs_url: str = "",
    include_vero: bool = True,
) -> str:
    """One logo (header only). No header label. Unsub lives in footer. Optional single Vero strip."""
    pixel = (
        f'<img src="{html.escape(open_pixel_url(send_id, api_base))}" width="1" height="1" alt="" '
        f'style="display:block;width:1px;height:1px;border:0;" />'
        if send_id
        else ""
    )
    vero = _email_vero_strip() if include_vero else ""
    footer = _email_marketing_footer(unsub_url=unsub_url, prefs_url=prefs_url)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>{html.escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:{_BG};color-scheme:light only;supported-color-schemes:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{_BG};">
    {html.escape(preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid {_LINE};">
          {_email_brand_header(label="")}
          {body_inner}
          {vero}
          {footer}
        </table>
        {pixel}
      </td>
    </tr>
  </table>
</body>
</html>
"""


def marketing_footer_urls(unsub_token: str | None, api_base: str = "", site: str = SITE) -> tuple[str, str]:
    base = (api_base or site).rstrip("/")
    site_b = site.rstrip("/")
    unsub = f"{base}/api/newsletter/unsubscribe?token={unsub_token or ''}"
    prefs = f"{site_b}/profile#interests"
    return unsub, prefs


DEFAULT_VIBES = [
    {
        "id": "hiking",
        "label": "Hiking",
        "href": f"{SITE}/explore?theme=hiking",
        "image": "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "beach",
        "label": "Beach",
        "href": f"{SITE}/explore?theme=beach",
        "image": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80",
    },
    {
        "id": "biking",
        "label": "Biking",
        "href": f"{SITE}/explore?theme=biking",
        "image": "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?auto=format&fit=crop&w=600&q=80",
    },
]


def signup_spark_html(
    *,
    name: str = "",
    send_id: str = "",
    unsub_token: str = "",
    api_base: str = "",
    vibes: list[dict[str, Any]] | None = None,
) -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    unsub, prefs = marketing_footer_urls(unsub_token, api_base)
    explore = track_url(send_id, f"{SITE}/explore", api_base) if send_id else f"{SITE}/explore"
    body = f"""<tr>
  <td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;color:{_NAVY};font-weight:800;letter-spacing:-0.02em;">
      Hey {html.escape(greet)} - where next?
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:{_MUTED};">
      Tap a vibe. We’ll tune Explore and your inbox around what you love.
    </p>
    {_vibe_tiles(vibes or DEFAULT_VIBES, send_id, api_base)}
    <div style="margin-top:16px;text-align:center;">{_btn("Open Explore", explore)}</div>
  </td>
</tr>
"""
    return _shell(
        preheader="Pick hiking, beach, or biking - your Itinero starts here",
        title="Welcome to Itinero",
        body_inner=body,
        send_id=send_id,
        api_base=api_base,
        unsub_url=unsub,
        prefs_url=prefs,
        include_vero=True,
    )


def signup_spark_plain(*, name: str = "") -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    return (
        f"Hey {greet},\n\n"
        f"Welcome to Itinero. Pick a vibe and start exploring:\n"
        f"- Hiking: {SITE}/explore?theme=hiking\n"
        f"- Beach: {SITE}/explore?theme=beach\n"
        f"- Biking: {SITE}/explore?theme=biking\n\n"
        f"See you on the road,\nItinero\n"
    )


def trip_idea_html(
    *,
    name: str = "",
    cards: list[dict[str, Any]],
    send_id: str = "",
    unsub_token: str = "",
    api_base: str = "",
) -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    unsub, prefs = marketing_footer_urls(unsub_token, api_base)
    cards_html = "".join(
        _dest_card(
            c,
            track_url(send_id, str(c.get("href") or f"{SITE}/explore"), api_base)
            if send_id
            else str(c.get("href") or f"{SITE}/explore"),
            index=i,
        )
        for i, c in enumerate((cards or [])[:3])
    )
    body = f"""<tr>
  <td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:{_NAVY};font-weight:800;">
      {html.escape(greet)}, a few trip ideas
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:{_MUTED};">
      Places that fit your mood - tap one to open it on Itinero.
    </p>
    {cards_html}
  </td>
</tr>
"""
    return _shell(
        preheader="A few trip ideas picked for you",
        title="Your trip ideas",
        body_inner=body,
        send_id=send_id,
        api_base=api_base,
        unsub_url=unsub,
        prefs_url=prefs,
        include_vero=False,
    )


def offer_html(
    *,
    name: str = "",
    offer: dict[str, Any],
    send_id: str = "",
    unsub_token: str = "",
    api_base: str = "",
) -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    unsub, prefs = marketing_footer_urls(unsub_token, api_base)
    title = html.escape(str(offer.get("title") or "Special offer"))
    code = html.escape(str(offer.get("code") or ""))
    img = html.escape(str(offer.get("image_url") or ""))
    dtype = str(offer.get("discount_type") or "percent")
    dval = offer.get("discount_value")
    if offer.get("copy"):
        copy = html.escape(str(offer.get("copy")))
    elif dval is not None:
        if dtype == "percent":
            copy = html.escape(
                f"Save {dval}% on Itinero package fees (our margin). Supplier fares unchanged."
            )
        else:
            copy = html.escape(
                f"Save {dval} on Itinero package fees (our margin). Supplier fares unchanged."
            )
    else:
        copy = html.escape("A little something for your next package on Itinero.")
    href = track_url(send_id, f"{SITE}/packages", api_base) if send_id else f"{SITE}/packages"
    body = f"""<tr>
  <td style="padding:0;">
    <img src="{img}" alt="" width="560" style="display:block;width:100%;max-height:200px;object-fit:cover;border:0;" />
  </td>
</tr>
<tr>
  <td style="padding:24px 28px 8px;">
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:{_NAVY};font-weight:800;">
      {html.escape(greet)}, {title}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:{_MUTED};">{copy}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
      <tr>
        <td align="center" style="background:{_CREAM};border:1px dashed {_ORANGE};border-radius:12px;padding:14px;">
          <p style="margin:0;font-size:11px;color:{_MUTED};text-transform:uppercase;letter-spacing:0.12em;">Code</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:{_NAVY};letter-spacing:0.08em;">{code}</p>
        </td>
      </tr>
    </table>
    {_btn("Browse packages", href)}
  </td>
</tr>
"""
    return _shell(
        preheader=f"Use code {offer.get('code') or ''} on Itinero packages",
        title=str(offer.get("title") or "Offer"),
        body_inner=body,
        send_id=send_id,
        api_base=api_base,
        unsub_url=unsub,
        prefs_url=prefs,
        include_vero=False,
    )


def digest_html(
    *,
    name: str = "",
    cards: list[dict[str, Any]],
    offer: dict[str, Any] | None = None,
    send_id: str = "",
    unsub_token: str = "",
    api_base: str = "",
) -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    unsub, prefs = marketing_footer_urls(unsub_token, api_base)
    cards_html = "".join(
        _dest_card(
            c,
            track_url(send_id, str(c.get("href") or f"{SITE}/explore"), api_base)
            if send_id
            else str(c.get("href") or f"{SITE}/explore"),
            index=i,
        )
        for i, c in enumerate((cards or [])[:4])
    )
    offer_bit = ""
    if offer:
        oh = track_url(send_id, f"{SITE}/deals", api_base) if send_id else f"{SITE}/deals"
        offer_bit = f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:{_CREAM};border-radius:14px;border:1px solid #FED7AA;">
  <tr><td style="padding:14px 16px;">
    <p style="margin:0;font-size:16px;font-weight:800;color:{_NAVY};">{html.escape(str(offer.get('title') or ''))}</p>
    <p style="margin:4px 0 10px;font-size:13px;color:{_MUTED};">Code <strong style="color:{_NAVY};">{html.escape(str(offer.get('code') or ''))}</strong></p>
    {_btn("See deals", oh)}
  </td></tr>
</table>"""
    body = f"""<tr>
  <td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:{_NAVY};font-weight:800;">
      {html.escape(greet)}, today’s spark
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:{_MUTED};">
      Destinations matched to your interests.
    </p>
    {offer_bit}
    {cards_html}
  </td>
</tr>
"""
    return _shell(
        preheader="Fresh trip ideas matched to you",
        title="Your Itinero digest",
        body_inner=body,
        send_id=send_id,
        api_base=api_base,
        unsub_url=unsub,
        prefs_url=prefs,
        include_vero=False,
    )


def booking_more_like_html(
    *,
    name: str = "",
    destination: str = "",
    cards: list[dict[str, Any]],
    send_id: str = "",
    unsub_token: str = "",
    api_base: str = "",
) -> str:
    greet = (name or "").strip().split(" ")[0] or "there"
    dest = html.escape(destination or "your trip")
    unsub, prefs = marketing_footer_urls(unsub_token, api_base)
    cards_html = "".join(
        _dest_card(
            c,
            track_url(send_id, str(c.get("href") or f"{SITE}/explore"), api_base)
            if send_id
            else str(c.get("href") or f"{SITE}/explore"),
            index=i,
        )
        for i, c in enumerate((cards or [])[:3])
    )
    body = f"""<tr>
  <td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:{_NAVY};font-weight:800;">
      Loved {dest}? Try these next
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:{_MUTED};">
      Hey {html.escape(greet)} - a few places in a similar mood.
    </p>
    {cards_html}
  </td>
</tr>
"""
    return _shell(
        preheader=f"More like {destination}",
        title="More like your trip",
        body_inner=body,
        send_id=send_id,
        api_base=api_base,
        unsub_url=unsub,
        prefs_url=prefs,
        include_vero=False,
    )


def build_marketing_message(
    *,
    to: str,
    subject: str,
    html_body: str,
    plain: str,
    from_addr: str,
    unsub_url: str | None = None,
) -> EmailMessage:
    from supervisor.email_copy import scrub_em_marks

    msg = EmailMessage()
    msg["Subject"] = scrub_em_marks(subject)
    msg["From"] = from_addr
    msg["To"] = to
    if unsub_url:
        msg["List-Unsubscribe"] = f"<{unsub_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg.set_content(scrub_em_marks(plain))
    msg.add_alternative(scrub_em_marks(html_body), subtype="html")
    # Only attach CIDs that appear in HTML (logo +/- vero); never unused mark
    return _attach_inline_brand(msg, include_vero=True)
