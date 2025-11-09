import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import dayjs from 'dayjs';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function EquityCurveChart({ accountId, start, end }: { accountId?: string; start?: string; end?: string }) {
  const api = useApi();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true); setError(null);
  const res = await api.get('/analytics/equity', { params: { accountId, start, end } });
        if (!mounted) return;
        const rows = (res.data.curve || []).map((p: any) => ({
          time: p.time,
          date: dayjs(p.time).format('YYYY-MM-DD'),
          value: p.cumulative,
        }));
        setData(rows);
      } catch (e: any) {
        setError('Failed to load equity curve');
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [accountId, start, end]);

  if (loading) return <div>Loading equity…</div>;
  if (error) return <div style={{color:'#e66'}}>{error}</div>;
  if (!data.length) return <div>No data</div>;

  return (
    <div style={{height:300}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="date" stroke="#cfd8dc" tick={{ fontSize: 12 }} minTickGap={32} />
          <YAxis stroke="#cfd8dc" tick={{ fontSize: 12 }} />
          <Tooltip contentStyle={{ background:'rgba(0,0,0,0.7)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff' }} labelFormatter={(v)=>String(v)} />
          <Line type="monotone" dataKey="value" stroke="#66e5ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
