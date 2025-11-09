import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

export default function TagsPage(){
  const api = useApi();
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  useEffect(()=>{ api.get('/tags').then(r=>setTags(r.data)); },[]);
  async function create(){
    const res = await api.post('/tags', { name });
    setTags(t=>[...t,res.data]);
    setName('');
  }
  async function rename(id: string){
    const res = await api.put(`/tags/${id}`, { name: editName });
    setTags(ts => ts.map(t => t.id===id ? res.data : t));
    setEditId(null); setEditName('');
  }
  async function remove(id: string){
    await api.delete(`/tags/${id}`);
    setTags(ts => ts.filter(t => t.id!==id));
  }
  async function merge(){
    const ids = Object.keys(selected).filter(k=>selected[k]);
    if (ids.length < 2) return; // need at least one source and one target
    const targetId = ids[0];
    const sourceIds = ids.slice(1);
    await api.post('/tags/merge', { targetId, sourceIds });
    // Refresh list
    const r = await api.get('/tags');
    setTags(r.data);
    setSelected({});
  }
  return <div>
    <h2>Tags</h2>
    <div style={{display:'flex', gap:8}}>
      <input placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
      <button onClick={create}>Create</button>
    </div>
    <div style={{marginTop:12, display:'grid', gap:8}}>
      {tags.map(t=> (
        <div key={t.id} className='glass-subpanel' style={{padding:8, display:'flex', alignItems:'center', gap:8}}>
          <input type='checkbox' checked={!!selected[t.id]} onChange={e=>setSelected(s=>({ ...s, [t.id]: e.target.checked }))} />
          {editId===t.id ? (
            <>
              <input value={editName} onChange={e=>setEditName(e.target.value)} />
              <button onClick={()=>rename(t.id)} disabled={!editName}>Save</button>
              <button onClick={()=>{ setEditId(null); setEditName(''); }}>Cancel</button>
            </>
          ) : (
            <>
              <div style={{flex:1}}>{t.name}</div>
              <button onClick={()=>{ setEditId(t.id); setEditName(t.name); }}>Rename</button>
              <button onClick={()=>remove(t.id)}>Delete</button>
            </>
          )}
        </div>
      ))}
    </div>
    <div style={{marginTop:12}}>
      <button onClick={merge} disabled={Object.values(selected).filter(Boolean).length < 2}>Merge selected (first is target)</button>
    </div>
  </div>;
}
