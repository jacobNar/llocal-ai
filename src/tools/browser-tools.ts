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
      // Find interactive elements and elements with click handlers
      const baseSelectors = 'a, button, input, textarea, select';
      const allElements = Array.from(document.querySelectorAll('*'));
      
      const interactiveElements = allElements.filter(element => {
        // Check if element matches our base interactive selectors
        const isBaseInteractive = element.matches(baseSelectors);
        
        // Check if element has click event listeners
        const hasClickHandler = (element as HTMLElement).onclick || 
                              element.getAttribute('onclick') ||
                              element.hasAttribute('ng-click') || // Angular
                              element.hasAttribute('@click') ||   // Vue
                              element.hasAttribute('onClick');    // React
        
        return isBaseInteractive || hasClickHandler;
      });


      interactiveElements.forEach((element, index) => {
        // Only assign if not already present
        if (!element.hasAttribute('ai-el-id')) {
          // You can use a counter, timestamp, or random string for uniqueness
          const uniqueId = `ai-el-${Date.now()}-${index}`;
          element.setAttribute('ai-el-id', uniqueId);
        }
      });
      
      console.log("Found " + interactiveElements.length + " interactible elements");  
      return interactiveElements.map(element => {
        const elementInfo: any = {
          type: element.tagName.toLowerCase(),
          text: element.textContent?.trim() || element.getAttribute('placeholder') || element.getAttribute('value') || '',
          aiElId: element.getAttribute('ai-el-id') || '',
        };

        // Add href for links
        if (element instanceof HTMLAnchorElement && element.href) {
          elementInfo.href = element.href;
        }
        // Add input-specific attributes
        if (element instanceof HTMLInputElement) {
          elementInfo.inputType = element.type;
        }

        // Check for click handlers
        if ((element as HTMLElement).onclick || 
            element.getAttribute('onclick') ||
            element.hasAttribute('ng-click') ||
            element.hasAttribute('@click') ||
            element.hasAttribute('onClick')) {
          elementInfo.hasClickHandler = true;
        }

        return elementInfo;
      });
    });
  
    return new ToolMessage({
      tool_call_id: toolCallId,
      content: "Interactible elements from " + currentPage.url() + ": " +JSON.stringify(content),
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
    description: 'Returns a list of all interactible elements from the current webpage loaded by the "Load Webpage" tool and assigns a unique ai-el-id attribute to each element.',
    schema: z.undefined()
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

  const clickElementTool = tool(async ({ aiElId }: { aiElId: string }, { toolCallId }: { toolCallId: string }): Promise<ToolMessage> => {
    console.log("clicking element " + aiElId)
    const pages = await browser.pages();
    const currentPage = pages[pages.length - 1];
    console.log("grabbing interactible elements from current page")
    try {
      await currentPage.evaluate((aiElId: string) => {
        const element = document.querySelector(`[ai-el-id="${aiElId}"]`);
        if (element) {
          (element as HTMLElement).click();
        } else {
          throw new Error(`Element with aiElId ${aiElId} not found`);
        }
      }, aiElId);
    } catch (error) {
      console.error("Error clicking element:", error);
      return new ToolMessage({
        tool_call_id: toolCallId,
        content: "Error clicking element: " + error.message,
      });
    }
    

    return new ToolMessage({
      tool_call_id: toolCallId,
      "content": "Element with ID " + aiElId + " clicked successfully.",
    });

  }, {
    name: 'Click Element',
    description: 'Clicks the element with the given aiElId on the current webpage. Should be called after the "Get Interactible Elements From Current Webpage" tool.',
    schema: z.object({
      aiElId: z.string().describe('The aiElId of the element to click on'),
    }),
  });


export {
  getInteractibleElementsTool,
  loadWebpageTool,
  clickElementTool,
};