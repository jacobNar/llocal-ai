import { ipcMain } from 'electron';
import webCrawlerTool from '../tools/web-crawler-tools';
import { getVectorStore, getTextSplitter } from '../services/rag-service';

export const registerToolHandlers = () => {

    ipcMain.handle("webCrawlerTool", async (event, url) => {
        try {
            const response = await webCrawlerTool(url);
            const urlPages = Object.values(response) as string[];
            const urls = Object.keys(response) as string[];

            const vectorStore = getVectorStore();
            const textSplitter = getTextSplitter();

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

}
