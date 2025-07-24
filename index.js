// index.js
require('dotenv').config();
const axios      = require('axios');
const puppeteer  = require('puppeteer');
const { fetchETHBuys } = require('./utils');
const config     = require('./config.json');

// Env & config
const ETH_USD_THRESHOLD = parseFloat(process.env.ETH_THRESHOLD) || config.ethUsdThreshold;
const X_USERNAME        = process.env.X_USERNAME;
const X_PASSWORD        = process.env.X_PASSWORD;
const SPONSOR_LINE = `Sponsored by: @${config.sponsorHandle}`
  + (config.sponsorPhrase ? ` – ${config.sponsorPhrase}` : '');

let browser, page;

// Pre-cache price for each run
async function getEthPrice() {
  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  return data.ethereum.usd;
}

async function initX() {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page    = await browser.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });
  await page.type('input[name="text"]', X_USERNAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.type('input[name="password"]', X_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('✅ Logged in to X');
}

async function postToCommunity(slug, text) {
  await page.goto(`https://x.com/i/communities/${slug}/home`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="tweetTextarea_0"]');
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(text);
  await page.click('[data-testid="tweetButtonInline"]');
  await page.waitForTimeout(2000);
}

async function runTracker() {
  console.log(`\n--- Running tracker at ${new Date().toISOString()} ---`);
  console.log(`ETH threshold: $${ETH_USD_THRESHOLD}`);

  // 1) Fetch the current ETH-USD price once per cycle
  const ethPrice = await getEthPrice();

  // 2) Loop each community
  for (const item of config.communities) {
    const { slug, token } = item;
    console.log(`\n⏳ Checking ${token.name} on ${token.chain} for community "${slug}"…`);

    try {
      // 3) Fetch raw buys
      const buys = await fetchETHBuys(token.address);

      // 4) Filter buys by USD threshold
      const largeBuys = buys.filter(b => (b.value * ethPrice) >= ETH_USD_THRESHOLD);
      console.log(`✅ Found ${largeBuys.length} buys ≥ $${ETH_USD_THRESHOLD}`);

      // 5) Post each new buy
      for (const b of largeBuys) {
        const usdVal = (b.value * ethPrice).toFixed(2);
        const msg = [
          `🔥 Bought ${b.value.toFixed(4)} ETH of **${token.name}** ($${usdVal})`,
          `🔗 Chart: https://dexscreener.com/ethereum/${token.address}`,
          SPONSOR_LINE
        ].join('\n');

        console.log(`📝 Posting to ${slug}:`, msg.replace(/\n/g,' | '));
        await postToCommunity(slug, msg);
      }

    } catch (err) {
      console.error(`❌ Error for ${slug}:`, err.message);
    }
  }
}

;(async () => {
  await initX();
  // Run first immediately, then every 30s
  await runTracker();
  setInterval(runTracker, 30_000);
})();
