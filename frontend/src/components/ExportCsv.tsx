import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../apiBase';

export default function ExportCsv(){
  const { token } = useAuth();
  function download(kind: 'trades'|'transactions'){
  const url = apiUrl(`/csv/${kind}`);
    const a = document.createElement('a');
    a.href = url;
    if (token) {
      // Use fetch to include Authorization header and create blob
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const objectUrl = URL.createObjectURL(blob);
          a.href = objectUrl;
          a.download = `${kind}.csv`;
          a.click();
          URL.revokeObjectURL(objectUrl);
        });
      return;
    }
    a.download = `${kind}.csv`;
    a.click();
  }
  return (
    <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
      <button onClick={()=>download('trades')}>Export Trades CSV</button>
      <button onClick={()=>download('transactions')}>Export Transactions CSV</button>
    </div>
  );
}
