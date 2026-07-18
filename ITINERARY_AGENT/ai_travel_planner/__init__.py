"""
AI Travel Planner
=================
A production-quality multi-agent travel planning system built with LangGraph.

Agents:
    - Itinerary Agent: Main orchestrator — converses with the user, manages state,
      delegates tasks, and builds the final itinerary.
    - Flight Agent: LLM-powered worker — searches, filters, ranks, and pre-books flights.
    - Hotel Agent:  LLM-powered worker — searches, filters, ranks, and pre-books hotels.
"""

__version__ = "1.0.0"
__author__ = "AI Travel Planner"
