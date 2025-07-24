// test-post.js
require('dotenv').config();
const axios       = require('axios');
const chromium    = require('chrome-aws-lambda');
const puppeteer   = require('puppeteer-core');
const { fetchETHBuys } = require('./utils');
const config      = require('./config.json');

;(async () => {
  // Fetch ETH buys
  const { slug, token } = config.communities[0];
  console.log(`Fetching ETH buys for ${token.name}…`);
  const buys = await fetchETHBuys(token.address);
  console.log('Sample:', buys.slice(0,3));

  // Launch browser via chrome-aws-lambda
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: false,
    slowMo: 50
  });
  const page = await browser.newPage();

  // Log in to X
  await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });
  await page.type('input[name="text"]', process.env.X_USERNAME);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.type('input[name="password"]', process.env.X_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log('✅ Logged in to X');

  // Build test message
  const b = buys[0];
  const ethPrice = (await axios
    .get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
  ).data.ethereum.usd;
  const usd = (b.value * ethPrice).toFixed(2);
  const msg = [
    `🔥 Bought ${b.value.toFixed(4)} ETH of **${token.name}** ($${usd})`,
    `🔗 Chart: https://dexscreener.com/ethereum/${token.address}`,
    `Sponsored by: @${config.sponsorHandle} – ${config.sponsorPhrase}`
  ].join('\n');

  // Post into your private ETH community
  await page.goto(`https://x.com/i/communities/${slug}/home`, { waitUntil: 'networkidle2' });
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.keyboard.type(msg);
  await page.click('[data-testid="tweetButtonInline"]');
  console.log('📝 Posted test message into', slug);

  // Finish
  await page.waitForTimeout(3000);
  await browser.close();
  process.exit(0);
})();
