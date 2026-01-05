import { ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import puppeteer, { Browser } from 'puppeteer';
import { z } from "zod";
let browser: Browser;
export function setBrowserInstance(instance: Browser) {
  browser = instance;
}

const getInteractibleElementsTool = tool(async (_: any, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {

  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
  console.log("grabbing interactible elements from current page")
  try {
    const content = await currentPage.evaluate(() => {
      // 0. Get Page Title
      const pageTitle = document.title;

      // 1. Find interactive elements
      const baseSelectors = 'a, button, input, textarea, select';

      // 2. Find static text context elements
      const textSelectors = 'h1, h2, h3, h4, h5, h6, p, header, nav, main';

      const allElements = Array.from(document.querySelectorAll('*'));

      const interactiveElements = allElements.filter(element => {
        const isBaseInteractive = element.matches(baseSelectors);
        const isTextContext = element.matches(textSelectors);

        // Check click handlers
        const hasClickHandler = (element as HTMLElement).onclick ||
          element.getAttribute('onclick') ||
          element.hasAttribute('ng-click') ||
          element.hasAttribute('@click') ||
          element.hasAttribute('onClick');

        if (!isBaseInteractive && !hasClickHandler && !isTextContext) return false;

        // Check viewport visibility
        const rect = element.getBoundingClientRect();
        const inViewport = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );

        if (!inViewport) return false;

        // For text elements, ensure they have actual content
        if (isTextContext) {
          const text = element.textContent?.trim();
        }

        return true;
      });

      // Helper function to generate a unique selector (XPath)
      function getUniqueSelector(element: Element): string {
        // 1. ID
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        // ... (rest of helper remains same if available in scope, ensuring we include it)

        // 2. Text Content (if unique) - REPEATED for safety in this replace block context
        const text = element.textContent?.trim();
        if (text && text.length < 50) {
          const tag = element.tagName.toLowerCase();
          const xpath = `//${tag}[contains(text(), "${text.replace(/"/g, '&quot;')}")]`;
          const snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          if (snapshot.snapshotLength === 1) return xpath;
        }

        // 3. Fallback: Structural XPath
        const getPathTo = (el: Element): string => {
          if (el.id) return `//*[@id="${el.id}"]`;
          if (el === document.body) return '/html/body';
          if (!el.parentNode) return '';
          let ix = 0;
          const siblings = el.parentNode.childNodes;
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === el) return getPathTo(el.parentNode as Element) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            if (sibling.nodeType === 1 && (sibling as Element).tagName === el.tagName) ix++;
          }
          return '';
        }
        return getPathTo(element);
      }

      console.log("Found " + interactiveElements.length + " visible elements");
      const elementsData = interactiveElements.map(element => {
        const elementInfo: any = {
          type: element.tagName.toLowerCase(),
          text: element.textContent?.trim() || element.getAttribute('placeholder') || element.getAttribute('value') || '',
          selector: getUniqueSelector(element),
        };

        if (element instanceof HTMLAnchorElement && element.href) elementInfo.href = element.href;
        if (element instanceof HTMLInputElement) elementInfo.inputType = element.type;

        return elementInfo;
      });

      return {
        pageTitle,
        elements: elementsData
      };
    });

    return new ToolMessage({
      tool_call_id: toolCallId,
      content: JSON.stringify(content),
    });
  } catch (error) {
    console.error("Error in getInteractibleElementsTool:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error retrieving interactible elements: " + error.message,
    });
  }


}, {
  name: 'Get Interactible Elements From Current Webpage',
  description: 'Returns the page title and a list of all interactible and significant text elements (headers, paragraphs) from the current webpage. Use this to analyze the page content and find elements to interact with.',
  schema: z.object({})
});

const loadWebpageTool = tool(async ({ url }: { url: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log("tool call id: " + toolCallId)
  const newPage = await browser.newPage()
  await newPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
  await newPage.evaluateOnNewDocument(() => {
    delete Object.getPrototypeOf(navigator).webdriver;

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  })


  // Set referrer
  const referrer = "https://www.google.com"; // Replace with the desired referrer
  await newPage.setExtraHTTPHeaders({ Referer: referrer });
  await newPage.goto(url, { waitUntil: 'networkidle2' });

  return new ToolMessage({
    tool_call_id: toolCallId,
    "content": "Webpage loaded successfully. You can now use the 'Get Interactible Elements From Current Webpage' tool to get the interactible elements from the current webpage.",
  });

}, {
  name: 'Load Webpage',
  description: 'Directs the current browser instance to load a webpage.',
  schema: z.object({
    url: z.string().describe('URL of website to load'),
  }),
});

const clickElementTool = tool(async ({ selector }: { selector: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log("clicking element " + selector)
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
  try {
    await currentPage.evaluate((selector: string) => {
      let element: Element | null = null;
      if (selector.startsWith('//') || selector.startsWith('(')) {
        // XPath
        const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue as Element;
      } else {
        // CSS
        element = document.querySelector(selector);
      }

      if (element) {
        (element as HTMLElement).click();
      } else {
        throw new Error(`Element with selector ${selector} not found`);
      }
    }, selector);
  } catch (error) {
    console.error("Error clicking element:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error clicking element: " + error.message,
    });
  }


  return new ToolMessage({
    tool_call_id: toolCallId,
    "content": "Element with selector " + selector + " clicked successfully.",
  });

}, {
  name: 'Click Element',
  description: 'Clicks the element with the given selector on the current webpage. Should be called after the "Get Interactible Elements From Current Webpage" tool.',
  schema: z.object({
    selector: z.string().describe('The selector (CSS or XPath) of the element to click on'),
  }),
});


const typeTextTool = tool(async ({ selector, text }: { selector: string, text: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  console.log(`typing "${text}" into element ${selector}`)
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];

  try {
    let element: any;
    if (selector.startsWith('//') || selector.startsWith('(')) { // Simple XPath check
      const handle = await currentPage.evaluateHandle((xpath: string) => {
        return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      }, selector);
      element = handle.asElement();
    } else {
      element = await currentPage.$(selector);
    }

    if (element) {
      // Clear the field first - often necessary for inputs
      await element.click({ clickCount: 3 }); // Select all
      await element.press('Backspace');    // Delete

      await element.type(text);
    } else {
      throw new Error(`Element with selector ${selector} not found`);
    }
  } catch (error) {
    console.error("Error typing into element:", error);
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Error typing into element: " + error.message,
    });
  }

  return new ToolMessage({
    tool_call_id: toolCallId,
    "content": `Typed "${text}" into element with selector ${selector} successfully.`,
  });

}, {
  name: 'Type Text',
  description: 'Types the given text into the element with the given selector on the current webpage. Should be called after the "Get Interactible Elements From Current Webpage" tool.',
  schema: z.object({
    selector: z.string().describe('The selector (CSS or XPath) of the element to type into'),
    text: z.string().describe('The text to type into the element'),
  }),
});

const scrollPageTool = tool(async (_: any, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
  const pages = await browser.pages();
  const currentPage = pages[pages.length - 1];
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
    });
  }

  return new ToolMessage({
    tool_call_id: toolCallId,
    content: "Scrolled page down successfully.",
  });
}, {
  name: 'Scroll Page Down',
  description: 'Scrolls the page down by one viewport height to reveal new content. Use this to find more interactible elements if the desired element is not in the current view.',
  schema: z.object({}),
});

export {
  getInteractibleElementsTool,
  loadWebpageTool,
  clickElementTool,
  typeTextTool,
  scrollPageTool,
};