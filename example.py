import asyncio
import traceback
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from typing import TypedDict, Annotated, List
from operator import getitem
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolCall
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph.message import AnyMessage
from langgraph.prebuilt import ToolNode
from langchain_mcp_adapters.tools import load_mcp_tools
import json
import re
from langchain_openai import ChatOpenAI
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
import os
from dotenv import load_dotenv
load_dotenv()

SYSTEM_PROMPT = """
**PRIMARY DIRECTIVE:** You are a dedicated, persistent web browsing expert. Your SOLE function is to achieve the user's task using the provided tools. 
**You must NEVER state that you cannot proceed or lack information.** If you need information, you MUST call the appropriate tool to get it. 
**NEVER** ask for permission, clarification, or further instructions once the task is started. Do not state you are analyzing or planning. never ask me to review something either.
**Your output must ONLY be a tool call or the final answer.**
If the output is a tool call simply return the tool call JSON, DO NOT wrap it in any markdown like ```json ``` or text.

Here's an example of a good tool call output:
{"name": "new_page", "arguments": {"url": "https://promo.united.com/offers/packmoremiles"}}

Here's an example of a tool call with no arguments:
{"name": "take_snapshot", "arguments": {}}

**IMPORTANT:** Even if the tool takes no arguments, you MUST use the JSON format with an empty 'arguments' object.
**IMPORTANT:** The response for a tool call must contain the entire complete JSON of the tool call like above with the "name" and "arguments" keys. A response like 'take_snapshot{"arguments": {}}' is NOT valid since it can't be parsed as JSON. Instead the correct result would be '{ "name": "take_snapshot", "arguments": {}}'.

Here's an example final answer output:
I've successfully submitted the web form and recieved the confirmation message: "Thank you for signing up!"

**ERROR HANDLING:** If you receive a 'Tool execution failed' message, DO NOT STOP. Analyze the error details, assume the user expects you to fix the plan immediately, and respond with a corrected tool call to advance the task.

**TASK FLOW:**
1. Always start with new_page then take_snapshot. 
2. Call take_snapshot after any action that changes the page (navigation, click, fill) and analyze the snapshot content to plan the next step.
3. A take_snapshot should never be the final tool, call there should always be some tool call after take_snapshot
4. Only when the final requested information is in your possession, respond with a final, concise answer.
"""


class AgentState(TypedDict):
    # A list of messages (HumanMessage, AIMessage, ToolMessage, etc.)
    # The 'add_messages' operator appends new messages to the list
    messages: Annotated[List[AnyMessage], add_messages]


def call_model(state: AgentState, config: RunnableConfig) -> dict:
    messages = state['messages']
    if len(messages) > 10:
        messages = [messages[0]] + messages[-10:]

    formatted_messages = [SystemMessage(content=SYSTEM_PROMPT)]
    
    # Strategy: Prune old snapshots to save context window, and truncate massive snapshots 
    # to avoid 500 errors from the LLM provider.
    
    # 1. Find the index of the LAST "take_snapshot" message. 
    # We only need the most recent view of the page. Older views are stale.
    last_snapshot_idx = -1
    for i, m in enumerate(messages):
        if isinstance(m, ToolMessage) and m.name == "take_snapshot":
            last_snapshot_idx = i


    
    for i, m in enumerate(messages):
        if isinstance(m, AIMessage):
            formatted_messages.append(AIMessage(content=m.content))
        elif isinstance(m, ToolMessage):
            content = m.content
            
            # Optimization: Handle take_snapshot specifically
            if m.name == "take_snapshot":
                if i != last_snapshot_idx:
                    # This is an old snapshot. We don't need the full DOM content anymore.
                    content = "(Snapshot of previous page omitted for brevity)"
                elif len(content) > 50000:
                    # This is the LATEST snapshot, but it's too big. Truncate it.
                    content = content[:50000] + "\n...(Snapshot truncated due to length)..."
            
            # Convert tool result to a clear text observation
            formatted_messages.append(HumanMessage(content=f"Tool Output: {content}"))
        else:
            formatted_messages.append(m)

    # 1. Invoke the model
    print(f"Calling model with {len(formatted_messages)} messages")
    
    result = chat.invoke(formatted_messages)
    print("result from model (RAW)")
    print(result)

    raw_content = result.content
    parsed_tool_calls = []

    # Parse concatenated JSON objects (JSONL-like)
    decoder = json.JSONDecoder()
    pos = 0
    while pos < len(raw_content):
        # Skip whitespace
        while pos < len(raw_content) and raw_content[pos].isspace():
            pos += 1
        if pos >= len(raw_content):
            break

        try:
            obj, end_pos = decoder.raw_decode(raw_content, pos)

            if isinstance(obj, dict) and "name" in obj and "arguments" in obj:
                print(f"Parsed tool call: {obj['name']}")
                tool_call = ToolCall(
                    name=obj['name'],
                    args=obj['arguments'],
                    id=f"manual-call-{len(parsed_tool_calls)}"
                )
                parsed_tool_calls.append(tool_call)

            pos = end_pos
        except json.JSONDecodeError:
            stripped = raw_content.strip()
            if 'allowed_tool_names' in globals() and stripped in allowed_tool_names:
                print(f"Parsed lazy tool call: {stripped}")
                tool_call = ToolCall(
                    name=stripped,
                    args={},
                    id=f"manual-call-{len(parsed_tool_calls)}"
                )
                parsed_tool_calls.append(tool_call)
                break
            
            # Fallback 2: Check if it's ToolName{"arguments": ...}
            match = re.match(r"^([a-zA-Z0-9_]+)\s*(\{.*)$", raw_content, re.DOTALL)
            if match:
                tool_name = match.group(1)
                json_part = match.group(2)
                if 'allowed_tool_names' in globals() and tool_name in allowed_tool_names:
                    try:
                        args_obj = json.loads(json_part)
                        if "arguments" in args_obj:
                            args = args_obj["arguments"]
                        else:
                            args = args_obj 
                        
                        print(f"Parsed prefixed tool call: {tool_name}")
                        tool_call = ToolCall(
                            name=tool_name,
                            args=args,
                            id=f"manual-call-{len(parsed_tool_calls)}"
                        )
                        parsed_tool_calls.append(tool_call)
                        break
                    except json.JSONDecodeError:
                        pass

            print(
                "Content is not valid JSON tool call, treating as final answer or text.")
            break

    if parsed_tool_calls:

        final_ai_message = AIMessage(
            content=raw_content, 
            tool_calls=parsed_tool_calls,
            # Copy over metadata/IDs from the original result if needed for debugging
            response_metadata=result.response_metadata,
            id=result.id
        )
    else:
        final_ai_message = result
        
    if not final_ai_message.content and not final_ai_message.tool_calls:
        print("WARNING: Model returned empty content and no tool calls. Substituting with fallback.")
        final_ai_message = AIMessage(content="I apologize, but I encountered an issue and returned an empty response. I will try to proceed or retry the last step.")

    print("result from model (PARSED)")
    print(final_ai_message)
    return {"messages": [final_ai_message]}


async def call_tool(state: AgentState, config: RunnableConfig) -> dict:
    ai_message = state['messages'][-1]
    tool_calls = ai_message.tool_calls
    tool_call_id = tool_calls[0]['id']
    tool_name = tool_calls[0]['name']

    single_tool_call = [tool_calls[0]]
    print("executing tool " + tool_name)
    try:
        # Attempt to execute the tool
        tool_messages = await tool_executor.ainvoke(single_tool_call, config=config)
        print("result from successful tool call")
        print(tool_messages)
        return tool_messages

    except Exception as e:
        # Catch any exception that occurs during tool execution (e.g., failed click, timeout)
        error_message = f"Tool execution failed for tool '{tool_name}' with arguments: {tool_calls[0]['args']}.\nError: {type(e).__name__}: {str(e)}\n\nFull Traceback:\n{traceback.format_exc()}"

        # Create a ToolMessage that contains the error information
        error_tool_message = [
            ToolMessage(
                content=error_message,
                tool_call_id=tool_call_id,
                name=tool_name
            )
        ]

        print(f"!!! ERROR CAUGHT: Returning error to agent for re-evaluation.")
        # Return the error message wrapped in the LangGraph state update structure
        return {"messages": error_tool_message}


def should_continue(state: AgentState) -> str:
    # Check the last message from the LLM
    last_message = state['messages'][-1]

    # If the LLM returned a tool_call, go to the tool node
    if last_message.tool_calls:
        # Note: We must check for tool_calls because we are forcing single iteration
        return "continue"
    else:
        # Otherwise, the LLM returned a final answer, so we end
        return "end"


async def main():
    global tools, chat, agent, tool_executor, allowed_tool_names
    client = MultiServerMCPClient(
        {
            "chrome-devtools": {
                "transport": "stdio",  # Local subprocess communication
                "command": "npx",
                # Absolute path to your math_server.py file
                "args": [
                    "chrome-devtools-mcp@latest",
                    "--headless=false"
                    "--isolated=true"
                ]
            }
        }
    )
    async with client.session("chrome-devtools") as session:
        tools = await load_mcp_tools(session)
        tool_executor = ToolNode(tools)

        allowed_tool_names = ["new_page", "take_snapshot", "click", "fill", "fill_form", "handle_dialog", "press_key", "take_screenshot", "close_page", "evaluate_script", "wait_for"]
        allowed_tools = [tool for tool in tools if tool.name in allowed_tool_names]
        for tool in allowed_tools:
            print(tool.name)

        # Format tool definitions for the system prompt
        tools_str = ""
        for tool in allowed_tools:
            tools_str += f"Tool: {tool.name}\nDescription: {tool.description}\nArguments: {tool.args}\n\n"

        global SYSTEM_PROMPT
        SYSTEM_PROMPT += f"\n\n**AVAILABLE TOOLS:**\n{tools_str}"
        print(SYSTEM_PROMPT)
        # return
        llm = HuggingFaceEndpoint(
            repo_id="Qwen/Qwen2.5-Coder-32B-Instruct", # Note: Qwen3 is experimental; 2.5 is currently more stable on HF
            task="text-generation",
            max_new_tokens=2048,
            do_sample=True,
            temperature=0.8,
            huggingfacehub_api_token=os.getenv("HF_TOKEN"),
        )
        
        chat = ChatHuggingFace(llm=llm)

        workflow = StateGraph(AgentState)

        workflow.add_node("agent", call_model)
        workflow.add_node("tool", call_tool)

        workflow.set_entry_point("agent")

        workflow.add_conditional_edges(
            "agent",
            should_continue,
            {
                "continue": "tool",
                "end": END
            }
        )

        workflow.add_edge('tool', 'agent')

        app = workflow.compile()
        config = {"configurable": {"thread_id": "100"}, "recursion_limit": 100}

        print("Streaming agent steps:")
        async for step in app.astream(
            {"messages": [HumanMessage(
                content="visit united.com, search for flights to new york from chicago on 12/13/2025. tell me the how many flights are available and the amount of seats left on each flight on that day.")]
             }, config=config):
            print(step)
            print('\n---------------------------------\n')

if __name__ == "__main__":
    asyncio.run(main())
