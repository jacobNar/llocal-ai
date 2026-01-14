import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OllamaEmbeddings } from '@langchain/ollama';

let vectorStore: MemoryVectorStore;
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 0 });

export const initRag = () => {
    const embeddings = new OllamaEmbeddings({
        baseUrl: 'http://localhost:11434/',
        model: 'llama3.2',
    });
    vectorStore = new MemoryVectorStore(embeddings);
    console.log("RAG Service initialized");
}

export const getVectorStore = () => {
    if (!vectorStore) initRag();
    return vectorStore;
}

export const getTextSplitter = () => textSplitter;
