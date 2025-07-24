// test.js
require('dotenv').config();
const { fetchETHBuys, fetchSOLBuys } = require('./utils');
const config = require('./config.json');

(async () => {
  console.clear();
  console.log('🔍 Testing SOL “buy” fetch via Helius…\n');

  for (const item of config.communities) {
    if (item.token.chain !== 'solana') continue;
    const mint = item.token.address;
    console.log(`⏳  Fetching buys for ${item.token.name} (${mint})…`);
    try {
      const buys = await fetchSOLBuys(mint);
      if (buys.length) {
        console.log(`   ✅ Got ${buys.length} buy(s). Sample:`, buys.slice(0,3));
      } else {
        console.log('   ⚠️  No buys found (or under threshold)');
      }
    } catch (e) {
      console.error(`   ❌ Error fetching SOL buys:`, e.message);
    }
    console.log('');
  }

  console.log('🏁 Test complete.');
  process.exit(0);
})();
