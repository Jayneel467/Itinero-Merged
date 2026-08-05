"""
Rich Console Display Helpers
=============================
Centralises all terminal output formatting so agents only call
these helpers instead of raw print() statements.
"""

from __future__ import annotations

from rich.console import Console
from rich.panel import Panel
from rich.rule import Rule
from rich.text import Text
from rich.theme import Theme

# ── Shared console instance ───────────────────────────────────────────────────

_theme = Theme(
    {
        "agent": "bold cyan",
        "user": "bold green",
        "system": "bold yellow",
        "error": "bold red",
        "info": "dim white",
        "highlight": "bold magenta",
    }
)

console = Console(theme=_theme)


# ── Helper functions ──────────────────────────────────────────────────────────


def print_banner() -> None:
    """Print the application welcome banner."""
    banner = Text()
    banner.append("\n  ✈  AI Travel Planner  🏨\n", style="bold cyan")
    banner.append("  Powered by LangGraph · Multi-Agent Architecture\n", style="dim")
    console.print(Panel(banner, border_style="cyan", padding=(0, 2)))
    console.print()


def print_agent_message(message: str, title: str = "Travel Planner") -> None:
    """Render a message from the Itinerary Agent."""
    console.print(f"\n[agent]🤖 {title}:[/agent]")
    console.print(f"   {message}\n")


def print_user_message(message: str) -> None:
    """Echo the user's input in a styled way (for log readability)."""
    console.print(f"[user]👤 You:[/user] {message}")


def print_section(title: str) -> None:
    """Print a visual section divider."""
    console.print(Rule(f"[system]{title}[/system]", style="yellow"))


def print_error(message: str) -> None:
    """Print an error message."""
    console.print(f"[error]⚠  Error:[/error] {message}")


def print_info(message: str) -> None:
    """Print an informational system message."""
    console.print(f"[info]ℹ  {message}[/info]")


def print_flight_options(flights: list[dict]) -> None:  # type: ignore[type-arg]
    """Pretty-print a numbered list of flight options."""
    print_section("Available Flights")
    for i, f in enumerate(flights, start=1):
        console.print(
            f"  [highlight]{i}.[/highlight] "
            f"[bold]{f.get('airline')} {f.get('flight_number')}[/bold]  "
            f"{f.get('origin')} → {f.get('destination')}  |  "
            f"{f.get('departure_time')}  |  "
            f"{f.get('duration_display')}  |  "
            f"{'Nonstop' if f.get('stops', 0) == 0 else str(f.get('stops')) + ' stop(s)'}  |  "
            f"₹{f.get('price_per_adult'):,.0f}/adult"
        )


def print_hotel_options(hotels: list[dict], day_label: str = "") -> None:  # type: ignore[type-arg]
    """Pretty-print a numbered list of hotel options."""
    title = f"Hotel Options{' — ' + day_label if day_label else ''}"
    print_section(title)
    for i, h in enumerate(hotels, start=1):
        stars = "★" * int(h.get("star_rating", 3))
        console.print(
            f"  [highlight]{i}.[/highlight] "
            f"[bold]{h.get('name')}[/bold]  {stars}  |  "
            f"{h.get('area')}  |  "
            f"{h.get('room_type')}  |  "
            f"{h.get('meal_plan')}  |  "
            f"₹{h.get('price_per_night'):,.0f}/night  |  "
            f"{h.get('cancellation_policy')}"
        )
