import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import dayjs from 'dayjs';
// Local copy of shared risk util vendored for container build
import { calcRiskRewardR } from '../shared/math/risk';
import SymbolAutocomplete from './SymbolAutocomplete';

export default function TradeForm() {
  const DRAFT_KEY = 'tradeDraft.v1';
  type TradeDraft = { symbol: string; direction: 'LONG'|'SHORT'; stopPrice: string; targetPrice: string; strategy: string; notes: string; confidence: number; tags: string; fills: Array<{ type:'ENTRY'|'EXIT'; size:string; price:string; time:string }> };
  const [form, setForm] = useState<TradeDraft>(() => {
    const base: TradeDraft = { symbol: '', direction: 'LONG', stopPrice: '', targetPrice: '', strategy: '', notes: '', confidence: 50, tags: '', fills: [] };
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Defensive normalization for older drafts
        return {
          ...base,
          ...parsed,
          direction: parsed.direction === 'SHORT' ? 'SHORT' : 'LONG',
          fills: Array.isArray(parsed.fills) ? parsed.fills.filter((f: any)=> f && (f.type==='ENTRY'||f.type==='EXIT') && (f.price!=null) && (f.size!=null)) : [],
        };
      }
    } catch {}
    return base;
  });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [strategyId, setStrategyId] = useState<string|undefined>(undefined);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const saveTimer = useRef<number | null>(null);
  // Load default account automatically with precedence:
  // 1) last used (localStorage)
  // 2) favorite from settings
  // 3) first account
  const api = useApi();
  useEffect(() => {
    let mounted = true;
    async function loadAccount() {
      setLoadingAccount(true);
      try {
        // Fetch accounts, settings (favorite), and strategies
        const [acctRes, settingsRes, stratRes] = await Promise.all([
          api.get('/accounts'),
          api.get('/settings').catch(()=>({ data: {} })),
          api.get('/strategies').catch(()=>({ data: [] }))
        ]);
        if (!mounted) return;
        setAccounts(acctRes.data || []);
        setStrategies(stratRes.data || []);
        const list:any[] = acctRes.data || [];
        const last = localStorage.getItem('lastAccountId');
        const fav = settingsRes.data?.favoriteAccountId;
        const exists = (id:string|null)=> !!id && list.some(a => a.id === id);
        if (exists(last)) setAccountId(last as string);
        else if (exists(fav)) setAccountId(fav as string);
        else if (list.length > 0) setAccountId(list[0].id);
      } catch (e) {
        // silently ignore for now (could surface a banner later)
      } finally {
        if (mounted) setLoadingAccount(false);
      }
    }
    loadAccount();
    return ()=> { mounted = false; };
  }, [api]);
  const [metrics, setMetrics] = useState<any>(null);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);

  function persist(next: typeof form) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch {}
  }

  function update<K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) {
    setForm(f => ({ ...f, [key]: value }));
    // debounce save
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persist({ ...form, [key]: value });
    }, 250);
  }

  // Recompute metrics whenever fills, stop or target or direction change.
  useEffect(() => {
    const { stopPrice, targetPrice, direction } = form;
    if (!stopPrice || !targetPrice) { setMetrics(null); return; }
    const entryFills = form.fills.filter(f=> f.type==='ENTRY');
    if (!entryFills.length) { setMetrics(null); return; }
    const totalQty = entryFills.reduce((s,f)=> s + Number(f.size||0), 0);
    if (totalQty <= 0) { setMetrics(null); return; }
    const weightedEntry = entryFills.reduce((s,f)=> s + Number(f.price)*Number(f.size), 0) / totalQty;
    setMetrics(calcRiskRewardR(Number(weightedEntry), Number(stopPrice), Number(targetPrice), Number(totalQty), direction));
  }, [form.fills, form.stopPrice, form.targetPrice, form.direction]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // useApi already injects Authorization header
    if (!accountId) {
      alert('Create an account first on Accounts page before adding trades.');
      return;
    }
  const payload:any = {
      accountId,
      symbol: form.symbol,
    strategyId: strategyId || undefined,
      direction: form.direction,
      stopPrice: form.stopPrice ? Number(form.stopPrice) : undefined,
      targetPrice: form.targetPrice ? Number(form.targetPrice) : undefined,
      strategy: form.strategy || undefined,
      notes: form.notes || undefined,
      confidence: form.confidence,
      tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
    };
    // Always using fills-only model; require at least one ENTRY fill.
    if (!form.fills.length || !form.fills.some(f=> f.type==='ENTRY')) {
      alert('Add at least one ENTRY fill before creating the trade.');
      return;
    }
    payload.fills = form.fills.map(f => ({ type: f.type, size: Number(f.size), price: Number(f.price), time: dayjs(f.time).toISOString() }));
  // Do not set fees from client; backend auto-calculates based on account settings and fills
    let res;
    try {
      res = await api.post('/trades', payload);
    } catch(err:any) {
      alert('Failed to create trade: ' + (err?.response?.data?.error || err.message));
      return;
    }
    // Optional attachment upload after trade creation
    try {
      if (attachFiles.length) {
        const formData = new FormData();
        formData.append('tradeId', res.data.trade.id);
        for (const f of attachFiles) formData.append('file', f);
        await api.post('/attachments', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
    } catch { /* ignore attachment failure for now */ }
    try {
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Trade Created', { body: `${res.data.trade.symbol} size ${res.data.trade.size}` });
        } else if (Notification.permission !== 'denied') {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') new Notification('Trade Created', { body: `${res.data.trade.symbol} size ${res.data.trade.size}` });
        }
      }
    } catch {}
    // Clear draft
    const now = dayjs().format('YYYY-MM-DDTHH:mm');
  const cleared: TradeDraft = { symbol: '', direction: form.direction, stopPrice: '', targetPrice: '', strategy: '', notes: '', confidence: form.confidence, tags: '', fills: [] };
    setForm(cleared);
    setAttachFiles([]);
    persist(cleared);
  }

  return (
    <form onSubmit={submit} className='glass-panel trade-form-grid'>
      <h2 style={{margin:0}}>New Trade</h2>
      {/* Row 1: Account (left) + Symbol (right) */}
      <label className='form-field'>
        <span>Account</span>
  <select value={accountId ?? ''} onChange={e => { const val = e.target.value || null; setAccountId(val); try { if (val) localStorage.setItem('lastAccountId', val); else localStorage.removeItem('lastAccountId'); } catch {} } }>
          <option value='' disabled>Select account</option>
          {accounts.map(a => (<option key={a.id} value={a.id}>{a.name || a.title || `Account ${a.id.slice(0,6)}`}</option>))}
        </select>
      </label>
      <label className='form-field'>
        <span>Symbol</span>
        <SymbolAutocomplete value={form.symbol} onChange={v=> update('symbol', v)} />
      </label>
  {loadingAccount && accounts.length === 0 && <div className='span-2'>Loading account...</div>}
      {!loadingAccount && !accountId && (
        <div className='warn span-2'>No account detected. Go to Accounts page and create one first.</div>
      )}
      {/* Row 2: Strategy full width */}
      <label className='form-field'>
        <span>Strategy</span>
        <select value={strategyId || ''} onChange={e=> setStrategyId(e.target.value || undefined)}>
          <option value=''>None</option>
          {strategies.map((s:any)=> <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {/* Row 3: Notes full width */}
      <textarea placeholder='Notes' value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} className='span-2' />
      {/* Row 4: Direction full width, then Stop/Target */}
      <label className='form-field span-2'>
        <span>Direction</span>
        <div className='segmented direction-segmented'>
          <button type='button' onClick={()=>update('direction','LONG')} className={`dir-btn long ${form.direction==='LONG'?'active':''}`}>Long</button>
          <button type='button' onClick={()=>update('direction','SHORT')} className={`dir-btn short ${form.direction==='SHORT'?'active':''}`}>Short</button>
        </div>
      </label>
      <input placeholder='Stop Price' value={form.stopPrice} onChange={e => update('stopPrice', e.target.value)} />
      <input placeholder='Target Price' value={form.targetPrice} onChange={e => update('targetPrice', e.target.value)} />
      {/* Helper text above fills */}
      <div className='helper-text span-2'>Add ENTRY fills to scale in and EXIT fills to scale out. Risk metrics use weighted ENTRY average.</div>
      {/* Fills editor (always used) */}
  <FillsEditor fills={form.fills} onChange={(fills)=>update('fills', fills as any)} disabledSymbol={!form.symbol} />
      <label className='form-field span-2'>
        <span>Attachments (optional, multi)</span>
        <input type='file' multiple onChange={e=> setAttachFiles(Array.from(e.target.files || []))} />
        {attachFiles.length > 0 && (<div className='file-list'>{attachFiles.map(f => <span key={f.name}>{f.name}</span>)}</div>)}
      </label>
      <label className='form-field'>
        <span>Confidence: {form.confidence}%</span>
        <input type='range' min={0} max={100} value={form.confidence} onChange={e => update('confidence', Number(e.target.value))} />
      </label>
  <input placeholder='Tags (comma separated)' value={form.tags} onChange={e => update('tags', e.target.value)} />
      {/* Setup Mode removed */}
      {/* Asset class selection removed; backend derives from Yahoo */}
      {metrics && (
        <div className='metrics-row span-2'>
          <Metric label='Risk' value={metrics.risk} />
          <Metric label='Reward' value={metrics.reward} />
          <Metric label='R' value={metrics.R ?? 0} precision={2} />
        </div>
      )}
      <div className='actions span-2'>
  <button type='button' onClick={() => { const cleared: TradeDraft = { symbol: '', direction: form.direction, stopPrice: '', targetPrice: '', strategy: '', notes: '', confidence: form.confidence, tags: '', fills: [] }; setForm(cleared); persist(cleared as any); setMetrics(null); }}>Clear Draft</button>
        <button type='submit'>Create Trade</button>
      </div>
    </form>
  );
}

function FillsEditor({ fills, onChange, disabledSymbol }: { fills: Array<{ type:'ENTRY'|'EXIT'; size:string; price:string; time:string }>; onChange: (fills: Array<{ type:'ENTRY'|'EXIT'; size:string; price:string; time:string }>) => void; disabledSymbol: boolean; }){
  const [draft, setDraft] = useState<{ type:'ENTRY'|'EXIT'; size:string; price:string; time:string }>({ type:'ENTRY', size:'', price:'', time: dayjs().format('YYYY-MM-DDTHH:mm') });
  function add(){ if (!draft.size || !draft.price) return; onChange([ ...fills, draft ]); setDraft({ type:'ENTRY', size:'', price:'', time: dayjs().format('YYYY-MM-DDTHH:mm') }); }
  function remove(idx: number){ const next = fills.slice(); next.splice(idx,1); onChange(next); }
  const hasFills = fills.length > 0;
  return (
    <div className='fills-editor span-2'>
      <div className='fills-header'>Fills {hasFills ? '(multi-fill)' : ''}</div>
      {hasFills && (
        <div className='fills-list'>
          {fills.map((f, i) => (
            <div key={i} className='fill-row'>
              <span className={`tag-chip type-${f.type.toLowerCase()}`}>{f.type}</span>
              <span className='fill-cell'>Size: {f.size}</span>
              <span className='fill-cell'>Price: {f.price}</span>
              <span className='fill-cell'>{dayjs(f.time).format('MM-DD HH:mm')}</span>
              <button type='button' className='icon-btn danger' onClick={()=>remove(i)} aria-label='Remove fill'>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className='fill-input-row'>
        <select value={draft.type} onChange={e=> setDraft(d=> ({ ...d, type: e.target.value as any }))}>
          <option value='ENTRY'>Entry</option>
          <option value='EXIT'>Exit</option>
        </select>
        <input placeholder='Size' value={draft.size} onChange={e=> setDraft(d=> ({ ...d, size: e.target.value }))} />
        <input placeholder='Price' value={draft.price} onChange={e=> setDraft(d=> ({ ...d, price: e.target.value }))} />
        <input type='datetime-local' value={draft.time} onChange={e=> setDraft(d=> ({ ...d, time: e.target.value }))} />
        <button type='button' onClick={add} disabled={disabledSymbol}>Add</button>
      </div>
    </div>
  );
}

// SymbolAutocomplete now a shared component

function isFuturesSymbol(sym: string){ return /=F$/i.test((sym||'').trim()); }
function isMicroFuturesSymbol(sym: string){ const s = (sym||'').trim().toUpperCase(); return isFuturesSymbol(s) && s.startsWith('M'); }
function computeDefaultFeeForSymbol(sym: string, account: any){
  if (!isFuturesSymbol(sym)) return null;
  const isMicro = isMicroFuturesSymbol(sym);
  if (isMicro && account.defaultFeePerMicroContract != null) return Number(account.defaultFeePerMicroContract);
  if (!isMicro && account.defaultFeePerMiniContract != null) return Number(account.defaultFeePerMiniContract);
  return null;
}

function Metric({ label, value, precision=2 }: { label:string; value:number; precision?:number }){
  return (
    <div className='metric-box'>
      <div className='metric-label'>{label}</div>
      <div className='metric-value'>{value.toFixed(precision)}</div>
    </div>
  );
}
