import puppeteer, { Browser } from 'puppeteer-core';
import { setBrowserInstance } from '../tools/browser-tools';

let browser: Browser | null = null;

export const initBrowser = async () => {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log("Connecting to Electron remote debugging port with retry...");
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            browser = await puppeteer.connect({
                browserURL: 'http://127.0.0.1:8315',
                defaultViewport: null,
            });
            // Set the shared browser instance for tools
            setBrowserInstance(browser);
            console.log("Chromium connected to Electron on attempt", attempt);
            return browser;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            if (attempt < maxAttempts) {
                await new Promise(res => setTimeout(res, 3000));
            } else {
                console.error("Failed to connect to Electron remote debugging port after retries. Ensure the app was started with remote-debugging switches.");
                throw error;
            }
        }
    }
    return browser;
}

export const getBrowser = () => browser;
