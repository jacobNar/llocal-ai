const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const puppeteer = require("puppeteer");
var browser = null;
const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    }
  });

  // Load the Angular app from the build directory
  mainWindow.loadFile(path.join(__dirname, '../out/llocal-ai-ui/index.html'));
  
  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  createWindow();
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("webCrawlerTool", async (event, url) => {
  return await webCrawlerTool(url);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


const normalizeUrl = (url) => {
  // Remove protocol (http:// or https://)
  let normalized = url.replace(/^https?:\/\//, '');
  // Remove www prefix if present
  normalized = normalized.replace(/^www\./, '');
  return normalized;
};

const webCrawlerTool = async (startUrl) => {
  browser = await puppeteer.launch({ headless: false, executablePath: executablePath });
  console.log("chromium started");
  console.log("new tab");
  const visited = new Set();
  const siteContent = {};
  const baseDomain= normalizeUrl(new URL(startUrl).origin);

  const visitPage = async (url) => {
      if (visited.has(url)) return;
      visited.add(url);
      const newPage = await browser.newPage();
      try {
          await newPage.goto(url, { waitUntil: 'networkidle2' });
          const content = await newPage.evaluate(() => {
              document.querySelectorAll('script, style').forEach(el => el.remove());
              return document.body.innerText.trim();
          });

          siteContent[url] = content || "(No extractable content found)";
          
          const links = await newPage.evaluate(() => 
              Array.from(document.querySelectorAll('a[href]'))
                  .map(a => (a).href.trim())
          );

          let filteredLinks = links.filter(link => normalizeUrl(link).startsWith(baseDomain) && !visited.has(link))
          await Promise.all(filteredLinks.map(link => visitPage(link))
          );
      } catch (error) {
          console.error(`Failed to visit ${url}:`, error);
      }finally {
          // Close the individual tab after processing
          await newPage.close();
      }
  };

  await visitPage(startUrl);
  await browser.close();
  return siteContent;
}