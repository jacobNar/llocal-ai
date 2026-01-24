import { InferenceClient } from "@huggingface/inference";
import { z } from 'zod';
import { MemorySaver, StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseMessage, ToolMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
    getElementsTool,
    loadWebpageTool,
    clickElementTool,
    typeTextTool,
    scrollPageTool,
    openBrowserWindowTool
} from '../tools/browser-tools';
import { responseTool } from '../tools/response-tool';

let agent: any;
let verifierClient: InferenceClient;
let filterClient: InferenceClient;
let client: InferenceClient;
let toolsMap: { [key: string]: any };
let tools: any[];

const initClients = () => {
    client = new InferenceClient(process.env.HF_TOKEN);
    verifierClient = new InferenceClient(process.env.HF_TOKEN);
    filterClient = new InferenceClient(process.env.HF_TOKEN);
}

export const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
    }),
    isGoalMet: Annotation<boolean>({
        reducer: (x, y) => y,
        default: () => false,
    }),
    userGoal: Annotation<string>({
        reducer: (x, y) => x || y,
        default: () => "",
    }),
});

const getSystemPrompt = () => {
    return `**PRIMARY DIRECTIVE:** You are a dedicated, persistent web browsing expert. Your SOLE function is to achieve the user's task using the provided tools. 
    **You must NEVER state that you cannot proceed or lack information.** If you need information, you MUST call the appropriate tool to get it. 
    **NEVER** ask for permission, clarification, or further instructions once the task is started. Do not state you are analyzing or planning. never ask me to review something either.

    **TASK FLOW:**
    1. Always start with 'Open Browser Window' to create a visible window for the user to see your actions.
    2. Call 'Get Elements' to see what elements are available to interact with.
    3. Use 'Click Element' to navigate or interact. **IMPORTANT:** To type into a field, you MUST first 'Click Element' on the input field to focus it, then use 'Type Text'.
    4. After any interaction, call 'Get Elements' to see what elements are available to interact with.
    5. Only when the final requested information is in your possession, use the 'Response' tool to provide the answer.

    **COMMON MISTAKES TO AVOID:**
    1. After typing in a textbox, you will have to submit the form by using the 'Click Element' tool with the submit button.
    2. If you have typed in a text box, no need to call Get Elements again, simply click the submit button from the last snapshot of the page.
    3. **CRITICAL:** When using 'Click Element', you MUST use the **EXACT** 'name' and 'role' from the 'Get Elements' output. Do not truncate, summarize, or alter the name (e.g., if the name is "Search Amazon", do NOT use "Search").
    4. If there are multiple elements with the same role and name, use the 'parentRole' and 'parentName' parameters provided by the 'Get Elements' tool to specify which one you want. This is more robust than using the index. If no parent is provided, you can fall back to the 'index'.

    **ERROR HANDLING:**
    1. If a tool call fails (e.g., element not found), **DO NOT** try the exact same action again immediately.
    2. You **MUST** call 'Get Elements' to refresh your view of the page state before trying again. The page might have changed or loaded.
    3. If multiple attempts fail, try a different strategy (e.g., scroll down, look for alternative links).
    `;
};

const callModel = async (state: typeof AgentState.State, config: RunnableConfig) => {
    const allMessages = state.messages;

    const messagesToProcess = allMessages.slice(-10);

    const userGoal = state.userGoal || state.messages.find(m => m instanceof HumanMessage)?.content.toString() || "Unknown Goal";

    const hfMessages: any[] = [
        { role: "system", content: getSystemPrompt() },
        { role: "user", content: `User Goal: ${userGoal}` }
    ];

    let lastGetElementsMessage: ToolMessage | null = null;
    for (let i = allMessages.length - 1; i >= 0; i--) {
        if (allMessages[i] instanceof ToolMessage && allMessages[i].name === 'Get Elements') {
            lastGetElementsMessage = allMessages[i] as ToolMessage;
            break;
        }
    }

    const isLastGetElementsInWindow = messagesToProcess.some(m => m === lastGetElementsMessage);

    if (lastGetElementsMessage && !isLastGetElementsInWindow) {
        const contentStr = typeof lastGetElementsMessage.content === 'string' ? lastGetElementsMessage.content : JSON.stringify(lastGetElementsMessage.content);
        hfMessages.push({
            role: "user",
            content: `[Context - Last Known Page State]\n(from previous turn)\n${contentStr}`
        });
    }

    // Process window messages
    messagesToProcess.forEach((m, index) => {
        if (m instanceof HumanMessage) {
            hfMessages.push({ role: "user", content: m.content.toString() });
        } else if (m instanceof AIMessage) {
            const content = m.content.toString() || (m.tool_calls && m.tool_calls.length > 0 ? `[Tool Call: ${m.tool_calls.map((t: any) => t.name).join(", ")}]` : "");
            hfMessages.push({ role: "assistant", content: content });
        } else if (m instanceof ToolMessage) {
            const contentStr = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);

            if (m.name === 'Get Elements') {
                if (m === lastGetElementsMessage) {
                    hfMessages.push({ role: "user", content: contentStr });
                } else {
                    hfMessages.push({ role: "user", content: `[Old Tool Output Truncated] Elements from previous state.` });
                }
            } else {
                hfMessages.push({ role: "user", content: `Tool "${m.name}" Output: ${contentStr}` });
            }
        }
    });


    const model = "meta-llama/Llama-3.1-70B-Instruct";
    let content = "";
    const toolCalls: any[] = [];

    const formattedTools = tools.map((t) => {
        const jsonSchema = zodToJsonSchema(t.schema as z.ZodType<any>);
        delete (jsonSchema as any).$schema;
        return {
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: jsonSchema,
            },
        };
    });

    try {
        const chatCompletion = await client.chatCompletion({
            model: model,
            messages: hfMessages,
            max_tokens: 2048,
            temperature: 0.1,
            tools: formattedTools,
            tool_choice: "auto",
        });

        const message = chatCompletion.choices[0].message;
        console.log(JSON.stringify(message))
        content = message.content || "";

        if (message.tool_calls && message.tool_calls.length > 0) {
            message.tool_calls.forEach((tc: any) => {
                toolCalls.push({
                    name: tc.function.name,
                    args: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
                    id: tc.id || `call_${Date.now()}`
                });
            });
        }

    } catch (e) {
        console.error("HF Inference Error:", e);
        content = "Error calling model: " + (e instanceof Error ? e.message : String(e));
    }

    console.log("Model response:", content);
    console.log("tool calls:", toolCalls);

    const aiMessage = new AIMessage({
        content: content,
        tool_calls: toolCalls
    });

    return {
        messages: [aiMessage]
    };
};

const callTool = async (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return { messages: [] };
    }

    const toolCall = lastMessage.tool_calls[0];
    const tool = toolsMap[toolCall.name];

    if (!tool) {
        return {
            messages: [new ToolMessage({
                tool_call_id: toolCall.id || "unknown",
                content: `Error: Tool ${toolCall.name} not found. Available tools: ${Object.keys(toolsMap).join(", ")}`,
                name: toolCall.name
            })]
        }
    }

    console.log(`Executing tool ${toolCall.name} with args`, toolCall.args);
    try {
        const result = await tool.invoke(toolCall.args);
        let content: any = "";
        if (result instanceof ToolMessage) {
            content = result.content;
        } else {
            content = typeof result === 'string' ? result : JSON.stringify(result);
        }

        if (toolCall.name === 'Get Elements') {
            const userGoal = state.userGoal || state.messages.find(m => m instanceof HumanMessage)?.content.toString() || "Unknown Goal";
            console.log("Filtering getElements with goal:", userGoal);

            try {
                const originalJson = typeof content === 'string' ? JSON.parse(content) : content;
                let elements = originalJson.elements || [];

                // Limit input to ~8k tokens (approx 32k chars)
                const MAX_CHARS = 32000;
                let currentSize = 0;
                const limitedElements = [];
                for (const el of elements) {
                    const elStr = JSON.stringify(el);
                    if (currentSize + elStr.length > MAX_CHARS) {
                        console.log(`Truncating elements list to ${limitedElements.length} items to fit token limit`);
                        break;
                    }
                    limitedElements.push(el);
                    currentSize += elStr.length;
                }
                elements = limitedElements;

                if (elements.length > 0) {
                    const filterPrompt = `
            You are an intelligent UI element filter.
            User Goal: "${userGoal}"

            Available Elements:
            ${JSON.stringify(elements)}

            Task: Select ONLY the elements that are relevant to achieving the User Goal. 
            If there are interactible elements like 'button', 'searchbox' etc always include those.
            Include relevant 'link' elements but strip away ones that don't look like they will have the user achieve the goal.

            IMPORTANT: You must return the result in strictly JSON format.
            The output must be a JSON object with a single key "elements" containing the array of selected items.
            Example: { "elements": [{ "role": "button", "name": "..." }] }
            DO NOT wrap the output in markdown code blocks (e.g. \`\`\`json).
            DO NOT include any explanation or extra text.
            Just return the raw JSON object.
          `;

                    const filterSchema = {
                        type: "object",
                        properties: {
                            elements: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        role: { type: "string" },
                                        name: { type: "string" }
                                    },
                                    required: ["role", "name"],
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["elements"],
                        additionalProperties: false
                    };

                    const response_format = {
                        type: "json_object" as const,
                        value: filterSchema
                    };

                    const filterCompletion = await filterClient.chatCompletion({
                        model: "meta-llama/Llama-3.1-70B-Instruct",
                        messages: [{ role: "user", content: filterPrompt }],
                        max_tokens: 4000,
                        temperature: 0,
                        response_format: response_format
                    });

                    console.log("Filter model response:");
                    const filteredText = filterCompletion.choices[0].message.content || "{}";
                    console.log("Filter model response:", filteredText);

                    const filteredJson = JSON.parse(filteredText);

                    const finalResponse = {
                        pageTitle: originalJson.pageTitle,
                        elements: filteredJson.elements || []
                    };

                    console.log(`Filtered elements from ${elements.length} to ${finalResponse.elements.length}`);
                    content = finalResponse;

                }

            } catch (filterError) {
                console.error("Error filtering elements:", filterError);
            }
        }

        if (result instanceof ToolMessage) {
            result.tool_call_id = toolCall.id || "unknown";
            result.content = content;
            return { messages: [result] };
        }

        return {
            messages: [new ToolMessage({
                tool_call_id: toolCall.id || "unknown",
                content: content,
                name: toolCall.name
            })]
        };

    } catch (error) {
        return {
            messages: [new ToolMessage({
                tool_call_id: toolCall.id || "unknown",
                content: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
                name: toolCall.name
            })]
        }
    }
};

const verifyGoal = async (state: typeof AgentState.State) => {
    const userGoal = state.userGoal || state.messages.find(m => m instanceof HumanMessage)?.content.toString() || "Unknown goal";
    const lastMessage = state.messages[state.messages.length - 1];

    let proposedResponse = "";
    if (lastMessage instanceof AIMessage) {
        if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
            const responseTool = lastMessage.tool_calls.find(tc => tc.name === "Response");
            if (responseTool) {
                proposedResponse = responseTool.args.response;
            } else {
                proposedResponse = "Agent is performing tool calls: " + lastMessage.tool_calls.map(t => t.name).join(", ");
            }
        } else {
            proposedResponse = lastMessage.content.toString();
        }
    }

    const verifyPrompt = `
You are a strict QA Verifier.
Goal: "${userGoal}"

Current Response/Action: "${proposedResponse}"

Has the user's goal been FULLY met based on the "Current Response/Action"? 
If the response contains the answer to the user's question (e.g. a price, a fact, a summary), say YES (true) even if the end goal was achieved through different means than specified by the user.

Return ONLY a JSON object in this format:
{
  "isGoalMet": boolean,
  "reason": "Short explanation of why yes or no"
}
  `;

    try {
        const goalSchema = {
            type: "object",
            properties: {
                isGoalMet: { type: "boolean" },
                reason: { type: "string" }
            },
            required: ["isGoalMet", "reason"],
            additionalProperties: false
        };

        const response_format = {
            type: "json_object" as const,
            value: goalSchema
        };

        console.log("Verifying with response:", proposedResponse);

        const completion = await verifierClient.chatCompletion({
            model: "meta-llama/Llama-3.1-70B-Instruct",
            messages: [{ role: "user", content: verifyPrompt }],
            max_tokens: 500,
            temperature: 0,
            response_format: response_format
        });

        const resultText = completion.choices[0].message.content || "{}";
        let resultJson;
        try {
            resultJson = JSON.parse(resultText);
        } catch (e) {
            const match = resultText.match(/\{[\s\S]*\}/);
            if (match) {
                try { resultJson = JSON.parse(match[0]); } catch (err) { }
            }
        }

        if (!resultJson || typeof resultJson.isGoalMet !== 'boolean') {
            console.warn("Verifier failed to return valid JSON", resultText);
            return { isGoalMet: false };
        }

        console.log("Verifier result:", resultJson);

        if (resultJson.isGoalMet) {
            return { isGoalMet: true };
        } else {
            return {
                isGoalMet: false,
                messages: [new HumanMessage(`[Verifier Feedback]: The goal is NOT yet met. Reason: ${resultJson.reason}. Please continue trying.`)]
            };
        }

    } catch (e) {
        console.error("Verifier Error:", e);
        return { isGoalMet: true };
    }
};

const shouldContinue = (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        if (lastMessage.tool_calls[0].name === "Response") {
            return "verifier";
        }
        return "tool";
    }
    // If no tool calls, loop back to agent to try again (force tool call via system prompt/iteration)
    return "agent";
};

export const initAgent = () => {
    initClients();

    tools = [openBrowserWindowTool, loadWebpageTool, getElementsTool, clickElementTool, typeTextTool, scrollPageTool, responseTool];
    toolsMap = Object.fromEntries(tools.map(t => [t.name, t]));

    const workflow = new StateGraph(AgentState)
        .addNode("agent", callModel)
        .addNode("tool", callTool)
        .addNode("verifier", verifyGoal)
        .addEdge(START, "agent")
        .addConditionalEdges("agent", shouldContinue, {
            tool: "tool",
            verifier: "verifier",
            agent: "agent"
        })
        .addEdge("tool", "agent")
        .addConditionalEdges("verifier", (state) => {
            if (state.isGoalMet) return END;
            return "agent";
        });

    const memory = new MemorySaver();
    agent = workflow.compile({ checkpointer: memory });
    console.log("Agent initialized");
    return agent;
};

export const getAgent = () => {
    if (!agent) {
        return initAgent();
    }
    return agent;
}

export const toolsList = () => tools;
export const toolsMapExport = () => toolsMap;
