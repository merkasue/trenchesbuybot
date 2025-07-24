// index.js
require('dotenv').config();
const axios     = require('axios');
const puppeteer = require('puppeteer');
const { fetchETHBuys } = require('./utils');
const config    = require('./config.json');

// Threshold from env or config.json
const ETH_USD_THRESHOLD = parseFloat(process.env.ETH_THRESHOLD) || config.ethUsdThreshold;

// X credentials from env
const X_USERNAME = process.env.X_USERNAME;
const X_PASSWORD = process.env.X_PASSWORD;

// Global sponsor line
const SPONSOR_LINE = `Sponsored by: @${config.sponsorHandle}` +
  (config.sponsorPhrase ? ` – ${config.sponsorPhrase}` : '');

// Browser and page instances
let browser, page;

// Helper: fetch the current ETH→USD price once per cycle
async function getEthPrice() {
  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  return data.ethereum.usd;
}

// Initialize Puppeteer using the system Chromium
async function initX() {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
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

// Post a message to a given community slug
async function postToCommunity(slug, text) {
  await page.goto(`https://x.com/i/communities/${slug}/home`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="tweetTextarea_0"]');
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(text);
  await page.click('[data-testid="tweetButtonInline"]');
  await page.waitForTimeout(2000);
}

// Build the alert message for a buy
async function buildAlert(item, buy, ethPrice) {
  const { name, address } = item.token;
  const usdValue = (buy.value * ethPrice).toFixed(2);
  return [
    `🔥 Bought ${buy.value.toFixed(4)} ETH of **${name}** ($${usdValue})`,
    `🔗 Chart: https://dexscreener.com/ethereum/${address}`,
    SPONSOR_LINE
  ].join('\n');
}

// Main tracking loop
async function runTracker() {
  console.log(`\n⏱  Tracker run at ${new Date().toISOString()}`);
  console.log(`🔍 ETH threshold: $${ETH_USD_THRESHOLD}`);

  const ethPrice = await getEthPrice();

  for (const item of config.communities) {
    const { slug, token } = item;
    console.log(`\n⏳ Checking ${token.name} in community "${slug}"…`);

    try {
      // 1) Fetch ETH buys
      const buys = await fetchETHBuys(token.address);

      // 2) Filter by USD threshold
      const largeBuys = buys.filter(b => (b.value * ethPrice) >= ETH_USD_THRESHOLD);
      console.log(`✅ Found ${largeBuys.length} buys ≥ $${ETH_USD_THRESHOLD}`);

      // 3) Post each
      for (const b of largeBuys) {
        const msg = await buildAlert(item, b, ethPrice);
        console.log(`📝 Posting to ${slug}:`, msg.replace(/\n/g,' | '));
        await postToCommunity(slug, msg);
      }
    } catch (err) {
      console.error(`❌ Error for ${slug}:`, err.message);
    }
  }
}

// Bootstrap: login, then run every 30s
(async () => {
  await initX();
  await runTracker();
  setInterval(runTracker, 30_000);
})();
