import { TradeMetrics } from '../types';
export default function RiskRewardBox({ m }: { m: TradeMetrics | null }) {
  if (!m) return null;
  return <div style={{display:'flex', gap:12}}>
    <div>Risk: {m.risk.toFixed(2)}</div>
    <div>Reward: {m.reward.toFixed(2)}</div>
    <div>R: {m.R?.toFixed(2)}</div>
  </div>;
}
