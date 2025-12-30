from typing import AsyncGenerator, List, Optional
from app.ai.base import BaseAgent
from langgraph.prebuilt import ToolNode


tools = [search_web, search_documents]
tool_node = ToolNode(tools)


class ChatAgent():
    def __init__(self):
        super().__init__()

    def get_response(self, message: str, session_id: str, connection_id: str, user_id: Optional[str] = None) -> List[dict]:
        pass

    def get_stream_response(self, message: str, session_id: str, connection_id: str, user_id: Optional[str] = None) -> AsyncGenerator[dict, None]:
        pass

    def define_graph(self) -> StateGraph:
        pass

    def _build_graph_config(self, session_id: str, user_id: Optional[str] = None) -> dict:
        pass

    def _llm(self, state: ChatAgentState) -> Command:
        pass

    def _tool_call(self, state: ChatAgentState) -> Command:
        pass

    def _final_response(self, state: ChatAgentState) -> Command:
        pass