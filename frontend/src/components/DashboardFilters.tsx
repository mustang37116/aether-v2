import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import './DashboardFilters.css';

export interface Filters { accountId?: string; start?: string; end?: string; }

export default function DashboardFilters({ value, onChange }: { value: Filters; onChange: (v: Filters)=>void }){
  const api = useApi();
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(()=>{ api.get('/accounts').then(r=>setAccounts(r.data)).catch(()=>{}); },[]);

  return (
    <div className='filter-bar'>
      <div className='filter-scroll'>
        <div className='filter-group'>
          <label className='filter-item'>
            <span className='filter-label'>Account</span>
            <select value={value.accountId || ''} onChange={e=>onChange({ ...value, accountId: e.target.value || undefined })}>
              <option value=''>All</option>
              {accounts.map((a:any)=> <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className='filter-item'>
            <span className='filter-label'>Start</span>
            <input type='date' value={value.start || ''} onChange={e=>onChange({ ...value, start: e.target.value || undefined })} />
          </label>
          <label className='filter-item'>
            <span className='filter-label'>End</span>
            <input type='date' value={value.end || ''} onChange={e=>onChange({ ...value, end: e.target.value || undefined })} />
          </label>
          {/* Clear button removed per request */}
        </div>
      </div>
    </div>
  );
}
