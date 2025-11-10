import EquityCurveChart from '../components/EquityCurveChart';
import CalendarHeatmap from '../components/CalendarHeatmap';
import AnalyticsBreakdown from '../components/AnalyticsBreakdown';
import DashboardFilters, { Filters } from '../components/DashboardFilters';
import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { getCached, setCached } from '../hooks/cache';
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
    let cancelled = false;
    const cacheKey = `dashboard:${filters.accountId||'all'}`;
    // Try cache first for instant paint
    const cached = getCached<any>(cacheKey);
    if (cached) {
      setStats(cached.stats);
      setBalance(cached.balance);
    }
    (async()=>{
      try {
        const [tradesResp, txResp] = await Promise.all([
          api.get('/trades', { params: { accountId: filters.accountId } }),
          api.get('/transactions', { params: { accountId: filters.accountId } })
        ]);
        if (cancelled) return;
        const trades = tradesResp.data.trades || tradesResp.data || [];
        const total = trades.length;
        const sumQty = (arr:any[], type:'ENTRY'|'EXIT') => (arr||[]).filter(f=>f.type===type).reduce((s:number,f:any)=> s + Number(f.size||0), 0);
        const avgPrice = (fills:any[]) => {
          const totalSz = fills.reduce((s:number,f:any)=> s + Number(f.size||0), 0);
          if (!totalSz) return null;
          const totalPxSz = fills.reduce((s:number,f:any)=> s + (Number(f.price)||0) * (Number(f.size)||0), 0);
          return totalPxSz / totalSz;
        };
        let wins=0, losses=0, pnlSum=0, rSum=0, rCount=0, closed=0, open=0;
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
            // Compute realized R where possible without relying on TP; prefer using SL if present
            const entryPx = (avgPrice(fills.filter((f:any)=>f.type==='ENTRY')) ?? (Number(t.entryPrice)||null));
            const exitPx = (avgPrice(fills.filter((f:any)=>f.type==='EXIT')) ?? (Number(t.exitPrice)||null));
            const stopPx = t.stopPrice != null ? Number(t.stopPrice) : null; // may be null
            const realizedQty = qtyEntry > 0 && qtyExit > 0 ? Math.min(qtyEntry, qtyExit) : (Number(t.size)||0);
            if (stopPx != null && entryPx != null && exitPx != null && realizedQty > 0){
              const risk = Math.abs(entryPx - stopPx) * realizedQty;
              const reward = Math.abs(exitPx - entryPx) * realizedQty; // realized distance
              if (risk > 0) { rSum += (reward / risk); rCount++; }
            } else if (t.metrics?.R != null) {
              // Fallback to server-computed R if available
              rSum += Math.abs(Number(t.metrics.R)); rCount++;
            }
          } else {
            open++;
          }
        }
        const winRate = closed>0 ? (wins/closed)*100 : 0;
        const avgR = rCount>0 ? rSum/rCount : 0;
  const computedStats = { total, closed, open, winRate, pnlSum, avgR };
  setStats(computedStats);

        // Account balance = deposits - withdrawals + realized PnL (fees already included in t.pnl)
        const txs:any[] = txResp.data || [];
        const netTx = txs.reduce((s,tx:any)=> s + (tx.type === 'DEPOSIT' ? Number(tx.amount) : -Number(tx.amount)), 0);
        const realized = trades.reduce((s:number,t:any)=> s + (typeof t.pnl === 'number' ? Number(t.pnl) : 0), 0);
        const computedBalance = netTx + realized;
        setBalance(computedBalance);
        // Cache fresh snapshot (TTL 30s)
        setCached(cacheKey, { stats: computedStats, balance: computedBalance }, 30000);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [filters.accountId]);
  return (
    <div className='dashboard-root'>
      <div className='glass-panel'>
        <div className='dashboard-top'>
          <DashboardFilters value={filters} onChange={setFilters} />
          {stats && (
            <div className='stats-row'>
              {balance != null && <BigNumber label='Balance' value={formatCurrency(balance)} />}
              <BigNumber label='Trades' value={stats.total} />
              <BigNumber label='Open' value={stats.open} />
              <BigNumber label='Win %' value={stats.winRate.toFixed(1)} />
              <BigNumber label='PnL' value={formatCurrency(stats.pnlSum)} />
              <BigNumber label='Avg R' value={formatR(stats.avgR)} />
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

function formatCurrency(n: number){
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n); } catch { return `$${n.toFixed(2)}`; }
}

function formatR(avgR: number){
  if (!isFinite(avgR)) return '—';
  const r = Math.abs(avgR);
  return `1:${r.toFixed(2)}`;
}
