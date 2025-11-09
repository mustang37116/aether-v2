import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useMemo } from 'react';

// API base resolution for Koyeb/Supabase deployment (no localhost fallbacks):
// Priority:
// 1) VITE_API_BASE_URL (recommended; set to your Koyeb API URL)
// 2) Same-origin '/api' (when reverse-proxied on the same domain)
const explicit = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
const baseURL = (explicit ? explicit.replace(/\/$/, '') : (sameOrigin ? sameOrigin.replace(/\/$/, '') + '/api' : '/api'));

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
