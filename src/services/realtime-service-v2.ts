import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { PriceUpdate, BookUpdate, Orderbook, OrderbookLevel } from '../core/types.js';

export interface RealtimeServiceConfig {
  autoReconnect?: boolean;
  debug?: boolean;
}

export interface OrderbookSnapshot extends Orderbook {
  marketId: string;
  outcomeId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastTradedPrice?: number;
  lastTradedSide?: 'BUY' | 'SELL';
}

export interface LastTradeInfo {
  marketId: string;
  outcomeId: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  timestamp: number;
}

export interface UserOrder {
  orderId: string;
  marketId: string;
  outcomeId: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  status: string;
  timestamp: number;
}

export interface ActivityTrade {
  traderAddress: string;
  marketId: string;
  eventId: string;
  marketSlug?: string;
  outcome: string;
  price: number;
  side: 'BUY' | 'SELL';
  size: number;
  timestamp: number;
}

export interface CryptoPrice {
  symbol: string;
  price: number;
  timestamp: number;
}

export interface Subscription {
  id: string;
  unsubscribe: () => void;
}

export interface MarketSubscription extends Subscription {}

export interface MarketDataHandlers {
  onOrderbook?: (book: OrderbookSnapshot) => void;
  onLastTrade?: (trade: LastTradeInfo) => void;
  onError?: (error: Error) => void;
}

export interface ActivityHandlers {
  onTrade?: (trade: ActivityTrade) => void;
  onError?: (error: Error) => void;
}

export interface CryptoPriceHandlers {
  onPrice?: (price: CryptoPrice) => void;
  onError?: (error: Error) => void;
}

export class RealtimeServiceV2 extends EventEmitter {
  private wsMarkets: WebSocket | null = null;
  private wsRealtime: WebSocket | null = null;
  private config: RealtimeServiceConfig;
  private connected = false;
  private subscriptionIdCounter = 0;
  
  // Reconnection tracking
  private activeSubs: Set<{ type: string; payload: any }> = new Set();

  constructor(config: RealtimeServiceConfig = {}) {
    super();
    this.config = {
      autoReconnect: config.autoReconnect ?? true,
      debug: config.debug ?? false,
    };
  }

  private log(msg: string, ...args: any[]) {
    if (this.config.debug) {
      console.log(`[RealtimeServiceV2] ${msg}`, ...args);
    }
  }

  connect(): this {
    if (this.connected) return this;

    this.log('Connecting to Bayse WebSockets...');
    
    // Connect to Markets WebSocket
    this.wsMarkets = new WebSocket('wss://socket.bayse.markets/ws/v1/markets');
    this.setupMarketsWs(this.wsMarkets);

    // Connected flag set when markets websocket is open
    this.wsMarkets.on('open', () => {
      this.connected = true;
      this.emit('connected');
      this.log('Markets WebSocket connected.');
      this.resubscribe();
    });

    return this;
  }

  disconnect(): void {
    this.connected = false;
    if (this.wsMarkets) {
      this.wsMarkets.close();
      this.wsMarkets = null;
    }
    if (this.wsRealtime) {
      this.wsRealtime.close();
      this.wsRealtime = null;
    }
    this.activeSubs.clear();
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private setupMarketsWs(ws: WebSocket) {
    ws.on('message', (data) => {
      const text = data.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleMarketsMessage(msg);
        } catch (err) {
          this.emit('error', err);
        }
      }
    });

    ws.on('close', () => {
      this.log('Markets WebSocket closed.');
      if (this.config.autoReconnect && this.connected) {
        setTimeout(() => this.connect(), 5000);
      }
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private setupRealtimeWs(ws: WebSocket) {
    ws.on('message', (data) => {
      const text = data.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleRealtimeMessage(msg);
        } catch (err) {
          this.emit('error', err);
        }
      }
    });

    ws.on('close', () => {
      this.log('Realtime WebSocket closed.');
    });

    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private handleMarketsMessage(msg: any) {
    if (msg.type === 'orderbook_update') {
      const book = msg.data.orderbook;
      const snapshot: OrderbookSnapshot = {
        marketId: book.marketId,
        outcomeId: book.outcomeId,
        timestamp: book.timestamp,
        bids: book.bids.map((b: any) => ({ price: b.price, size: b.quantity })),
        asks: book.asks.map((a: any) => ({ price: a.price, size: a.quantity })),
        lastTradedPrice: book.lastTradedPrice,
        lastTradedSide: book.lastTradedSide,
      };
      this.emit(`orderbook:${book.marketId}`, snapshot);
      this.emit('orderbook', snapshot);
    } else if (msg.type === 'buy_order' || msg.type === 'sell_order') {
      const trade = msg.data;
      const activityTrade: ActivityTrade = {
        traderAddress: trade.user.id,
        marketId: trade.market.id,
        eventId: trade.event.id,
        marketSlug: trade.event.slug,
        outcome: trade.order.outcome,
        price: trade.order.price,
        side: trade.order.type as 'BUY' | 'SELL',
        size: trade.order.quantity,
        timestamp: new Date(trade.order.createdAt).getTime(),
      };
      this.emit('activityTrade', activityTrade);
    }
  }

  private handleRealtimeMessage(msg: any) {
    if (msg.type === 'asset_price') {
      const price: CryptoPrice = {
        symbol: msg.data.symbol,
        price: msg.data.price,
        timestamp: msg.data.timestamp,
      };
      this.emit(`cryptoPrice:${price.symbol}`, price);
      this.emit('cryptoPrice', price);
    }
  }

  private sendWs(ws: WebSocket | null, payload: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  private resubscribe() {
    for (const sub of this.activeSubs) {
      if (sub.type === 'markets') {
        this.sendWs(this.wsMarkets, sub.payload);
      } else if (sub.type === 'realtime') {
        this.ensureRealtimeConnected();
        if (this.wsRealtime && this.wsRealtime.readyState === WebSocket.OPEN) {
          this.sendWs(this.wsRealtime, sub.payload);
        } else {
          this.wsRealtime?.on('open', () => this.sendWs(this.wsRealtime, sub.payload));
        }
      }
    }
  }

  private ensureRealtimeConnected() {
    if (!this.wsRealtime) {
      this.wsRealtime = new WebSocket('wss://socket.bayse.markets/ws/v1/realtime');
      this.setupRealtimeWs(this.wsRealtime);
    }
  }

  subscribeMarkets(marketIds: string[], handlers: MarketDataHandlers = {}): MarketSubscription {
    const subId = `markets_${++this.subscriptionIdCounter}`;
    const payload = {
      type: 'subscribe',
      channel: 'orderbook',
      marketIds,
      currency: 'USD',
    };

    const subItem = { type: 'markets', payload };
    this.activeSubs.add(subItem);

    if (this.connected) {
      this.sendWs(this.wsMarkets, payload);
    }

    const orderbookListener = (snapshot: OrderbookSnapshot) => {
      if (marketIds.includes(snapshot.marketId)) {
        handlers.onOrderbook?.(snapshot);
      }
    };

    this.on('orderbook', orderbookListener);

    return {
      id: subId,
      unsubscribe: () => {
        this.off('orderbook', orderbookListener);
        this.activeSubs.delete(subItem);
        // Bayse unsubscribe formats: type=unsubscribe, room=orderbook:MARKET_ID
        for (const mId of marketIds) {
          this.sendWs(this.wsMarkets, {
            type: 'unsubscribe',
            room: `orderbook:${mId}`,
          });
        }
      },
    };
  }

  subscribeCryptoChainlinkPrices(symbols: string[], handlers: CryptoPriceHandlers = {}): Subscription {
    const subId = `crypto_${++this.subscriptionIdCounter}`;
    const payload = {
      type: 'subscribe',
      channel: 'asset_prices',
      symbols,
    };

    const subItem = { type: 'realtime', payload };
    this.activeSubs.add(subItem);

    this.ensureRealtimeConnected();
    if (this.wsRealtime && this.wsRealtime.readyState === WebSocket.OPEN) {
      this.sendWs(this.wsRealtime, payload);
    } else {
      this.wsRealtime?.on('open', () => this.sendWs(this.wsRealtime, payload));
    }

    const priceListener = (price: CryptoPrice) => {
      if (symbols.includes(price.symbol)) {
        handlers.onPrice?.(price);
      }
    };

    this.on('cryptoPrice', priceListener);

    return {
      id: subId,
      unsubscribe: () => {
        this.off('cryptoPrice', priceListener);
        this.activeSubs.delete(subItem);
        for (const sym of symbols) {
          this.sendWs(this.wsRealtime, {
            type: 'unsubscribe',
            room: `asset_prices:${sym}`,
          });
        }
      },
    };
  }

  subscribeAllActivity(handlers: ActivityHandlers = {}): Subscription {
    const subId = `activity_${++this.subscriptionIdCounter}`;
    // Get all events activity
    // Note: Bayse markets requires eventId for activity channel.
    // So for subscribeAllActivity, we won't subscribe to all, but rather we can listen to general trades
    // if there's a global feed, but list-events activity is room: activity:EVENT_ID.
    // If user subscribes, we can register it.
    // Let's implement activity feed handler.
    const activityListener = (trade: ActivityTrade) => {
      handlers.onTrade?.(trade);
    };

    this.on('activityTrade', activityListener);

    return {
      id: subId,
      unsubscribe: () => {
        this.off('activityTrade', activityListener);
      },
    };
  }

  subscribeEventActivity(eventId: string, handlers: ActivityHandlers = {}): Subscription {
    const subId = `activity_event_${++this.subscriptionIdCounter}`;
    const payload = {
      type: 'subscribe',
      channel: 'activity',
      eventId,
    };

    const subItem = { type: 'markets', payload };
    this.activeSubs.add(subItem);

    if (this.connected) {
      this.sendWs(this.wsMarkets, payload);
    }

    const activityListener = (trade: ActivityTrade) => {
      if (trade.eventId === eventId) {
        handlers.onTrade?.(trade);
      }
    };

    this.on('activityTrade', activityListener);

    return {
      id: subId,
      unsubscribe: () => {
        this.off('activityTrade', activityListener);
        this.activeSubs.delete(subItem);
        this.sendWs(this.wsMarkets, {
          type: 'unsubscribe',
          room: `activity:${eventId}`,
        });
      },
    };
  }
}
