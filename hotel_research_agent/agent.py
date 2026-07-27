from state import hotelmemory

from langgraph.graph import StateGraph

builder = StateGraph(hotelmemory)

# Incomplete scaffold — real hotel flow lives in hotel_booking_backend.py
graph = builder.compile()