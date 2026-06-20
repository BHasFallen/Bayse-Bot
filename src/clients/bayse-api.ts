import { RateLimiter, ApiType } from '../core/rate-limiter.js';
import type { UnifiedCache } from '../core/unified-cache.js';
import { PolymarketError, ErrorCode } from '../core/errors.js';
import crypto from 'crypto';

export interface BayseConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
}

export interface BayseMarket {
  id: string;
  title: string;
  status: string;
  outcome1Id: string;
  outcome1Label: string;
  outcome1Price: number;
  outcome2Id: string;
  outcome2Label: string;
  outcome2Price: number;
  yesBuyPrice: number;
  noBuyPrice: number;
  feePercentage: number;
  totalOrders: number;
  rules?: string;
}

export interface BayseEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  type: 'single' | 'combined';
  engine: 'AMM' | 'CLOB';
  status: string;
  resolutionDate?: string;
  closingDate?: string;
  imageUrl?: string;
  liquidity: number;
  totalVolume: number;
  totalOrders: number;
  supportedCurrencies: string[];
  markets: BayseMarket[];
}

export interface BayseOrderbookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface BayseOrderbook {
  marketId: string;
  outcomeId: string;
  timestamp: string;
  bids: BayseOrderbookLevel[];
  asks: BayseOrderbookLevel[];
  lastTradedPrice?: number;
  lastTradedSide?: 'BUY' | 'SELL';
}

export interface BayseAsset {
  id: string;
  symbol: string;
  userId: string;
  network: string;
  availableBalance: number;
  pendingBalance: number;
  isDefault: boolean;
}

export interface BayseOrderParams {
  side: 'BUY' | 'SELL';
  outcomeId: string;
  amount: number;
  type: 'LIMIT' | 'MARKET';
  price?: number;
  currency?: 'USD' | 'NGN';
  timeInForce?: 'GTC' | 'GTD' | 'FAK' | 'FOK';
  postOnly?: boolean;
  stpMode?: 'SKIP' | 'CANCEL_OLDEST' | 'CANCEL_NEWEST' | 'CANCEL_BOTH';
}

export interface BayseOrderResult {
  engine: 'AMM' | 'CLOB';
  order: {
    id: string;
    marketId?: string;
    outcome: string;
    side: 'BUY' | 'SELL';
    status: string;
    amount: number;
    price: number;
    quantity: number;
    createdAt: string;
    updatedAt: string;
  };
}

export class BayseApiClient {
  private publicKey: string;
  private secretKey: string;
  private baseUrl: string;

  constructor(
    private rateLimiter: RateLimiter,
    private cache: UnifiedCache,
    config: BayseConfig = {}
  ) {
    this.publicKey = config.publicKey || process.env.BAYSE_PUBLIC_KEY || '';
    this.secretKey = config.secretKey || process.env.BAYSE_SECRET_KEY || '';
    this.baseUrl = config.baseUrl || 'https://relay.bayse.markets';
  }

  /**
   * Helper to create HMAC signature for write endpoints
   */
  private createSignature(timestamp: number, method: string, path: string, bodyStr: string | null): string {
    if (!this.secretKey) {
      throw new PolymarketError(ErrorCode.AUTH_FAILED, 'Bayse Secret Key is missing');
    }
    const bodyHash = bodyStr ? crypto.createHash('sha256').update(bodyStr).digest('hex') : '';
    const payload = `${timestamp}.${method}.${path}.${bodyHash}`;
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('base64');
  }

  /**
   * General HTTP fetch helper with rate limiting and retry handling
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown = null,
    authLevel: 'public' | 'read' | 'write' = 'public'
  ): Promise<T> {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let bodyStr: string | null = null;
    if (body !== null) {
      bodyStr = JSON.stringify(body);
    }

    if (authLevel === 'read' || authLevel === 'write') {
      if (!this.publicKey) {
        throw new PolymarketError(ErrorCode.AUTH_FAILED, 'Bayse Public Key is missing');
      }
      headers['X-Public-Key'] = this.publicKey;
    }

    if (authLevel === 'write') {
      const signature = this.createSignature(timestamp, method, path, bodyStr);
      headers['X-Timestamp'] = timestamp.toString();
      headers['X-Signature'] = signature;
    }

    return this.rateLimiter.execute(ApiType.CLOB_API, async () => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: bodyStr || undefined,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw PolymarketError.fromHttpError(response.status, errorBody);
      }

      return response.json() as Promise<T>;
    });
  }

  // ===== PUBLIC ENDPOINTS =====

  async getHealth(): Promise<{ status: string }> {
    return this.request('GET', '/health', null, 'public');
  }

  // ===== READ ENDPOINTS (READ AUTH OR PUBLIC) =====

  async getEvents(params: {
    category?: string;
    status?: string;
    keyword?: string;
    currency?: 'USD' | 'NGN';
    trending?: boolean;
    page?: number;
    size?: number;
  } = {}): Promise<{ events: BayseEvent[]; pagination: any }> {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.keyword) query.set('keyword', params.keyword);
    if (params.currency) query.set('currency', params.currency);
    if (params.trending !== undefined) query.set('trending', String(params.trending));
    if (params.page) query.set('page', String(params.page));
    if (params.size) query.set('size', String(params.size));

    // Provide public key for read authentication if available, otherwise call public
    const auth = this.publicKey ? 'read' : 'public';
    return this.request('GET', `/v1/pm/events?${query}`, null, auth);
  }

  async getEvent(eventId: string): Promise<BayseEvent> {
    const auth = this.publicKey ? 'read' : 'public';
    return this.request('GET', `/v1/pm/events/${eventId}`, null, auth);
  }

  async getEventBySlug(slug: string): Promise<BayseEvent | null> {
    const res = await this.getEvents({ page: 1, size: 20 });
    const match = res.events.find((e) => e.slug === slug);
    if (match) {
      return this.getEvent(match.id);
    }
    return null;
  }

  async getOrderbooks(outcomeIds: string[], depth = 10, currency: 'USD' | 'NGN' = 'USD'): Promise<BayseOrderbook[]> {
    const query = new URLSearchParams();
    for (const outcomeId of outcomeIds) {
      query.append('outcomeId[]', outcomeId);
    }
    query.set('depth', String(depth));
    query.set('currency', currency);

    return this.request('GET', `/v1/pm/books?${query}`, null, 'public');
  }

  async getPortfolio(): Promise<{ positions: any[] }> {
    return this.request('GET', '/v1/pm/portfolio', null, 'read');
  }

  async getActivities(): Promise<{ activities: any[] }> {
    return this.request('GET', '/v1/pm/activities', null, 'read');
  }

  async getAssets(): Promise<{ assets: BayseAsset[] }> {
    return this.request('GET', '/v1/wallet/assets', null, 'read');
  }

  // ===== WRITE ENDPOINTS (WRITE AUTH) =====

  async placeOrder(eventId: string, marketId: string, order: BayseOrderParams): Promise<BayseOrderResult> {
    return this.request('POST', `/v1/pm/events/${eventId}/markets/${marketId}/orders`, order, 'write');
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/v1/pm/orders/${orderId}`, null, 'write');
  }

  async mintShares(marketId: string, quantity: number, currency: 'USD' | 'NGN' = 'USD'): Promise<any> {
    return this.request('POST', `/v1/pm/markets/${marketId}/mint`, { quantity, currency }, 'write');
  }

  async burnShares(marketId: string, quantity: number, currency: 'USD' | 'NGN' = 'USD'): Promise<any> {
    return this.request('POST', `/v1/pm/markets/${marketId}/burn`, { quantity, currency }, 'write');
  }
}
