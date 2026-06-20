/**
 * Bayse Complete Trading Bot v3.0
 *
 * FULL SDK IMPLEMENTATION FOR BAYSE MARKETS:
 * 
 * STRATEGIES:
 * 1. ArbitrageService - Off-chain mint/burn and order book arbitrage
 *
 * Run with: npx tsx bot-config.ts
 */

import 'dotenv/config';
import {
  PolymarketSDK,
  ArbitrageService,
} from './src/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  capital: {
    totalUsd: parseFloat(process.env.CAPITAL_USD || '250'),
    maxPerTradePct: 0.02,
    maxPerMarketPct: 0.10,
    maxTotalExposurePct: 0.30,
    minOrderUsd: 5,
    strategyAllocation: {
      arbitrage: 1.0, // 100% to arbitrage on Bayse
    },
  },

  risk: {
    // Daily limits
    dailyMaxLossPct: 0.05,
    maxConsecutiveLosses: 6,
    pauseOnBreachMinutes: 60,

    // Monthly and cumulative limits
    monthlyMaxLossPct: 0.15,
    maxDrawdownFromPeak: 0.25,
    totalMaxLossPct: 0.40,

    // Dynamic position sizing
    enableDynamicSizing: true,
    minPositionPct: 0.01,
    maxPositionPct: 0.05,
    lossSizingReduction: 0.20,
    winSizingIncrease: 0.10,
  },

  arbitrage: {
    enabled: true,
    profitThreshold: 0.01, // 1% profit threshold
    minTradeSize: 5,       // Minimum trade size
    maxTradeSize: 100,
    minVolume24h: 500,     // Volume threshold on Bayse
    autoExecute: true,
    enableRebalancer: true,
  },

  dryRun: process.env.DRY_RUN !== 'false',
};

// ============================================================================
// STATE
// ============================================================================

interface BotState {
  startTime: number;
  dailyPnL: number;
  totalPnL: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  tradesExecuted: number;
  isPaused: boolean;
  pauseUntil: number;

  // Risk tracking
  monthlyPnL: number;
  monthStartTime: number;
  peakCapital: number;
  currentCapital: number;
  currentDrawdown: number;
  permanentlyHalted: boolean;
  lastDailyReset: number;

  // Strategy stats
  arbTrades: number;
  arbProfit: number;

  // Tracked data
  activeArbMarket: string | null;

  // Balances
  usdBalance: number;
  ngnBalance: number;
  totalBalance: number;
}

const state: BotState = {
  startTime: Date.now(),
  dailyPnL: 0,
  totalPnL: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  tradesExecuted: 0,
  isPaused: false,
  pauseUntil: 0,

  // Risk tracking
  monthlyPnL: 0,
  monthStartTime: Date.now(),
  peakCapital: CONFIG.capital.totalUsd,
  currentCapital: CONFIG.capital.totalUsd,
  currentDrawdown: 0,
  permanentlyHalted: false,
  lastDailyReset: Date.now(),

  arbTrades: 0,
  arbProfit: 0,
  activeArbMarket: null,

  usdBalance: 0,
  ngnBalance: 0,
  totalBalance: 0,
};

// ============================================================================
// UTILITIES
// ============================================================================

function log(level: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const icons: Record<string, string> = {
    INFO: '📋', WARN: '⚠️', ERROR: '❌', TRADE: '💰', SIGNAL: '🎯',
    ARB: '🔄', WALLET: '👛',
  };
  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

function canTrade(): boolean {
  if (state.permanentlyHalted) {
    log('ERROR', '🛑 Trading permanently halted - total loss limit reached');
    return false;
  }

  // Reset daily PnL if new day
  const daysSinceReset = (Date.now() - state.lastDailyReset) / (1000 * 60 * 60 * 24);
  if (daysSinceReset >= 1) {
    log('INFO', `Daily PnL reset. Previous day: $${state.dailyPnL.toFixed(2)}`);
    state.dailyPnL = 0;
    state.lastDailyReset = Date.now();
  }

  // Reset monthly PnL if new month
  const daysSinceMonthStart = (Date.now() - state.monthStartTime) / (1000 * 60 * 60 * 24);
  if (daysSinceMonthStart >= 30) {
    log('INFO', `Monthly PnL reset. Previous month: $${state.monthlyPnL.toFixed(2)}`);
    state.monthlyPnL = 0;
    state.monthStartTime = Date.now();
  }

  // Update current capital and drawdown
  state.currentCapital = CONFIG.capital.totalUsd + state.totalPnL;
  if (state.currentCapital > state.peakCapital) {
    state.peakCapital = state.currentCapital;
  }
  state.currentDrawdown = (state.peakCapital - state.currentCapital) / state.peakCapital;

  // Check temporary pause
  if (state.isPaused && Date.now() < state.pauseUntil) return false;
  if (state.isPaused && Date.now() >= state.pauseUntil) {
    state.isPaused = false;
    log('INFO', 'Bot resumed after cooldown');
  }

  // Daily loss limit
  const dailyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct;
  if (state.dailyPnL <= -dailyLossLimit) {
    state.isPaused = true;
    state.pauseUntil = Date.now() + CONFIG.risk.pauseOnBreachMinutes * 60 * 1000;
    log('WARN', `Daily loss limit breached: -$${Math.abs(state.dailyPnL).toFixed(2)} (limit: $${dailyLossLimit.toFixed(2)})`);
    log('WARN', `Bot paused for ${CONFIG.risk.pauseOnBreachMinutes} minutes`);
    return false;
  }

  // Monthly loss limit
  const monthlyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct;
  if (state.monthlyPnL <= -monthlyLossLimit) {
    log('ERROR', `🛑 Monthly loss limit breached: -$${Math.abs(state.monthlyPnL).toFixed(2)} (limit: $${monthlyLossLimit.toFixed(2)})`);
    log('ERROR', 'Trading paused until next month');
    state.isPaused = true;
    state.pauseUntil = Date.now() + (30 * 24 * 60 * 60 * 1000);
    return false;
  }

  // Drawdown from peak
  if (state.currentDrawdown >= CONFIG.risk.maxDrawdownFromPeak) {
    log('ERROR', `🛑 Maximum drawdown reached: ${(state.currentDrawdown * 100).toFixed(1)}% (limit: ${(CONFIG.risk.maxDrawdownFromPeak * 100).toFixed(1)}%)`);
    log('ERROR', `Peak: $${state.peakCapital.toFixed(2)} → Current: $${state.currentCapital.toFixed(2)}`);
    state.isPaused = true;
    state.pauseUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
    return false;
  }

  // Total loss limit - PERMANENT HALT
  const totalLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.totalMaxLossPct;
  if (state.totalPnL <= -totalLossLimit) {
    state.permanentlyHalted = true;
    log('ERROR', '💀 TOTAL LOSS LIMIT REACHED - TRADING PERMANENTLY HALTED');
    log('ERROR', `Total loss: -$${Math.abs(state.totalPnL).toFixed(2)} (limit: $${totalLossLimit.toFixed(2)})`);
    return false;
  }

  return true;
}

function recordTrade(profit: number, strategy: string) {
  state.tradesExecuted++;
  state.dailyPnL += profit;
  state.monthlyPnL += profit;
  state.totalPnL += profit;

  if (profit < 0) {
    state.consecutiveLosses++;
    state.consecutiveWins = 0;
  } else {
    state.consecutiveLosses = 0;
    state.consecutiveWins++;
  }

  if (strategy === 'arbitrage') state.arbTrades++;
}

// ============================================================================
// ARBITRAGE SERVICE SETUP
// ============================================================================

let arbService: ArbitrageService | null = null;

async function setupArbitrage(sdk: PolymarketSDK) {
  if (!CONFIG.arbitrage.enabled) return;
  log('ARB', 'Setting up ArbitrageService for Bayse Markets...');

  arbService = new ArbitrageService({
    publicKey: process.env.BAYSE_PUBLIC_KEY,
    secretKey: process.env.BAYSE_SECRET_KEY,
    baseUrl: process.env.BAYSE_BASE_URL || 'https://relay.bayse.markets',
    profitThreshold: CONFIG.arbitrage.profitThreshold,
    minTradeSize: CONFIG.arbitrage.minTradeSize,
    maxTradeSize: CONFIG.arbitrage.maxTradeSize,
    autoExecute: !CONFIG.dryRun && CONFIG.arbitrage.autoExecute,
    enableRebalancer: !CONFIG.dryRun && CONFIG.arbitrage.enableRebalancer,
    enableLogging: true,
  });

  arbService.on('opportunity', (opp) => {
    log('ARB', `🎯 Arbitrage Opportunity: ${opp.type.toUpperCase()} +${opp.profitPercent.toFixed(2)}% | Est Profit: $${opp.estimatedProfit.toFixed(2)}`);
  });

  arbService.on('execution', (result) => {
    if (result.success) {
      state.arbProfit += result.profit;
      log('TRADE', `Arb execution success: +$${result.profit.toFixed(2)}`);
      recordTrade(result.profit, 'arbitrage');
    } else {
      log('WARN', `Arb execution failed: ${result.error}`);
    }
  });

  const updateBalance = async () => {
    try {
      const balances = await sdk.tradingService.getBalances();
      const usd = balances.find(b => b.symbol === 'USD');
      const ngn = balances.find(b => b.symbol === 'NGN');
      state.usdBalance = usd ? parseFloat(usd.balance) : 0;
      state.ngnBalance = ngn ? parseFloat(ngn.balance) : 0;
      state.totalBalance = state.usdBalance; // Display USD value as portfolio total
    } catch (err) {
      log('WARN', `Failed to query balances: ${(err as Error).message}`);
    }
  };

  await updateBalance();
  setInterval(updateBalance, 15000);

  // Scan for arbitrage
  const results = await arbService.scanMarkets({ minVolume24h: CONFIG.arbitrage.minVolume24h }, CONFIG.arbitrage.profitThreshold);
  const opps = results.filter(r => r.arbType !== 'none');

  if (opps.length > 0) {
    state.activeArbMarket = opps[0].market.name;
    await arbService.start(opps[0].market);
    log('ARB', `Started arbitrage on: ${opps[0].market.name}`);
  } else {
    log('ARB', 'No arbitrage opportunities found. Scanning periodically...');
    const scanInterval = setInterval(async () => {
      if (arbService && !state.activeArbMarket) {
        const scanResults = await arbService.scanMarkets({ minVolume24h: CONFIG.arbitrage.minVolume24h }, CONFIG.arbitrage.profitThreshold);
        const activeOpps = scanResults.filter(r => r.arbType !== 'none');
        if (activeOpps.length > 0) {
          state.activeArbMarket = activeOpps[0].market.name;
          await arbService.start(activeOpps[0].market);
          log('ARB', `Started arbitrage on: ${activeOpps[0].market.name}`);
          clearInterval(scanInterval);
        }
      }
    }, 30000);
  }
}

// ============================================================================
// STATUS DISPLAY
// ============================================================================

function displayStatus() {
  const runtime = Math.round((Date.now() - state.startTime) / 1000 / 60);

  console.log('\n' + '═'.repeat(80));
  console.log('           BAYSE TRADING BOT v3.0 - OFF-CHAIN ARBITRAGE');
  console.log('═'.repeat(80));
  console.log(`  Runtime:        ${runtime} minutes`);
  console.log(`  Mode:           ${CONFIG.dryRun ? '🧪 DRY RUN' : '🔴 LIVE TRADING'}`);
  console.log(`  Status:         ${state.permanentlyHalted ? '🛑 HALTED (TOTAL LOSS)' : state.isPaused ? '⏸️ PAUSED' : '✅ ACTIVE'}`);
  console.log('─'.repeat(80));
  console.log('  BALANCES:');
  console.log(`    USD:          $${state.usdBalance.toFixed(2)}`);
  console.log(`    NGN:          ₦${state.ngnBalance.toFixed(2)}`);
  console.log('─'.repeat(80));
  console.log('  PnL & CAPITAL:');
  console.log(`    Daily:        $${state.dailyPnL >= 0 ? '+' : ''}${state.dailyPnL.toFixed(2)} / $${(CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct).toFixed(2)} limit (${(CONFIG.risk.dailyMaxLossPct * 100).toFixed(0)}%)`);
  console.log(`    Monthly:      $${state.monthlyPnL >= 0 ? '+' : ''}${state.monthlyPnL.toFixed(2)} / $${(CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct).toFixed(2)} limit (${(CONFIG.risk.monthlyMaxLossPct * 100).toFixed(0)}%)`);
  console.log(`    Total:        $${state.totalPnL >= 0 ? '+' : ''}${state.totalPnL.toFixed(2)}`);
  console.log(`    Current:      $${state.currentCapital.toFixed(2)} (Peak: $${state.peakCapital.toFixed(2)})`);
  console.log(`    Drawdown:     ${(state.currentDrawdown * 100).toFixed(1)}% / ${(CONFIG.risk.maxDrawdownFromPeak * 100).toFixed(0)}% max`);
  console.log(`    Arb Profit:   $${state.arbProfit >= 0 ? '+' : ''}${state.arbProfit.toFixed(2)}`);
  console.log('─'.repeat(80));
  console.log('  RISK STATUS:');
  const dailyPct = (Math.abs(state.dailyPnL) / CONFIG.capital.totalUsd * 100).toFixed(1);
  const monthlyPct = (Math.abs(state.monthlyPnL) / CONFIG.capital.totalUsd * 100).toFixed(1);
  const dailyStatus = state.dailyPnL <= -(CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct) ? '🔴 BREACHED' : '✅ OK';
  const monthlyStatus = state.monthlyPnL <= -(CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct) ? '🔴 BREACHED' : '✅ OK';
  const drawdownStatus = state.currentDrawdown >= CONFIG.risk.maxDrawdownFromPeak ? '🔴 BREACHED' : '✅ OK';
  console.log(`    Daily Limit:  ${dailyStatus} (${dailyPct}% used)`);
  console.log(`    Monthly Limit:${monthlyStatus} (${monthlyPct}% used)`);
  console.log(`    Drawdown:     ${drawdownStatus} (${(state.currentDrawdown * 100).toFixed(1)}%)`);
  console.log(`    Consecutive:  ${state.consecutiveLosses} losses | ${state.consecutiveWins} wins`);
  console.log('─'.repeat(80));
  console.log('  STRATEGIES:');
  console.log(`    Arbitrage:    ${state.arbTrades} trades | ${state.activeArbMarket || 'scanning'}`);
  console.log('═'.repeat(80) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          BAYSE COMPLETE TRADING BOT v3.0                           ║');
  console.log('║  Arbitrage Strategy | Off-Chain Order Execution                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  if (!process.env.BAYSE_PUBLIC_KEY || !process.env.BAYSE_SECRET_KEY) {
    log('ERROR', 'BAYSE_PUBLIC_KEY or BAYSE_SECRET_KEY not found in environment');
    process.exit(1);
  }

  log('INFO', 'Configuration', {
    capital: `$${CONFIG.capital.totalUsd}`,
    dryRun: CONFIG.dryRun,
    strategies: {
      arbitrage: CONFIG.arbitrage.enabled,
    },
  });

  const sdk = await PolymarketSDK.create({
    publicKey: process.env.BAYSE_PUBLIC_KEY,
    secretKey: process.env.BAYSE_SECRET_KEY,
    baseUrl: process.env.BAYSE_BASE_URL || 'https://relay.bayse.markets',
  });

  log('INFO', `Client Initialized. Key: ${process.env.BAYSE_PUBLIC_KEY.slice(0, 8)}...`);

  // Setup arbitrage
  await setupArbitrage(sdk);

  displayStatus();
  setInterval(displayStatus, 60000);

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    if (arbService) await arbService.stop();
    displayStatus();
    sdk.stop();
    process.exit(0);
  });

  log('INFO', '🚀 Bot v3.0 running! Press Ctrl+C to stop.\n');
}

main().catch((err) => {
  log('ERROR', `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
