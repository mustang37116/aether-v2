import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// Prefer environment variable (configured in Vercel or .env) and fall back to localhost for dev.
// Example: VITE_API_BASE_URL=https://api.example.com
const baseURL = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export function useApi() {
  const { token } = useAuth();
  const client = axios.create({ baseURL });
  client.interceptors.request.use(cfg => {
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });
  return client;
}
