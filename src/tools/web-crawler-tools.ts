import puppeteer from 'puppeteer';

const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const normalizeUrl = (url: string) => {
  // Remove protocol (http:// or https://)
  let normalized = url.replace(/^https?:\/\//, '');
  // Remove www prefix if present
  normalized = normalized.replace(/^www\./, '');
  return normalized;
};

const webCrawlerTool = async (startUrl: string) => {
  const browser = await puppeteer.launch({ headless: false, executablePath: executablePath });
  console.log("chromium started");
  console.log("new tab");
  const visited = new Set();
  const siteContent: Record<string, string> = {};
  const baseDomain= normalizeUrl(new URL(startUrl).origin);
  const maxLinks = 10

  const visitPage = async (url: string) => {
      if (visited.has(url)) return;
      visited.add(url);
      const newPage = await browser.newPage();
      try {
          await newPage.goto(url, { waitUntil: 'networkidle2' });
          const content = await newPage.evaluate(() => {
              document.querySelectorAll('script, style').forEach(el => el.remove());
              return document.body.innerText.trim();
          });

          console.log(`Visited ${url}`);

          siteContent[url] = content;
          
          const links = await newPage.evaluate(() => 
              Array.from(document.querySelectorAll('a[href]'))
                  .map(a => (a as HTMLAnchorElement).href.trim())
          );

          const filteredLinks = links.filter(link => normalizeUrl(link).startsWith(baseDomain) && !visited.has(link))
          await Promise.all(filteredLinks.map(link => {
            if (visited.size < maxLinks) {
                return visitPage(link);
            }
            return Promise.resolve();
          }));
      } catch (error) {
          console.error(`Failed to visit ${url}:`, error);
      }finally {
          await newPage.close();
      }
  };

  await visitPage(startUrl);
  await browser.close();
  console.log("chromium closed");
  // console.log(siteContent)
  return siteContent;
}

export default webCrawlerTool;