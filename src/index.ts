import { app, BrowserWindow, ipcMain  } from 'electron';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import type { Document } from '@langchain/core/documents';
import { MemorySaver,StateGraph, Annotation, START, END , MessagesAnnotation } from "@langchain/langgraph";
import { HumanMessage, AIMessage, BaseMessage, ToolMessage, AIMessageChunk } from "@langchain/core/messages";
import puppeteer, { Browser } from 'puppeteer';
import { RunnableConfig } from "@langchain/core/runnables";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {JsonOutputToolsParser} from "@langchain/core/output_parsers/openai_tools"
import {
  getInteractibleElementsTool,
  loadWebpageTool,
  clickElementTool,
  setBrowserInstance
} from './tools/browser-tools';

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}
//APP GLOBALS
let browser: Browser;
let mainWindow: BrowserWindow;
let vectorStore: MemoryVectorStore;
let agent: any;
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 0 });

const createWindow = (): void => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 600,
    width: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.on('ready', () => {
  initAgent();
  initBrowser();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q.
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


// Initialize LLM, embeddings, tools, and agent
const initAgent = () => {

  const AgentState = Annotation.Root({
    input: Annotation<string>({
      reducer: (x, y) => y ?? x ?? "",
    }),
    plan: Annotation<string[]>({
      reducer: (x, y) => y ?? x ?? [],
    }),
    pastSteps: Annotation<[string, string][]>({
      reducer: (x, y) => x.concat(y),
    }),
    response: Annotation<string>({
      reducer: (x, y) => y ?? x,
    }),
  })
  
  // const llm = new ChatOllama({
  //   baseUrl: 'http://localhost:11434/',
  //   model: 'llama3.2',
  //   temperature: 0,
  //   maxRetries: 2,
  // });

  const embeddings = new OllamaEmbeddings({
    baseUrl: 'http://localhost:11434/',
    model: 'llama3.2',
  });

  vectorStore = new MemoryVectorStore(embeddings);
  const memory = new MemorySaver();

  const similaritySearchTool = tool(async ({ query }: { query: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
    console.log("tool call id: " + toolCallId)
    console.log("Similarity search tool called with query: ", query);
    const results: Document[] = await vectorStore.similaritySearch(query, 30);
    const content =  results.map(r => r.pageContent).join('\n\n');
    
    return new ToolMessage({
      tool_call_id: toolCallId,
      content,
    });

  }, {
    name: 'Knowledge base similarity search',
    description: 'Search vector store with for relevant context to answer the user\'s query using similarity search.',
    schema: z.object({
      query: z.string().describe('Search query'),
    }),
  });

  const tools = [ loadWebpageTool, getInteractibleElementsTool, clickElementTool];

  const agentExecutor = createReactAgent({
    llm: new ChatOllama({
      baseUrl: 'http://localhost:11434/',
      model: 'llama3.2',
      temperature: 0,
      maxRetries: 2,
    }),
    checkpointer: memory,
    prompt: `You are an agent that can only use the provided tools and past conversation results to accomplish tasks. 
              Do not write or output code. 
              If you cannot complete a task with the available tools, respond with "I cannot complete this task with the available info, more tool calls may be required."`,
    tools: tools,
  });
  // const toolNode = new ToolNode<typeof AgentState.State>(tools)
  // const boundModel = llm.bindTools(tools)

  //planning step

  const plan = zodToJsonSchema(
    z.object({
      steps: z
        .array(z.string())
        .describe("different steps to follow, should be in sorted order"),
    }),
  );
  const planFunction = {
    name: "plan",
    description: "This tool is used to plan the steps to follow",
    parameters: plan,
  };

  const planTool = {
    type: "function",
    function: planFunction,
  };

  const plannerPrompt = ChatPromptTemplate.fromTemplate(
    `For the given objective, come up with a simple step by step plan. \
  This plan should involve individual tasks, that if executed correctly will yield the correct answer. Do not add any superfluous steps. \
  The result of the final step should be the final answer. Make sure that each step has all the information needed - do not skip steps.
  For any steps including tool calls, specify the inputs to the tools. do not use default values like example.com, only use user provided values for tools calls out outputs of other tools calls or agent calls.
  DO NOT WRITE CODE. Only use tools that are available to you. \
  You have a browser instance available to use with the help of the following tools:
  The 'Load Webpage' which Directs the current browser instance to load a given url, must include input url in step as 'http://....'
  And the 'Get Interactible Elements From Current Webpage' tool which Returns a list of all interactible elements from the current webpage and assigns a unique ai-el-id attribute to each element needed for the 'Click Element' tool.
  And the 'Click Element' tool which can be used to click a specific element returned by the 'Get Interactible Elements From Current Webpage' tool.

  Respond ONLY with valid JSON in the following format:
  {{ "steps": ["step 1", "step 2", ...] }}

  {objective}`,
  );

  const model = new ChatOllama({
    baseUrl: 'http://localhost:11434/',
    model: 'llama3.2',
    temperature: 0,
    maxRetries: 2,
  })

  const planner = plannerPrompt.pipe(model);

  const response = zodToJsonSchema(
    z.object({
      response: z.string().describe("Response to user."),
    }),
  );

  const responseTool = {
    type: "function",
    function: {
      name: "Respond to user",
      description: "Responsd to user when the answer is in the past steps or provided context.",
      parameters: response,
    },
  };

  const replannerPrompt = ChatPromptTemplate.fromTemplate(
    `For the given objective, assess whether the objective can be met based on the current plan and the past steps already executed. 
    If you think the objective has been met with the actions taken from previous steps, call the 'Respond to user' tool, otherwise call the 'plan' tool. \
    DO NOT ANSWER with inforamtion not provided in this prompt.
    IMPORTANT: If you have enough information to answer the user's objective, DO NOT add more steps. Instead, call the 'response' tool with your answer to the user. 
    Only add steps if more actions are needed to reach the answer.
    If there are still plan steps left, return the current plan.
    If you receive an empty plan, that means the current plan has been executed and you need to replan or respond to the user.
    Do not use placeholder values like <YouTube Link>. Always describe how to extract the required value from previous tool outputs.

    Respond ONLY with a valid tool call, either:
    - a 'plan' tool call with steps that still NEED to be done, or
    - a 'Respond to user' tool call with the final answer for the user.

    Format:
    {{ "steps": ["step 1", "step 2", ...] }}   // if more steps are needed
    or
    {{ "response": "your answer to the user" }} // if you can answer now

    Your objective was this:
    {input}

    Your original plan was this:
    {plan}

    You have currently done the follow steps:
    {pastSteps}
`,
  );

  const parser = new JsonOutputToolsParser();
  const replanner = replannerPrompt
    .pipe(
        new ChatOllama({
            baseUrl: 'http://localhost:11434/',
            model: 'llama3.2',
            temperature: 0,
            maxRetries: 2,
        }).bindTools([
            planTool,
            responseTool,
        ])
    )
    .pipe(parser);

  async function executeStep(
      state: typeof AgentState.State,
      config?: RunnableConfig,
    ): Promise<Partial<typeof AgentState.State>> {
      const task = state.plan[0];
      const input = {
        messages: [new HumanMessage(task)],
      };
      console.log("Executing task:", task);
      const result = await agentExecutor.invoke(input, { configurable: { thread_id: "1" } }) as { messages: BaseMessage[] };
      
      // Properly type the messages array
      const messages = result.messages as BaseMessage[];
      const toolMsg = [...messages].reverse().find((m) => m instanceof ToolMessage); 
      const content = toolMsg?.content?.toString() ?? messages[messages.length - 1]?.content?.toString() ?? '';
      console.log("Task result:", content);
    
      return {
        pastSteps: [[task, content]],
        plan: state.plan.slice(1),
      };
  }

  async function planStep(
    state: typeof AgentState.State,
  ): Promise<Partial<typeof AgentState.State>> {
    console.log("Planning step with input:", state.input);  
    const response = await planner.invoke({ objective: state.input });
    const content = response.content?.toString() ?? '';
    const plan = JSON.parse(content);
    console.log("Raw planner output:", plan);
    // Defensive: plan may be undefined, or not have steps
    if (plan && Array.isArray(plan.steps)) {
      return { plan: plan.steps };
    }
    // Fallback: treat the whole plan as a single step if not an array
    return { plan: [typeof plan === "string" ? plan : JSON.stringify(plan)] };
  }

  async function replanStep(
    state: typeof AgentState.State,
  ): Promise<Partial<typeof AgentState.State>> {
    console.log("Replanning step with input:", state.input);
    console.log("Replanning step with plan:", state.plan);
    console.log("Replanning step with pastSteps:", state.pastSteps);
    const output: any = await replanner.invoke({
      input: state.input,
      plan: state.plan.flat().join("\n"),
      pastSteps: state.pastSteps
        .map(([step, result]) => `${step}: ${result}`)
        .join("\n"),
    });
    // console.log("Replanner output:", output);
    const toolCall = output[0];
    console.log("total replanner value: " + JSON.stringify(toolCall));
    // console.log("Raw replanner output:", toolCall);
    if (toolCall.type == "Respond to user") {
      return { response: toolCall.args?.response };
    }

    return { plan: toolCall.args?.steps };
  }

  function shouldEnd(state: typeof AgentState.State) {
    console.log("Should end check with state:", state);
    return state.response ? "true" : "false";
  }

  const workflow = new StateGraph(AgentState)
    .addNode("planner", planStep)
    .addNode("agent", executeStep)
    .addNode("replan", replanStep)
    .addEdge(START, "planner")
    .addEdge("planner", "agent")
    .addEdge("agent", "replan")
    .addConditionalEdges("replan", shouldEnd, {
      true: END,
      false: "agent",
    });

  // Finally, we compile it!
  // This compiles it into a LangChain Runnable,
  // meaning you can use it as you would any other runnable
  agent = workflow.compile();
  console.log("Agent initialized");
};

const initBrowser = async () => {
  browser = await puppeteer.launch({ headless: false, executablePath: executablePath });
  setBrowserInstance(browser);
  console.log("chromium started");
}

// IPC to handle user queries
ipcMain.handle('runQuery', async (event, message:string) => {
  try {
    console.log("runQuery called with message: ", message)
    // const humanMessage = new HumanMessage(message)
    const result = await agent.invoke({ input: message }, { configurable: { thread_id: "1" } });
    
    return result;
  }catch (error){
    console.error("Error in runQuery:", error);
    return error;
  }
  
});

ipcMain.handle("webCrawlerTool", async (event, url) => {
  const response = await webCrawlerTool(url);
  const urlPages = Object.values(response)
  const urls = Object.keys(response)

  urlPages.map(async (urlPage: string, index: number) => {
    const sentences = await textSplitter.splitText(urlPage);
    const documents = sentences.map(sentence => ({
        pageContent: sentence,
        metadata: {url: urls[index]}
    }));
    await vectorStore.addDocuments(documents)
  })
});

const normalizeUrl = (url: string) => {
  // Remove protocol (http:// or https://)
  let normalized = url.replace(/^https?:\/\//, '');
  // Remove www prefix if present
  normalized = normalized.replace(/^www\./, '');
  return normalized;
};

const webCrawlerTool = async (startUrl: string) => {
  const browser = await puppeteer.launch({ headless: false, executablePath: executablePath });
  console.log("chromium started");
  console.log("new tab");
  const visited = new Set();
  const siteContent: Record<string, string> = {};
  const baseDomain= normalizeUrl(new URL(startUrl).origin);
  const maxLinks = 10

  const visitPage = async (url: string) => {
      if (visited.has(url)) return;
      visited.add(url);
      const newPage = await browser.newPage();
      try {
          await newPage.goto(url, { waitUntil: 'networkidle2' });
          const content = await newPage.evaluate(() => {
              document.querySelectorAll('script, style').forEach(el => el.remove());
              return document.body.innerText.trim();
          });

          console.log(`Visited ${url}`);

          siteContent[url] = content;
          
          const links = await newPage.evaluate(() => 
              Array.from(document.querySelectorAll('a[href]'))
                  .map(a => (a as HTMLAnchorElement).href.trim())
          );

          const filteredLinks = links.filter(link => normalizeUrl(link).startsWith(baseDomain) && !visited.has(link))
          await Promise.all(filteredLinks.map(link => {
            if (visited.size < maxLinks) {
                return visitPage(link);
            }
            return Promise.resolve();
          }));
      } catch (error) {
          console.error(`Failed to visit ${url}:`, error);
      }finally {
          // Close the individual tab after processing
          await newPage.close();
      }
  };

  await visitPage(startUrl);
  await browser.close();
  console.log("chromium closed");
  // console.log(siteContent)
  return siteContent;
}