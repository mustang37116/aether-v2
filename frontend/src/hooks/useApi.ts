import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// Resolve API base URL:
// 1. Explicit env var VITE_API_BASE_URL
// 2. Same-origin (single-service deployment) window.location.origin
// 3. Dev fallback localhost
const explicit = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
const baseURL = explicit || sameOrigin || 'http://localhost:4000';

export function useApi() {
  const { token } = useAuth();
  const client = axios.create({ baseURL });
  client.interceptors.request.use(cfg => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });
  return client;
}
