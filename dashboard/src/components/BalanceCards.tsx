import type { BotState, BotConfig } from '../types';

interface BalanceCardsProps {
  state: BotState | null;
  config: BotConfig | null;
}

interface BalanceCardProps {
  icon: string;
  label: string;
  value: string;
  subLabel?: string;
  gradient: string;
  iconBg: string;
  primary?: boolean;
}

function BalanceCard({ icon, label, value, subLabel, gradient, iconBg, primary }: BalanceCardProps) {
  return (
    <div className={`glass-card glass-card-hover rounded-lg p-3 ${gradient} ${primary ? 'ring-1 ring-green-500/30' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            {label}
            {primary && <span className="text-green-400 text-[9px]">● PRIMARY</span>}
          </div>
          <div className={`${primary ? 'text-xl' : 'text-lg'} font-bold font-mono text-white truncate`}>
            {value}
          </div>
        </div>
        {subLabel && (
          <div className="text-[10px] text-gray-600 hidden xl:block">{subLabel}</div>
        )}
      </div>
    </div>
  );
}

export function BalanceCards({ state, config }: BalanceCardsProps) {
  const usd = state?.usdBalance ?? 0;
  const ngn = state?.ngnBalance ?? 0;
  const isNgn = config?.currency === 'NGN';
  const total = state?.totalBalance ?? (isNgn ? ngn : usd);

  const formatCurrency = (value: number, decimals: number = 2) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const cards = isNgn
    ? [
        {
          icon: '₦',
          label: 'NGN Balance',
          value: `₦${formatCurrency(ngn)}`,
          subLabel: 'Primary',
          gradient: 'bg-gradient-to-br from-green-500/10 to-green-500/5',
          iconBg: 'bg-green-500/20',
          primary: true,
        },
        {
          icon: '💵',
          label: 'USD',
          value: `$${formatCurrency(usd)}`,
          subLabel: 'Secondary',
          gradient: 'bg-gradient-to-br from-blue-500/10 to-blue-500/5',
          iconBg: 'bg-blue-500/20',
          primary: false,
        },
        {
          icon: '🏦',
          label: 'Total Value',
          value: `₦${formatCurrency(total)}`,
          subLabel: 'Total NGN',
          gradient: 'bg-gradient-to-br from-yellow-500/10 to-orange-500/5',
          iconBg: 'bg-yellow-500/20',
          primary: false,
        },
      ]
    : [
        {
          icon: '💵',
          label: 'USD Balance',
          value: `$${formatCurrency(usd)}`,
          subLabel: 'Available USD',
          gradient: 'bg-gradient-to-br from-green-500/10 to-green-500/5',
          iconBg: 'bg-green-500/20',
          primary: true,
        },
        {
          icon: '₦',
          label: 'NGN',
          value: `₦${formatCurrency(ngn)}`,
          subLabel: 'Available NGN',
          gradient: 'bg-gradient-to-br from-blue-500/10 to-blue-500/5',
          iconBg: 'bg-blue-500/20',
          primary: false,
        },
        {
          icon: '🏦',
          label: 'Total Value',
          value: `$${formatCurrency(total)}`,
          subLabel: 'Total USD',
          gradient: 'bg-gradient-to-br from-yellow-500/10 to-orange-500/5',
          iconBg: 'bg-yellow-500/20',
          primary: false,
        },
      ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((card) => (
        <BalanceCard key={card.label} {...card} />
      ))}
    </div>
  );
}
