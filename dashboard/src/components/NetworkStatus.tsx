import { useState, useEffect } from 'react';

interface NetworkStatusProps {
  connected: boolean;
}

export function NetworkStatus({ connected }: NetworkStatusProps) {
  const [latency, setLatency] = useState<number>(0);

  useEffect(() => {
    // Simulate network stats updates
    const interval = setInterval(() => {
      setLatency(50 + Math.random() * 100);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getLatencyColor = (ms: number) => {
    if (ms < 100) return 'text-green-400';
    if (ms < 200) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="flex items-center gap-4 text-xs">
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={`status-dot ${connected ? 'status-dot-active animate-pulse' : 'status-dot-error'}`} />
        <span className={connected ? 'text-green-400' : 'text-red-400'}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="w-px h-4 bg-white/10" />

      {/* Latency */}
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500">📡</span>
        <span className={`font-mono ${getLatencyColor(latency)}`}>
          {latency.toFixed(0)}ms (API)
        </span>
      </div>
    </div>
  );
}
