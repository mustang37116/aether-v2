import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SettingsPage from './SettingsPage';

export default function AuthPage() {
  const { login, register, logout, token } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div style={{ maxWidth: 360 }}>
      <h2>Account</h2>
      {token ? (
        <div style={{display:'grid', gap:16}}>
          <div className='glass-subpanel' style={{padding:12, display:'grid', gap:10}}>
            <div style={{opacity:.8}}>You are logged in.</div>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button onClick={() => { logout(); navigate('/'); }}>Logout</button>
            </div>
          </div>
          <div className='glass-panel' style={{padding:12}}>
            <SettingsPage />
          </div>
        </div>
      ) : (
        <>
          <input placeholder='Email' value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder='Password' type='password' value={password} onChange={e=>setPassword(e.target.value)} />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={()=>login(email,password)}>Login</button>
            <button onClick={()=>register(email,password)}>Register</button>
          </div>
        </>
      )}
    </div>
  );
}
