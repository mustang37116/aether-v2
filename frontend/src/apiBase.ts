// Centralized dynamic API base used by fetch-based helpers (non-axios)
// Priority: explicit VITE_API_BASE_URL -> same-origin /api -> localhost dev fallback
const explicit = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_BASE_URL;
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
export const API_BASE = explicit || (sameOrigin ? sameOrigin + '/api' : 'http://localhost:4000/api');

// Convenience helpers for building full URLs (avoid manual concatenation bugs)
export function apiUrl(path: string){
  if (!path.startsWith('/')) path = '/' + path;
  return API_BASE + path;
}
