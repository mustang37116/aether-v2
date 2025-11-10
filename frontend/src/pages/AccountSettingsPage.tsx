import React, { useEffect, useState } from 'react';
import { apiUrl } from '../apiBase';
import { useApi } from '../hooks/useApi';

type AssetClass = 'STOCK' | 'OPTION' | 'FUTURE' | 'FOREX' | 'CRYPTO';

interface FeeRow { assetClass: AssetClass; mode: 'PER_CONTRACT_DOLLAR' | 'PER_CONTRACT_PERCENT'; value: number; }
interface TickerFee { id?: string; symbol: string; mode: 'PER_CONTRACT_DOLLAR' | 'PER_CONTRACT_PERCENT'; value: number; }

interface Transaction { id: string; createdAt: string; type: 'DEPOSIT'|'WITHDRAWAL'; amount: number; currency: string; }

const assetClasses: AssetClass[] = ['STOCK','OPTION','FUTURE','FOREX','CRYPTO'];

export const AccountSettingsPage: React.FC<{ accountId: string }> = ({ accountId }) => {
  const api = useApi();
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [miniFee, setMiniFee] = useState<string>('');
  const [microFee, setMicroFee] = useState<string>('');
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tickerFees, setTickerFees] = useState<TickerFee[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [txType, setTxType] = useState<'DEPOSIT'|'WITHDRAWAL'>('DEPOSIT');
  const [txAmount, setTxAmount] = useState<string>('');
  const [txCreatedAt, setTxCreatedAt] = useState<string>(() => {
    const d = new Date();
    const pad = (n:number)=> String(n).padStart(2,'0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth()+1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const MM = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${HH}:${MM}`; // datetime-local format (no seconds)
  });
  const [txMsg, setTxMsg] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
  const acct = await api.get(`/accounts/${accountId}`).then(r=>r.data);
  const r = await api.get(`/accounts/${accountId}/fees`).then(r => r.data);
        const existing: any[] = r.fees || [];
        // Load per-ticker overrides and symbol universe
        try {
          const tfRes = await api.get(`/accounts/${accountId}/ticker-fees`).then(r=>r.data);
          if (mounted) {
            setSymbols(tfRes.symbols || []);
            setTickerFees((tfRes.overrides || []).map((o:any)=>({ id:o.id, symbol:o.symbol, mode:o.mode, value:Number(o.value) })));
          }
        } catch {/* ignore */}
        const map: Record<string, any> = {};
        existing.forEach(e => { map[e.assetClass] = e; });
        const merged = assetClasses.map(ac => ({
          assetClass: ac,
          mode: map[ac]?.mode || 'PER_CONTRACT_DOLLAR',
          value: map[ac]?.value ?? 0
        }));
        if (mounted) {
          setAccount(acct);
          setMiniFee(acct.defaultFeePerMiniContract != null ? String(acct.defaultFeePerMiniContract) : '');
          setMicroFee(acct.defaultFeePerMicroContract != null ? String(acct.defaultFeePerMicroContract) : '');
          setFees(merged as FeeRow[]);
        }
        // load transactions
        try {
          const txRes = await api.get('/transactions', { params: { accountId } });
          if (mounted) setTransactions(txRes.data as Transaction[]);
        } catch {/* ignore */}
      } catch (e: any) { if (mounted) setError(e.message || 'failed to load'); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [accountId]);

  const updateRow = (idx: number, patch: Partial<FeeRow>) => {
    setFees(f => f.map((row,i) => i===idx ? { ...row, ...patch } : row));
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      // Save per-asset-class matrix
      await api.put(`/accounts/${accountId}/fees`, { fees });
      // Save mini/micro explicit defaults on account
      await api.patch(`/accounts/${accountId}`, {
        defaultFeePerMiniContract: miniFee !== '' ? Number(miniFee) : null,
        defaultFeePerMicroContract: microFee !== '' ? Number(microFee) : null,
      });
      // Save ticker fee overrides
      await api.put(`/accounts/${accountId}/ticker-fees`, { fees: tickerFees.map(tf=>({ symbol: tf.symbol, mode: tf.mode, value: tf.value })) });
      const tfRes = await api.get(`/accounts/${accountId}/ticker-fees`).then(r=>r.data);
      setTickerFees((tfRes.overrides || []).map((o:any)=>({ id:o.id, symbol:o.symbol, mode:o.mode, value:Number(o.value) })));
      // Recalculate on save
      await api.post(`/accounts/${accountId}/recalc-fees`, {});
    } catch (e: any) { setError(e.message || 'save failed'); }
    finally { setSaving(false); }
  };
  const addTickerFee = () => {
    const sym = prompt('Enter symbol (exact):');
    if (!sym) return;
    if (tickerFees.find(t=>t.symbol===sym)) return alert('Already exists');
    setTickerFees(t=>[...t,{ symbol:sym, mode:'PER_CONTRACT_DOLLAR', value:0 }]);
    if (!symbols.includes(sym)) setSymbols(s=>[...s,sym]);
  };
  const removeTickerFee = (sym:string) => {
    if (!confirm('Remove override for '+sym+'?')) return;
    setTickerFees(t=>t.filter(x=>x.symbol!==sym));
  };

  const submitTx = async () => {
    setTxMsg('');
    const amt = Number(txAmount);
    if (!amt || amt <= 0 || !account) return;
    try {
      const payload: any = { accountId, type: txType, amount: amt, currency: account.currency };
      if (txCreatedAt) {
        const dt = new Date(txCreatedAt);
        if (!isNaN(dt.getTime())) payload.createdAt = dt.toISOString();
      }
      await api.post('/transactions', payload);
      setTxMsg('Saved'); setTxAmount('');
      const txRes = await api.get('/transactions', { params: { accountId } });
      setTransactions(txRes.data as Transaction[]);
    } catch {
      setTxMsg('Failed');
    }
  };

  if (loading) return <div>Loading fees...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return <div style={{ maxWidth: 760 }}>
    <h2 style={{marginTop:0, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div>{account?.name || 'Account'} <span style={{fontSize:14, opacity:.6}}>{account?.currency}</span></div>
      {account && <button style={{background:'#3b0b0b'}} onClick={async()=>{
        if (!confirm(`Delete account "${account.name}" and all its trades & transactions? This cannot be undone.`)) return;
  const r = await fetch(apiUrl(`/accounts/${account.id}`), { method:'DELETE', headers:{ Authorization: `Bearer ${localStorage.getItem('token')||''}` }});
        if (r.ok) {
          alert('Account deleted');
          window.location.href = '/accounts';
        } else {
          alert('Delete failed');
        }
      }}>Delete Account</button>}
    </h2>
    <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
      {account && <>
        <button type='button' onClick={async()=>{
          const url = apiUrl(`/csv/trades?accountId=${account.id}`);
          const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `trades-${account.name}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}>Export Trades CSV</button>
        <button type='button' onClick={async()=>{
          const url = apiUrl(`/csv/transactions?accountId=${account.id}`);
          const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `transactions-${account.name}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}>Export Transactions CSV</button>
        <button type='button' onClick={async()=>{
          const url = apiUrl(`/csv/account-bundle?accountId=${account.id}`);
          const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
          const blob = await r.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `account-${account.name}-bundle.zip`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}>Export Account Bundle</button>
        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}>
          <span>Import Trades CSV</span>
          <input type='file' accept='.csv' onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const form = new FormData(); form.append('file', f); form.append('accountId', account.id);
            try {
              const r = await fetch(apiUrl('/csv/trades/import'), { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: form });
              const j = await r.json();
              alert(`Imported ${j.imported||0}, updated ${j.updated||0}`);
            } catch { alert('Import failed'); }
            e.target.value='';
          }} />
        </label>
        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}>
          <span>Import Topstep CSV</span>
          <input type='file' accept='.csv' onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const form = new FormData(); form.append('file', f); form.append('accountId', account.id);
            // Add explain flag so user can see per-row reasons if skips happen
            form.append('explain', 'true');
            try {
              const r = await fetch(apiUrl('/csv/topstep/import?explain=true'), { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: form });
              const j = await r.json();
              if (r.ok) {
                if (j.explain && Array.isArray(j.explain) && j.explain.length) {
                  console.log('Topstep import skip reasons:', j.explain);
                }
                alert(`Topstep import: imported ${j.imported||0} / ${j.totalRows||'?'} rows, skippedMissing ${j.skippedMissing||0}, duplicates ${j.duplicates||0}, matchedExisting ${j.matchedExisting||0}`);
              } else {
                alert(j.error || 'Import failed');
              }
            } catch { alert('Import failed'); }
            e.target.value='';
          }} />
        </label>
        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}>
          <span>Import Transactions CSV</span>
          <input type='file' accept='.csv' onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const form = new FormData(); form.append('file', f); form.append('accountId', account.id);
            try {
              const r = await fetch(apiUrl('/csv/transactions/import'), { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, body: form });
              const j = await r.json();
              alert(`Imported ${j.imported||0}, updated ${j.updated||0}`);
              const txRes = await fetch(apiUrl(`/transactions?accountId=${account.id}`), { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }});
              const txJson = await txRes.json();
              setTransactions(txJson);
            } catch { alert('Import failed'); }
            e.target.value='';
          }} />
        </label>
      </>}
    </div>
    <h3 style={{margin:'16px 0 8px'}}>Fees</h3>
    <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:8}}>
      <input type='number' step='0.01' placeholder='Futures MINI fee ($/contract)' value={miniFee} onChange={e=>setMiniFee(e.target.value)} />
      <input type='number' step='0.01' placeholder='Futures MICRO fee ($/contract)' value={microFee} onChange={e=>setMicroFee(e.target.value)} />
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Asset Class</th>
          <th style={{ textAlign: 'left' }}>Mode</th>
          <th style={{ textAlign: 'left' }}>Value</th>
        </tr>
      </thead>
      <tbody>
        {fees.map((row, idx) => <tr key={row.assetClass}>
          <td>{row.assetClass}</td>
          <td>
            <select value={row.mode} onChange={e => updateRow(idx, { mode: e.target.value as any })}>
              <option value="PER_CONTRACT_DOLLAR">Dollar / contract-share</option>
              <option value="PER_CONTRACT_PERCENT">Percent of notional</option>
            </select>
          </td>
          <td>
            <input type="number" step={row.mode === 'PER_CONTRACT_PERCENT' ? 0.0001 : 0.01} value={row.value} onChange={e => updateRow(idx, { value: parseFloat(e.target.value) || 0 })} />
          </td>
        </tr>)}
      </tbody>
    </table>
    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
      <button disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save & Recalc'}</button>
      {account && <button type='button' onClick={async()=>{
        try {
          const r = await api.post(`/accounts/${account.id}/recalc-fees`,{}).then(r=>r.data);
          alert(`Recalculated fees on ${r.updated} trades`);
        } catch(e:any){ alert('Recalc failed: '+(e.message||'unknown')); }
      }}>Recalculate Fees</button>}
    </div>
    <p style={{ fontSize: 12, color: '#666' }}>
      Fee precedence: Ticker Override &gt; Futures Mini/Micro Defaults (round-trip realized contracts) &gt; Asset-Class Matrix. Dollar (contract/share) for non-futures counts sides; futures defaults/ticker dollar overrides are round-trip only on realized quantity. Percent applies per side on notional.
    </p>

    <h3 style={{margin:'24px 0 8px'}}>Per-Ticker Overrides</h3>
    <p style={{fontSize:12, color:'#666', marginTop:0}}>Overrides take precedence over mini/micro defaults and asset-class matrix. Leave a row at 0 to effectively disable it (or remove).</p>
    <div style={{marginBottom:8}}>
      <button type='button' onClick={addTickerFee}>Add Symbol Override</button>
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom:12 }}>
      <thead>
        <tr>
          <th style={{textAlign:'left'}}>Symbol</th>
          <th style={{textAlign:'left'}}>Mode</th>
          <th style={{textAlign:'left'}}>Value</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tickerFees.map(tf => (
          <tr key={tf.symbol}>
            <td>{tf.symbol}</td>
            <td>
              <select value={tf.mode} onChange={e=>setTickerFees(list=>list.map(x=>x.symbol===tf.symbol?{...x, mode:e.target.value as any}:x))}>
                <option value='PER_CONTRACT_DOLLAR'>Dollar / contract</option>
                <option value='PER_CONTRACT_PERCENT'>Percent notional</option>
              </select>
            </td>
            <td><input type='number' step={tf.mode==='PER_CONTRACT_PERCENT'?0.0001:0.01} value={tf.value} onChange={e=>setTickerFees(list=>list.map(x=>x.symbol===tf.symbol?{...x, value: Number(e.target.value)||0}:x))} /></td>
            <td><button style={{fontSize:12}} onClick={()=>removeTickerFee(tf.symbol)}>✕</button></td>
          </tr>
        ))}
        {!tickerFees.length && <tr><td colSpan={4}><i>No overrides</i></td></tr>}
      </tbody>
    </table>
    {symbols.length > 0 && (
      <details style={{marginBottom:16}}>
        <summary style={{cursor:'pointer'}}>Discovered Symbols ({symbols.length})</summary>
        <div style={{fontSize:12, display:'flex', flexWrap:'wrap', gap:6, marginTop:6}}>
          {symbols.map(s => <span key={s} style={{padding:'2px 6px', border:'1px solid #333', borderRadius:4}}>{s}</span>)}
        </div>
      </details>
    )}

    <h3 style={{margin:'24px 0 8px'}}>Transactions</h3>
    {txMsg && <div style={{marginBottom:8, color: txMsg==='Saved' ? '#9ae6b4' : '#f56565'}}>{txMsg}</div>}
    <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
      <select value={txType} onChange={e=>setTxType(e.target.value as any)}>
        <option value='DEPOSIT'>Deposit</option>
        <option value='WITHDRAWAL'>Withdrawal</option>
      </select>
      <input type='number' placeholder='Amount' value={txAmount} onChange={e=>setTxAmount(e.target.value)} />
      <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}>
        <span>Date</span>
        <input type='datetime-local' value={txCreatedAt} onChange={e=>setTxCreatedAt(e.target.value)} />
      </label>
      <button type='button' onClick={submitTx} disabled={!txAmount}>Save</button>
    </div>
    <table style={{width:'100%', marginTop:12}} className='trade-table'>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Currency</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {transactions.map(tx => <tr key={tx.id}>
          <td>{new Date(tx.createdAt).toLocaleString()}</td>
          <td>{tx.type}</td>
          <td>{Number(tx.amount).toFixed(2)}</td>
          <td>{tx.currency}</td>
          <td><button style={{fontSize:12}} onClick={async()=>{
            if (!confirm('Delete this transaction?')) return;
            await fetch(apiUrl(`/transactions/${tx.id}`), { method:'DELETE', headers:{ Authorization: `Bearer ${localStorage.getItem('token')||''}` }});
            setTransactions(t => t.filter(x => x.id !== tx.id));
          }}>✕</button></td>
        </tr>)}
        {!transactions.length && (
          <tr><td colSpan={5}><i>No transactions</i></td></tr>
        )}
      </tbody>
    </table>
  </div>;
};

export default AccountSettingsPage;
