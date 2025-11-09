import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Mirror logic from useApi for consistent base resolution (no localhost fallback).
const explicit = (import.meta as any).env?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
const sameOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
const API_ROOT = explicit ? explicit.replace(/\/$/, '') : (sameOrigin ? sameOrigin.replace(/\/$/, '') + '/api' : '/api');

interface AuthCtx {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: any }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  useEffect(() => {
    if (token) localStorage.setItem('token', token); else localStorage.removeItem('token');
  }, [token]);

  async function register(email: string, password: string) {
    try {
  const res = await axios.post(`${API_ROOT}/auth/register`, { email, password });
      setToken(res.data.token);
    } catch (e:any) {
      console.error('Register failed', e?.response?.data || e.message);
      alert('Register failed');
    }
  }
  async function login(email: string, password: string) {
    try {
  const res = await axios.post(`${API_ROOT}/auth/login`, { email, password });
      setToken(res.data.token);
    } catch (e:any) {
      console.error('Login failed', e?.response?.data || e.message);
      alert('Login failed');
    }
  }
  function logout() { setToken(null); }

  return <Ctx.Provider value={{ token, register, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
