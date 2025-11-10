import { useState, useEffect } from 'react';
import { API_BASE } from '../apiBase';
import { useApi } from '../hooks/useApi';
import { useCachedGet } from '../hooks/useCachedGet';
import dayjs from 'dayjs';
import TradeChart from '../components/TradeChart';
import SymbolAutocomplete from '../components/SymbolAutocomplete';
import ModalContainer from '../components/ModalContainer';

interface Filters { accountId?: string; start?: string; end?: string; }

export default function JournalPage(){
  const api = useApi();
  const [trades, setTrades] = useState<any[]>([]);
  const [error, setError] = useState<string|null>(null);
  const [fatal, setFatal] = useState<string|null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any|null>(null);
  const [editingTrade, setEditingTrade] = useState<any|null>(null);
  const PAGE_SIZE = 25;

  // Basic filters local (could reuse DashboardFilters later)
  const [filters, setFilters] = useState<Filters>(() => ({ start: dayjs().subtract(6,'month').format('YYYY-MM-DD') }));

  const params:any = { limit: PAGE_SIZE, skip: page * PAGE_SIZE, accountId: filters.accountId, start: filters.start, end: filters.end };
  const { data: cachedTrades, loading } = useCachedGet<any[]>('/trades', params, { ttl: 20000, keepPrevious: true });
  useEffect(()=>{ if (cachedTrades) setTrades(cachedTrades); }, [cachedTrades]);
  useEffect(()=>{ if (!cachedTrades && !loading) setError('Failed to load trades'); else setError(null); }, [cachedTrades, loading]);

  function next(){ setPage(p => p + 1); }
  function prev(){ setPage(p => Math.max(0, p - 1)); }

  return (
    <div style={{display:'grid', gap:24}}>
      <div className='glass-panel' style={{display:'grid', gap:12}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h2 style={{margin:0}}>Journal</h2>
          <div style={{display:'flex', gap:8}}>
            <button type='button' onClick={()=>{ window.location.href='/trades'; }}>New Trade</button>
            <button type='button' onClick={()=>{ window.location.href='/journal/deleted'; }}>Deleted Trades</button>
          </div>
        </div>
        <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
          <div style={{display:'grid', gap:4}}>
            <span style={{fontSize:12, opacity:.7}}>Start</span>
            <input type='date' value={filters.start || ''} onChange={e=> setFilters(f=> ({...f, start: e.target.value || undefined }))} />
          </div>
          <div style={{display:'grid', gap:4}}>
            <span style={{fontSize:12, opacity:.7}}>End</span>
            <input type='date' value={filters.end || ''} onChange={e=> setFilters(f=> ({...f, end: e.target.value || undefined }))} />
          </div>
        </div>
        {loading && <div>Loading...</div>}
        {error && <div className='warn'>{error}</div>}
        {fatal && (
          <div style={{background:'#3b0b0b', padding:12, borderRadius:8}}>
            <strong>Journal render error:</strong> {fatal} (check console)
          </div>
        )}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12}}>
          {!fatal && trades.map(t => {
            try {
              if (!t || !t.id) return null;
              return <JournalCard key={t.id} trade={t} onView={()=>setSelected(t)} onEdit={()=>setEditingTrade(t)} />;
            } catch(e:any){
              console.error('JournalCard render failed', e, t);
              setFatal(e?.message || 'Unknown error');
              return null;
            }
          })}
        </div>
        {!loading && trades.length === 0 && (
          <div style={{textAlign:'center', padding:20, fontSize:12, opacity:.7}}>No trades found.</div>
        )}
        <div style={{display:'flex', gap:12}}>
          <button onClick={prev} disabled={page===0 || loading}>Prev</button>
          <button onClick={next} disabled={loading || trades.length < PAGE_SIZE}>Next</button>
          <span style={{fontSize:12, opacity:.6}}>{page+1}</span>
        </div>
      </div>
      {selected && <JournalDetail trade={selected} onClose={()=>setSelected(null)} />}
      {editingTrade && (
        <EditTradeModal
          trade={editingTrade}
          onClose={()=>setEditingTrade(null)}
          onSaved={()=>{ setEditingTrade(null); /* trigger refetch */ }}
        />
      )}
    </div>
  );
}

function JournalCard({ trade, onView, onEdit }: { trade:any; onView:()=>void; onEdit:()=>void }){
  const d = deriveFromFills(trade);
  const dateForCard = d.firstEntryTime ? d.firstEntryTime : trade.entryTime;
  return (
    <div className='trade-card' style={{display:'grid', gap:8}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
        <div style={{display:'flex', flexDirection:'column'}}>
          <div style={{fontWeight:700, fontSize:16}}>{trade.symbol}</div>
          <div style={{fontSize:12, opacity:.8}}>{dayjs(dateForCard).format('MMM D, YYYY')}</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={onView}>View</button>
          <button onClick={onEdit}>Edit</button>
        </div>
      </div>

      <div style={{display:'flex', gap:12, fontSize:12}}>
        <span>R: {trade.metrics?.R != null ? Number(trade.metrics.R).toFixed(2) : '-'}</span>
        <span className={trade.pnl > 0 ? 'pnl-pos' : trade.pnl < 0 ? 'pnl-neg' : ''}>PnL: {trade.pnl != null ? Number(trade.pnl).toFixed(2) : '-'}</span>
        <span>Qty: {d.qtyEntry != null ? d.qtyEntry : (trade.size ?? '-')}</span>
      </div>

      <div>
  <div style={{fontSize:12}}>Strategy: {typeof trade.strategy === 'object' && trade.strategy !== null ? (trade.strategy.name || '-') : (trade.strategyMeta?.name || trade.strategy || '-')}</div>
        {trade.notes && <div style={{fontSize:12, opacity:0.9, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{trade.notes}</div>}
        {trade.tags?.length ? (
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {trade.tags.map((tg:any)=> <span key={tg.id} className='tag-chip'>{tg.name}</span>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TagEditorInline({ tradeId, initialTags, onChange }: { tradeId:string; initialTags:any[]; onChange:()=>void }){
  const api = useApi();
  const [tags, setTags] = useState<any[]>(initialTags);
  const [value, setValue] = useState('');
  useEffect(()=>{ setTags(initialTags); }, [initialTags]);
  async function add(){
    if (!value.trim()) return;
    try { await api.post(`/trades/${tradeId}/tags`, { name: value.trim() }); setValue(''); await onChange(); }
    catch {}
  }
  async function remove(tagId: string){
    try { await api.delete(`/trades/${tradeId}/tags/${tagId}`); await onChange(); }
    catch {}
  }
  return (
    <div style={{display:'grid', gap:6}}>
      <div style={{fontSize:12, opacity:.7}}>Tags</div>
      <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
        {tags.map(tg => (
          <span key={tg.id} className='tag-chip' style={{display:'inline-flex', alignItems:'center', gap:6}}>
            {tg.name}
            <button type='button' style={{background:'transparent', fontSize:10}} onClick={()=>remove(tg.id)}>x</button>
          </span>
        ))}
      </div>
      <div style={{display:'flex', gap:6}}>
        <input placeholder='Add tag' value={value} onChange={e=>setValue(e.target.value)} />
        <button type='button' onClick={add}>Add</button>
      </div>
    </div>
  );
}

import { createPortal } from 'react-dom';

function JournalDetail({ trade, onClose }: { trade:any; onClose:()=>void }){
  const derived = deriveFromFills(trade);
  const api = useApi();
  const [attachments, setAttachments] = useState<any[]>(Array.isArray(trade.attachments) ? trade.attachments : []);
  const [closing, setClosing] = useState(false);
  const handleClose = () => {
    if (closing) return; setClosing(true); setTimeout(onClose, 180);
  };
  useEffect(()=>{
    // ensure we have latest attachments
    (async()=>{
      try {
        const r = await api.get('/attachments', { params: { tradeId: trade.id } });
        setAttachments(r.data || []);
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id]);
  function isImage(url: string){ return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url); }
  function fileName(url: string){ try { const u = new URL(`http://x${url}`.replace('http://x/','http://x')); return u.pathname.split('/').pop() || 'file'; } catch { return url.split('/').pop() || 'file'; } }
  const overlay = (
    <div className={`modal-overlay-view ${closing ? 'closing' : ''}`} onClick={handleClose}>
      <ModalContainer onClose={handleClose} labelledById="journal-detail-title" className={`modal ${closing ? 'closing' : ''}`}>
        <div className='modal-scroll'>
        <div className='modal-header' style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 id='journal-detail-title' style={{margin:0}}>{trade.symbol}</h3>
          <button onClick={handleClose}>Close</button>
        </div>
        <div style={{marginBottom:12}}>
          <TradeChart trade={trade} height={260} />
        </div>
        <div style={{display:'grid', gap:8}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:12}}>
            <Metric label='Entry' value={derived.avgEntry != null ? Number(derived.avgEntry).toFixed(2) : '-'} />
            <Metric label='Exit' value={derived.avgExit != null ? Number(derived.avgExit).toFixed(2) : '-'} />
            <Metric label='Qty' value={derived.qtyEntry != null ? derived.qtyEntry : (trade.size ?? '-')} />
            <Metric label='R' value={trade.metrics?.R != null ? trade.metrics.R.toFixed(2) : '-'} />
            <Metric label='PnL' value={trade.pnl != null ? trade.pnl.toFixed(2) : '-'} />
            <Metric label='Hold' value={trade.holdTimeSeconds ? formatHold(trade.holdTimeSeconds) : '-'} />
            <Metric label='Fees' value={trade.fees != null ? Number(trade.fees).toFixed(2) : '0.00'} />
          </div>
          <Metric label='Strategy' value={typeof trade.strategy === 'object' && trade.strategy !== null ? (trade.strategy.name || '-') : (trade.strategyMeta?.name || trade.strategy || '-')} />
          {trade.tags?.length ? (
            <div>
              <div style={{fontSize:12, opacity:0.7, marginBottom:4}}>Tags</div>
              <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                {trade.tags.map((tg:any)=> <span key={tg.id} className='tag-chip'>{tg.name}</span>)}
              </div>
            </div>
          ) : null}
          {trade.notes && (
            <div>
              <div style={{fontSize:12, opacity:0.7, marginBottom:4}}>Notes</div>
              <div style={{whiteSpace:'pre-wrap'}}>{trade.notes}</div>
            </div>
          )}
          <div>
            <div style={{fontSize:12, opacity:0.7, marginBottom:4}}>Attachments</div>
            {attachments.length ? (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:8}}>
                  {attachments.map(att => (
                    <div key={att.id} style={{background:'rgba(255,255,255,0.06)', borderRadius:6, padding:6, display:'grid', gap:6, alignItems:'center', justifyItems:'center'}}>
                      {isImage(att.url) ? (
                        <a href={`${API_BASE.replace(/\/api$/, '')}${att.url}`} target='_blank' rel='noreferrer' style={{display:'block', width:'100%'}}>
                          <img src={`${API_BASE.replace(/\/api$/, '')}${att.url}`} alt={fileName(att.url)} style={{width:'100%', height:100, objectFit:'cover', borderRadius:4}} />
                        </a>
                      ) : (
                        <a href={`${API_BASE.replace(/\/api$/, '')}${att.url}`} target='_blank' rel='noreferrer' style={{fontSize:12, wordBreak:'break-all'}}>Download {fileName(att.url)}</a>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{fontSize:12, opacity:0.6}}>No attachments</div>
            )}
          </div>
        </div>
        </div>
      </ModalContainer>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

function EditTradeModal({ trade, onClose, onSaved }: { trade:any; onClose:()=>void; onSaved:()=>void }){
  const api = useApi();
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [accounts, setAccounts] = useState<any[]|null>(null);
  const [form, setForm] = useState({
    direction: (trade.direction as 'LONG'|'SHORT') || 'LONG',
    strategy: trade.strategy || '',
    notes: trade.notes || '',
    confidence: trade.confidence ?? 50,
    stopPrice: trade.stopPrice != null ? String(trade.stopPrice) : '',
    targetPrice: trade.targetPrice != null ? String(trade.targetPrice) : '',
    symbol: trade.symbol,
    fees: trade.fees != null ? String(trade.fees) : '',
  });
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategyId, setStrategyId] = useState<string | ''>(trade.strategyId || '');
  const [rPreview, setRPreview] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [fills, setFills] = useState<any[]>([]);
  const [newFill, setNewFill] = useState<{ type: 'ENTRY'|'EXIT'; size: string; price: string; time: string }>({ type: 'ENTRY', size: '', price: '', time: dayjs().format('YYYY-MM-DDTHH:mm') });

  useEffect(()=>{
    // Load accounts once to read default fees for autofill
    (async ()=>{
      try { const r = await api.get('/accounts'); setAccounts(r.data || []); } catch {}
      try { const s = await api.get('/strategies'); setStrategies(s.data || []); } catch {}
    })();
  }, []);

  // Fees are auto-calculated on the server based on account settings and fills.

  // Preview R based on fills (weighted ENTRY avg) + stop/target
  useEffect(()=>{
    const s = Number(form.stopPrice);
    const t = Number(form.targetPrice);
    if (!fills.length || !s || !t) { setRPreview(null); return; }
    const entries = fills.filter((f:any)=> f.type==='ENTRY');
    if (!entries.length) { setRPreview(null); return; }
    const qty = entries.reduce((sum:number,f:any)=> sum + Number(f.size||0), 0);
    if (!qty) { setRPreview(null); return; }
    const wEntry = entries.reduce((sum:number,f:any)=> sum + Number(f.price)*Number(f.size), 0) / qty;
    const risk = Math.abs(wEntry - s) * qty;
    const reward = Math.abs(t - wEntry) * qty;
    const R = risk ? (reward / risk).toFixed(2) : null;
    setRPreview(R);
  }, [fills, form.stopPrice, form.targetPrice]);

  useEffect(()=>{ (async()=>{ try { const r = await api.get('/attachments', { params: { tradeId: trade.id } }); setAttachments(r.data || []); } catch {} })(); }, [trade.id]);
  useEffect(()=>{ (async()=>{ try { const r = await api.get(`/trades/${trade.id}/fills`); setFills(r.data || []); } catch {} })(); }, [trade.id]);

  function update<K extends keyof typeof form>(k: K, v: any){ setForm(f=>({...f, [k]: v})); }

  async function save(){
    setSaving(true);
    try{
  const payload:any = {
    symbol: form.symbol,
    direction: form.direction,
    strategy: form.strategy,
    strategyId: strategyId || null,
    notes: form.notes,
    confidence: Number(form.confidence),
    stopPrice: form.stopPrice ? Number(form.stopPrice) : null,
    targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
  };
      await api.patch(`/trades/${trade.id}`, payload);
      onSaved();
    }catch{
      // ignore
    } finally {
      setSaving(false);
    }
  }
  async function addFill(){
    if (!newFill.size || !newFill.price) return;
    try {
      const body = { type: newFill.type, size: Number(newFill.size), price: Number(newFill.price), time: dayjs(newFill.time).toISOString() };
      await api.post(`/trades/${trade.id}/fills`, body);
      const r = await api.get(`/trades/${trade.id}/fills`);
      setFills(r.data || []);
      setNewFill({ type: 'ENTRY', size: '', price: '', time: dayjs().format('YYYY-MM-DDTHH:mm') });
    } catch {}
  }

  async function deleteFill(id: string){
    if (!confirm('Delete this fill?')) return;
    try { await api.delete(`/trades/fills/${id}`); setFills(fs => fs.filter(f=> f.id !== id)); } catch {}
  }

  async function uploadAttachment(){
    if (!attachFiles.length) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append('tradeId', trade.id);
      for (const f of attachFiles) fd.append('file', f);
      await api.post('/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const r = await api.get('/attachments', { params: { tradeId: trade.id } }); setAttachments(r.data || []);
      setAttachFiles([]);
    } catch { /* ignore */ } finally { setUploading(false); }
  }

  async function deleteAttachment(id: string){
    if (!confirm('Delete attachment?')) return;
    try { await api.delete(`/attachments/${id}`); setAttachments(a=> a.filter(x=> x.id !== id)); } catch {}
  }

  const handleClose = () => {
    if (closing) return; setClosing(true); setTimeout(onClose, 180);
  };
  const overlay = (
    <div className={`modal-overlay-edit ${closing ? 'closing' : ''}`} onClick={handleClose}>
      <ModalContainer onClose={handleClose} labelledById='edit-trade-title' className={`modal ${closing ? 'closing' : ''}`}>
        <div className='modal-scroll'>
          <div className='modal-header' style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h3 id='edit-trade-title' style={{margin:0}}>Edit {trade.symbol}</h3>
            <div style={{display:'flex', gap:8}}>
              <button onClick={handleClose}>Close</button>
            </div>
          </div>
          <div className='trade-form-grid'>
            {/* Symbol */}
            <label className='form-field span-2'>
              <span>Symbol</span>
              <SymbolAutocomplete value={form.symbol} onChange={v=>update('symbol', v)} />
            </label>
            {/* Direction */}
            <label className='form-field span-2'>
              <span>Direction</span>
              <div className='segmented direction-segmented'>
                <button type='button' onClick={()=>update('direction','LONG')} className={`dir-btn long ${form.direction==='LONG'?'active':''}`}>Long</button>
                <button type='button' onClick={()=>update('direction','SHORT')} className={`dir-btn short ${form.direction==='SHORT'?'active':''}`}>Short</button>
              </div>
            </label>
            {/* Helper: convert legacy to fills */}
            {(!fills.length) && (
              <div className='helper-text span-2'>
                No fills yet. You can convert legacy entry/exit into fills.
                <div style={{marginTop:8}}>
                  <button type='button' onClick={async()=>{
                    try {
                      const batch:any[] = [];
                      if (trade.size && trade.entryPrice) batch.push({ type:'ENTRY', size: Number(trade.size), price: Number(trade.entryPrice), time: dayjs(trade.entryTime).toISOString() });
                      if (trade.exitPrice && trade.exitTime) batch.push({ type:'EXIT', size: Number(trade.size), price: Number(trade.exitPrice), time: dayjs(trade.exitTime).toISOString() });
                      if (!batch.length) return;
                      await api.post(`/trades/${trade.id}/fills`, batch);
                      const r = await api.get(`/trades/${trade.id}/fills`);
                      setFills(r.data || []);
                    } catch {}
                  }}>Convert legacy entry/exit to fills</button>
                </div>
              </div>
            )}
            {/* Strategy */}
            <label className='form-field'>
              <span>Strategy</span>
              <select value={strategyId} onChange={e=> setStrategyId(e.target.value)}>
                <option value=''>None</option>
                {strategies.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {/* Confidence */}
            <label className='form-field'>
              <span>Confidence: {form.confidence}%</span>
              <input type='range' min={0} max={100} value={form.confidence} onChange={e=>update('confidence', Number(e.target.value))} />
            </label>
            {/* Notes */}
            <textarea className='span-2' placeholder='Notes' rows={4} value={form.notes} onChange={e=>update('notes', e.target.value)} />
            {/* Stop/Target */}
            <input placeholder='Stop Price' value={form.stopPrice} onChange={e=>update('stopPrice', e.target.value)} />
            <input placeholder='Target Price' value={form.targetPrice} onChange={e=>update('targetPrice', e.target.value)} />
            <div className='helper-text'>R preview: {rPreview ?? '-'}</div>
            {/* Setup Mode removed */}
            {/* Tags */}
            <div className='span-2'>
              <TagEditorInline tradeId={trade.id} initialTags={trade.tags || []} onChange={onSaved} />
            </div>
            {/* Fills */}
            <div className='span-2' style={{display:'grid', gap:6}}>
              <div className='fills-header'>Fills (overrides single entry/exit fields)</div>
              {fills.length ? (
                <div className='fills-list'>
                  {fills.map(f => (
                    <div key={f.id} className='fill-row'>
                      <span className={`tag-chip ${f.type==='ENTRY'?'type-entry':'type-exit'}`} style={{justifySelf:'start'}}>{f.type}</span>
                      <span className='fill-cell'>Size: {Number(f.size)}</span>
                      <span className='fill-cell'>Price: {Number(f.price).toFixed(2)}</span>
                      <span className='fill-cell'>{dayjs(f.time).format('YYYY-MM-DD HH:mm')}</span>
                      <button type='button' className='icon-btn danger' onClick={()=>deleteFill(f.id)}>✕</button>
                    </div>
                  ))}
                </div>
              ) : <div style={{fontSize:11, opacity:.6}}>No fills</div>}
              <div className='fill-input-row'>
                <select value={newFill.type} onChange={e=> setNewFill(n=> ({ ...n, type: e.target.value as any }))}>
                  <option value='ENTRY'>Entry</option>
                  <option value='EXIT'>Exit</option>
                </select>
                <input placeholder='Size' value={newFill.size} onChange={e=> setNewFill(n=> ({ ...n, size: e.target.value }))} />
                <input placeholder='Price' value={newFill.price} onChange={e=> setNewFill(n=> ({ ...n, price: e.target.value }))} />
                <input type='datetime-local' value={newFill.time} onChange={e=> setNewFill(n=> ({ ...n, time: e.target.value }))} />
                <button type='button' onClick={addFill}>Add</button>
              </div>
            </div>
            {/* Attachments */}
            <div className='span-2' style={{display:'grid', gap:6}}>
              <div style={{fontSize:12, opacity:.7}}>Attachments</div>
              {attachments.length ? (
                <div style={{display:'grid', gap:4}}>
                  {attachments.map(att => (
                    <div key={att.id} style={{display:'flex', alignItems:'center', gap:8}}>
                      <a href={`${API_BASE.replace(/\/api$/, '')}${att.url}`} target='_blank' rel='noreferrer' style={{fontSize:11}}>Attachment</a>
                      <button type='button' style={{background:'transparent', color:'var(--danger)', fontSize:10}} onClick={()=>deleteAttachment(att.id)}>✕</button>
                    </div>
                  ))}
                </div>
              ) : <div style={{fontSize:11, opacity:.6}}>No attachments</div>}
              <div style={{display:'grid', gap:6}}>
                <div style={{display:'flex', gap:6, alignItems:'center'}}>
                  <input type='file' multiple onChange={e=> setAttachFiles(Array.from(e.target.files || []))} />
                  <button type='button' disabled={!attachFiles.length || uploading} onClick={uploadAttachment}>{uploading ? 'Uploading...' : 'Upload'}</button>
                </div>
                {attachFiles.length > 0 && (
                  <div style={{display:'flex', flexWrap:'wrap', gap:6, fontSize:11, opacity:.8}}>
                    {attachFiles.map(f => <span key={f.name}>{f.name}</span>)}
                  </div>
                )}
              </div>
            </div>
            {/* Actions */}
            <div className='actions span-2'>
              <button onClick={save} disabled={saving}>Save</button>
              <button onClick={handleClose} type='button'>Cancel</button>
              <button style={{marginLeft:'auto', background:'#3b0b0b'}} onClick={async()=>{
                if (!confirm('Delete this trade? You can restore it from Recently Deleted.')) return;
                try { await api.delete(`/trades/${trade.id}`); onSaved(); }
                catch {}
              }}>Delete Trade</button>
            </div>
          </div>
        </div>
      </ModalContainer>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}

function Metric({ label, value }: { label:string; value:any }){
  return (
    <div>
      <div style={{fontSize:11, opacity:.7}}>{label}</div>
      <div style={{fontWeight:600}}>{value}</div>
    </div>
  );
}

function isFuturesSymbol(sym: string){ return /=F$/i.test((sym||'').trim()); }
function isMicroFuturesSymbol(sym: string){ const s = (sym||'').trim().toUpperCase(); return isFuturesSymbol(s) && s.startsWith('M'); }
function computeDefaultFeeForSymbol(sym: string, account: any){
  if (!account) return null;
  if (!isFuturesSymbol(sym)) return null;
  const isMicro = isMicroFuturesSymbol(sym);
  if (isMicro && account.defaultFeePerMicroContract != null) return Number(account.defaultFeePerMicroContract);
  if (!isMicro && account.defaultFeePerMiniContract != null) return Number(account.defaultFeePerMiniContract);
  return null;
}

function formatHold(seconds: number) {
  if (seconds < 60) return seconds.toFixed(0) + 's';
  const m = Math.floor(seconds/60); const s = Math.floor(seconds%60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m/60); const mm = m%60;
  return `${h}h ${mm}m`;
}

// Local helper to derive weighted averages and quantities from fills (if present)
function deriveFromFills(trade: any){
  const fills = Array.isArray(trade.tradeFills) ? trade.tradeFills : trade.fills || [];
  if (!fills.length) return { avgEntry: null, avgExit: null, qtyEntry: null, firstEntryTime: null };
  const entryFills = fills.filter((f:any)=> f.type==='ENTRY');
  const exitFills = fills.filter((f:any)=> f.type==='EXIT');
  const sumQty = (arr:any[]) => arr.reduce((s,x)=> s + Number(x.size||0), 0);
  const qtyEntry = sumQty(entryFills);
  const qtyExit = sumQty(exitFills);
  const wAvg = (arr:any[]) => {
    const total = arr.reduce((s,x)=> s + Number(x.price)*Number(x.size), 0);
    const qty = sumQty(arr);
    return qty ? total/qty : null;
  };
  const avgEntry = wAvg(entryFills);
  const avgExit = wAvg(exitFills);
  const firstEntryTime = entryFills[0]?.time || null;
  return { avgEntry, avgExit, qtyEntry, qtyExit, firstEntryTime };
}
