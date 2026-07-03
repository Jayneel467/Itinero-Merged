from langgraph.graph import StateGraph
from typing import TypedDict

class State(TypedDict):
    pass

builder = StateGraph(State)

graph = builder.compile()
