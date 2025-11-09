import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';

interface ChecklistItem {
  id: string;
  text: string;
  required?: boolean;
  order: number;
}

export default function PlaybooksPage(){
  const api = useApi();
  const [playbooks, setPlaybooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selected, setSelected] = useState<any|null>(null);
  const [selectedSetup, setSelectedSetup] = useState<any|null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupDesc, setSetupDesc] = useState('');

  async function load(){
    setLoading(true); setErr('');
    try { const r = await api.get('/playbooks'); setPlaybooks(r.data||[]); }
    catch { setErr('Failed to load'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  async function createPlaybook(){
    if (!name.trim()) return;
    try { await api.post('/playbooks', { name, description: desc || undefined }); setName(''); setDesc(''); load(); }
    catch { alert('Create failed'); }
  }
  async function openPlaybook(pb:any){
    try { const r = await api.get(`/playbooks/${pb.id}`); setSelected(r.data); setSelectedSetup(null); setChecklistItems([]); }
    catch { setSelected(pb); setSelectedSetup(null); setChecklistItems([]); }
  }
  async function addSetup(){
    if (!selected || !setupName.trim()) return;
    try { await api.post(`/playbooks/${selected.id}/setups`, { name: setupName, description: setupDesc||undefined }); setSetupName(''); setSetupDesc(''); openPlaybook(selected); }
    catch { alert('Add setup failed'); }
  }
  async function deleteSetup(id:string){
    if (!confirm('Delete setup?')) return;
    try { await api.delete(`/playbooks/setups/${id}`); if (selected) openPlaybook(selected); }
    catch { alert('Delete failed'); }
  }

  async function selectSetup(setup:any){
    setSelectedSetup(setup);
    // The playbook detail API includes checklistItems already
    setChecklistItems((setup.checklistItems || []) as ChecklistItem[]);
  }

  async function addChecklistItem(){
    if (!selectedSetup || !newItemText.trim()) return;
    setSavingChecklist(true);
    try {
      await api.post(`/playbooks/setups/${selectedSetup.id}/items`, { text: newItemText.trim() });
      if (selected) await openPlaybook(selected);
      if (selected && selectedSetup) {
        const setup = (selected.setups||[]).find((s:any)=> s.id === selectedSetup.id);
        setChecklistItems((setup?.checklistItems || []) as ChecklistItem[]);
      }
      setNewItemText('');
    } catch { alert('Add item failed'); }
    finally { setSavingChecklist(false); }
  }

  async function deleteChecklistItem(id:string){
    if (!selectedSetup) return;
    try {
      await api.delete(`/playbooks/setup-items/${id}`);
      if (selected) await openPlaybook(selected);
      if (selected && selectedSetup) {
        const setup = (selected.setups||[]).find((s:any)=> s.id === selectedSetup.id);
        setChecklistItems((setup?.checklistItems || []) as ChecklistItem[]);
      }
    }
    catch { alert('Delete item failed'); }
  }
  async function deletePlaybook(id:string){
    if (!confirm('Delete playbook and its setups?')) return;
    try { await api.delete(`/playbooks/${id}`); setSelected(null); load(); }
    catch { alert('Delete failed'); }
  }

  return (
    <div className='glass-panel' style={{display:'grid', gap:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2 style={{margin:0}}>Playbooks</h2>
      </div>
      {loading && <div>Loading...</div>}
      {err && <div className='warn'>{err}</div>}
      <div style={{display:'grid', gap:8}}>
        <div style={{display:'flex', gap:6}}>
          <input placeholder='New playbook name' value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder='Description (optional)' value={desc} onChange={e=>setDesc(e.target.value)} />
          <button onClick={createPlaybook}>Add</button>
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10}}>
        {playbooks.map(pb => (
          <div key={pb.id} className='trade-card' style={{display:'grid', gap:6}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <div style={{fontWeight:700}}>{pb.name}</div>
                {pb.description && <div style={{fontSize:12, opacity:.7}}>{pb.description}</div>}
              </div>
              <div style={{display:'flex', gap:6}}>
                <button onClick={()=>openPlaybook(pb)}>Open</button>
                <button style={{background:'#3b0b0b'}} onClick={()=>deletePlaybook(pb.id)}>Delete</button>
              </div>
            </div>
            <div style={{fontSize:12, opacity:.7}}>Setups: {pb._count?.setups ?? 0}</div>
          </div>
        ))}
      </div>
      {selected && (
        <div className='glass-panel' style={{display:'grid', gap:10}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h3 style={{margin:0}}>Playbook: {selected.name}</h3>
            <button onClick={()=>setSelected(null)}>Close</button>
          </div>
          <div style={{display:'flex', gap:6}}>
            <input placeholder='New setup name' value={setupName} onChange={e=>setSetupName(e.target.value)} />
            <input placeholder='Description' value={setupDesc} onChange={e=>setSetupDesc(e.target.value)} />
            <button onClick={addSetup}>Add Setup</button>
          </div>
          <div style={{display:'grid', gap:6}}>
            {(selected.setups||[]).map((s:any)=> (
              <div key={s.id} className='trade-card' style={{display:'grid', gap:8, border: selectedSetup?.id === s.id ? '1px solid var(--accent)' : undefined}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <button onClick={()=>selectSetup(s)} style={{background:'none', border:'none', padding:0, textAlign:'left', cursor:'pointer'}}>
                    <div style={{fontWeight:600}}>{s.name}</div>
                    {s.description && <div style={{fontSize:12, opacity:.75}}>{s.description}</div>}
                  </button>
                  <div>
                    <button style={{background:'#3b0b0b'}} onClick={()=>deleteSetup(s.id)}>Delete</button>
                  </div>
                </div>
                {selectedSetup?.id === s.id && (
                  <div style={{display:'grid', gap:6}}>
                    <div style={{fontSize:12, opacity:.7}}>Checklist Items</div>
                    <div style={{display:'grid', gap:4}}>
                      {checklistItems.length ? checklistItems.slice().sort((a,b)=>a.order-b.order).map(ci => (
                        <div key={ci.id} style={{fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <span>#{ci.order} {ci.text}</span>
                          <button onClick={()=>deleteChecklistItem(ci.id)} style={{background:'none', border:'none', color:'#f55', cursor:'pointer'}} title='Delete'>&times;</button>
                        </div>
                      )) : <div style={{fontSize:12, opacity:.6}}>No checklist items yet</div>}
                    </div>
                    <div style={{display:'flex', gap:4}}>
                      <input placeholder='Checklist item text' value={newItemText} onChange={e=>setNewItemText(e.target.value)} />
                      <button disabled={savingChecklist} onClick={addChecklistItem}>{savingChecklist?'Saving...':'Add'}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
