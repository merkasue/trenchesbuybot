// index.js
require('dotenv').config();
const axios      = require('axios');
const puppeteer  = require('puppeteer');
const { fetchETHBuys } = require('./utils');
const config     = require('./config.json');

// --- Thresholds & credentials from .env or config.json ---
const ETH_USD_THRESHOLD = parseFloat(process.env.ETH_THRESHOLD) || config.ethUsdThreshold;
const X_USERNAME        = process.env.X_USERNAME;
const X_PASSWORD        = process.env.X_PASSWORD;

// --- Global sponsor line ---
const SPONSOR_LINE = `Sponsored by: @${config.sponsorHandle}`
  + (config.sponsorPhrase ? ` – ${config.sponsorPhrase}` : '');

// --- State to avoid dupes ---
let lastRunTs = Date.now();
const seenTxs = new Set();

// --- Cache ETH price for 60s ---
let _ethPrice = null, _ethPriceTs = 0;
async function getEthPrice() {
  if (_ethPrice && Date.now() - _ethPriceTs < 60_000) return _ethPrice;
  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  _ethPrice = data.ethereum.usd;
  _ethPriceTs = Date.now();
  return _ethPrice;
}

// --- Build the text message for a buy ---
async function buildAlert(item, buy) {
  const { name, address } = item.token;
  const usdValue = (buy.value * await getEthPrice()).toFixed(2);
  return [
    `🔥 Bought ${buy.value.toFixed(4)} ETH of **${name}** ($${usdValue})`,
    `🔗 Chart: https://dexscreener.com/ethereum/${address}`,
    SPONSOR_LINE
  ].join('\n');
}

// --- Puppeteer login (password-based) ---
let browser, page;
async function initX() {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });
  await page.type('input[name="text"]', X_USERNAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.type('input[name="password"]', X_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('✅ Logged in to X');
}

// --- Post a message into one community ---
async function postToCommunity(slug, text) {
  await page.goto(`https://x.com/i/communities/${slug}/home`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="tweetTextarea_0"]');
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(text);
  await page.click('[data-testid="tweetButtonInline"]');
  await page.waitForTimeout(2000);
}

// --- Main tracking loop ---
async function runTracker() {
  console.clear();
  console.log(`ETH threshold: $${ETH_USD_THRESHOLD}`);

  for (const item of config.communities) {
    const { slug, token } = item;
    try {
      const buys = await fetchETHBuys(token.address);
      for (const b of buys.filter(buy => buy.value * (await getEthPrice()) >= ETH_USD_THRESHOLD)) {
        const key = `${slug}-${b.hash}`;
        if (seenTxs.has(key)) continue;
        seenTxs.add(key);
        const msg = await buildAlert(item, b);
        console.log(`[${slug}]`, msg.replace(/\n/g,' | '));
        await postToCommunity(slug, msg);
      }
    } catch (err) {
      console.error(`[${slug}] Error:`, err.message);
    }
  }

  lastRunTs = Date.now();
}

// --- Bootstrap ---
;(async () => {
  await initX();
  await runTracker();
  setInterval(runTracker, 30_000);  // every 30s
})();
