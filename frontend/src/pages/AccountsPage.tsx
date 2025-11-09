import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

export default function AccountsPage() {
  const api = useApi();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  // Fee settings moved to Account Settings page for cohesion
  // Transactions moved to AccountSettingsPage
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Removed txs state

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get('/accounts');
        if (!mounted) return;
        setAccounts(res.data);
        // No transaction preloading now
      } catch (e: any) {
        if (!mounted) return;
        if (e?.response?.status === 401) {
          setError('Not authenticated. Go to Auth page (/auth), register or login, then return here.');
        } else {
          setError('Failed to load accounts. Check backend is running on http://localhost:4000.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function create() {
    if (!name) return;
    try {
      const payload:any = { name, currency };
      const res = await api.post('/accounts', payload);
      setAccounts(a => [...a, res.data]);
      setName('');
    } catch (e: any) {
      if (e?.response?.status === 401) {
        setError('Not authenticated. Please login first.');
      } else {
        setError('Account creation failed.');
      }
    }
  }

  // loadTx removed

  return (
    <div>
      <h2>Accounts</h2>
      {loading && <div>Loading...</div>}
      {error && <div style={{background:'#fff3cd', padding:8, border:'1px solid #ffeeba'}}>{error}</div>}
      {!loading && !error && accounts.length === 0 && (
        <div style={{background:'#eef', padding:8}}>No accounts yet. Create your first one below.</div>
      )}
      <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
        <input placeholder='Name' value={name} onChange={e => setName(e.target.value)} />
        <select value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value='USD'>USD</option>
          <option value='EUR'>EUR</option>
          <option value='GBP'>GBP</option>
        </select>
        <button type='button' onClick={create} disabled={!name}>Create</button>
      </div>
      <ul style={{marginTop:16, listStyle:'none', padding:0}}>
        {accounts.map(a => <li key={a.id} style={{marginBottom:6}}>
          <a href={`/accounts/${a.id}/settings`} style={{
            display:'block',
            padding:'8px 12px',
            background:'rgba(255,255,255,0.06)',
            borderRadius:6,
            textDecoration:'none',
            color:'inherit'
          }}>
            <strong>{a.name}</strong> <span style={{opacity:.7}}>({a.currency})</span>
            { (a.defaultFeePerMiniContract || a.defaultFeePerMicroContract) && (
              <span style={{marginLeft:8, fontSize:12, opacity:.6}}>
                {a.defaultFeePerMiniContract ? `Mini $${Number(a.defaultFeePerMiniContract).toFixed(2)}` : ''}
                {a.defaultFeePerMiniContract && a.defaultFeePerMicroContract ? ' · ' : ''}
                {a.defaultFeePerMicroContract ? `Micro $${Number(a.defaultFeePerMicroContract).toFixed(2)}` : ''}
              </span>
            )}
          </a>
        </li>)}
      </ul>

      {/* Transaction UI removed; now accessible within per-account settings page */}
    </div>
  );
}
