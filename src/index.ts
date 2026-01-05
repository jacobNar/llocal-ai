import { app, BrowserWindow, ipcMain } from 'electron';
import { InferenceClient } from "@huggingface/inference";
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { Document } from '@langchain/core/documents';
import { MemorySaver, StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { BaseMessage, ToolMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import puppeteer, { Browser } from 'puppeteer';
import { RunnableConfig } from "@langchain/core/runnables";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as dotenv from 'dotenv';
import {
  getInteractibleElementsTool,
  loadWebpageTool,
  clickElementTool,
  setBrowserInstance,
  typeTextTool,
  scrollPageTool
} from './tools/browser-tools';
import { responseTool } from './tools/response-tool';
import webCrawlerTool from './tools/web-crawler-tools';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OllamaEmbeddings } from '@langchain/ollama';
import { DatabaseService } from './services/db';


dotenv.config();

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}
let browser: Browser;
let mainWindow: BrowserWindow;
let vectorStore: MemoryVectorStore;
let agent: any;
let db: DatabaseService;
let verifierClient: InferenceClient;
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 0 });
let toolsMap: { [key: string]: any };


const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: 1080,
    width: 1920,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

};

app.on('ready', () => {
  db = new DatabaseService();
  initAgent();
  initBrowser();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  initAgent();
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


const initAgent = () => {

  const embeddings = new OllamaEmbeddings({
    baseUrl: 'http://localhost:11434/',
    model: 'llama3.2',
  });

  const client = new InferenceClient(process.env.HF_TOKEN);


  verifierClient = new InferenceClient(process.env.HF_TOKEN);

  vectorStore = new MemoryVectorStore(embeddings);



  const tools = [loadWebpageTool, getInteractibleElementsTool, clickElementTool, typeTextTool, scrollPageTool, responseTool];
  toolsMap = Object.fromEntries(tools.map(t => [t.name, t]));


  const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
    }),
    isGoalMet: Annotation<boolean>({
      reducer: (x, y) => y,
      default: () => false,
    }),
  });

  const getSystemPrompt = () => {
    return `**PRIMARY DIRECTIVE:** You are a dedicated, persistent web browsing expert. Your SOLE function is to achieve the user's task using the provided tools. 
    **You must NEVER state that you cannot proceed or lack information.** If you need information, you MUST call the appropriate tool to get it. 
    **NEVER** ask for permission, clarification, or further instructions once the task is started. Do not state you are analyzing or planning. never ask me to review something either.

    **TASK FLOW:**
    1. Always start with 'Load Webpage' to visit the URL if provided.
    2. Call 'Get Interactible Elements From Current Webpage' to see what elements are available to interact with.
    3. Use 'Click Element' to navigate or interact.
    4. After any interaction, call 'Get Interactible Elements From Current Webpage' to see what elements are available to interact with.
    5. Only when the final requested information is in your possession, use the 'Response' tool to provide the answer.`;
  };

  const callModel = async (state: typeof AgentState.State, config: RunnableConfig) => {
    const messages = state.messages;
    const recentMessages = messages.slice(-10);
    const hfMessages: any[] = [
      { role: "system", content: getSystemPrompt() }
    ];

    let lastInteractibleToolIndex = -1;
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const m = recentMessages[i];
      if (m instanceof ToolMessage && m.name === 'Get Interactible Elements From Current Webpage') {
        lastInteractibleToolIndex = i;
        break;
      }
    }

    recentMessages.forEach((m, index) => {
      if (m instanceof HumanMessage) {
        hfMessages.push({ role: "user", content: m.content.toString() });
      } else if (m instanceof AIMessage) {
        hfMessages.push({ role: "assistant", content: m.content.toString() });
      } else if (m instanceof ToolMessage) {
        if (m.name === 'Get Interactible Elements From Current Webpage') {
          if (index === lastInteractibleToolIndex) {
            hfMessages.push({ role: "user", content: `Tool Output: ${m.content.toString()}` });
          }
        } else {
          hfMessages.push({ role: "user", content: `Tool Output: ${m.content.toString()}` });
        }
      }
    });

    console.log(`Calling model with ${hfMessages.length} messages`);

    console.log("Payload Preview:", JSON.stringify(hfMessages[hfMessages.length - 1]));

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
        temperature: 0.8,
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

    return { messages: [aiMessage] };
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
      if (result instanceof ToolMessage) {
        result.tool_call_id = toolCall.id || "unknown";
        return { messages: [result] };
      }

      return {
        messages: [new ToolMessage({
          tool_call_id: toolCall.id || "unknown",
          content: typeof result === 'string' ? result : JSON.stringify(result),
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
    const messages = state.messages;
    const userGoal = messages.find(m => m instanceof HumanMessage)?.content.toString() || "Unknown goal";

    const lastMessage = messages[messages.length - 1];
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
    
    Current Progress/Response: "${proposedResponse}"
    
    Conversation History:
    ${messages.map(m => {
      let content = m.content ? m.content.toString() : "";
      if (m instanceof AIMessage && m.tool_calls && m.tool_calls.length > 0) {
        const calls = m.tool_calls.map(tc => `${tc.name}(${JSON.stringify(tc.args)})`).join(", ");
        content += `\n[Agent Tool Calls]: ${calls}`;
      }
      return `${m._getType()}: ${content.substring(0, 5000)}`;
    }).join("\n")}
    
    Has the user's goal been FULLY met based on the "Current Progress/Response"? 
    If the response contains the answer to the user's question (e.g. a price, a fact, a summary), say YES (true) even if the end goal was acheived through different means than specified by the user.
    Ignore the tool outputs in history if the final response has the answer.
    
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
        model: "Qwen/Qwen2.5-7B-Instruct",
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
    return "verifier";
  };

  const workflow = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("tool", callTool)
    .addNode("verifier", verifyGoal)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tool: "tool",
      verifier: "verifier"
    })
    .addEdge("tool", "agent")
    .addConditionalEdges("verifier", (state) => {
      if (state.isGoalMet) return END;
      return "agent";
    });

  const memory = new MemorySaver();
  agent = workflow.compile({ checkpointer: memory });
  console.log("Agent initialized");
};

const initBrowser = async () => {
  browser = await puppeteer.launch({
    headless: false,
    executablePath: executablePath,
    defaultViewport: null,
    args: ['--start-maximized', "--no-sandbox", "--disable-setuid-sandbox"]
  });
  setBrowserInstance(browser);
  console.log("chromium started");
}

ipcMain.handle('runQuery', async (event, { message, conversationId }: { message: string, conversationId?: string }) => {
  try {
    console.log("runQuery called with message: ", message, " conversationId: ", conversationId);

    if (!conversationId) {
      conversationId = db.createConversation(message.substring(0, 30) + "...");
    }

    db.addMessage(conversationId, 'user', message);

    const config = {
      configurable: { thread_id: conversationId },
      recursionLimit: 50
    };

    const result = await agent.invoke({
      messages: [new HumanMessage(message)]
    }, config);

    const messages = result.messages;
    const lastMsg = messages[messages.length - 1];

    let finalResponse = lastMsg.content;
    if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
      const lastTool = lastMsg.tool_calls[0];
      if (lastTool.name === "Response") {
        finalResponse = lastTool.args.response;
      }
    }

    const allMessages = result.messages;

    let startIndex = -1;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (allMessages[i] instanceof HumanMessage && allMessages[i].content === message) {
        startIndex = i;
        break;
      }
    }

    if (startIndex !== -1) {
      const newMessages = allMessages.slice(startIndex + 1);

      for (const msg of newMessages) {
        if (msg instanceof AIMessage) {
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCalls = msg.tool_calls;
            const responseTool = toolCalls.find((tc: any) => tc.name === "Response");

            if (responseTool) {
              const responseContent = JSON.stringify(responseTool.args);
              db.addMessage(conversationId, 'assistant', responseContent);
            } else {
              const toolLog = toolCalls.map((tc: any) => {
                const name = tc.name || (tc as any).function?.name || 'Unknown Tool';
                const args = tc.args || (tc as any).function?.arguments || {};
                return `Executing tool: ${name} Args: ${JSON.stringify(args)}`;
              }).join("\n");

              db.addMessage(conversationId, 'assistant', toolLog);
            }
          } else if (msg.content) {
            db.addMessage(conversationId, 'assistant', msg.content.toString());
          }
        } else if (msg instanceof ToolMessage) {
          db.addMessage(conversationId, 'tool', `Tool Output (${msg.name}): ${msg.content.toString()}`);
        }
      }
    } else {
      db.addMessage(conversationId, 'assistant', String(finalResponse));
    }

    return {
      messages: messages.map((m: BaseMessage) => {
        let role = 'unknown';
        const type = m._getType();
        if (type === 'human') role = 'user';
        else if (type === 'ai') role = 'assistant';
        else if (type === 'system') role = 'system';
        else if (type === 'tool') role = 'tool';

        return {
          content: m.content,
          role: role
        };
      }),
      final_response: finalResponse,
      conversationId: conversationId
    };

  } catch (error) {
    console.error("Error in runQuery:", error);
    return error;
  }
});

ipcMain.handle('getHistory', async () => {
  return db.getConversations();
});

ipcMain.handle('loadConversation', async (event, conversationId: string) => {
  return db.getMessages(conversationId);
});

ipcMain.handle("webCrawlerTool", async (event, url) => {
  try {
    const response = await webCrawlerTool(url);
    const urlPages = Object.values(response)
    const urls = Object.keys(response)

    urlPages.map(async (urlPage: string, index: number) => {
      const sentences = await textSplitter.splitText(urlPage);
      const documents = sentences.map(sentence => ({
        pageContent: sentence,
        metadata: { url: urls[index] }
      }));
      await vectorStore.addDocuments(documents)
    })
    return "Indexed " + url;
  } catch (e) {
    console.error(e);
    return "Error indexing: " + e;
  }

});

ipcMain.handle("getWorkflows", async () => {
  return db.getWorkflows();
});

ipcMain.handle("saveWorkflow", async (event, conversationId: string) => {
  try {
    const messages = db.getMessages(conversationId);
    if (messages.length === 0) return { success: false, error: "No messages found" };
    interface ExtractedToolCall {
      name: string;
      args: any;
      status: 'pending' | 'success' | 'failed';
    }

    const workflowToolCalls: ExtractedToolCall[] = [];
    let pendingToolCalls: ExtractedToolCall[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant') {
        const lines = msg.content.split('\n');
        const callsInMessage: { name: string; args: any }[] = [];

        for (const line of lines) {
          const match = line.match(/Executing tool: (.*?) Args: (.*)/);
          if (match) {
            try {
              const name = match[1].trim();
              if (name !== 'Response') {
                callsInMessage.push({
                  name: name,
                  args: JSON.parse(match[2].trim())
                });
              }
            } catch (e) {
              console.error("Failed to parse tool log:", line);
            }
          }
        }

        if (callsInMessage.length > 0) {
          let toolsFound = 0;
          for (let j = i + 1; j < messages.length; j++) {
            const nextMsg = messages[j];
            if (nextMsg.role === 'tool') {
              if (toolsFound < callsInMessage.length) {
                const call = callsInMessage[toolsFound];
                const content = nextMsg.content;
                const isError = content.includes("Error:") || content.includes("Tool execution error:") || content.includes("Error retrieving") || content.includes("Error clicking");

                if (!isError) {
                  workflowToolCalls.push({
                    name: call.name,
                    args: call.args,
                    status: 'success'
                  });
                }
                toolsFound++;
              } else {
                break;
              }
            } else {
              break;
            }
          }
        }
      }
    }

    if (workflowToolCalls.length === 0) {
      return { success: false, error: "No successful tool calls found to save." };
    }

    const toolCallSummary = workflowToolCalls.map(c => `${c.name}: ${JSON.stringify(c.args)}`).join("\n");
    const userGoal = messages.find(m => m.role === 'user')?.content || "User Goal";

    const prompt = `
        User Goal: ${userGoal}
        
        Successful Tool Sequence:
        ${toolCallSummary}
        
        Generate a concise Title and a short Description for this workflow.
        Return strictly JSON: { "title": "...", "description": "..." }
    `;

    const client = new InferenceClient(process.env.HF_TOKEN);
    const completion = await client.chatCompletion({
      model: "meta-llama/Llama-3.1-70B-Instruct",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });


    const resultText = completion.choices[0].message.content || "{}";
    let resultJson;
    try {
      resultJson = JSON.parse(resultText);
    } catch (e) {
      return { success: false, error: "Failed to parse LLM output" };
    }

    const id = db.createWorkflow(resultJson.title || "Untitled Workflow", resultJson.description || "No description", JSON.stringify(workflowToolCalls));
    return { success: true, id: id, workflow: { ...resultJson, tool_calls: workflowToolCalls } };

  } catch (e) {
    console.error("Error saving workflow", e);
    return { success: false, error: String(e) };
  }
});

ipcMain.handle("runWorkflow", async (event, workflowId: string) => {
  try {
    const workflow = db.getWorkflow(workflowId);
    if (!workflow) return { success: false, error: "Workflow not found" };

    const toolCalls = JSON.parse(workflow.tool_calls);
    const results = [];

    for (const call of toolCalls) {
      const tool = toolsMap[call.name];
      if (!tool) {
        results.push({ name: call.name, status: "error", error: "Tool not found" });
        continue;
      }
      try {
        if (!browser || !browser.isConnected()) {
          await initBrowser();
        }

        console.log(`Running workflow tool: ${call.name}`, call.args);
        const result = await tool.invoke(call.args);
        results.push({ name: call.name, status: "success", result: result });
      } catch (e) {
        results.push({ name: call.name, status: "error", error: String(e) });
        break;
      }
    }
    return { success: true, results: results };

  } catch (e) {
    console.error("Error running workflow", e);
    return { success: false, error: String(e) };
  }
});

