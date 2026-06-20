// Core infrastructure
export { RateLimiter, ApiType } from './core/rate-limiter.js';
export { Cache, CACHE_TTL } from './core/cache.js';
export { PolymarketError, ErrorCode, withRetry } from './core/errors.js';
export * from './core/types.js';

// Cache integration
export type { UnifiedCache } from './core/unified-cache.js';
export { createUnifiedCache } from './core/unified-cache.js';

// API Clients
export { BayseApiClient } from './clients/bayse-api.js';
export type {
  BayseConfig,
  BayseMarket,
  BayseEvent,
  BayseOrderbookLevel,
  BayseOrderbook,
  BayseAsset,
  BayseOrderParams,
  BayseOrderResult,
} from './clients/bayse-api.js';

// Services
export { MarketService, getIntervalMs as getIntervalMsService } from './services/market-service.js';
export type { ResolvedMarketTokens } from './services/market-service.js';

// Real-time (V2 - adapted for Bayse WebSocket)
export { RealtimeServiceV2 } from './services/realtime-service-v2.js';
export type {
  RealtimeServiceConfig,
  OrderbookSnapshot,
  LastTradeInfo,
  UserOrder,
  ActivityTrade,
  CryptoPrice,
  Subscription,
  MarketSubscription,
  MarketDataHandlers,
  ActivityHandlers,
  CryptoPriceHandlers,
} from './services/realtime-service-v2.js';

// ArbitrageService (Adapted for Bayse mint/burn)
export { ArbitrageService } from './services/arbitrage-service.js';
export type {
  ArbitrageMarketConfig,
  ArbitrageServiceConfig,
  ArbitrageOpportunity as ArbitrageServiceOpportunity,
  ArbitrageExecutionResult,
  ArbitrageServiceEvents,
  OrderbookState,
  BalanceState,
  RebalanceAction,
  RebalanceResult,
  SettleResult,
  ClearPositionResult,
  ClearAction,
  ScanCriteria,
  ScanResult,
} from './services/arbitrage-service.js';

// TradingService (Adapted for Bayse REST orders)
export { TradingService } from './services/trading-service.js';
export type {
  TradingServiceConfig,
  LimitOrderParams,
  MarketOrderParams,
  Order,
  OrderResult,
  TradeInfo,
} from './services/trading-service.js';

// Price Utilities
export {
  roundPrice,
  roundSize,
  validatePrice,
  validateSize,
  calculateBuyAmount,
  calculateSellPayout,
  calculateSharesForAmount,
  calculateSpread,
  calculateMidpoint,
  formatPrice,
  formatUSDC,
  calculatePnL,
  checkArbitrage,
  getEffectivePrices,
  ROUNDING_CONFIG,
} from './utils/price-utils.js';
export type { TickSize } from './utils/price-utils.js';

// ===== Main SDK Class =====
import { RateLimiter } from './core/rate-limiter.js';
import { TradingService } from './services/trading-service.js';
import { MarketService } from './services/market-service.js';
import { RealtimeServiceV2 } from './services/realtime-service-v2.js';
import type { UnifiedMarket, ProcessedOrderbook, ArbitrageOpportunity, PolySDKOptions } from './core/types.js';
import { createUnifiedCache, type UnifiedCache } from './core/unified-cache.js';
import { BayseApiClient } from './clients/bayse-api.js';

export interface PolymarketSDKConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  cache?: any;
}

export class PolymarketSDK {
  private rateLimiter: RateLimiter;
  private cache: UnifiedCache;

  public readonly bayseClient: BayseApiClient;
  public readonly tradingService: TradingService;
  public readonly markets: MarketService;
  public readonly realtime: RealtimeServiceV2;

  private _initialized = false;

  constructor(config: PolymarketSDKConfig = {}) {
    this.rateLimiter = new RateLimiter();
    this.cache = createUnifiedCache(config.cache);

    const publicKey = config.publicKey || process.env.BAYSE_PUBLIC_KEY || '';
    const secretKey = config.secretKey || process.env.BAYSE_SECRET_KEY || '';
    const baseUrl = config.baseUrl || 'https://relay.bayse.markets';

    this.bayseClient = new BayseApiClient(this.rateLimiter, this.cache, {
      publicKey,
      secretKey,
      baseUrl,
    });

    this.tradingService = new TradingService(this.rateLimiter, this.cache, {
      publicKey,
      secretKey,
      baseUrl,
    });

    this.markets = new MarketService(this.bayseClient, undefined, this.rateLimiter, this.cache);
    this.realtime = new RealtimeServiceV2();
  }

  static async create(config: PolymarketSDKConfig = {}): Promise<PolymarketSDK> {
    const sdk = new PolymarketSDK(config);
    await sdk.start();
    return sdk;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    await this.tradingService.initialize();
    this._initialized = true;
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  async start(options: { timeout?: number } = {}): Promise<void> {
    await this.initialize();
    this.connect();
    await this.waitForConnection(options.timeout ?? 10000);
  }

  connect(): void {
    this.realtime.connect();
  }

  async waitForConnection(timeoutMs: number = 10000): Promise<void> {
    if (this.realtime.isConnected?.()) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
      this.realtime.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  stop(): void {
    this.realtime.disconnect();
  }

  disconnect(): void {
    this.stop();
  }

  async getMarket(marketId: string): Promise<UnifiedMarket> {
    const m = await this.markets.getClobMarket(marketId);
    if (!m) {
      throw new Error(`Market not found: ${marketId}`);
    }
    return {
      conditionId: m.conditionId,
      slug: m.marketSlug,
      question: m.question,
      description: m.description,
      tokens: m.tokens,
      volume: 0,
      liquidity: 0,
      active: m.active,
      closed: m.closed,
      acceptingOrders: m.acceptingOrders,
      endDate: new Date(),
      source: 'merged',
    };
  }

  async getOrderbook(marketId: string): Promise<ProcessedOrderbook> {
    return this.markets.getProcessedOrderbook(marketId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateMarketCache(marketId: string): void {
    this.cache.invalidate(marketId);
  }
}
