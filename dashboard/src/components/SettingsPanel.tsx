import { useState } from 'react';
import type { BotConfig } from '../types';

interface SettingsPanelProps {
  config: BotConfig | null;
  onUpdate: (changes: Partial<BotConfig & { capital: any; risk: any; arbitrage: any }>) => void;
  onToggleDryRun?: () => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  type?: string;
  hint?: string;
}

function Field({ label, value, onChange, suffix, type = 'number', hint }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-poly-dark/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 transition-all"
          step="any"
        />
        {suffix && <span className="text-gray-500 text-sm whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <p className="text-[10px] text-gray-600">{hint}</p>}
    </div>
  );
}

function SectionHeader({ icon, title, color }: { icon: string; title: string; color: string }) {
  return (
    <div className={`text-xs uppercase tracking-wider mb-3 flex items-center gap-2 text-${color}-400`}>
      <span>{icon}</span>
      {title}
    </div>
  );
}

export function SettingsPanel({ config, onUpdate, onToggleDryRun }: SettingsPanelProps) {
  const [saved, setSaved] = useState(false);

  // Capital fields
  const [capitalNgn, setCapitalNgn] = useState(String(config?.capital?.totalNgn ?? 400000));
  const [capitalUsd, setCapitalUsd] = useState(String(config?.capital?.totalUsd ?? 250));

  // Arbitrage fields
  const [profitThreshold, setProfitThreshold] = useState(
    String(((config?.arbitrage?.profitThreshold ?? 0.01) * 100).toFixed(2))
  );
  const [minTradeSize, setMinTradeSize] = useState(String(config?.arbitrage?.minTradeSize ?? 5));
  const [maxTradeSize, setMaxTradeSize] = useState(String(config?.arbitrage?.maxTradeSize ?? 100));
  const [minVolume24h, setMinVolume24h] = useState(String(config?.arbitrage?.minVolume24h ?? 500));

  // Risk fields
  const [dailyMaxLoss, setDailyMaxLoss] = useState(
    String(((config?.risk?.dailyMaxLossPct ?? 0.05) * 100).toFixed(1))
  );
  const [monthlyMaxLoss, setMonthlyMaxLoss] = useState(
    String(((config?.risk?.monthlyMaxLossPct ?? 0.15) * 100).toFixed(1))
  );
  const [maxDrawdown, setMaxDrawdown] = useState(
    String(((config?.risk?.maxDrawdownFromPeak ?? 0.25) * 100).toFixed(1))
  );
  const [pauseMinutes, setPauseMinutes] = useState(
    String(config?.risk?.pauseOnBreachMinutes ?? 60)
  );

  // Currency
  const [currency, setCurrency] = useState<'USD' | 'NGN'>(config?.currency ?? 'NGN');

  const handleSave = () => {
    onUpdate({
      currency,
      capital: {
        totalNgn: parseFloat(capitalNgn),
        totalUsd: parseFloat(capitalUsd),
      },
      arbitrage: {
        profitThreshold: parseFloat(profitThreshold) / 100,
        minTradeSize: parseFloat(minTradeSize),
        maxTradeSize: parseFloat(maxTradeSize),
        minVolume24h: parseFloat(minVolume24h),
      },
      risk: {
        dailyMaxLossPct: parseFloat(dailyMaxLoss) / 100,
        monthlyMaxLossPct: parseFloat(monthlyMaxLoss) / 100,
        maxDrawdownFromPeak: parseFloat(maxDrawdown) / 100,
        pauseOnBreachMinutes: parseInt(pauseMinutes, 10),
      },
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!config) return null;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="section-header mb-0">
          <div className="section-header-icon bg-gradient-to-br from-purple-500/20 to-blue-500/20">
            🛠️
          </div>
          Live Settings
        </h2>
        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-1 rounded-full">
          Changes apply instantly — no restart needed
        </span>
      </div>

      <div className="panel-body">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Mode Selector */}
          <div className="md:col-span-2 xl:col-span-4 bg-poly-purple/5 border border-poly-purple/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                Trading Mode Configuration
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Toggle between paper trading simulation and live execution with real assets.
              </p>
            </div>
            {onToggleDryRun && (
              <button
                onClick={onToggleDryRun}
                className={`btn font-heading text-xs uppercase tracking-wider py-2.5 px-5 rounded-lg border transition-all ${
                  config.dryRun
                    ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400 animate-pulse'
                }`}
              >
                {config.dryRun ? '🧪 Simulation (Dry Run)' : '💰 Live Trading'}
              </button>
            )}
          </div>

          {/* Currency & Capital */}
          <div className="space-y-3">
            <SectionHeader icon="💰" title="Capital" color="green" />

            <div className="space-y-1">
              <label className="text-[11px] text-gray-400 uppercase tracking-wider">Primary Currency</label>
              <div className="flex gap-2">
                {(['NGN', 'USD'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                      currency === c
                        ? 'bg-green-500/20 border-green-500/40 text-green-400'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    {c === 'NGN' ? '₦ NGN' : '$ USD'}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Capital (NGN ₦)"
              value={capitalNgn}
              onChange={setCapitalNgn}
              suffix="₦"
              hint="Total capital if using Naira account"
            />
            <Field
              label="Capital (USD $)"
              value={capitalUsd}
              onChange={setCapitalUsd}
              suffix="$"
              hint="Total capital if using USD account"
            />
          </div>

          {/* Arbitrage */}
          <div className="space-y-3">
            <SectionHeader icon="⚖️" title="Arbitrage" color="blue" />
            <Field
              label="Min Profit Threshold"
              value={profitThreshold}
              onChange={setProfitThreshold}
              suffix="%"
              hint="Minimum spread to trigger a trade (e.g. 1 = 1%)"
            />
            <Field
              label="Min Trade Size"
              value={minTradeSize}
              onChange={setMinTradeSize}
              hint="Minimum order size in account currency"
            />
            <Field
              label="Max Trade Size"
              value={maxTradeSize}
              onChange={setMaxTradeSize}
              hint="Maximum order size per trade"
            />
            <Field
              label="Min 24h Volume"
              value={minVolume24h}
              onChange={setMinVolume24h}
              hint="Only scan markets above this volume"
            />
          </div>

          {/* Risk */}
          <div className="space-y-3">
            <SectionHeader icon="🛡️" title="Risk Limits" color="yellow" />
            <Field
              label="Daily Max Loss"
              value={dailyMaxLoss}
              onChange={setDailyMaxLoss}
              suffix="%"
              hint="Bot pauses if daily loss exceeds this"
            />
            <Field
              label="Monthly Max Loss"
              value={monthlyMaxLoss}
              onChange={setMonthlyMaxLoss}
              suffix="%"
              hint="Bot pauses for 30 days if breached"
            />
            <Field
              label="Max Drawdown"
              value={maxDrawdown}
              onChange={setMaxDrawdown}
              suffix="%"
              hint="Bot pauses for 7 days if drawdown exceeds this"
            />
            <Field
              label="Pause Duration"
              value={pauseMinutes}
              onChange={setPauseMinutes}
              suffix="min"
              hint="How long to pause after a daily loss breach"
            />
          </div>

          {/* Save */}
          <div className="flex flex-col justify-end space-y-3">
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-xs text-yellow-400/80 space-y-1">
              <div className="font-semibold">⚠️ Before saving:</div>
              <ul className="space-y-1 text-yellow-400/60 list-disc list-inside">
                <li>Settings apply to the live running bot immediately</li>
                <li>Changes are lost if the bot restarts — update .env for permanent changes</li>
                <li>Start with Dry Run mode to test new settings safely</li>
              </ul>
            </div>

            <button
              onClick={handleSave}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                saved
                  ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                  : 'bg-purple-600 hover:bg-purple-500 text-white border border-purple-500/50 shadow-lg shadow-purple-500/10'
              }`}
            >
              {saved ? '✅ Saved & Applied!' : '💾 Save & Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
