import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import {
  Header,
  BalanceCards,
  PnLPanel,
  TrendIndicators,
  StrategyGrid,
  ActivityLog,
  ConfigPanel,
  ConnectionStatus,
  DipArbPanel,
  ArbitragePanel,
  SmartMoneyPanel,
  QuickStats,
  SessionSummary,
  HistoryPage,
  PositionsPage,
  StrategyControls,
  SettingsPanel,
} from './components';

type Page = 'dashboard' | 'history' | 'positions';
type Tab = 'summary' | 'positions' | 'strategies' | 'logs' | 'settings';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [activeStrategyTab, setActiveStrategyTab] = useState<'overview' | 'smartMoney' | 'dipArb' | 'arbitrage'>('overview');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  const { state, config, logs, connected, error, sendCommand } = useWebSocket();
  const isDryRun = config?.dryRun ?? true;

  // Monitor window resize to change layout dynamically
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      // Auto sync mobile positions tab with full screen positions page state
      if (!mobile && currentPage === 'dashboard' && activeTab === 'positions') {
        setCurrentPage('positions');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentPage, activeTab]);

  const handleClosePosition = (tokenId: string, size: number) => {
    sendCommand('closePosition', { tokenId, size });
  };

  const handleToggleStrategy = (strategy: string, enabled: boolean) => {
    sendCommand('toggleStrategy', { strategy, enabled });
  };

  const handleRedeemPosition = (conditionId: string) => {
    sendCommand('redeemPosition', { conditionId });
  };

  const handleToggleDryRun = () => {
    if (!isDryRun) {
      const confirm = window.confirm(
        '⚠️ WARNING: You are switching to LIVE trading mode.\n\nReal funds will be used. Ensure you have loaded your Private Key and understand the risks.\n\nContinue?'
      );
      if (!confirm) return;
    }
    sendCommand('toggleDryRun', { enabled: !isDryRun });
  };

  const handleUpdateConfig = (changes: any) => {
    sendCommand('updateConfig', changes);
  };

  // SVG Icons for Bottom Navigation
  const getIcon = (tab: Tab, active: boolean) => {
    const activeColor = 'text-white';
    const inactiveColor = 'text-gray-400 group-hover:text-gray-300';
    const classes = `w-5 h-5 transition-transform ${active ? activeColor : inactiveColor}`;

    switch (tab) {
      case 'summary':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={classes}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        );
      case 'positions':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={classes}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        );
      case 'strategies':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={classes}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        );
      case 'logs':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={classes}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'settings':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={classes}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
    }
  };

  // Render content block for Mobile View
  const renderMobileContent = () => {
    switch (activeTab) {
      case 'summary':
        return (
          <div className="space-y-4 animate-tab-content">
            <QuickStats state={state} config={config} />
            <BalanceCards state={state} config={config} />
            <PnLPanel state={state} config={config} />
            <SessionSummary state={state} />

            {/* Mobile Actions Banner */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCurrentPage('history')}
                className="btn btn-secondary py-3 flex flex-col items-center justify-center gap-1.5 glass-card"
              >
                <span className="text-xl">📚</span>
                <span className="text-xs font-semibold text-gray-200">Trading History</span>
              </button>
              <button
                onClick={handleToggleDryRun}
                className={`btn py-3 flex flex-col items-center justify-center gap-1.5 glass-card border ${
                  isDryRun
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
              >
                <span className="text-xl">{isDryRun ? '💰' : '🧪'}</span>
                <span className="text-xs font-semibold">
                  Switch to {isDryRun ? 'LIVE' : 'DRY RUN'}
                </span>
              </button>
            </div>

            {/* Wallet Address Bar */}
            <div className="panel bg-poly-dark/30 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center text-lg">
                  👛
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">Trading Wallet</div>
                  <code className="text-xs text-gray-300 font-mono">0xaF98...0de</code>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('0xaF98e0638671abD5140Ad981Ff4c01869F3410de');
                  alert('Address copied to clipboard!');
                }}
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 text-xs transition-colors"
              >
                📋
              </button>
            </div>
          </div>
        );

      case 'positions':
        return (
          <div className="animate-tab-content">
            <PositionsPage
              onBack={() => setActiveTab('summary')}
              state={state}
              onClosePosition={handleClosePosition}
              onRedeemPosition={handleRedeemPosition}
              hideHeader={true}
            />
          </div>
        );

      case 'strategies':
        return (
          <div className="space-y-4 animate-tab-content">
            {/* Strategy Swiper Header */}
            <div className="flex bg-poly-dark/60 p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar scroll-smooth">
              {[
                { id: 'overview', label: 'Controls', icon: '⚡' },
                { id: 'smartMoney', label: 'Smart Money', icon: '👛' },
                { id: 'dipArb', label: 'Dip Arb', icon: '🎯' },
                { id: 'arbitrage', label: 'Arbitrage', icon: '🔄' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveStrategyTab(tab.id as any)}
                  className={`flex-1 min-w-[90px] py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    activeStrategyTab === tab.id
                      ? 'bg-gradient-to-r from-poly-purple to-poly-blue text-white shadow-glow-purple'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Active Strategy Content */}
            <div className="space-y-4">
              {activeStrategyTab === 'overview' && (
                <>
                  <StrategyControls config={config} onToggle={handleToggleStrategy} />
                  <TrendIndicators state={state} />
                  <StrategyGrid state={state} config={config} />
                </>
              )}
              {activeStrategyTab === 'smartMoney' && <SmartMoneyPanel state={state} />}
              {activeStrategyTab === 'dipArb' && <DipArbPanel state={state} />}
              {activeStrategyTab === 'arbitrage' && <ArbitragePanel state={state} />}
            </div>
          </div>
        );

      case 'logs':
        return (
          <div className="h-[calc(100vh-170px)] animate-tab-content">
            <ActivityLog logs={logs} />
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-4 animate-tab-content">
            <SettingsPanel config={config} onUpdate={handleUpdateConfig} />
            <details className="group">
              <summary className="cursor-pointer text-gray-500 text-sm hover:text-gray-400 flex items-center gap-2 py-2">
                <span className="transition-transform group-open:rotate-90">▶</span>
                Advanced Configuration (read-only)
              </summary>
              <div className="mt-2">
                <ConfigPanel config={config} />
              </div>
            </details>
          </div>
        );

      default:
        return null;
    }
  };

  // Full-screen page: History
  if (currentPage === 'history') {
    return <HistoryPage onBack={() => setCurrentPage('dashboard')} />;
  }

  // Full-screen page: Positions (Desktop Only)
  if (currentPage === 'positions' && !isMobile) {
    return (
      <PositionsPage
        onBack={() => setCurrentPage('dashboard')}
        state={state}
        onClosePosition={handleClosePosition}
        onRedeemPosition={handleRedeemPosition}
      />
    );
  }

  return (
    <div
      className={`min-h-screen bg-poly-dark text-white ${
        isDryRun ? 'dry-run-breathing' : 'live-mode-breathing'
      }`}
      style={{
        paddingBottom: isMobile ? 'calc(76px + env(safe-area-inset-bottom, 0px))' : '0px',
      }}
    >
      {/* Mode Banner - Compact */}
      <div
        className={`${
          isDryRun ? 'bg-red-500/20 border-red-500/30' : 'bg-green-500/20 border-green-500/30'
        } border-b px-4 py-1.5 text-center`}
      >
        <span
          className={`${
            isDryRun ? 'text-red-400' : 'text-green-400'
          } font-medium text-xs flex items-center justify-center gap-2`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isDryRun ? 'bg-red-400' : 'bg-green-400'
            } animate-pulse`}
          />
          {isDryRun ? 'DRY RUN — No real trades' : 'LIVE — Real money trading'}
        </span>
      </div>

      {/* Connection Status */}
      <ConnectionStatus connected={connected} error={error} />

      {/* Header */}
      <Header
        state={state}
        config={config}
        connected={connected}
        onHistoryClick={() => setCurrentPage('history')}
        onPositionsClick={() => {
          if (isMobile) {
            setActiveTab('positions');
          } else {
            setCurrentPage('positions');
          }
        }}
        onToggleDryRun={handleToggleDryRun}
      />

      {/* Main Grid View (Desktop) / Tab view (Mobile) */}
      <main className="p-4 max-w-[1800px] mx-auto">
        {isMobile ? (
          renderMobileContent()
        ) : (
          <div className="space-y-4">
            {/* Row 1: Quick Stats + Balances side by side */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <QuickStats state={state} config={config} />
              <BalanceCards state={state} config={config} />
            </div>

            {/* Row 2: Main Trading Grid - 4 columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <DipArbPanel state={state} />
              <ArbitragePanel state={state} />
              <PnLPanel state={state} config={config} />
              <SessionSummary state={state} />
            </div>

            {/* Row 3: Smart Money (main) + Side Panel (Trends + Strategies + OnChain) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <SmartMoneyPanel state={state} />
              </div>
              <div className="space-y-3">
                <StrategyControls config={config} onToggle={handleToggleStrategy} />
                <TrendIndicators state={state} />
                <StrategyGrid state={state} config={config} />
              </div>
            </div>

            {/* Row 4: Activity Log - Full Width at bottom */}
            <ActivityLog logs={logs} />

            {/* Settings Panel — Live Config Editor */}
            <SettingsPanel config={config} onUpdate={handleUpdateConfig} />

            {/* Config — Collapsible at bottom */}
            <details className="group">
              <summary className="cursor-pointer text-gray-500 text-sm hover:text-gray-400 flex items-center gap-2 py-2">
                <span className="transition-transform group-open:rotate-90">▶</span>
                Advanced Configuration (read-only)
              </summary>
              <div className="mt-2">
                <ConfigPanel config={config} />
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Bottom Tab Bar (Mobile Only) */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 bg-poly-dark/95 backdrop-blur-md border-t border-white/5 px-2 py-1 shadow-lg shadow-black/80"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
        >
          <div className="flex justify-around items-center max-w-md mx-auto">
            {([
              { id: 'summary', label: 'Summary' },
              { id: 'positions', label: 'Positions' },
              { id: 'strategies', label: 'Strategies' },
              { id: 'logs', label: 'Logs' },
              { id: 'settings', label: 'Settings' },
            ] as const).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all group ${
                    active ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                      active
                        ? 'bg-gradient-to-br from-poly-purple to-poly-blue text-white shadow-glow-purple scale-105'
                        : 'bg-white/5 group-hover:bg-white/10'
                    }`}
                  >
                    {getIcon(tab.id, active)}
                  </div>
                  <span className="text-[9px] font-semibold tracking-wider font-sans">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Minimal Footer */}
      <footer className="text-center py-4 border-t border-white/5 text-gray-600 text-xs">
        <div className="flex flex-col gap-1">
          <div>Polymarket Bot v3.0 • {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
          <div>
            Created by{' '}
            <a
              href="https://x.com/Mr_CryptoYT"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              @Mr_CryptoYT
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
