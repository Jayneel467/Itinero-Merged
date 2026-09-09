"""Backward-compatible import path for Itinerary Agent.

Prefer: ``from itinero.itinerary_agent import ItineraryAgent``
This module keeps ``ItineraryPlanner`` working for older imports.
"""

from itinero.itinerary_agent import ItineraryAgent, ItineraryPlanner

__all__ = ["ItineraryAgent", "ItineraryPlanner"]
