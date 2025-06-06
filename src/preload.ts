import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('llocalAiApi', {
  runQuery: (message: string) => ipcRenderer.invoke('runQuery', message),
  webCrawlerTool: (startUrl:string ) => ipcRenderer.invoke("webCrawlerTool", startUrl)
});
