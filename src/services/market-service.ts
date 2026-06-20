import { BayseApiClient, BayseMarket, BayseEvent } from '../clients/bayse-api.js';
import type { UnifiedCache } from '../core/unified-cache.js';
import { RateLimiter } from '../core/rate-limiter.js';
import { getEffectivePrices } from '../utils/price-utils.js';
import type {
  ProcessedOrderbook,
  Side,
  Orderbook,
  KLineCandle,
} from '../core/types.js';

export interface MarketToken {
  tokenId: string;
  outcome: string;
  price: number;
  winner?: boolean;
}

export interface Market {
  conditionId: string; // mapped to marketId
  eventId: string; // Bayse Event ID
  marketSlug: string;
  question: string;
  description?: string;
  tokens: MarketToken[];
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  endDateIso?: string | null;
}

export interface ResolvedMarketTokens {
  primaryTokenId: string;
  secondaryTokenId: string;
  outcomes: [string, string];
  primaryOutcome: string;
  secondaryOutcome: string;
}

export function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1s': 1000,
    '5s': 5000,
    '15s': 15000,
    '30s': 30000,
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '30m': 1800000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000,
  };
  return map[interval] || 60000;
}

export class MarketService {
  private initialized = false;

  constructor(
    private bayseClient: BayseApiClient | undefined,
    private unused_dataApi: any, // to match old signature if needed
    private rateLimiter: RateLimiter,
    private cache: UnifiedCache,
    private config?: any,
    private binanceService?: any
  ) {}

  async getClobMarket(marketId: string): Promise<Market | null> {
    if (!this.bayseClient) return null;

    try {
      // Fetch events (page 1, size 100 for scanning active events)
      const res = await this.bayseClient.getEvents({ page: 1, size: 100 });
      for (const event of res.events) {
        const mkt = event.markets.find((m) => m.id === marketId);
        if (mkt) {
          return {
            conditionId: mkt.id,
            eventId: event.id,
            marketSlug: event.slug,
            question: `${event.title} - ${mkt.title}`,
            description: event.description,
            tokens: [
              { tokenId: mkt.outcome1Id, outcome: mkt.outcome1Label, price: mkt.outcome1Price },
              { tokenId: mkt.outcome2Id, outcome: mkt.outcome2Label, price: mkt.outcome2Price },
            ],
            active: mkt.status === 'open',
            closed: mkt.status === 'resolved' || mkt.status === 'closed',
            acceptingOrders: mkt.status === 'open',
          };
        }
      }
    } catch (err) {
      console.error('[MarketService] Error fetching market details:', err);
    }
    return null;
  }

  async resolveMarketTokens(marketId: string): Promise<ResolvedMarketTokens | null> {
    const market = await this.getClobMarket(marketId);
    if (!market || market.tokens.length < 2) return null;
    return {
      primaryTokenId: market.tokens[0].tokenId,
      secondaryTokenId: market.tokens[1].tokenId,
      outcomes: [market.tokens[0].outcome, market.tokens[1].outcome],
      primaryOutcome: market.tokens[0].outcome,
      secondaryOutcome: market.tokens[1].outcome,
    };
  }

  async getProcessedOrderbook(marketId: string): Promise<ProcessedOrderbook> {
    if (!this.bayseClient) {
      throw new Error('Bayse client is not configured');
    }
    const market = await this.getClobMarket(marketId);
    if (!market || market.tokens.length < 2) {
      throw new Error(`Market not found: ${marketId}`);
    }

    const yesTokenId = market.tokens[0].tokenId;
    const noTokenId = market.tokens[1].tokenId;

    const books = await this.bayseClient.getOrderbooks([yesTokenId, noTokenId]);
    const yesBook = books.find((b) => b.outcomeId === yesTokenId) || { bids: [], asks: [] };
    const noBook = books.find((b) => b.outcomeId === noTokenId) || { bids: [], asks: [] };

    const yesBids = (yesBook.bids || []).map((b) => ({ price: b.price, size: b.quantity }));
    const yesAsks = (yesBook.asks || []).map((a) => ({ price: a.price, size: a.quantity }));
    const noBids = (noBook.bids || []).map((b) => ({ price: b.price, size: b.quantity }));
    const noAsks = (noBook.asks || []).map((a) => ({ price: a.price, size: a.quantity }));

    const yesBestBid = yesBids[0]?.price || 0;
    const yesBestAsk = yesAsks[0]?.price || 1;
    const noBestBid = noBids[0]?.price || 0;
    const noBestAsk = noAsks[0]?.price || 1;

    const effective = getEffectivePrices(yesBestAsk, yesBestBid, noBestAsk, noBestBid);
    const effectiveLongCost = effective.effectiveBuyYes + effective.effectiveBuyNo;
    const effectiveShortRevenue = effective.effectiveSellYes + effective.effectiveSellNo;
    const longArbProfit = 1 - effectiveLongCost;
    const shortArbProfit = effectiveShortRevenue - 1;

    return {
      yes: {
        bid: yesBestBid,
        ask: yesBestAsk,
        bidSize: yesBids[0]?.size || 0,
        askSize: yesAsks[0]?.size || 0,
        bidDepth: yesBids.reduce((sum, b) => sum + b.size, 0),
        askDepth: yesAsks.reduce((sum, a) => sum + a.size, 0),
        spread: yesBestAsk - yesBestBid,
        tokenId: yesTokenId,
      },
      no: {
        bid: noBestBid,
        ask: noBestAsk,
        bidSize: noBids[0]?.size || 0,
        askSize: noAsks[0]?.size || 0,
        bidDepth: noBids.reduce((sum, b) => sum + b.size, 0),
        askDepth: noAsks.reduce((sum, a) => sum + a.size, 0),
        spread: noBestAsk - noBestBid,
        tokenId: noTokenId,
      },
      summary: {
        askSum: yesBestAsk + noBestAsk,
        bidSum: yesBestBid + noBestBid,
        effectivePrices: effective,
        effectiveLongCost,
        effectiveShortRevenue,
        longArbProfit,
        shortArbProfit,
        totalBidDepth: yesBids.reduce((sum, b) => sum + b.size, 0) + noBids.reduce((sum, b) => sum + b.size, 0),
        totalAskDepth: yesAsks.reduce((sum, a) => sum + a.size, 0) + noAsks.reduce((sum, a) => sum + a.size, 0),
        imbalanceRatio: 0,
        yesSpread: yesBestAsk - yesBestBid,
      },
    };
  }
}
