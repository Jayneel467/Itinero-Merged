"""
Travel Agent — parent agent in the Itinero multi-agent workflow.

Workflow position:
  Supervisor → General Agent → Travel Agent → Flight Agent (sub-agent)
  Travel Agent output → Itinerary Agent
"""

from travel_agent.agent import TravelAgent, create_travel_agent
from travel_agent.models import (
    ItineraryFlightPayload,
    TravelAgentInput,
    TravelAgentOutput,
    TravelTask,
)
from travel_agent.workflow_connector import (
    WORKFLOW_AGENT,
    SUB_AGENT,
    FlightWorkflowBridge,
    handle_workflow_message,
    workflow_handoff,
)

__all__ = [
    "TravelAgent",
    "TravelAgentInput",
    "TravelAgentOutput",
    "TravelTask",
    "ItineraryFlightPayload",
    "create_travel_agent",
    "WORKFLOW_AGENT",
    "SUB_AGENT",
    "FlightWorkflowBridge",
    "handle_workflow_message",
    "workflow_handoff",
]
