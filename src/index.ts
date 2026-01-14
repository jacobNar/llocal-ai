import { app, BrowserWindow } from 'electron';
import * as dotenv from 'dotenv';
import { initAgent } from './agent/agent-service';
import { initBrowser } from './services/browser-service';
import { initDb } from './services/db';
import { initRag } from './services/rag-service';
import { registerChatHandlers } from './ipc/chat-handlers';
import { registerToolHandlers } from './ipc/tool-handlers';
import { registerWorkflowHandlers } from './ipc/workflow-handlers';

dotenv.config();

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: 1080,
    width: 1920,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
};

app.on('ready', () => {
  console.log("App Ready");
  initDb();
  initAgent();
  initBrowser();
  initRag();

  registerChatHandlers();
  registerToolHandlers();
  registerWorkflowHandlers();

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  initAgent();
  // initAgent is idempotent-ish or we can verify if we need to re-init. 
  // In the original code it was called on activate. 

  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
