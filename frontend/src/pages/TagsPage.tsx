import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

export default function TagsPage(){
  const api = useApi();
  const [tags, setTags] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'SETUP'|'CONDITION'|'MISTAKE'|'MARKET'|'EXECUTION'|'OUTCOME'|'CUSTOM'>('CUSTOM');
  const [color, setColor] = useState<string>('#888888');
  const [parentTagId, setParentTagId] = useState<string>('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'SETUP'|'CONDITION'|'MISTAKE'|'MARKET'|'EXECUTION'|'OUTCOME'|'CUSTOM'>('CUSTOM');
  const [editColor, setEditColor] = useState<string>('#888888');
  const [editParent, setEditParent] = useState<string>('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  useEffect(()=>{ api.get('/tags').then(r=>setTags(r.data)); },[]);
  async function create(){
    const payload: any = { name };
    if (type) payload.type = type;
    if (color) payload.color = color;
    if (parentTagId) payload.parentTagId = parentTagId;
    const res = await api.post('/tags', payload);
    setTags(t=>[...t,res.data]);
    setName(''); setColor('#888888'); setType('CUSTOM'); setParentTagId('');
  }
  async function rename(id: string){
    const res = await api.put(`/tags/${id}`, { name: editName, type: editType, color: editColor, parentTagId: editParent || null });
    setTags(ts => ts.map(t => t.id===id ? res.data : t));
    setEditId(null); setEditName(''); setEditColor('#888888'); setEditType('CUSTOM'); setEditParent('');
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
    <div className='glass-subpanel' style={{display:'flex', gap:8, alignItems:'center', padding:8, flexWrap:'wrap'}}>
      <input placeholder='Name' value={name} onChange={e=>setName(e.target.value)} />
      <select value={type} onChange={e=>setType(e.target.value as any)}>
        <option value='CUSTOM'>Custom</option>
        <option value='SETUP'>Setup</option>
        <option value='CONDITION'>Condition</option>
        <option value='MISTAKE'>Mistake</option>
        <option value='MARKET'>Market</option>
        <option value='EXECUTION'>Execution</option>
        <option value='OUTCOME'>Outcome</option>
      </select>
      <label style={{display:'inline-flex', alignItems:'center', gap:6}}>
        <span style={{fontSize:12, opacity:.7}}>Color</span>
        <input type='color' value={color} onChange={e=>setColor(e.target.value)} />
      </label>
      <select value={parentTagId} onChange={e=>setParentTagId(e.target.value)}>
        <option value=''>No parent</option>
        {tags.filter(t=>t.id!==editId).map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button onClick={create} disabled={!name.trim()}>Create</button>
    </div>
    <div style={{marginTop:12, display:'grid', gap:8}}>
      {tags.map(t=> (
        <div key={t.id} className='glass-subpanel' style={{padding:8, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <input type='checkbox' checked={!!selected[t.id]} onChange={e=>setSelected(s=>({ ...s, [t.id]: e.target.checked }))} />
          {editId===t.id ? (
            <>
              <input value={editName} onChange={e=>setEditName(e.target.value)} />
              <select value={editType} onChange={e=>setEditType(e.target.value as any)}>
                <option value='CUSTOM'>Custom</option>
                <option value='SETUP'>Setup</option>
                <option value='CONDITION'>Condition</option>
                <option value='MISTAKE'>Mistake</option>
                <option value='MARKET'>Market</option>
                <option value='EXECUTION'>Execution</option>
                <option value='OUTCOME'>Outcome</option>
              </select>
              <input type='color' value={editColor} onChange={e=>setEditColor(e.target.value)} />
              <select value={editParent} onChange={e=>setEditParent(e.target.value)}>
                <option value=''>No parent</option>
                {tags.filter(x=>x.id!==t.id).map(x=> <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button onClick={()=>rename(t.id)} disabled={!editName}>Save</button>
              <button onClick={()=>{ setEditId(null); setEditName(''); }}>Cancel</button>
            </>
          ) : (
            <>
              <div style={{flex:1, display:'flex', alignItems:'center', gap:8}}>
                <span style={{display:'inline-block', width:12, height:12, borderRadius:2, background: t.color || '#888', border:'1px solid rgba(255,255,255,0.2)'}} />
                <div>{t.name} <span style={{fontSize:11, opacity:.6}}>({t.type || 'CUSTOM'})</span>{t.parentTagId ? <span style={{fontSize:11, opacity:.6}}> · child of {tags.find(x=>x.id===t.parentTagId)?.name || '—'}</span> : null}</div>
              </div>
              <button onClick={()=>{ setEditId(t.id); setEditName(t.name); setEditType(t.type || 'CUSTOM'); setEditColor(t.color || '#888888'); setEditParent(t.parentTagId || ''); }}>Edit</button>
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
