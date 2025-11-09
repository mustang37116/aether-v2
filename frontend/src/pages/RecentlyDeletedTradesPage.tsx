import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import dayjs from 'dayjs';

export default function RecentlyDeletedTradesPage(){
  const api = useApi();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  async function load(){
    setLoading(true); setMsg('');
    try {
      const r = await api.get('/trades/deleted');
      setRows(r.data || []);
    } catch {
      setMsg('Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);
  async function restore(id: string){
    try { await api.post(`/trades/${id}/restore`); setRows(r => r.filter(x => x.id !== id)); }
    catch { alert('Restore failed'); }
  }
  return (
    <div>
      <h2>Recently Deleted</h2>
      {loading && <div>Loading...</div>}
      {msg && <div className='warn'>{msg}</div>}
      <table className='trade-table'>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Entry</th>
            <th>Size</th>
            <th>Deleted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.symbol}</td>
              <td>{dayjs(r.entryTime).format('YYYY-MM-DD')}</td>
              <td>{r.size}</td>
              <td>{dayjs(r.deletedAt).format('YYYY-MM-DD HH:mm')}</td>
              <td><button onClick={()=>restore(r.id)}>Restore</button></td>
            </tr>
          ))}
          {!rows.length && !loading && (
            <tr><td colSpan={5}><i>Nothing here</i></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
