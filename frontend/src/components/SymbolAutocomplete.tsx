import { useEffect, useRef, useState } from 'react';

export interface SymbolAutocompleteProps { value: string; onChange(v:string): void; placeholder?: string; className?: string; }
export default function SymbolAutocomplete({ value, onChange, placeholder='Symbol', className }: SymbolAutocompleteProps){
  const apiBase = 'http://localhost:4000';
  const rootRef = useRef<HTMLDivElement|null>(null);
  const inputRef = useRef<HTMLInputElement|null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController|null>(null);
  useEffect(()=>{ setQuery(value); }, [value]);
  useEffect(()=>{
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const t = setTimeout(async ()=>{
      try {
        const r = await fetch(`${apiBase}/marketdata/search?q=${encodeURIComponent(query)}`, { signal: ac.signal, headers: authHeaders() });
        if (!r.ok) throw new Error('search failed');
        const data = await r.json();
        setResults(data.quotes || []);
      } catch(e){ if ((e as any).name !== 'AbortError') console.warn(e); }
      finally { setLoading(false); }
    }, 250);
    return ()=> { clearTimeout(t); ac.abort(); };
  }, [query]);

  useEffect(()=>{
    function onDocMouseDown(ev: MouseEvent){
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return ()=> document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function authHeaders(){
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {} as any;
  }

  function pick(sym: string){
    onChange(sym);
    setQuery(sym);
    setOpen(false);
    // keep focus in input after selection
    setTimeout(()=> inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>){
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={rootRef} style={{position:'relative'}} className={className}>
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={query}
        onFocus={()=> setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={e=> { const v = e.target.value.toUpperCase(); setQuery(v); setOpen(true); onChange(v); inputRef.current?.focus(); }}
        style={{width:'100%'}}
        required
      />
      {open && (results.length > 0 || loading) && (
        <div role='listbox' style={{position:'absolute', top:'100%', left:0, right:0, zIndex:20, background:'var(--bgElevated, #1f2937)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:4, marginTop:4, maxHeight:220, overflowY:'auto', boxShadow:'0 4px 18px -2px rgba(0,0,0,0.5)'}}>
          {loading && <div style={{padding:8, fontSize:12, opacity:.7}}>Searching...</div>}
          {!loading && results.map(r=> {
            const desc = r.shortname || r.longname || r.exchDisp || r.quoteType;
            return (
              <div role='option' tabIndex={-1} key={r.symbol} onMouseDown={(e)=> e.preventDefault()} onClick={()=> pick(r.symbol)} style={{display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, width:'100%', textAlign:'left', background:'transparent', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'6px 8px', cursor:'pointer'}}>
                <span style={{fontWeight:600, letterSpacing:0.5}}>{r.symbol}</span>
                {desc && <span style={{fontSize:11, opacity:.6}}>{desc}</span>}
              </div>
            );
          })}
          {!loading && !results.length && <div style={{padding:8, fontSize:12, opacity:.6}}>No matches</div>}
        </div>
      )}
    </div>
  );
}
