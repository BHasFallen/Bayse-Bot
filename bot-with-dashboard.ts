/**
 * Bot with Dashboard - Wrapper that runs the bot with real-time monitoring UI
 * 
 * Run with: npx tsx bot-with-dashboard.ts
 * Then open: http://localhost:5173
 */

import 'dotenv/config';
import {
  PolymarketSDK,
  ArbitrageService,
} from './src/index.js';
import { startDashboard, dashboardEmitter } from './src/dashboard/index.js';
import type { BotState, BotConfig, LogLevel, DipArbSignal, SmartMoneySignal } from './src/dashboard/types.js';
import { addSession, createSessionFromState, type TradeRecord } from './src/dashboard/session-history.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Primary currency for this account
const CURRENCY = (process.env.CURRENCY || 'USD') as 'USD' | 'NGN';

let CONFIG = {
  currency: CURRENCY,
  capital: {
    totalUsd: parseFloat(process.env.CAPITAL_USD || '250'),
    totalNgn: parseFloat(process.env.CAPITAL_NGN || '400000'),
    maxPerTradePct: 0.02,
    maxPerMarketPct: 0.10,
    maxTotalExposurePct: 0.30,
    minOrderUsd: 5,
    strategyAllocation: {
      smartMoney: 0,
      arbitrage: 1.0,
      dipArb: 0,
      directTrades: 0,
    },
  },

  risk: {
    dailyMaxLossPct: 0.05,
    maxConsecutiveLosses: 6,
    pauseOnBreachMinutes: 60,
    monthlyMaxLossPct: 0.15,
    maxDrawdownFromPeak: 0.25,
    totalMaxLossPct: 0.40,
    enableDynamicSizing: true,
    minPositionPct: 0.01,
    maxPositionPct: 0.05,
    lossSizingReduction: 0.20,
    winSizingIncrease: 0.10,
  },

  smartMoney: {
    enabled: false,
    topN: 20,
    minWinRate: 0.60,
    minPnl: 500,
    minTrades: 30,
    minProfitFactor: 1.5,
    minConsistencyScore: 0.7,
    maxSingleTradeExposure: 0.3,
    checkLastNTrades: 10,
    sizeScale: 0.1,
    maxSizePerTrade: 15,
    maxSlippage: 0.03,
    minTradeSize: 10,
    delay: 500,
    customWallets: [] as string[],
  },

  arbitrage: {
    enabled: true,
    profitThreshold: 0.01,
    minTradeSize: 5,
    maxTradeSize: 100,
    minVolume24h: 500,
    autoExecute: true,
    enableRebalancer: true,
    estimatedGasCostUSD: 0,
    minNetProfit: 0.10,
  },

  dipArb: {
    enabled: false,
    coins: ['BTC', 'ETH', 'SOL'] as const,
    shares: 10,
    sumTarget: 0.92,
    autoRotate: false,
    autoExecute: false,
    minTradeValueUSD: 1.5,
  },

  onchain: {
    enabled: false,
    autoApprove: false,
    minMatic: 0,
  },

  binance: {
    enabled: false,
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const,
    interval: '15m' as const,
    trendThreshold: 2,
  },

  directTrading: {
    enabled: false,
    trendFollowing: false,
    minTrendStrength: 0,
    stopLossPct: 0,
    takeProfitPct: 0,
    trailingStopPct: 0,
    maxHoldDays: 0,
    minRiskReward: 0,
  },

  dryRun: process.env.DRY_RUN !== 'false',
};

// ============================================================================
// STATE
// ============================================================================

const state: BotState = {
  startTime: Date.now(),
  dailyPnL: 0,
  totalPnL: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  tradesExecuted: 0,
  isPaused: false,
  pauseUntil: 0,

  monthlyPnL: 0,
  monthStartTime: Date.now(),
  peakCapital: CONFIG.capital.totalUsd,
  currentCapital: CONFIG.capital.totalUsd,
  currentDrawdown: 0,
  permanentlyHalted: false,
  lastDailyReset: Date.now(),

  smartMoneyTrades: 0,
  arbTrades: 0,
  dipArbTrades: 0,
  directTrades: 0,
  arbProfit: 0,
  followedWallets: [],
  positions: [],
  activeArbMarket: null,
  activeDipArbMarket: null,
  splits: 0,
  merges: 0,
  redeems: 0,
  swaps: 0,
  usdBalance: 0,
  ngnBalance: 0,
  totalBalance: 0,
  unrealizedPnL: 0,
  btcTrend: 'neutral',
  ethTrend: 'neutral',
  solTrend: 'neutral',

  dipArb: {
    marketName: null,
    underlying: null,
    duration: null,
    endTime: null,
    upPrice: 0,
    downPrice: 0,
    sum: 0,
    status: 'idle',
    lastSignal: null,
    signals: [],
  },

  arbitrage: {
    status: 'idle',
    marketsScanned: 0,
    opportunitiesFound: 0,
    currentMarket: null,
    lastOpportunity: null,
  },

  smartMoneySignals: [],
};

// ============================================================================
// DASHBOARD-AWARE UTILITIES
// ============================================================================

function log(level: LogLevel, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const icons: Record<LogLevel, string> = {
    INFO: '📋', WARN: '⚠️', ERROR: '❌', TRADE: '💰', SIGNAL: '🎯',
    ARB: '🔄', WALLET: '👛', CHAIN: '⛓️', SWAP: '💱', BRIDGE: '🌉',
    KLINE: '📊', TREND: '📈',
  };

  console.log(`[${timestamp}] ${icons[level] || '•'} ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));

  dashboardEmitter.log(level, message, data);
}

function updateDashboard() {
  dashboardEmitter.updateState(state);
}

function canTrade(): boolean {
  if (state.permanentlyHalted) {
    log('ERROR', '🛑 Trading permanently halted - total loss limit reached');
    return false;
  }

  const daysSinceReset = (Date.now() - state.lastDailyReset) / (1000 * 60 * 60 * 24);
  if (daysSinceReset >= 1) {
    log('INFO', `Daily PnL reset. Previous day: $${state.dailyPnL.toFixed(2)}`);
    state.dailyPnL = 0;
    state.lastDailyReset = Date.now();
  }

  const daysSinceMonthStart = (Date.now() - state.monthStartTime) / (1000 * 60 * 60 * 24);
  if (daysSinceMonthStart >= 30) {
    log('INFO', `Monthly PnL reset. Previous month: $${state.monthlyPnL.toFixed(2)}`);
    state.monthlyPnL = 0;
    state.monthStartTime = Date.now();
  }

  state.currentCapital = CONFIG.capital.totalUsd + state.totalPnL;
  if (state.currentCapital > state.peakCapital) {
    state.peakCapital = state.currentCapital;
  }
  state.currentDrawdown = (state.peakCapital - state.currentCapital) / state.peakCapital;

  if (state.isPaused && Date.now() < state.pauseUntil) return false;
  if (state.isPaused && Date.now() >= state.pauseUntil) {
    state.isPaused = false;
    log('INFO', 'Bot resumed after cooldown');
    updateDashboard();
  }

  const dailyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.dailyMaxLossPct;
  if (state.dailyPnL <= -dailyLossLimit) {
    state.isPaused = true;
    state.pauseUntil = Date.now() + CONFIG.risk.pauseOnBreachMinutes * 60 * 1000;
    log('WARN', `Daily loss limit breached: -$${Math.abs(state.dailyPnL).toFixed(2)} (limit: $${dailyLossLimit.toFixed(2)})`);
    updateDashboard();
    return false;
  }

  const monthlyLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.monthlyMaxLossPct;
  if (state.monthlyPnL <= -monthlyLossLimit) {
    log('ERROR', `🛑 Monthly loss limit breached: -$${Math.abs(state.monthlyPnL).toFixed(2)} (limit: $${monthlyLossLimit.toFixed(2)})`);
    state.isPaused = true;
    state.pauseUntil = Date.now() + (30 * 24 * 60 * 60 * 1000);
    updateDashboard();
    return false;
  }

  if (state.currentDrawdown >= CONFIG.risk.maxDrawdownFromPeak) {
    log('ERROR', `🛑 Maximum drawdown reached: ${(state.currentDrawdown * 100).toFixed(1)}%`);
    state.isPaused = true;
    state.pauseUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
    updateDashboard();
    return false;
  }

  const totalLossLimit = CONFIG.capital.totalUsd * CONFIG.risk.totalMaxLossPct;
  if (state.totalPnL <= -totalLossLimit) {
    state.permanentlyHalted = true;
    log('ERROR', '💀 TOTAL LOSS LIMIT REACHED - TRADING PERMANENTLY HALTED');
    updateDashboard();
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
  updateDashboard();
}

// ============================================================================
// STRATEGIES
// ============================================================================

let arbService: ArbitrageService | null = null;

async function setupArbitrage(sdk: PolymarketSDK) {
  if (!CONFIG.arbitrage.enabled) return;
  log('ARB', 'Setting up ArbitrageService...');

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
    log('ARB', `🎯 Arbitrage opportunity found: ${opp.type.toUpperCase()} +${opp.profitPercent.toFixed(2)}% | Est profit: $${opp.estimatedProfit.toFixed(2)}`);
    state.arbitrage.opportunitiesFound++;
    state.arbitrage.lastOpportunity = {
      timestamp: new Date().toISOString(),
      type: opp.type,
      profitPct: opp.profitPercent,
      market: state.activeArbMarket || 'unknown',
    };
    updateDashboard();
  });

  arbService.on('execution', (result) => {
    if (result.success) {
      state.arbProfit += result.profit;
      log('TRADE', `Arb executed: +$${result.profit.toFixed(2)}`);
      recordTrade(result.profit, 'arbitrage');
      addSession(createSessionFromState(state.startTime, state as any, CONFIG as any, []));
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
      state.totalBalance = state.usdBalance;
      updateDashboard();
    } catch (err) {
      log('WARN', `Failed to update balances: ${(err as Error).message}`);
    }
  };

  await updateBalance();
  setInterval(updateBalance, 10000);

  // Scan markets
  state.arbitrage.status = 'scanning';
  updateDashboard();

  try {
    const results = await arbService.scanMarkets({ minVolume24h: CONFIG.arbitrage.minVolume24h }, CONFIG.arbitrage.profitThreshold);
    state.arbitrage.marketsScanned = results.length;
    const opps = results.filter(r => r.arbType !== 'none');

    if (opps.length > 0) {
      state.activeArbMarket = opps[0].market.name;
      state.arbitrage.currentMarket = opps[0].market.name;
      state.arbitrage.status = 'monitoring';
      updateDashboard();
      await arbService.start(opps[0].market);
      log('ARB', `Started monitoring market: ${opps[0].market.name}`);
    } else {
      state.arbitrage.status = 'idle';
      log('ARB', 'No immediate opportunities found. Scanning periodically...');
      updateDashboard();

      const scanInterval = setInterval(async () => {
        if (arbService && !state.activeArbMarket) {
          state.arbitrage.status = 'scanning';
          updateDashboard();
          const scanResults = await arbService.scanMarkets({ minVolume24h: CONFIG.arbitrage.minVolume24h }, CONFIG.arbitrage.profitThreshold);
          state.arbitrage.marketsScanned = scanResults.length;
          const activeOpps = scanResults.filter(r => r.arbType !== 'none');
          if (activeOpps.length > 0) {
            state.activeArbMarket = activeOpps[0].market.name;
            state.arbitrage.currentMarket = activeOpps[0].market.name;
            state.arbitrage.status = 'monitoring';
            updateDashboard();
            await arbService.start(activeOpps[0].market);
            log('ARB', `Started arbitrage on: ${activeOpps[0].market.name}`);
            clearInterval(scanInterval);
          } else {
            state.arbitrage.status = 'idle';
            updateDashboard();
          }
        }
      }, 30000);
    }
  } catch (err: any) {
    state.arbitrage.status = 'idle';
    log('ERROR', `Scanner error: ${err.message}`);
    updateDashboard();
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const port = parseInt(process.env.PORT || '3001', 10);
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          BAYSE BOT WITH WEB DASHBOARD                              ║');
  console.log(`║  Starting Server: http://localhost:${port.toString().padEnd(5)}                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  if (!process.env.BAYSE_PUBLIC_KEY || !process.env.BAYSE_SECRET_KEY) {
    console.error('Fatal: BAYSE_PUBLIC_KEY and BAYSE_SECRET_KEY must be set in .env');
    process.exit(1);
  }

  // Start Dashboard server
  startDashboard(port);

  // Send initial config to dashboard
  const initialDashboardConfig: BotConfig = {
    currency: CONFIG.currency,
    capital: {
      totalUsd: CONFIG.capital.totalUsd,
      totalNgn: CONFIG.capital.totalNgn,
      maxPerTradePct: CONFIG.capital.maxPerTradePct,
      maxPerMarketPct: CONFIG.capital.maxPerMarketPct,
      maxTotalExposurePct: CONFIG.capital.maxTotalExposurePct,
      minOrderUsd: CONFIG.capital.minOrderUsd,
      strategyAllocation: CONFIG.capital.strategyAllocation,
    },
    risk: {
      dailyMaxLossPct: CONFIG.risk.dailyMaxLossPct,
      monthlyMaxLossPct: CONFIG.risk.monthlyMaxLossPct,
      maxDrawdownFromPeak: CONFIG.risk.maxDrawdownFromPeak,
      maxConsecutiveLosses: CONFIG.risk.maxConsecutiveLosses,
      pauseOnBreachMinutes: CONFIG.risk.pauseOnBreachMinutes,
      totalMaxLossPct: CONFIG.risk.totalMaxLossPct,
    },
    smartMoney: {
      enabled: CONFIG.smartMoney.enabled,
      topN: CONFIG.smartMoney.topN,
      minWinRate: CONFIG.smartMoney.minWinRate,
      minPnl: CONFIG.smartMoney.minPnl,
      minTrades: CONFIG.smartMoney.minTrades,
      customWallets: CONFIG.smartMoney.customWallets,
    },
    arbitrage: {
      enabled: CONFIG.arbitrage.enabled,
      profitThreshold: CONFIG.arbitrage.profitThreshold,
      minTradeSize: CONFIG.arbitrage.minTradeSize,
      maxTradeSize: CONFIG.arbitrage.maxTradeSize,
      minVolume24h: CONFIG.arbitrage.minVolume24h,
      autoExecute: CONFIG.arbitrage.autoExecute,
    },
    dipArb: {
      enabled: CONFIG.dipArb.enabled,
      coins: CONFIG.dipArb.coins,
    },
    directTrading: {
      enabled: CONFIG.directTrading.enabled,
    },
    binance: {
      enabled: CONFIG.binance.enabled,
    },
    dryRun: CONFIG.dryRun,
  };
  dashboardEmitter.updateConfig(initialDashboardConfig);

  // Command listeners
  dashboardEmitter.on('command', async ({ command, payload }: { command: string; payload: any }) => {
    if (command === 'toggleStrategy') {
      const { strategy, enabled } = payload;
      if (strategy === 'arbitrage') {
        CONFIG.arbitrage.enabled = enabled;
        log('INFO', `Strategy Arbitrage ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (enabled && arbService && !arbService.isActive() && state.activeArbMarket) {
          const matchingResult = await arbService.quickScan(CONFIG.arbitrage.profitThreshold, 1);
          if (matchingResult.length > 0) {
            await arbService.start(matchingResult[0].market);
            state.arbitrage.status = 'monitoring';
          }
        } else if (!enabled && arbService && arbService.isActive()) {
          await arbService.stop();
          state.arbitrage.status = 'idle';
        }
        updateDashboard();
      }
    }

    if (command === 'toggleDryRun') {
      const { enabled } = payload;
      CONFIG.dryRun = enabled;
      log('WARN', `⚠️ BOT MODE CHANGED TO: ${CONFIG.dryRun ? '🧪 DRY RUN' : '🔴 LIVE'}`);
      if (arbService) {
        arbService.updateConfig({
          autoExecute: !CONFIG.dryRun && CONFIG.arbitrage.autoExecute,
        });
      }
      updateDashboard();
    }

    // ── Live config updates from the Settings Panel ──────────────────
    if (command === 'updateConfig') {
      const p = payload as Partial<typeof CONFIG & { capital: any; risk: any; arbitrage: any }>;
      let changed = false;

      if (p.capital?.totalNgn !== undefined) { CONFIG.capital.totalNgn = p.capital.totalNgn; changed = true; }
      if (p.capital?.totalUsd !== undefined) { CONFIG.capital.totalUsd = p.capital.totalUsd; changed = true; }
      if (p.arbitrage?.profitThreshold !== undefined) {
        CONFIG.arbitrage.profitThreshold = p.arbitrage.profitThreshold;
        arbService?.updateConfig({ profitThreshold: p.arbitrage.profitThreshold });
        changed = true;
      }
      if (p.arbitrage?.minTradeSize !== undefined) {
        CONFIG.arbitrage.minTradeSize = p.arbitrage.minTradeSize;
        arbService?.updateConfig({ minTradeSize: p.arbitrage.minTradeSize });
        changed = true;
      }
      if (p.arbitrage?.maxTradeSize !== undefined) {
        CONFIG.arbitrage.maxTradeSize = p.arbitrage.maxTradeSize;
        arbService?.updateConfig({ maxTradeSize: p.arbitrage.maxTradeSize });
        changed = true;
      }
      if (p.arbitrage?.minVolume24h !== undefined) { CONFIG.arbitrage.minVolume24h = p.arbitrage.minVolume24h; changed = true; }
      if (p.risk?.dailyMaxLossPct !== undefined) { CONFIG.risk.dailyMaxLossPct = p.risk.dailyMaxLossPct; changed = true; }
      if (p.risk?.monthlyMaxLossPct !== undefined) { CONFIG.risk.monthlyMaxLossPct = p.risk.monthlyMaxLossPct; changed = true; }
      if (p.risk?.maxDrawdownFromPeak !== undefined) { CONFIG.risk.maxDrawdownFromPeak = p.risk.maxDrawdownFromPeak; changed = true; }
      if (p.risk?.pauseOnBreachMinutes !== undefined) { CONFIG.risk.pauseOnBreachMinutes = p.risk.pauseOnBreachMinutes; changed = true; }
      if (p.currency !== undefined) { CONFIG.currency = p.currency; changed = true; }

      if (changed) {
        log('INFO', '⚙️ Configuration updated from dashboard', payload);
        // Push updated config to dashboard
        dashboardEmitter.updateConfig({
          currency: CONFIG.currency,
          capital: {
            totalUsd: CONFIG.capital.totalUsd,
            totalNgn: CONFIG.capital.totalNgn,
            maxPerTradePct: CONFIG.capital.maxPerTradePct,
            maxPerMarketPct: CONFIG.capital.maxPerMarketPct,
            maxTotalExposurePct: CONFIG.capital.maxTotalExposurePct,
            minOrderUsd: CONFIG.capital.minOrderUsd,
            strategyAllocation: CONFIG.capital.strategyAllocation,
          },
          risk: {
            dailyMaxLossPct: CONFIG.risk.dailyMaxLossPct,
            monthlyMaxLossPct: CONFIG.risk.monthlyMaxLossPct,
            maxDrawdownFromPeak: CONFIG.risk.maxDrawdownFromPeak,
            maxConsecutiveLosses: CONFIG.risk.maxConsecutiveLosses,
            pauseOnBreachMinutes: CONFIG.risk.pauseOnBreachMinutes,
            totalMaxLossPct: CONFIG.risk.totalMaxLossPct,
          },
          smartMoney: {
            enabled: CONFIG.smartMoney.enabled,
            topN: CONFIG.smartMoney.topN,
            minWinRate: CONFIG.smartMoney.minWinRate,
            minPnl: CONFIG.smartMoney.minPnl,
            minTrades: CONFIG.smartMoney.minTrades,
            customWallets: CONFIG.smartMoney.customWallets,
          },
          arbitrage: {
            enabled: CONFIG.arbitrage.enabled,
            profitThreshold: CONFIG.arbitrage.profitThreshold,
            minTradeSize: CONFIG.arbitrage.minTradeSize,
            maxTradeSize: CONFIG.arbitrage.maxTradeSize,
            minVolume24h: CONFIG.arbitrage.minVolume24h,
            autoExecute: CONFIG.arbitrage.autoExecute,
          },
          dipArb: { enabled: CONFIG.dipArb.enabled, coins: CONFIG.dipArb.coins },
          directTrading: { enabled: CONFIG.directTrading.enabled },
          binance: { enabled: CONFIG.binance.enabled },
          dryRun: CONFIG.dryRun,
        });
        updateDashboard();
      }
    }
  });

  if (CONFIG.dryRun) {
    log('INFO', '📝 Paper Trading Activated: Simulating trades on Bayse');
  }

  const sdk = await PolymarketSDK.create({
    publicKey: process.env.BAYSE_PUBLIC_KEY,
    secretKey: process.env.BAYSE_SECRET_KEY,
    baseUrl: process.env.BAYSE_BASE_URL || 'https://relay.bayse.markets',
  });

  log('INFO', `Bayse client initialized. Key: ${process.env.BAYSE_PUBLIC_KEY.slice(0, 8)}...`);

  // Setup Arbitrage
  await setupArbitrage(sdk);

  // Periodic state update
  setInterval(() => {
    updateDashboard();
  }, 5000);

  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    if (arbService) await arbService.stop();
    sdk.stop();
    process.exit(0);
  });

  log('INFO', '🚀 Bot + Dashboard running! Press Ctrl+C to stop.\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  console.error(err);
  process.exit(1);
});
