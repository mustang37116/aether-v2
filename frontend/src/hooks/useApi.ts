import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useMemo } from 'react';

// Resolve API base URL:
// 1. Explicit env var VITE_API_BASE_URL
// 2. Same-origin (single-service deployment) window.location.origin
// 3. Dev fallback localhost
const explicit = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
const baseURL = explicit || (sameOrigin ? sameOrigin + '/api' : 'http://localhost:4000/api');

export function useApi() {
  const { token } = useAuth();
  // Memoize client so identity is stable across renders (prevents effects from re-running endlessly)
  const client = useMemo(() => {
    const c = axios.create({ baseURL });
    // Attach interceptor with current token
    c.interceptors.request.use(cfg => {
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });
    return c;
  }, [token]);
  return client;
}
