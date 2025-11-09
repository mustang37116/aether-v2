import EquityCurveChart from '../components/EquityCurveChart';
import CalendarHeatmap from '../components/CalendarHeatmap';
import AnalyticsBreakdown from '../components/AnalyticsBreakdown';
import DashboardFilters, { Filters } from '../components/DashboardFilters';
import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import './Dashboard.css';
export default function DashboardPage() {
  const api = useApi();
  const [filters, setFilters] = useState<Filters>(()=>{
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const fmt = (d: Date) => d.toISOString().slice(0,10);
    return { start: fmt(start), end: fmt(now) };
  });
  const [stats, setStats] = useState<any|null>(null);
  const [balance, setBalance] = useState<number|null>(null);
  useEffect(()=>{
    (async()=>{
      try {
        const [tradesResp, txResp] = await Promise.all([
          api.get('/trades', { params: { accountId: filters.accountId } }),
          api.get('/transactions', { params: { accountId: filters.accountId } })
        ]);
        const trades = tradesResp.data.trades || tradesResp.data || [];
        const total = trades.length;
        const sumQty = (arr:any[], type:'ENTRY'|'EXIT') => (arr||[]).filter(f=>f.type===type).reduce((s:number,f:any)=> s + Number(f.size||0), 0);
        let wins=0, losses=0, pnlSum=0, rSum=0, closed=0, open=0;
        for (const t of trades){
          const fills = t.tradeFills || [];
          const qtyEntry = sumQty(fills, 'ENTRY');
          const qtyExit = sumQty(fills, 'EXIT');
          const isClosed = qtyEntry > 0 ? qtyExit >= qtyEntry : (t.exitPrice != null);
          if (isClosed){
            closed++;
            const pnl = typeof t.pnl === 'number' ? Number(t.pnl) : ((Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size) - Number(t.fees||0));
            pnlSum += pnl;
            if (pnl>0) wins++; else if (pnl<0) losses++;
            if (t.metrics?.R != null) rSum += Number(t.metrics.R);
          } else {
            open++;
          }
        }
        const winRate = closed>0 ? (wins/closed)*100 : 0;
        const avgR = closed>0 ? rSum/closed : 0;
        setStats({ total, closed, open, winRate, pnlSum, avgR });

        // Account balance = deposits - withdrawals + realized PnL (fees already included in t.pnl)
        const txs:any[] = txResp.data || [];
        const netTx = txs.reduce((s,tx:any)=> s + (tx.type === 'DEPOSIT' ? Number(tx.amount) : -Number(tx.amount)), 0);
        const realized = trades.reduce((s:number,t:any)=> s + (typeof t.pnl === 'number' ? Number(t.pnl) : 0), 0);
        setBalance(netTx + realized);
      } catch {}
    })();
  }, [filters.accountId]);
  return (
    <div className='dashboard-root'>
      <div className='glass-panel'>
        <div className='dashboard-top'>
          <DashboardFilters value={filters} onChange={setFilters} />
          {stats && (
            <div className='stats-row'>
              {balance != null && <BigNumber label='Balance' value={balance.toFixed(2)} />}
              <BigNumber label='Trades' value={stats.total} />
              <BigNumber label='Closed' value={stats.closed} />
              <BigNumber label='Open' value={stats.open} />
              <BigNumber label='Win %' value={stats.winRate.toFixed(1)} />
              <BigNumber label='PnL' value={stats.pnlSum.toFixed(2)} />
              <BigNumber label='Avg R' value={stats.avgR.toFixed(2)} />
            </div>
          )}
        </div>
      </div>
      <div className='glass-panel'>
        <EquityCurveChart accountId={filters.accountId} start={filters.start} end={filters.end} />
      </div>
      <div className='glass-panel'>
        <CalendarHeatmap accountId={filters.accountId} start={filters.start} end={filters.end} />
      </div>
      <div className='glass-panel'>
        <AnalyticsBreakdown accountId={filters.accountId} start={filters.start} end={filters.end} />
      </div>
    </div>
  );
}

function BigNumber({ label, value }: { label:string; value:any }) {
  return (
    <div className='big-number'>
      <div className='label'>{label.toUpperCase()}</div>
      <div className='value'>{value}</div>
    </div>
  );
}
