import { RateLimiter } from '../core/rate-limiter.js';
import type { UnifiedCache } from '../core/unified-cache.js';
import { PolymarketError, ErrorCode } from '../core/errors.js';
import type { Side, OrderType } from '../core/types.js';
import { BayseApiClient, type BayseOrderParams, type BayseOrderResult } from '../clients/bayse-api.js';

export interface TradingServiceConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

export interface LimitOrderParams {
  eventId: string;
  marketId: string;
  outcomeId: string;
  side: Side;
  price: number;
  size: number;
  orderType?: 'GTC' | 'GTD';
  expiration?: number;
  currency?: 'USD' | 'NGN';
}

export interface MarketOrderParams {
  eventId: string;
  marketId: string;
  outcomeId: string;
  side: Side;
  amount: number;
  price?: number;
  orderType?: 'FOK' | 'FAK';
  currency?: 'USD' | 'NGN';
}

export interface Order {
  id: string;
  status: string;
  outcomeId: string;
  side: Side;
  price: number;
  originalSize: number;
  filledSize: number;
  remainingSize: number;
  createdAt: string;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  orderIds?: string[];
  errorMsg?: string;
}

export interface TradeInfo {
  id: string;
  outcomeId: string;
  side: Side;
  price: number;
  size: number;
  fee: number;
  timestamp: number;
}

export class TradingService {
  private bayseClient: BayseApiClient;
  private initialized = false;

  constructor(
    private rateLimiter: RateLimiter,
    private cache: UnifiedCache,
    private config: TradingServiceConfig
  ) {
    this.bayseClient = new BayseApiClient(rateLimiter, cache, {
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.bayseClient.getHealth();
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async createLimitOrder(params: LimitOrderParams): Promise<OrderResult> {
    await this.ensureInitialized();
    try {
      const orderParams: BayseOrderParams = {
        side: params.side,
        outcomeId: params.outcomeId,
        amount: params.price * params.size,
        type: 'LIMIT',
        price: params.price,
        currency: params.currency || 'USD',
        timeInForce: params.orderType || 'GTC',
        stpMode: 'CANCEL_OLDEST',
      };

      const result = await this.bayseClient.placeOrder(params.eventId, params.marketId, orderParams);
      const status = result.order.status;
      const success = status === 'open' || status === 'filled' || status === 'partial_filled' || status === 'pending';

      return {
        success,
        orderId: result.order.id,
      };
    } catch (error) {
      return {
        success: false,
        errorMsg: `Limit order failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async createMarketOrder(params: MarketOrderParams): Promise<OrderResult> {
    await this.ensureInitialized();
    try {
      const orderParams: BayseOrderParams = {
        side: params.side,
        outcomeId: params.outcomeId,
        amount: params.amount,
        type: 'MARKET',
        price: params.price,
        currency: params.currency || 'USD',
        timeInForce: params.orderType || 'FAK',
      };

      const result = await this.bayseClient.placeOrder(params.eventId, params.marketId, orderParams);
      const status = result.order.status;
      const success = status === 'filled' || status === 'partial_filled';

      return {
        success,
        orderId: result.order.id,
      };
    } catch (error) {
      return {
        success: false,
        errorMsg: `Market order failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async cancelOrder(orderId: string): Promise<OrderResult> {
    await this.ensureInitialized();
    try {
      const result = await this.bayseClient.cancelOrder(orderId);
      return { success: result.success, orderId };
    } catch (error) {
      return {
        success: false,
        errorMsg: `Cancel failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async getOpenOrders(): Promise<Order[]> {
    await this.ensureInitialized();
    try {
      const res = await this.bayseClient.getPortfolio();
      // Assume portfolio contains active positions/orders
      // Format to Order interface
      return (res as any).orders?.map((o: any) => ({
        id: o.id,
        status: o.status,
        outcomeId: o.outcomeId,
        side: o.side as Side,
        price: o.price,
        originalSize: o.size,
        filledSize: o.filledSize || 0,
        remainingSize: o.size - (o.filledSize || 0),
        createdAt: o.createdAt,
      })) || [];
    } catch {
      return [];
    }
  }

  async getBalances(): Promise<Array<{ symbol: string; balance: string }>> {
    await this.ensureInitialized();
    try {
      const res = await this.bayseClient.getAssets();
      return res.assets.map((a) => ({
        symbol: a.symbol,
        balance: a.availableBalance.toString(),
      }));
    } catch {
      return [];
    }
  }

  async getBalanceAllowance(
    assetType: 'COLLATERAL' | 'CONDITIONAL',
    tokenId?: string
  ): Promise<{ balance: string; allowance: string }> {
    const balances = await this.getBalances();
    const usd = balances.find((b) => b.symbol === 'USD');
    return {
      balance: usd ? usd.balance : '0',
      allowance: '1000000000',
    };
  }

  async updateBalanceAllowance(): Promise<void> {
    // No-op for Bayse (not on-chain allowance based)
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getBayseClient(): BayseApiClient {
    return this.bayseClient;
  }
}
