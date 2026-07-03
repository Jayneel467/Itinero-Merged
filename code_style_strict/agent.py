from langgraph.graph import StateGraph, END, START
from typing import TypedDict
from state import InputState, OutputState
from tools import tool as tool1


class PrivateState(TypedDict):
    pass





def node_1(state: InputState) -> PrivateState :   
    tool1("1", "2")
    return {}

def node_2(state: PrivateState) -> OutputState:
    return {}


builder = StateGraph(PrivateState, input_schema=InputState, output_schema=OutputState)

graph = builder.compile()