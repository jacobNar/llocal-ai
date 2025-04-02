import { tool } from "@langchain/core/tools";
import { z } from "zod";

interface SiteContent {
    [url: string]: string;
}

const webCrawlerTool = tool(async ({ startUrl }: { startUrl: string }): Promise<SiteContent> => {
    return await (window as any).electronAPI.webCrawlerTool(startUrl);
}, {
    name: "Website Crawler",
    description: "Crawls a website starting from the given URL and returns an object containing the text content of each visited page.",
    schema: z.object({
        startUrl: z.string().url().describe("The starting URL to crawl")
    })
});

export default webCrawlerTool;