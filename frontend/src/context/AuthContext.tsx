import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

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
    const res = await axios.post('http://localhost:4000/auth/register', { email, password });
    setToken(res.data.token);
  }
  async function login(email: string, password: string) {
    const res = await axios.post('http://localhost:4000/auth/login', { email, password });
    setToken(res.data.token);
  }
  function logout() { setToken(null); }

  return <Ctx.Provider value={{ token, register, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
