import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import TagsPage from './TagsPage';

interface Strategy { id: string; name: string; description?: string | null; active: boolean; _count?: { trades: number; tags: number }; }

export default function StrategiesPage(){
  const api = useApi();
  const [list, setList] = useState<Strategy[]>([]);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  async function load(){ setLoading(true); try { const r = await api.get('/strategies'); setList(r.data || []); } finally { setLoading(false); } }
  useEffect(()=>{ load(); },[]);
  async function create(){ if (!name.trim()) return; const r = await api.post('/strategies', { name: name.trim(), description: desc || undefined }); setName(''); setDesc(''); setSelected(r.data); await load(); }
  return (
    <div style={{display:'grid', gap:16}}>
      <h2 style={{margin:0}}>Strategies</h2>
      <div className='glass-panel strategies-grid' style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:16}}>
        <div style={{display:'grid', gap:8}}>
          <div className='strategies-input-row' style={{display:'flex', gap:8, flexWrap:'wrap'}}>
            <input placeholder='New strategy name' value={name} onChange={e=>setName(e.target.value)} />
            <input placeholder='Description (optional)' value={desc} onChange={e=>setDesc(e.target.value)} />
            <button onClick={create}>Create</button>
          </div>
          {loading && <div>Loading...</div>}
          <div style={{display:'grid', gap:6}}>
            {list.map(s => (
              <button key={s.id} onClick={()=>setSelected(s)} className={`glass-subpanel`} style={{textAlign:'left', padding:8}}>
                <div style={{fontWeight:600}}>{s.name}</div>
                <div style={{fontSize:12, opacity:.7}}>{s.description || ''}</div>
                <div style={{fontSize:11, opacity:.6, marginTop:4}}>Trades: {s._count?.trades ?? '—'}</div>
              </button>
            ))}
            {!list.length && !loading && <div style={{fontSize:12, opacity:.7}}>No strategies yet.</div>}
          </div>
        </div>
        <div>
          {selected ? <StrategyDetail id={selected.id} onChanged={load} /> : <div style={{opacity:.7}}>Select a strategy to edit details.</div>}
        </div>
      </div>
      <div className='glass-panel'>
        <h3 style={{marginTop:0}}>Tags</h3>
        <p style={{fontSize:12, opacity:.7, marginTop:-8}}>Global trade tags moved here for organization.</p>
        <TagsPage />
      </div>
    </div>
  );
}

function StrategyDetail({ id, onChanged }: { id:string; onChanged: ()=>void }){
  const api = useApi();
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(()=>{ (async()=>{ setLoading(true); try { const r = await api.get(`/strategies/${id}`); setS(r.data); setName(r.data.name); setDesc(r.data.description||''); } finally { setLoading(false); } })(); },[id]);
  async function saveHeader(){ await api.patch(`/strategies/${id}`, { name, description: desc }); const r = await api.get(`/strategies/${id}`); setS(r.data); onChanged(); }
  if (loading) return <div>Loading...</div>;
  if (!s) return null;
  return (
    <div style={{display:'grid', gap:8}}>
      <div style={{display:'grid', gap:6}}>
        <input placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder='Description' value={desc} onChange={e=>setDesc(e.target.value)} />
        <div>
          <button onClick={saveHeader}>Save</button>
          <button style={{marginLeft:8}} onClick={async()=>{ if (!confirm('Delete strategy?')) return; await api.delete(`/strategies/${id}`); onChanged(); setS(null); }}>Delete</button>
        </div>
      </div>
      <div style={{fontSize:12, opacity:.6}}>Checklist removed; use strategies directly for tagging and analysis.</div>
    </div>
  );
}
