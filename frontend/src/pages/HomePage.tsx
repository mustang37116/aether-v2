import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage(){
  const { token } = useAuth();
  if (token) return <Navigate to='/dashboard' replace />;
  return (
    <div style={{display:'grid', placeItems:'center', minHeight:'60vh', textAlign:'center', padding:'24px'}}>
      <div style={{display:'grid', gap:16, maxWidth:720}}>
        <h1 style={{margin:0, fontSize:'clamp(28px, 6vw, 44px)'}}>Aether Terminal</h1>
        <p style={{opacity:.8, lineHeight:1.6, fontSize:'clamp(14px, 2.2vw, 18px)'}}>
          Your focused trading journal and analytics hub. Track fills-first trades, automate fees, and visualize performance with a clean, glassy UI.
        </p>
        <div style={{display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap'}}>
          <Link to="/auth?mode=login" className="nav-icon-button primary" style={{padding:'10px 16px', borderRadius:10, textDecoration:'none'}}>
            Login
          </Link>
          <Link to="/auth?mode=register" className="nav-icon-button" style={{padding:'10px 16px', borderRadius:10, textDecoration:'none', background:'rgba(255,255,255,0.08)'}}>
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
