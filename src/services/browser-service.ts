import puppeteer, { Browser } from 'puppeteer';
import { setBrowserInstance } from '../tools/browser-tools';

let browser: Browser | null = null;
const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

export const initBrowser = async () => {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log("Initializing chromium...");
    browser = await puppeteer.launch({
        headless: false,
        executablePath: executablePath,
        defaultViewport: null,
        args: ['--start-maximized', "--no-sandbox", "--disable-setuid-sandbox"]
    });

    setBrowserInstance(browser);
    console.log("Chromium started");
    return browser;
}

export const getBrowser = () => browser;
