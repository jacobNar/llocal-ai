import { ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import puppeteer, { Browser } from 'puppeteer-core';
import { BrowserWindow } from 'electron';
import { z } from "zod";
let browser: Browser;
export function setBrowserInstance(instance: Browser) {
  browser = instance;
}

const getInteractibleElementsTool = tool(async (_: any, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  const pages = await browser.pages();
  let currentPage = pages[pages.length - 1];

  const title = await currentPage.title();
  console.log(`Targeting page with title: ${title}`);
  console.log("grabbing interactible elements from current page via accessibility snapshot");

  try {
    const snapshot = await currentPage.accessibility.snapshot({ interestingOnly: true });
    const pageTitle = await currentPage.title();

    function flatten(node: any, collection: any[]) {
      if (node.name && node.role) {
        collection.push({
          role: node.role,
          name: node.name
        });
      }
      if (node.children) {
        for (const child of node.children) {
          flatten(child, collection);
        }
      }
    }

    const elements: any[] = [];
    if (snapshot) {
      flatten(snapshot, elements);
    }

    console.log(`Found ${elements.length} accessible elements`);

    return new ToolMessage({
      tool_call_id: toolCallId,
      content: {
        pageTitle,
        elements
      } as any,
      name: 'Get Interactible Elements From Current Webpage'
    });

  } catch (error) {
    console.error("Error in getInteractibleElementsTool:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error retrieving interactible elements: " + error.message,
      name: 'Get Interactible Elements From Current Webpage'
    });
  }
}, {
  name: 'Get Interactible Elements From Current Webpage',
  description: 'Returns the page title and a list of interactible elements (role and name) from the current webpage using the accessibility tree. Use this to find elements to interact with.',
  schema: z.object({})
});

const openBrowserWindowTool = tool(async ({ url }: { url: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log(`opening new visible browser window for url: ${url}`);
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  await win.loadURL(url);

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: `Opened new visible browser window for ${url}. Success.`,
    name: 'Open Browser Window'
  });
}, {
  name: 'Open Browser Window',
  description: 'Opens a new visible browser window to the specified URL using Electron. Use this to start a browsing session.',
  schema: z.object({
    url: z.string().describe('URL of website to load'),
  }),
});

const loadWebpageTool = tool(async ({ url }: { url: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  const pages = await browser.pages();

  let page = pages.length > 0 ? pages[pages.length - 1] : await browser.newPage();
  const urlLower = page.url();
  if (urlLower.includes('localhost') && urlLower.includes('index.html')) {
    console.log("Detected main app window as last page. Creating new page/window instead.");
    page = await browser.newPage();
  }

  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
  await page.evaluateOnNewDocument(() => {
    delete Object.getPrototypeOf(navigator).webdriver;

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  })


  // Set referrer
  const referrer = "https://www.google.com"; // Replace with the desired referrer
  await page.setExtraHTTPHeaders({ Referer: referrer });
  await page.goto(url, { waitUntil: 'networkidle2' });

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: "Webpage loaded successfully. You can now use the 'Get Interactible Elements From Current Webpage' tool to get the interactible elements from the current webpage.",
    name: 'Load Webpage'
  });

}, {
  name: 'Load Webpage',
  description: 'Directs the current browser instance to load a webpage.',
  schema: z.object({
    url: z.string().describe('URL of website to load'),
  }),
});

const clickElementTool = tool(async ({ role, name }: { role: string, name: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log(`clicking element with role "${role}" and name "${name}"`);
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
  console.log(`Clicking on page: ${await currentPage.title()}`);

  try {
    const selector = `aria/${name}[role="${role}"]`;
    const element = await currentPage.waitForSelector(selector, { visible: true });

    if (element) {
      await element.click();
    } else {
      throw new Error(`Element with role "${role}" and name "${name}" not found`);
    }
  } catch (error) {
    console.error("Error clicking element:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error clicking element: " + error.message,
      name: 'Click Element'
    });
  }

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: `Element "${name}" clicked successfully.`,
    name: 'Click Element'
  });

}, {
  name: 'Click Element',
  description: 'Clicks the element identified by its accessibility role and name. Should be called after the "Get Interactible Elements From Current Webpage" tool.',
  schema: z.object({
    role: z.string().describe('The accessibility role of the element (e.g., "button", "link", "searchbox")'),
    name: z.string().describe('The accessible name of the element'),
  }),
});


const typeTextTool = tool(async ({ role, name, text }: { role: string, name: string, text: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log(`typing "${text}" into element with role "${role}" and name "${name}"`);
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
  console.log(`Typing on page: ${await currentPage.title()}`);

  try {
    const selector = `aria/${name}[role="${role}"]`;
    const element = await currentPage.waitForSelector(selector, { visible: true });

    if (element) {
      await element.click({ clickCount: 3 }); // Select all
      await element.press('Backspace');    // Delete
      await element.type(text);
    } else {
      throw new Error(`Element with role "${role}" and name "${name}" not found`);
    }
  } catch (error) {
    console.error("Error typing into element:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error typing into element: " + error.message,
      name: 'Type Text'
    });
  }

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: `Typed "${text}" into element "${name}" successfully.`,
    name: 'Type Text'
  });

}, {
  name: 'Type Text',
  description: 'Types the given text into the element identified by its accessibility role and name. Should be called after the "Get Interactible Elements From Current Webpage" tool.',
  schema: z.object({
    role: z.string().describe('The accessibility role of the element'),
    name: z.string().describe('The accessible name of the element'),
    text: z.string().describe('The text to type into the element'),
  }),
});

const scrollPageTool = tool(async (_: any, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
  console.log(`Scrolling page: ${await currentPage.title()}`);
  console.log("scrolling page down");
  try {
    await currentPage.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
  } catch (error) {
    console.error("Error scrolling page:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error scrolling page: " + error.message,
      name: 'Scroll Page Down'
    });
  }

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: "Scrolled page down successfully.",
    name: 'Scroll Page Down'
  });
}, {
  name: 'Scroll Page Down',
  description: 'Scrolls the page down by one viewport height to reveal new content. Use this to find more interactible elements if the desired element is not in the current view.',
  schema: z.object({}),
});

export {
  getInteractibleElementsTool,
  loadWebpageTool,
  openBrowserWindowTool,
  clickElementTool,
  typeTextTool,
  scrollPageTool,
};