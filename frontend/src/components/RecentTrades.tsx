import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useApi } from '../hooks/useApi';
import ModalContainer from './ModalContainer';

export default function RecentTrades({ accountId, start, end, limit=10 }: { accountId?: string; start?: string; end?: string; limit?: number }) {
  const api = useApi();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [selected, setSelected] = useState<any|null>(null);

  useEffect(()=>{ load(); }, [accountId, start, end, limit]);

  async function load(){
    try{
      setLoading(true); setError(null);
      const params: any = {};
      if (accountId) params.accountId = accountId;
      if (start) params.start = start;
      if (end) params.end = end;
      if (limit) params.limit = limit;
      const r = await api.get('/trades', { params });
      setTrades(r.data);
    }catch(e){ setError('Failed to load trades'); }
    finally{ setLoading(false); }
  }

  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <h3 style={{margin:0}}>Recent Trades</h3>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className='warn'>{error}</div>}
      <div style={{display:'grid', gap:8}}>
        {trades.map(t => (
          <div key={t.id} className='trade-card' onClick={()=>setSelected(t)}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:600}}>{t.symbol}</div>
              <div style={{fontSize:12, opacity:0.8}}>{dayjs(t.entryTime).format('MMM D, YYYY')}</div>
            </div>
            <div style={{display:'flex', gap:12, fontSize:12}}>
              <span>R: {t.metrics?.R != null ? t.metrics.R.toFixed(2) : '-'}</span>
              <span>PnL: {t.pnl != null ? t.pnl.toFixed(2) : '-'}</span>
              <span>Strategy: {t.strategy || '-'}</span>
            </div>
            {t.notes && <div style={{fontSize:12, opacity:0.9, marginTop:4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{t.notes}</div>}
            {t.tags?.length ? (
              <div style={{display:'flex', gap:6, marginTop:6, flexWrap:'wrap'}}>
                {t.tags.map((tg:any)=> (
                  <span key={tg.id} className='tag-chip'>{tg.name}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {selected && <TradeDetail trade={selected} onClose={()=>setSelected(null)} />}
    </div>
  );
}

function TradeDetail({ trade, onClose }: { trade:any; onClose:()=>void }){
  const [closing, setClosing] = useState(false);
  const handleClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 180); };
  return (
    <div className={`modal-overlay-view ${closing ? 'closing' : ''}`} onClick={handleClose}>
      <ModalContainer onClose={handleClose} labelledById='recent-trade-title' className={`modal ${closing ? 'closing' : ''}`}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 id='recent-trade-title' style={{margin:0}}>{trade.symbol}</h3>
          <button onClick={handleClose}>Close</button>
        </div>
        <div style={{marginBottom:12}}>
          <TradeChart trade={trade} height={260} />
        </div>
        <div style={{display:'grid', gap:8}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <Info label='Entry' value={Number(trade.entryPrice).toFixed(2)} />
            <Info label='Exit' value={trade.exitPrice != null ? Number(trade.exitPrice).toFixed(2) : '-'} />
            <Info label='Size' value={trade.size} />
            <Info label='R' value={trade.metrics?.R != null ? trade.metrics.R.toFixed(2) : '-'} />
            <Info label='PnL' value={trade.pnl != null ? trade.pnl.toFixed(2) : '-'} />
            <Info label='Hold' value={trade.holdTimeSeconds ? formatHold(trade.holdTimeSeconds) : '-'} />
          </div>
          <Info label='Strategy' value={trade.strategy || '-'} />
          {trade.tags?.length ? (<div>
            <div style={{fontSize:12, opacity:0.7, marginBottom:4}}>Tags</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}> {trade.tags.map((tg:any)=> <span key={tg.id} className='tag-chip'>{tg.name}</span>)} </div>
          </div>) : null}
          {trade.notes ? (
            <div>
              <div style={{fontSize:12, opacity:0.7, marginBottom:4}}>Notes</div>
              <div style={{whiteSpace:'pre-wrap'}}>{trade.notes}</div>
            </div>
          ) : null}
        </div>
      </ModalContainer>
    </div>
  );
}
import TradeChart from './TradeChart';

function Info({ label, value }: { label:string; value:any }){
  return (
    <div>
      <div style={{fontSize:12, opacity:0.7}}>{label}</div>
      <div style={{fontWeight:600}}>{value}</div>
    </div>
  );
}

function formatHold(seconds: number) {
  if (seconds < 60) return seconds.toFixed(0) + 's';
  const m = Math.floor(seconds/60); const s = Math.floor(seconds%60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m/60); const mm = m%60;
  return `${h}h ${mm}m`;
}
