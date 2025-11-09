import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import TagsPage from './TagsPage';

interface Strategy { id: string; name: string; description?: string | null; active: boolean; _count?: { checklistItems: number; trades: number; tags: number }; }
interface Item { id: string; text: string; required: boolean; order: number; }

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
                <div style={{fontSize:11, opacity:.6, marginTop:4}}>Items: {s._count?.checklistItems ?? '—'} • Trades: {s._count?.trades ?? '—'}</div>
              </button>
            ))}
            {!list.length && !loading && <div style={{fontSize:12, opacity:.7}}>No strategies yet.</div>}
          </div>
        </div>
        <div>
          {selected ? <StrategyDetail id={selected.id} onChanged={load} /> : <div style={{opacity:.7}}>Select a strategy to edit its checklist.</div>}
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
  const [newText, setNewText] = useState('');
  const [newReq, setNewReq] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(()=>{ (async()=>{ setLoading(true); try { const r = await api.get(`/strategies/${id}`); setS(r.data); setName(r.data.name); setDesc(r.data.description||''); } finally { setLoading(false); } })(); },[id]);
  async function addItem(){ if (!newText.trim()) return; await api.post(`/strategies/${id}/items`, { text: newText.trim(), required: newReq }); setNewText(''); setNewReq(true); const r = await api.get(`/strategies/${id}`); setS(r.data); onChanged(); }
  async function saveHeader(){ await api.patch(`/strategies/${id}`, { name, description: desc }); const r = await api.get(`/strategies/${id}`); setS(r.data); onChanged(); }
  async function removeItem(itemId:string){ await api.delete(`/strategies/items/${itemId}`); const r = await api.get(`/strategies/${id}`); setS(r.data); onChanged(); }
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
      <div style={{marginTop:8}}>
        <div style={{fontWeight:600, marginBottom:6}}>Checklist</div>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <input placeholder='Checklist item' value={newText} onChange={e=>setNewText(e.target.value)} />
          <label style={{fontSize:12}}><input type='checkbox' checked={newReq} onChange={e=>setNewReq(e.target.checked)} /> Required</label>
          <button onClick={addItem}>Add</button>
        </div>
        <div style={{display:'grid', gap:6, marginTop:8}}>
          {(s.checklistItems||[]).map((it:Item)=> (
            <div key={it.id} className='glass-subpanel' style={{padding:8, display:'flex', alignItems:'center', gap:8}}>
              <span className='tag-chip'>{it.required ? 'Req' : 'Opt'}</span>
              <div style={{flex:1}}>{it.text}</div>
              <button onClick={()=>removeItem(it.id)} style={{fontSize:12}}>Delete</button>
            </div>
          ))}
          {(!s.checklistItems||!s.checklistItems.length) && <div style={{fontSize:12, opacity:.7}}>No checklist items</div>}
        </div>
      </div>
    </div>
  );
}
