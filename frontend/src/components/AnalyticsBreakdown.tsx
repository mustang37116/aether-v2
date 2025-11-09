import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

interface Props { accountId?: string; start?: string; end?: string; }

function Table({ title, rows, currency }: { title: string; rows: any[]; currency: string }) {
  return (
    <div className='glass-subpanel' style={{padding:12}}>
      <h3 style={{marginTop:0}}>{title}</h3>
      <table style={{width:'100%', fontSize:12, borderCollapse:'collapse'}}>
        <thead>
          <tr style={{textAlign:'left'}}>
            <th style={{padding:'4px 6px'}}>Key</th>
            <th style={{padding:'4px 6px'}}>Trades</th>
            <th style={{padding:'4px 6px'}}>Win%</th>
            <th style={{padding:'4px 6px'}}>Avg R</th>
            <th style={{padding:'4px 6px'}}>PnL ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} style={{borderTop:'1px solid rgba(255,255,255,0.1)'}}>
              <td style={{padding:'4px 6px'}}>{r.key}</td>
              <td style={{padding:'4px 6px'}}>{r.trades}</td>
              <td style={{padding:'4px 6px'}}>{(r.winRate*100).toFixed(1)}%</td>
              <td style={{padding:'4px 6px'}}>{r.avgR.toFixed(2)}</td>
              <td style={{padding:'4px 6px'}}>{r.pnl.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsBreakdown({ accountId, start, end }: Props) {
  const api = useApi();
  const [assetClass, setAssetClass] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [tag, setTag] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
  const params: any = {};
  if (accountId) params.accountId = accountId;
  if (start) params.start = start;
  if (end) params.end = end;
        const [ac, st, tg] = await Promise.all([
          api.get('/analytics/byAssetClass', { params }),
          api.get('/analytics/byStrategy', { params }),
          api.get('/analytics/byTag', { params }),
        ]);
        if (!mounted) return;
        setAssetClass(ac.data);
        setStrategy(st.data);
        setTag(tg.data);
      } finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [accountId, start, end]);

  if (loading) return <div>Loading breakdown…</div>;
  return (
    <div style={{display:'grid', gap:16}}>
      <Table title='By Asset Class' rows={assetClass?.rows || []} currency={assetClass?.currency || 'USD'} />
      <Table title='By Strategy' rows={strategy?.rows || []} currency={strategy?.currency || 'USD'} />
      <Table title='By Tag' rows={tag?.rows || []} currency={tag?.currency || 'USD'} />
    </div>
  );
}
