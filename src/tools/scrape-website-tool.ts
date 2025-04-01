// import puppeteer from 'puppeteer-core';
// import { tool } from "@langchain/core/tools";
// import { z } from "zod";
// const path = "C:/Program Files/Google/Chrome/Application/chrome.exe";


// const crawler = async ({startUrl}: {startUrl: string}): Promise<SiteContent> => {
//     const browser = await puppeteer.launch({
//         args: [
//           "--no-sandbox",
//           "--disable-setuid-sandbox"
//         ],
//         defaultViewport: {
//           width: 1280, // Desktop width
//           height: 800, // Desktop height
//         },
//         executablePath: path,
//         headless: false
//     });
//     console.log("chromium started");
//     console.log("new tab");
//     const visited: Set<string> = new Set();
//     const siteContent: SiteContent = {};
//     const baseDomain: string = new URL(startUrl).origin;

//     const visitPage = async (url: string): Promise<void> => {

//         if (visited.has(url)) return;
//         visited.add(url);
//         const newPage = await browser.newPage();
//         try {
//             await newPage.goto(url, { waitUntil: 'networkidle2' });
//             const content: string = await newPage.evaluate(() => {
//                 document.querySelectorAll('script, style').forEach(el => el.remove());
//                 return document.body.innerText.trim();
//             });

//             siteContent[url] = content || "(No extractable content found)";
            
//             const links: string[] = await newPage.evaluate(() => 
//                 Array.from(document.querySelectorAll('a[href]'))
//                     .map(a => (a as HTMLAnchorElement).href.trim())
//             );

//             await Promise.all(
//                 links.filter(link => link.startsWith(baseDomain) && !visited.has(link))
//                      .map(link => visitPage(link))
//             );
//         } catch (error) {
//             console.error(`Failed to visit ${url}:`, error);
//         }finally {
//             // Close the individual tab after processing
//             await newPage.close();
//         }
//     };

//     await visitPage(startUrl);
//     await browser.close();
//     return siteContent;
// }

// interface SiteContent {
//     [url: string]: string;
// }


// const webCrawlerTool = tool(async ({ startUrl }: { startUrl: string }): Promise<SiteContent> => {
//     return await crawler({ startUrl });
// }, {
//     name: "Website Crawler",
//     description: "Crawls a website starting from the given URL and returns an object containing the text content of each visited page.",
//     schema: z.object({
//         startUrl: z.string().url().describe("The starting URL to crawl")
//     })
// });

// export default webCrawlerTool;