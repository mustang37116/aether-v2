import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

export default function AnalyticsSummary() {
  const api = useApi();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/analytics/summary').then(r => setData(r.data)); }, []);
  if (!data) return <div>Loading...</div>;
  return (
    <div style={{display:'grid', gap:8}}>
      <div>Trades: {data.total}</div>
      <div>Wins: {data.wins}</div>
      <div>Win Rate: {(data.winRate*100).toFixed(1)}%</div>
      <div>Avg Hold (s): {data.avgHoldSeconds.toFixed(0)}</div>
    </div>
  );
}
