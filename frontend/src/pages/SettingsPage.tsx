import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

export default function SettingsPage(){
  const api = useApi();
  const { applyTheme } = useAuth();
  // Theme options (keys must match CSS .theme-* classes)
  const themeOptions = ['aurora','solar','emerald','amethyst','ocean','mono'];
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [favoriteAccountId, setFavoriteAccountId] = useState<string>('');
  const [defaultChartInterval, setDefaultChartInterval] = useState<'1d'|'1h'|'15m'>('1d');
  const [defaultChartWindowDays, setDefaultChartWindowDays] = useState<number>(30);
  const [theme, setTheme] = useState<string>('aurora');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(()=>{
    (async () => {
      const [s, a] = await Promise.all([ api.get('/settings'), api.get('/accounts') ]);
      const settings = s.data.settings || {};
      setBaseCurrency(s.data.baseCurrency || 'USD');
      setFavoriteAccountId(settings.favoriteAccountId || '');
      if (settings.defaultChartInterval) setDefaultChartInterval(settings.defaultChartInterval);
      if (settings.defaultChartWindowDays) setDefaultChartWindowDays(settings.defaultChartWindowDays);
      if (settings.theme) { setTheme(settings.theme); }
      setAccounts(a.data);
    })();
  },[]);

  async function save(){
    setSaving(true); setMsg('');
    try {
      await api.put('/settings', {
        baseCurrency,
        favoriteAccountId: favoriteAccountId || null,
        defaultChartInterval,
        defaultChartWindowDays,
        theme
      });
      setMsg('Saved');
    } catch {
      setMsg('Failed to save');
    } finally { setSaving(false); }
    // Apply immediately for live preview
    try { (await import('../context/AuthContext')); } catch {}
    const root = document.documentElement;
    root.className = root.className.split(/\s+/).filter(c => !c.startsWith('theme-')).join(' ').trim();
    if (theme) root.classList.add(`theme-${theme}`);
  }

  return (
    <div>
      <h2>Settings</h2>
      {msg && <div style={{marginBottom:8}}>{msg}</div>}
      <div className='glass-subpanel' style={{padding:12, display:'grid', gap:12}}>
        <label style={{display:'grid', gap:4}}>
          <span>Base Currency</span>
          <select value={baseCurrency} onChange={e=>setBaseCurrency(e.target.value)}>
            <option value='USD'>USD</option>
            <option value='EUR'>EUR</option>
            <option value='GBP'>GBP</option>
          </select>
        </label>
        <label style={{display:'grid', gap:4}}>
          <span>Favorite Account</span>
          <select value={favoriteAccountId} onChange={e=>setFavoriteAccountId(e.target.value)}>
            <option value=''>None</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div style={{display:'grid', gap:8}}>
          <label style={{display:'grid', gap:4}}>
            <span>Default Chart Interval</span>
            <select value={defaultChartInterval} onChange={e=> setDefaultChartInterval(e.target.value as any)}>
              <option value='1d'>1D</option>
              <option value='1h'>1H</option>
              <option value='15m'>15M</option>
              <option value='5m'>5M</option>
            </select>
          </label>
          <label style={{display:'grid', gap:4}}>
            <span>Default Chart Window</span>
            <select value={String(defaultChartWindowDays)} onChange={e=> setDefaultChartWindowDays(Number(e.target.value))}>
              <option value='1'>1d</option>
              <option value='5'>5d</option>
              <option value='15'>15d</option>
              <option value='30'>30d</option>
              <option value='90'>90d</option>
            </select>
          </label>
          <label style={{display:'grid', gap:4}}>
            <span>Theme</span>
            <select value={theme} onChange={e=> { const t = e.target.value; setTheme(t); applyTheme(t); }}>
              {themeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span style={{fontSize:11, opacity:.55}}>Themes apply a color palette over the same glass surfaces.</span>
          </label>
        </div>
        <div>
          <button onClick={save} disabled={saving}>Save</button>
        </div>
      </div>
      <div className='glass-panel' style={{marginTop:16, padding:12}}>
        <h3 style={{marginTop:0}}>Backup</h3>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <button type='button' onClick={async()=>{
            const r = await api.get('/csv/backup', { responseType: 'blob' });
            const blob = r.data as Blob;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'backup.zip';
            a.click();
            URL.revokeObjectURL(a.href);
          }}>Export All (ZIP)</button>
          <label style={{display:'flex', alignItems:'center', gap:8}}>
            <span>Import ZIP</span>
            <input type='file' accept='.zip' onChange={async e=>{
              const f = e.target.files?.[0];
              if (!f) return;
              const form = new FormData();
              form.append('file', f);
              try {
                await api.post('/backup/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                alert('Import complete');
              } catch {
                alert('Import failed');
              }
            }} />
          </label>
        </div>
        <p style={{fontSize:12, opacity:.7, marginTop:8}}>Backup includes accounts, trades, transactions, tags, settings, and account fees.</p>
      </div>
    </div>
  );
}
