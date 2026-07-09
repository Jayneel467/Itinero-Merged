"""
Flight Agent — sub-agent of Travel Agent in the Itinero workflow.

Workflow: Supervisor → General Agent → Travel Agent → Flight Agent (this package)
Output flows to Itinerary Agent via ``TravelAgentOutput.itinerary_payload``.
"""

from flight_agent.agent import FlightAgent, create_flight_agent
from flight_agent.models import FlightAgentInput, FlightAgentOutput, SessionContext

__version__ = "1.0.0"

# Workflow integration (for Supervisor / General Agent developer):
#   from travel_agent import FlightWorkflowBridge, handle_workflow_message

__all__ = [
    "FlightAgent",
    "FlightAgentInput",
    "FlightAgentOutput",
    "SessionContext",
    "create_flight_agent",
    "__version__",
]
