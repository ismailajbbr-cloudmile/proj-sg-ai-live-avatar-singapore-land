import json
from typing import AsyncGenerator, List, Optional, Literal

from langchain_core.messages import ToolMessage, SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.types import Command

from app.ai.base import BaseAgent
from app.ai.agents.chart import chart_agent
from app.ai.prompts import (
    concierge_agent_prompt
)
from app.ai.state import ExploreAgentState, FinalResponse
from app.ai.tools import get_table_schema, run_sql_query, generate_chart, generate_summary
from app.ai.utils import (
    is_system,
    trim_messages,
    format_connection_details,
    get_connection_details,
    get_today_str,
    format_explore_history,
    parse_final_response,
)
from app.ai.config import create_explore_llm, MAX_LLM_RETRIES
from app.core.config import settings
from app.core.logging import logger
from app.core.langfuse import get_langfuse_callback_handler
from app.ai.utils.llm_factory import create_gemini_llm
from app.ai.tools import search_datastore, search_web

class ConciergeAgent(BaseAgent):
    """Conceige agent for datastore querying and web search.
    """
    
    def __init__(self):
        """Initialize the Concierge Agent.
        """
        super().__init__()
        self.connection_id = None
        self.conciege_llm = create_gemini_llm(settings.LLM_MODEL, settings.DEFAULT_LLM_TEMPERATURE, settings.DEFAULT_LLM_MAX_TOKENS)
        self.conciege_tools = [search_datastore, search_web]
        self.conciege_llm_with_tools = self.conciege_llm.bind_tools(self.conciege_tools)

    async def _llm(self, state: ConciergeAgentState) -> Command:

        connection_id = state.connection_id
        if not connection_id:
            raise ValueError("Connection ID is required to generate response.")

        # Construct system prompt
        datastore_description = get_datastore_description(datastore_id)
        system_prompt = concierge_agent_prompt.format(
            current_date=get_today_str(), 
            datastore_description=datastore_description
        )


        messages = trim_messages(state.messages, settings.MAX_TOKENS)

        # Always ensure system message exists and is up-to-date
        # Filter out any existing system messages (trim_messages preserves them, but we want fresh ones)
        # This ensures dynamic content (current_date, connection_details) stays fresh
        # and prevents duplicate system messages
        messages = [SystemMessage(content=system_prompt)] + [
            msg for msg in messages if not is_system(msg)
        ]

        retry_count = 0

        while retry_count < MAX_LLM_RETRIES:
            try:
                llm_response = await llm.ainvoke(messages)
                logger.info(
                    "llm_response_generated",
                    retry_count=retry_count,
                )

                # If there are tool calls, go to the tool call node
                if llm_response.tool_calls:
                    action_history = []
                    for tool_call in llm_response.tool_calls:
                        # Add action description to the state (with safe access)
                        action_desc = tool_call.get("args", {}).get("action_description", "Tool call")
                        action_history.append(action_desc)
                    return Command(
                        goto="tool_call",
                        update={"messages": [llm_response], "action_history": action_history},
                    )

                # If there are no tool calls, go to the final response node
                if llm_response.content:
                    return Command(goto="final_response", update={"messages": [llm_response]})
                else:
                    # Retry if response is empty
                    retry_count += 1
                    if retry_count < MAX_LLM_RETRIES:
                        logger.warning("llm_response_empty_retrying", retry_count=retry_count)
                        continue
                    else:
                        raise ValueError("LLM response is empty after all retries")

            except ValueError as e:
                # Re-raise ValueError if it's our empty response error after all retries
                if "empty after all retries" in str(e):
                    raise
                # Otherwise, retry if we haven't exhausted retries
                retry_count += 1
                if retry_count < MAX_LLM_RETRIES:
                    logger.warning(
                        "llm_call_failed_retrying",
                        error=str(e),
                        retry_count=retry_count,
                        max_retries=MAX_LLM_RETRIES,
                    )
                    continue
                else:
                    logger.error(
                        "llm_call_failed",
                        error=str(e),
                        retry_count=retry_count,
                        exc_info=True,
                    )
                    raise
            except Exception as e:
                # For other exceptions, retry if we haven't exhausted retries
                retry_count += 1
                if retry_count < MAX_LLM_RETRIES:
                    logger.warning(
                        "llm_call_failed_retrying",
                        error=str(e),
                        retry_count=retry_count,
                        max_retries=MAX_LLM_RETRIES,
                        exc_info=True,
                    )
                    continue
                else:
                    logger.error(
                        "llm_call_failed",
                        error=str(e),
                        retry_count=retry_count,
                        exc_info=True,
                    )
                    raise

    async def _tool_call(self, state: ExploreAgentState) -> Command:
        """Process tool calls from the last message.

        Args:
            state: The current agent state containing messages and tool calls.

        Returns:
            Command: Command to navigate to next node (llm or final_response).
            
        Raises:
            ValueError: If unknown tool is called or messages are empty.
        """
        if not state.messages:
            raise ValueError("No messages in state to process tool calls.")
        
        last_message = state.messages[-1]
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            raise ValueError("Last message does not contain tool calls.")
        
        node_output = {"messages": [], "query_history": [], "chart_history": []}

        for tool_call in last_message.tool_calls:

            # Generate summary
            if tool_call["name"] == "generate_summary":
                # If the tool call is generate_summary, go to the final response node
                # Preserve any accumulated state (query_history, chart_history) from previous tool calls
                return Command(
                    goto="final_response",
                    update={
                        "action_history": ["Finalizing response"],
                        "query_history": state.query_history + node_output["query_history"],
                        "chart_history": state.chart_history + node_output["chart_history"],
                    },
                )

            # Get table schema
            if tool_call["name"] == "get_table_schema":
                table_names = tool_call.get("args", {}).get("table_names", [])
                logger.info("get_table_schema", table_names=table_names)
                try:
                    tool_result = await get_table_schema.ainvoke({**tool_call["args"], "state": state})
                except Exception as e:
                    logger.error(
                        "get_table_schema_failed",
                        error=str(e),
                        table_names=tool_call["args"].get("table_names"),
                        exc_info=True,
                    )
                    raise

            # Run SQL query
            elif tool_call["name"] == "run_sql_query":
                tool_args = tool_call.get("args", {})
                sql_query = tool_args.get("sql_query", "")
                logger.info("run_sql_query", sql_query=sql_query)
                try:
                    tool_result, query_result = await run_sql_query.ainvoke({**tool_args, "state": state})
                    node_output["query_history"].append(
                        {
                            "action_description": tool_args.get("action_description", "SQL query executed"),
                            "sql_query": sql_query,
                            "query_result": query_result,
                        }
                    )
                except Exception as e:
                    logger.error(
                        "run_sql_query_failed",
                        error=str(e),
                        sql_query=tool_call["args"].get("sql_query", "")[:100],  # Log first 100 chars
                        exc_info=True,
                    )
                    raise

            # Generate chart
            elif tool_call["name"] == "generate_chart":
                tool_args = tool_call.get("args", {})
                chart_type = tool_args.get("chart_type", "bar")
                chart_title = tool_args.get("chart_title", "Chart")
                chart_description = tool_args.get("chart_description", "")
                logger.info(
                    "generate_chart",
                    chart_type=chart_type,
                    chart_title=chart_title,
                    chart_description=chart_description,
                )
                try:
                    chart_request_json = json.dumps(
                        {
                            "chart_type": chart_type,
                            "chart_title": chart_title,
                            "chart_description": chart_description,
                        }
                    )
                    chart_agent_state = {
                        "messages": [HumanMessage(content=chart_request_json)],
                        "query_history": state.query_history,
                    }
                    chart_result = await chart_agent.ainvoke(chart_agent_state)
                    if chart_result.get("error"):
                        error_message = chart_result.get("error", "Unknown error")
                        logger.warning(
                            "chart_generation_failed",
                            chart_title=chart_title,
                            chart_type=chart_type,
                            error=error_message,
                        )
                        node_output["chart_history"].append(
                            {
                                "action_description": tool_args.get("action_description", "Chart generation attempted"),
                                "chart_title": chart_title,
                                "chart_config": "Error generating chart",
                            }
                        )
                        tool_result = error_message
                    else:
                        node_output["chart_history"].append(
                            {
                                "action_description": tool_args.get("action_description", "Chart generated"),
                                "chart_title": chart_result.get("chart_title", chart_title),
                                "chart_config": chart_result.get("chart_config", {}),
                                "python_code": chart_result.get("python_code"),  # Store the Python code used to generate the chart
                            }
                        )
                        tool_result = json.dumps(chart_result.get("chart_config", {}), default=str)
                except Exception as e:
                    logger.error(
                        "generate_chart_failed",
                        error=str(e),
                        chart_type=tool_call["args"].get("chart_type"),
                        chart_title=tool_call["args"].get("chart_title"),
                        exc_info=True,
                    )
                    raise
            else:
                raise ValueError(f"Unknown tool: {tool_call['name']}")

            # Add tool result to output messages
            node_output["messages"].append(
                ToolMessage(
                    content=tool_result,
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                )
            )

        # Return to the llm node
        return Command(
            goto="llm",
            update=node_output,
        )

    async def _final_response(self, state: ExploreAgentState) -> Command:
        """Generate the final response from the agent.

        Args:
            state: The current agent state containing messages and tool calls.

        Returns:
            Command: Command to navigate to END with final response.
            
        Raises:
            ValueError: If messages are empty.
            Exception: If final response generation fails.
        """
        if not state.messages:
            raise ValueError("No messages in state to generate final response.")
        
        # If it's a direct response from the LLM, return the response as is
        last_message = state.messages[-1]
        if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
            content = last_message.content
            
            # Handle different content formats safely
            # Content can be: str, list[str], list[dict], or None
            if content is None:
                logger.warning(
                    "explore_agent_empty_content",
                    message_type=type(last_message).__name__,
                )
                content = "No response generated."
            elif isinstance(content, list):
                if not content:
                    logger.warning("explore_agent_empty_content_list")
                    content = "No response generated."
                else:
                    # Content is a list of content blocks (e.g., from multimodal models)
                    first_block = content[0]
                    if isinstance(first_block, dict) and "text" in first_block:
                        content = first_block["text"]
                    elif isinstance(first_block, str):
                        content = first_block
                    else:
                        # Fallback: convert first block to string
                        content = str(first_block)
            elif not isinstance(content, str):
                # Convert non-string content to string
                content = str(content)
            
            final_response = [{"type": "text", "payload": {"content": content}}]
        # Else, generate the final response
        else:
            # Configure the model to output structured data in JSON format (lazy initialization)
            final_response_writer = create_explore_llm().with_structured_output(
                FinalResponse, method="json_mode", include_raw=True
            )

            # Format the conversation history for the final response writer
            formatted_conversation_history, artifacts = format_explore_history(
                state.messages, state.query_history, state.chart_history
            )
            
            # Log available artifacts for debugging
            chart_artifacts = {k: v for k, v in artifacts.items() if k.startswith("chart_")}
            table_artifacts = {k: v for k, v in artifacts.items() if k.startswith("table_")}
            logger.info(
                "explore_agent_artifacts_available",
                chart_count=len(chart_artifacts),
                chart_ids=list(chart_artifacts.keys()),
                table_count=len(table_artifacts),
                table_ids=list(table_artifacts.keys()),
                chart_history_length=len(state.chart_history),
            )

            # Enhance prompt with available chart and table IDs
            available_charts = list(chart_artifacts.keys())
            available_tables = list(table_artifacts.keys())
            
            # Create the prompt with the formatted conversation history and available artifacts
            # Use the configured response style prompt
            prompt_message = self._final_response_prompt.format(
                conversation_history=formatted_conversation_history,
                available_charts=", ".join(available_charts) if available_charts else "none",
                available_tables=", ".join(available_tables) if available_tables else "none"
            )

            # Generate the structured response using the final response writer
            try:
                response = await final_response_writer.ainvoke([HumanMessage(content=prompt_message)])
                logger.info("final_response_generated")
                
                # Log what the LLM returned
                if response.get("parsed"):
                    parsed_blocks = response["parsed"].model_dump().get("response_blocks", [])
                    block_types = [block.get("type") for block in parsed_blocks]
                    chart_refs = [block.get("payload") for block in parsed_blocks if block.get("type") == "chart"]
                    logger.info(
                        "explore_agent_llm_response",
                        total_blocks=len(parsed_blocks),
                        block_types=block_types,
                        chart_references=chart_refs,
                    )
                elif response.get("raw"):
                    logger.info(
                        "explore_agent_llm_response_raw",
                        raw_content_preview=str(response["raw"].content)[:200] if hasattr(response["raw"], "content") else str(response["raw"])[:200],
                    )
                
                final_response = parse_final_response(response, artifacts)
                
                # Log the parsed final response
                final_block_types = [block.get("type") for block in final_response]
                final_chart_blocks = [block for block in final_response if block.get("type") == "chart"]
                logger.info(
                    "explore_agent_parsed_final_response",
                    total_blocks=len(final_response),
                    block_types=final_block_types,
                    chart_blocks_count=len(final_chart_blocks),
                )
            except Exception as e:
                logger.error(
                    "final_response_generation_failed",
                    error=str(e),
                    exc_info=True,
                )
                raise Exception(f"Failed to generate final response: {str(e)}") from e

        return Command(goto=END, update={"final_response": final_response})

    def define_graph(self) -> StateGraph:
        """Define the LangGraph workflow.

        Returns:
            StateGraph: The LangGraph workflow.
        """
        graph_builder = StateGraph(ExploreAgentState)
        graph_builder.add_node("llm", self._llm)
        graph_builder.add_node("tool_call", self._tool_call)
        graph_builder.add_node("final_response", self._final_response)
        graph_builder.set_entry_point("llm")
        graph_builder.set_finish_point("final_response")  # Set finish point to the final_response node
        return graph_builder

    def _build_graph_config(
        self, session_id: str, user_id: Optional[str] = None
    ) -> dict:
        """Build the configuration dictionary for graph invocation.
        
        Args:
            session_id: The session ID for checkpointing.
            user_id: Optional user ID for Langfuse tracking.
            
        Returns:
            dict: Configuration dictionary with callbacks and metadata.
        """
        callbacks = []
        langfuse_handler = get_langfuse_callback_handler()
        if langfuse_handler:
            callbacks.append(langfuse_handler)
        
        # Build metadata for Langfuse tracking
        metadata = {}
        if user_id:
            metadata["langfuse_user_id"] = str(user_id)
        if session_id:
            metadata["langfuse_session_id"] = str(session_id)
        
        return {
            "configurable": {"thread_id": session_id},
            "callbacks": callbacks,
            "metadata": metadata,
        }

    async def get_response(
        self,
        message: str,
        session_id: str,
        connection_id: str,
        user_id: Optional[str] = None,
    ) -> List[dict]:
        """Get a response from the LLM.

        Args:
            message: User message to send to the LLM.
            session_id: The session ID.
            connection_id: The connection ID.
            user_id: Optional user ID for Langfuse tracking.

        Returns:
            List[dict]: The response from the LLM containing final_response blocks.
            
        Raises:
            ValueError: If message, session_id, or connection_id is empty.
            Exception: If graph invocation fails.
        """
        if not message:
            raise ValueError("Message is required.")
        if not session_id:
            raise ValueError("Session ID is required.")
        if not connection_id:
            raise ValueError("Connection ID is required.")
        
        if self._graph is None:
            self._graph = await self.create_graph()

        config = self._build_graph_config(session_id, user_id)

        try:
            response = await self._graph.ainvoke(
                {
                    "messages": [HumanMessage(content=message)],
                    "connection_id": connection_id,
                },
                config,
            )
            final_response = response.get("final_response", [])
            
            # Log the structure of final_response for debugging
            if isinstance(final_response, list):
                block_types = [block.get("type") if isinstance(block, dict) else type(block).__name__ for block in final_response]
                chart_blocks = [block for block in final_response if isinstance(block, dict) and block.get("type") == "chart"]
                logger.info(
                    "explore_agent_final_response",
                    session_id=session_id,
                    total_blocks=len(final_response),
                    block_types=block_types,
                    chart_blocks_count=len(chart_blocks),
                )
            
            return final_response
        except Exception as e:
            logger.error(
                "explore_agent_get_response_failed",
                session_id=session_id,
                connection_id=connection_id,
                error=str(e),
                exc_info=True,
            )
            raise

    async def get_stream_response(
        self,
        message: str,
        session_id: str,
        connection_id: str,
        user_id: Optional[str] = None,
    ) -> AsyncGenerator[dict, None]:
        """Get a streaming response from the LLM.

        Args:
            message: User message to send to the LLM.
            session_id: The session ID.
            connection_id: The connection ID.
            user_id: Optional user ID for Langfuse tracking.

        Yields:
            dict: Streaming updates from the agent.
            
        Raises:
            ValueError: If message, session_id, or connection_id is empty.
            Exception: If graph streaming fails.
        """
        if not message:
            raise ValueError("Message is required.")
        if not session_id:
            raise ValueError("Session ID is required.")
        if not connection_id:
            raise ValueError("Connection ID is required.")
        
        if self._graph is None:
            self._graph = await self.create_graph()

        config = self._build_graph_config(session_id, user_id)

        try:
            async for update in self._graph.astream(
                {
                    "messages": [HumanMessage(content=message)],
                    "connection_id": connection_id,
                },
                config,
                stream_mode="updates",
            ):
                yield update
        except Exception as e:
            logger.error(
                "explore_agent_get_stream_response_failed",
                session_id=session_id,
                connection_id=connection_id,
                error=str(e),
                exc_info=True,
            )
            raise



concierge_agent = ConciergeAgent()