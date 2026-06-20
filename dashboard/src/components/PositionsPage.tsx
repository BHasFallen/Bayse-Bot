import { useState } from 'react';
import type { BotState } from '../types';

interface PositionsPageProps {
    onBack: () => void;
    state: BotState | null;
    onClosePosition: (tokenId: string, size: number) => void;
    onRedeemPosition: (conditionId: string) => void;
    hideHeader?: boolean;
}

export function PositionsPage({ onBack, state, onClosePosition, onRedeemPosition, hideHeader = false }: PositionsPageProps) {
    const [closingId, setClosingId] = useState<string | null>(null);
    const [redeemingId, setRedeemingId] = useState<string | null>(null);

    const positions = state?.positions || [];

    const formatPnL = (value: number) => {
        const formatted = Math.abs(value).toFixed(2);
        return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
    };

    const handleClose = async (pos: any) => {
        setClosingId(pos.asset);
        onClosePosition(pos.asset, pos.size);
        setTimeout(() => setClosingId(null), 3000);
    };

    const handleRedeem = async (pos: any) => {
        setRedeemingId(pos.conditionId);
        onRedeemPosition(pos.conditionId);
        setTimeout(() => setRedeemingId(null), 5000);
    };

    return (
        <div className={`${hideHeader ? '' : 'min-h-screen bg-poly-dark'} text-white`}>
            {/* Header */}
            {!hideHeader && (
                <header className="glass-card border-b border-white/5 px-6 py-4">
                <div className="flex items-center justify-between max-w-[1600px] mx-auto">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="btn btn-secondary">
                            ← Back to Dashboard
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl">
                                📦
                            </div>
                            <div>
                                <h1 className="text-xl font-bold">Open Positions</h1>
                                <div className="text-xs text-gray-500">Monitor and close your positions</div>
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">Positions</div>
                            <div className="text-xl font-bold font-mono">{positions.length}</div>
                        </div>
                    </div>
                </div>
            </header>
            )}

            <main className={`${hideHeader ? 'py-2 px-0' : 'p-6'} max-w-[1600px] mx-auto`}>
                {positions.length === 0 ? (
                    <div className="panel p-12 text-center">
                        <div className="text-6xl mb-4">📭</div>
                        <h2 className="text-xl font-semibold mb-2">No Open Positions</h2>
                        <p className="text-gray-400">
                            You don't have any open positions yet. Start trading to see them here.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in">
                        {/* Positions Table */}
                        <div className="panel">
                            <div className="panel-header">
                                <h3 className="section-header mb-0">
                                    <div className="section-header-icon bg-gradient-to-br from-green-500/20 to-emerald-500/20">💹</div>
                                    Your Positions
                                </h3>
                            </div>
                            <div className="panel-body">
                                {/* Desktop View: Table */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wider">
                                                <th className="pb-3 pr-4">Market</th>
                                                <th className="pb-3 pr-4">Outcome</th>
                                                <th className="pb-3 pr-4 text-right">Size</th>
                                                <th className="pb-3 pr-4 text-right">Avg Price</th>
                                                <th className="pb-3 pr-4 text-right">Current</th>
                                                <th className="pb-3 pr-4 text-right">P&L</th>
                                                <th className="pb-3 text-center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {positions.map((pos: any) => {
                                                const pnl = pos.cashPnl ?? 0;
                                                const pnlPct = (pos.percentPnl ?? 0) * 100;
                                                const isClosing = closingId === pos.asset;

                                                return (
                                                    <tr key={pos.asset} className="hover:bg-white/5 transition-colors">
                                                        <td className="py-4 pr-4">
                                                            <div className="max-w-[300px] truncate text-gray-200" title={pos.title}>
                                                                {pos.title || 'Unknown Market'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate">{pos.slug}</div>
                                                        </td>
                                                        <td className="py-4 pr-4">
                                                            <span className={`badge ${pos.outcome === 'Yes' || pos.outcome === 'Up' ? 'badge-green' : 'badge-red'}`}>
                                                                {pos.outcome}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono">
                                                            {pos.size?.toFixed(2) ?? '0.00'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono text-gray-400">
                                                            ${pos.avgPrice?.toFixed(3) ?? '0.000'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right font-mono text-gray-400">
                                                            ${pos.curPrice?.toFixed(3) ?? '0.000'}
                                                        </td>
                                                        <td className="py-4 pr-4 text-right">
                                                            <div className={`font-mono font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {formatPnL(pnl)}
                                                            </div>
                                                            <div className={`text-xs ${pnlPct >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                                                {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                            </div>
                                                        </td>
                                                        <td className="py-4 text-center">
                                                            {pos.marketClosed ? (
                                                                pos.isWinner ? (
                                                                    <button
                                                                        onClick={() => handleRedeem(pos)}
                                                                        disabled={redeemingId === pos.conditionId}
                                                                        className={`btn ${redeemingId === pos.conditionId ? 'btn-secondary opacity-50' : 'btn-primary bg-green-500 hover:bg-green-600'} text-sm px-4 py-2 mx-auto`}
                                                                    >
                                                                        {redeemingId === pos.conditionId ? 'Redeeming...' : '💰 Redeem'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-gray-500 text-sm font-medium">Outcome Lost</span>
                                                                )
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleClose(pos)}
                                                                    disabled={isClosing}
                                                                    className={`btn ${isClosing ? 'btn-secondary opacity-50' : 'btn-primary bg-red-500 hover:bg-red-600'} text-sm px-4 py-2 mx-auto`}
                                                                >
                                                                    {isClosing ? 'Closing...' : 'Close'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile View: Cards */}
                                <div className="block md:hidden space-y-4">
                                    {positions.map((pos: any) => {
                                        const pnl = pos.cashPnl ?? 0;
                                        const pnlPct = (pos.percentPnl ?? 0) * 100;
                                        const isClosing = closingId === pos.asset;

                                        return (
                                            <div key={pos.asset} className="bg-poly-dark/40 rounded-xl p-4 border border-white/5 space-y-3">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <h4 className="font-semibold text-gray-200 truncate text-sm" title={pos.title}>
                                                            {pos.title || 'Unknown Market'}
                                                        </h4>
                                                        <span className="text-xs text-gray-500 font-mono block truncate mt-0.5">{pos.slug}</span>
                                                    </div>
                                                    <span className={`badge flex-shrink-0 text-xs ${pos.outcome === 'Yes' || pos.outcome === 'Up' ? 'badge-green' : 'badge-red'}`}>
                                                        {pos.outcome}
                                                    </span>
                                                </div>
                                                
                                                <div className="grid grid-cols-3 gap-2 bg-poly-dark/50 rounded-lg p-2 text-center text-xs font-mono">
                                                    <div>
                                                        <div className="text-[9px] text-gray-500 uppercase">Size</div>
                                                        <div className="text-gray-300 font-semibold mt-0.5">{pos.size?.toFixed(2) ?? '0.00'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] text-gray-500 uppercase">Avg Px</div>
                                                        <div className="text-gray-300 mt-0.5">${pos.avgPrice?.toFixed(3) ?? '0.000'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] text-gray-500 uppercase">Cur Px</div>
                                                        <div className="text-gray-300 mt-0.5">${pos.curPrice?.toFixed(3) ?? '0.000'}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-1">
                                                    <div>
                                                        <div className="text-[9px] text-gray-500 uppercase">P&L</div>
                                                        <div className="flex items-baseline gap-1.5 mt-0.5">
                                                            <span className={`font-bold font-mono text-sm ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {formatPnL(pnl)}
                                                            </span>
                                                            <span className={`text-[10px] font-mono ${pnlPct >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                                                ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        {pos.marketClosed ? (
                                                            pos.isWinner ? (
                                                                <button
                                                                    onClick={() => handleRedeem(pos)}
                                                                    disabled={redeemingId === pos.conditionId}
                                                                    className={`btn ${redeemingId === pos.conditionId ? 'btn-secondary opacity-50' : 'btn-primary bg-green-500 hover:bg-green-600'} text-xs px-3 py-1.5`}
                                                                >
                                                                    {redeemingId === pos.conditionId ? 'Redeeming...' : '💰 Redeem'}
                                                                </button>
                                                            ) : (
                                                                <span className="text-gray-500 text-xs font-medium">Outcome Lost</span>
                                                            )
                                                        ) : (
                                                            <button
                                                                onClick={() => handleClose(pos)}
                                                                disabled={isClosing}
                                                                className={`btn ${isClosing ? 'btn-secondary opacity-50' : 'btn-primary bg-red-500 hover:bg-red-600'} text-xs px-3 py-1.5`}
                                                            >
                                                                {isClosing ? 'Closing...' : 'Close'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="panel bg-blue-500/10 border-blue-500/30">
                            <div className="panel-body flex items-start gap-3">
                                <div className="text-2xl">ℹ️</div>
                                <div>
                                    <h4 className="font-semibold text-blue-400 mb-1">How Closing Works</h4>
                                    <p className="text-sm text-gray-400">
                                        Clicking "Close" will sell your entire position at market price. The order will be executed
                                        immediately via Polymarket's order book. Make sure you are in <strong>Live Mode</strong>
                                        (not Dry Run) for the sell to execute.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
