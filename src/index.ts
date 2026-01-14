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
app.commandLine.appendSwitch('remote-debugging-port', '8315');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
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
  initRag();

  registerChatHandlers();
  registerToolHandlers();
  registerWorkflowHandlers();

  createWindow();
  initBrowser();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  initAgent();
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
