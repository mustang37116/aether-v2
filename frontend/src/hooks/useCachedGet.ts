import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from './useApi';

type CacheEntry<T> = { data: T | undefined; at: number; inflight?: Promise<T> };
const cache = new Map<string, CacheEntry<any>>();

function keyOf(baseURL: string, path: string, params?: any){
  const p = params ? JSON.stringify(params) : '';
  return `${baseURL}::${path}::${p}`;
}

export interface UseCachedGetOptions {
  ttl?: number; // ms
  keepPrevious?: boolean; // keep last data while revalidating
  enabled?: boolean; // allow conditional fetch
}

export function useCachedGet<T = any>(path: string, params?: any, opts: UseCachedGetOptions = {}){
  const api = useApi();
  const ttl = opts.ttl ?? 30_000;
  const keepPrevious = opts.keepPrevious ?? true;
  const enabled = opts.enabled ?? true;
  // baseURL is baked into axios client; read it via defaults
  const base = (api.defaults?.baseURL as string) || '';
  const k = useMemo(()=> keyOf(base, path, params), [base, path, params && JSON.stringify(params)]);
  const [, force] = useState(0);
  const [data, setData] = useState<T|undefined>(()=> cache.get(k)?.data);
  const [loading, setLoading] = useState<boolean>(!cache.get(k)?.data);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(()=>{ mounted.current = true; return ()=> { mounted.current = false; }; }, []);

  async function fetchNow(): Promise<T|undefined> {
    if (!enabled) return data;
    const now = Date.now();
    const entry = cache.get(k);
    // If inflight, just await it
    if (entry?.inflight) {
      try { const res = await entry.inflight; if (mounted.current) setData(res); return res; } catch { return data; }
    }
    // Use cached if fresh
    if (entry && (now - entry.at) < ttl && entry.data !== undefined) {
      if (mounted.current) { setData(entry.data); setLoading(false); }
      return entry.data as T;
    }
    if (!keepPrevious) { if (mounted.current) setData(undefined); }
    if (mounted.current) { setLoading(!keepPrevious || !entry?.data); setError(null); }
    const p = api.get(path, { params }).then(r=> r.data as T);
    cache.set(k, { ...(entry||{ data: undefined, at: 0 }), inflight: p, at: now });
    try {
      const result = await p;
      cache.set(k, { data: result, at: Date.now() });
      if (mounted.current) { setData(result); setLoading(false); }
      return result;
    } catch (e:any) {
      cache.delete(k);
      if (mounted.current) { setError(e?.message || 'Request failed'); setLoading(false); }
      return undefined;
    }
  }

  // Revalidate on mount/changes
  useEffect(()=>{ fetchNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled]);

  const refetch = () => fetchNow().then(()=> force(x=>x+1));
  return { data, loading, error, refetch } as const;
}
