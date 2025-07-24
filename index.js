// index.js
require('dotenv').config();
const axios       = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const { fetchETHBuys } = require('./utils');
const config      = require('./config.json');

// --- Environment & Config ---
const ETH_USD_THRESHOLD    = parseFloat(process.env.ETH_THRESHOLD) || config.ethUsdThreshold;
const SPONSOR_LINE         = `Sponsored by: @${config.sponsorHandle}` +
  (config.sponsorPhrase ? ` – ${config.sponsorPhrase}` : '');

// Twitter API credentials (set these in your .env or host secrets)
const client = new TwitterApi({
  appKey:         process.env.TWITTER_API_KEY,
  appSecret:      process.env.TWITTER_API_SECRET,
  accessToken:    process.env.TWITTER_ACCESS_TOKEN,
  accessSecret:   process.env.TWITTER_ACCESS_SECRET,
});

// Use the v2 client for tweeting
const twitter = client.v2;

// --- Helpers ---

// 1) Get ETH→USD spot price once per run
async function getEthPrice() {
  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
  );
  return data.ethereum.usd;
}

// 2) Get market cap for an ERC20 via CoinGecko
async function getMarketCap(contractAddress) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/ethereum/contract/${contractAddress}`;
    const { data } = await axios.get(url);
    return data.market_data.market_cap.usd || 0;
  } catch (err) {
    console.warn(`⚠️ Failed to fetch market cap for ${contractAddress}:`, err.message);
    return 0;
  }
}

// 3) Build the tweet text
function buildTweet({ name, address }, buyValue, ethPrice, marketCap) {
  const usdValue     = (buyValue * ethPrice).toFixed(2);
  const capFormatted = marketCap >= 1e9
    ? `$${(marketCap/1e9).toFixed(2)}B`
    : marketCap >= 1e6
      ? `$${(marketCap/1e6).toFixed(2)}M`
      : `$${marketCap.toLocaleString()}`;

  return [
    `🔥 Bought ${buyValue.toFixed(4)} ETH of **${name}** ($${usdValue})`,
    `💰 Market Cap: ${capFormatted}`,
    `🔗 Chart: https://dexscreener.com/ethereum/${address}`,
    SPONSOR_LINE
  ].join('\n\n');
}

// --- Main Loop ---
async function runTracker() {
  console.log(`\n⏱ Tracker run at ${new Date().toISOString()}`);
  const ethPrice = await getEthPrice();

  for (const { slug, token } of config.communities) {
    console.log(`\n⏳ Checking ${token.name}…`);
    try {
      // fetch on‐chain buys
      const buys = await fetchETHBuys(token.address);

      // filter above threshold (in USD)
      const largeBuys = buys.filter(b => (b.value * ethPrice) >= ETH_USD_THRESHOLD);
      console.log(`✅ ${largeBuys.length} buys ≥ $${ETH_USD_THRESHOLD}`);

      if (!largeBuys.length) continue;

      // fetch market cap once
      const marketCap = await getMarketCap(token.address);

      // post each new buy
      for (const b of largeBuys) {
        const text = buildTweet(token, b.value, ethPrice, marketCap);
        console.log(`📝 Tweeting:`, text.replace(/\n/g,' | '));
        const res = await twitter.tweet(text);
        console.log(`   ↪️ Tweet successful: https://x.com/i/web/status/${res.data.id}`);
      }
    } catch (err) {
      console.error(`❌ Error processing ${token.name}:`, err);
    }
  }
}

// --- Bootstrap ---
(async () => {
  // first run immediately
  await runTracker();
  // then every 30s
  setInterval(runTracker, 30_000);
})();
