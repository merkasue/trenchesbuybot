// utils.js
require('dotenv').config();
const axios = require('axios');

/**
 * Fetch recent ETH token transfers via Etherscan
 * @param {string} tokenAddress  ERC-20 contract address
 * @returns {Promise<Array<{value:number,hash:string,time:string}>>}
 */
async function fetchETHBuys(tokenAddress) {
  const key = process.env.ETHERSCAN_API_KEY;
  const url =
    `https://api.etherscan.io/api`
    + `?module=account&action=tokentx`
    + `&contractaddress=${tokenAddress}`
    + `&sort=desc`
    + `&apikey=${key}`;
  const res = await axios.get(url);
  if (!res.data || res.data.status !== '1' || !Array.isArray(res.data.result)) {
    console.warn(`⚠️ ETH fetch returned no array for ${tokenAddress}`);
    return [];
  }
  return res.data.result.map(tx => ({
    value: Number(tx.value) / 1e18,
    hash:  tx.hash,
    time:  new Date(tx.timeStamp * 1000).toISOString()
  }));
}

module.exports = { fetchETHBuys };
