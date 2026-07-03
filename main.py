from code_style_strict.agent import graph as hotel_agent
from typing_extensions import TypedDict
from langgraph.graph import StateGraph

class state(TypedDict):
    pass
builder = StateGraph(state)

builder.add_node(hotel_agent)

graph = builder.compile()