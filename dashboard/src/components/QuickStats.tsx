import type { BotState, BotConfig } from '../types';

interface QuickStatsProps {
  state: BotState | null;
  config: BotConfig | null;
}

export function QuickStats({ state, config }: QuickStatsProps) {
  const realizedPnL = state?.totalPnL ?? 0;
  const unrealizedPnL = state?.unrealizedPnL ?? 0;
  // Total for display includes unrealized gains/losses
  const totalPnL = realizedPnL + unrealizedPnL;

  const dailyPnL = state?.dailyPnL ?? 0;
  const trades = state?.tradesExecuted ?? 0;
  const activeStrategies = [
    config?.smartMoney?.enabled,
    config?.arbitrage?.enabled,
    config?.dipArb?.enabled,
    config?.directTrading?.enabled,
  ].filter(Boolean).length;

  const winRate = trades > 0 ? Math.min(100, Math.max(0, 50 + (realizedPnL / (trades * 2)))) : 0;

  const formatPnL = (value: number) => {
    const formatted = Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        {/* Total P&L */}
        <div className="flex items-center gap-3">
          <div className={`icon-circle-sm flex-shrink-0 ${totalPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {totalPnL >= 0 ? '📈' : '📉'}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total P&L</div>
            <div className={`text-base font-bold font-mono truncate ${totalPnL >= 0 ? 'text-green-400 glow-text-green' : 'text-red-400 glow-text-red'}`}>
              {formatPnL(totalPnL)}
            </div>
            {unrealizedPnL !== 0 && (
              <span className="text-[9px] text-gray-500 block font-normal truncate">
                ({unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)} Open)
              </span>
            )}
          </div>
        </div>

        {/* Daily P&L */}
        <div className="flex items-center gap-3">
          <div className={`icon-circle-sm flex-shrink-0 ${dailyPnL >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
            {dailyPnL >= 0 ? '☀️' : '🌙'}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Today</div>
            <div className={`text-base font-bold font-mono truncate ${dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPnL(dailyPnL)}
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="flex items-center gap-3">
          <div className="icon-circle-sm flex-shrink-0 bg-purple-500/20">🎯</div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</div>
            <div className="text-base font-bold font-mono text-purple-400 truncate">
              {winRate.toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Total Trades */}
        <div className="flex items-center gap-3">
          <div className="icon-circle-sm flex-shrink-0 bg-blue-500/20">💹</div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Trades</div>
            <div className="text-base font-bold font-mono text-blue-400 truncate">{trades}</div>
          </div>
        </div>

        {/* Active Strategies */}
        <div className="flex items-center gap-3">
          <div className="icon-circle-sm flex-shrink-0 bg-yellow-500/20">⚡</div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Active</div>
            <div className="text-base font-bold font-mono text-yellow-400 truncate">
              {activeStrategies}/4
            </div>
          </div>
        </div>

        {/* Opportunities */}
        <div className="flex items-center gap-3">
          <div className="icon-circle-sm flex-shrink-0 bg-cyan-500/20">🔍</div>
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Found</div>
            <div className="text-base font-bold font-mono text-cyan-400 truncate">
              {state?.arbitrage?.opportunitiesFound ?? 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
