import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import dayjs from 'dayjs';

interface DayCell { date: string; pnl: number; deposits: number; withdrawals: number; }

function colorFor(value: number) {
  if (value === 0) return 'rgba(255,255,255,0.08)';
  return value > 0 ? 'rgba(102,229,255,0.5)' : 'rgba(255,102,153,0.5)';
}

export default function CalendarHeatmap({ accountId, start, end }: { accountId?: string; start?: string; end?: string }) {
  const api = useApi();
  const [days, setDays] = useState<DayCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true); setError(null);
  const res = await api.get('/analytics/calendar', { params: { accountId, start, end } });
        if (!mounted) return;
        setDays(res.data.days || []);
      } catch (e: any) {
        setError('Failed to load calendar');
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [accountId, start, end]);

  if (loading) return <div>Loading calendar…</div>;
  if (error) return <div style={{color:'#e66'}}>{error}</div>;
  if (!days.length) return <div>No daily data</div>;

  // Group by month
  const byMonth = days.reduce((acc, d) => {
    const m = d.date.slice(0,7);
    acc[m] = acc[m] || []; acc[m].push(d); return acc;
  }, {} as Record<string, DayCell[]>);

  return (
    <div style={{display:'grid', gap:24}}>
      {Object.entries(byMonth).map(([month, cells]) => (
        <div key={month}>
          <div style={{marginBottom:8, fontWeight:600}}>{month}</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(14, 1fr)', gap:4}}>
            {cells.map(c => (
              <div key={c.date} title={`${c.date} pnl:${c.pnl.toFixed(2)}`} style={{
                height:24,
                background: colorFor(c.pnl + c.deposits + c.withdrawals),
                borderRadius:4,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:10,
                color:'#fff',
              }}>{dayjs(c.date).date()}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
