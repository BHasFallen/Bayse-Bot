/**
 * Example 1: Basic SDK Usage
 *
 * This example demonstrates:
 * - Getting trending markets from Gamma API
 * - Getting market details from unified API (Gamma + CLOB)
 * - Getting orderbook data
 *
 * Run: npx ts-node examples/01-basic-usage.ts
 */

import { PolymarketSDK } from '../src/index.js';

async function main() {
  console.log('=== Polymarket SDK Basic Usage ===\n');

  const sdk = new PolymarketSDK();

  // 1. Get trending events
  console.log('1. Fetching trending events...');
  const res = await sdk.bayseClient.getEvents({ trending: true, size: 5 });
  const trendingEvents = res.events;
  console.log(`   Found ${trendingEvents.length} trending events:\n`);

  for (const event of trendingEvents) {
    console.log(`   - ${event.title}`);
    console.log(`     Slug: ${event.slug}`);
    console.log(`     Volume: $${event.totalVolume.toLocaleString()}`);
    console.log(`     Liquidity: $${event.liquidity.toLocaleString()}`);
    if (event.markets.length > 0) {
      const market = event.markets[0];
      console.log(`     First Market: ${market.title}`);
      console.log(`     Prices: Yes=${market.outcome1Price.toFixed(2)}, No=${market.outcome2Price.toFixed(2)}`);
    }
    console.log('');
  }

  // 2. Get unified market details
  if (trendingEvents.length > 0 && trendingEvents[0].markets.length > 0) {
    const firstEvent = trendingEvents[0];
    const firstMarket = firstEvent.markets[0];
    console.log(`2. Getting unified market details for market ID: ${firstMarket.id}`);
    const unifiedMarket = await sdk.getMarket(firstMarket.id);
    console.log(`   Question: ${unifiedMarket.question}`);
    console.log(`   Condition ID: ${unifiedMarket.conditionId}`);
    const yesToken = unifiedMarket.tokens[0];
    const noToken = unifiedMarket.tokens[1];
    console.log(`   YES/Outcome 1 Token ID: ${yesToken?.tokenId}`);
    console.log(`   NO/Outcome 2 Token ID: ${noToken?.tokenId}`);
    console.log(`   YES/Outcome 1 Price: ${yesToken?.price.toFixed(4)}`);
    console.log(`   NO/Outcome 2 Price: ${noToken?.price.toFixed(4)}`);
    console.log(`   Source: ${unifiedMarket.source}`);
    console.log('');

    // 3. Get orderbook
    console.log('3. Getting orderbook...');
    const orderbook = await sdk.getOrderbook(unifiedMarket.conditionId);
    console.log(`   YES Best Bid: ${orderbook.yes.bid.toFixed(4)} (size: ${orderbook.yes.bidSize.toFixed(2)})`);
    console.log(`   YES Best Ask: ${orderbook.yes.ask.toFixed(4)} (size: ${orderbook.yes.askSize.toFixed(2)})`);
    console.log(`   YES Spread: ${(orderbook.yes.spread * 100).toFixed(2)}%`);
    console.log('');
    console.log(`   NO Best Bid: ${orderbook.no.bid.toFixed(4)} (size: ${orderbook.no.bidSize.toFixed(2)})`);
    console.log(`   NO Best Ask: ${orderbook.no.ask.toFixed(4)} (size: ${orderbook.no.askSize.toFixed(2)})`);
    console.log(`   NO Spread: ${(orderbook.no.spread * 100).toFixed(2)}%`);
    console.log('');
    console.log(`   Ask Sum (YES+NO): ${orderbook.summary.askSum.toFixed(4)}`);
    console.log(`   Bid Sum (YES+NO): ${orderbook.summary.bidSum.toFixed(4)}`);
    console.log(`   Long Arb Profit: ${(orderbook.summary.longArbProfit * 100).toFixed(3)}%`);
    console.log(`   Short Arb Profit: ${(orderbook.summary.shortArbProfit * 100).toFixed(3)}%`);
    console.log(`   Imbalance Ratio: ${orderbook.summary.imbalanceRatio.toFixed(2)}`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
