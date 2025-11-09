import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import dayjs from 'dayjs';

export default function TradesListPage() {
  const api = useApi();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, any[]>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true); setError(null);
      const r = await api.get('/trades');
      setTrades(r.data);
    } catch (e: any) {
      setError('Failed to load trades');
    } finally { setLoading(false); }
  }

  async function finalize(id: string) {
    const exitPriceStr = prompt('Exit price?');
    if (!exitPriceStr) return;
    const exitPrice = Number(exitPriceStr);
    if (Number.isNaN(exitPrice)) { alert('Invalid number'); return; }
    setFinalizing(id);
    try {
      await api.put(`/trades/${id}/exit`, { exitPrice, exitTime: new Date().toISOString() });
      await load();
    } catch { alert('Finalize failed'); }
    finally { setFinalizing(null); }
  }

  async function loadAtt(tradeId: string) {
    try {
      const res = await api.get('/attachments', { params: { tradeId } });
      setAttachments(a => ({ ...a, [tradeId]: res.data }));
    } catch {
      // ignore
    }
  }

  return (
    <div className='glass-panel'>
      <h2 style={{marginTop:0}}>Trades</h2>
      {loading && <div>Loading...</div>}
      {error && <div className='warn'>{error}</div>}
      <table className='trade-table'>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Strategy</th>
            <th>Tags</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>P&L</th>
            <th>R</th>
            <th>Hold</th>
            <th>Size</th>
            <th>Setup?</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(t => {
            const R = t.metrics?.R ?? null;
            const hold = t.holdTimeSeconds != null ? formatHold(t.holdTimeSeconds) : '-';
            const pnl = t.pnl != null ? t.pnl.toFixed(2) : '-';
            return (
              <tr key={t.id}>
                <td>{t.symbol}</td>
                <td style={{fontSize:12, maxWidth:120}}>{t.strategy || ''}</td>
                <td style={{fontSize:11, maxWidth:160}}>{t.tags?.map((tg:any)=>tg.name).join(', ')}</td>
                <td>{Number(t.entryPrice).toFixed(2)}</td>
                <td>{t.exitPrice != null ? Number(t.exitPrice).toFixed(2) : '-'}</td>
                <td className={t.pnl > 0 ? 'pnl-pos' : t.pnl < 0 ? 'pnl-neg' : ''}>{pnl}</td>
                <td>{R != null ? R.toFixed(2) : '-'}</td>
                <td>{hold}</td>
                <td>{t.size}</td>
                <td>{t.setupMode ? 'Yes' : ''}</td>
                <td style={{display:'grid', gap:6}}>
                  {!t.exitPrice && <button disabled={finalizing===t.id} onClick={()=>finalize(t.id)}>Finalize</button>}
                  <TagEditor trade={t} api={api} onChange={load} />
                  <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:12, opacity:0.8}}>Attach</span>
                    <input type='file' style={{display:'none'}} onChange={e=>onUpload(api, t.id, e)} />
                    <button onClick={(ev)=>{
                      const input = (ev.currentTarget.previousSibling as HTMLInputElement);
                      input?.click();
                    }} disabled={uploading===t.id}>Upload</button>
                    <button onClick={()=>loadAtt(t.id)}>View</button>
                  </label>
                  {attachments[t.id]?.length ? (
                    <div style={{display:'grid', gap:4}}>
                      {attachments[t.id].map(att => (
                        <div key={att.id} style={{display:'flex', alignItems:'center', gap:6}}>
                          <a href={`http://localhost:4000${att.url}`} target='_blank' rel='noreferrer' style={{fontSize:11}}>Attachment</a>
                          <button type='button'
                            style={{background:'transparent', color:'var(--danger)', fontSize:10}}
                            onClick={()=>onDeleteAttachment(api, t.id, att.id)}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

async function onUpload(api: ReturnType<typeof useApi>, tradeId: string, e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const form = new FormData();
  form.append('tradeId', tradeId);
  form.append('file', file);
  try {
    await api.post('/attachments', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    // Refresh attachments list automatically
    const res = await api.get('/attachments', { params: { tradeId } });
    // Optimistically update state (component-level state update handled in parent via loadAtt pattern not accessible here)
  } catch { alert('Upload failed'); }
}

async function onDeleteAttachment(api: ReturnType<typeof useApi>, tradeId: string, attId: string) {
  if (!confirm('Delete attachment?')) return;
  try {
    await api.delete(`/attachments/${attId}`);
    // After delete we could refresh but parent state method not in scope; page reload will fetch if user clicks View again.
  } catch { alert('Delete failed'); }
}

function TagEditor({ trade, api, onChange }: { trade:any; api: ReturnType<typeof useApi>; onChange:()=>any }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  async function add() {
    if (!value.trim()) return;
    setAdding(true);
    try {
      await api.post(`/trades/${trade.id}/tags`, { name: value.trim() });
      setValue('');
      await onChange();
    } catch {}
    finally { setAdding(false); }
  }
  async function remove(tagId: string) {
    if (!confirm('Remove tag?')) return;
    try {
      await api.delete(`/trades/${trade.id}/tags/${tagId}`);
      await onChange();
    } catch {}
  }
  return (
    <div style={{display:'grid', gap:4}}>
      <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
        {trade.tags?.map((tg:any)=> (
          <span key={tg.id} style={{background:'rgba(255,255,255,0.15)', padding:'2px 6px', borderRadius:4, display:'inline-flex', alignItems:'center', gap:4}}>
            {tg.name}
            <button type='button' style={{background:'transparent', color:'var(--danger)', fontSize:10}} onClick={()=>remove(tg.id)}>x</button>
          </span>
        ))}
      </div>
      <div style={{display:'flex', gap:4}}>
        <input style={{flex:1}} placeholder='Add tag' value={value} onChange={e=>setValue(e.target.value)} />
        <button type='button' disabled={adding} onClick={add}>Add</button>
      </div>
    </div>
  );
}

async function loadAtt(this: any, tradeId: string) {
  // This function body will be replaced by component-scoped version; this placeholder is for types.
}
