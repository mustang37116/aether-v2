import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function useApi() {
  const { token } = useAuth();
  const client = axios.create({ baseURL: 'http://localhost:4000' });
  client.interceptors.request.use(cfg => { if (token) cfg.headers.Authorization = `Bearer ${token}`; return cfg; });
  return client;
}
