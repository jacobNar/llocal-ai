import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('llocalAiApi', {
  runQuery: (message: string, conversationId?: string) => ipcRenderer.invoke('runQuery', { message, conversationId }),
  webCrawlerTool: (startUrl: string) => ipcRenderer.invoke("webCrawlerTool", startUrl),
  getHistory: () => ipcRenderer.invoke('getHistory'),
  loadConversation: (conversationId: string) => ipcRenderer.invoke('loadConversation', conversationId),
  saveWorkflow: (conversationId: string) => ipcRenderer.invoke('saveWorkflow', conversationId),
  getWorkflows: () => ipcRenderer.invoke('getWorkflows'),
  runWorkflow: (workflowId: string) => ipcRenderer.invoke('runWorkflow', workflowId)
});
