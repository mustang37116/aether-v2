import NavBar from '../components/NavBar';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export default function RootLayout(){
  const { token } = useAuth();
  return (
    <div style={{padding:24}}>
      <div className='glass-app' style={{padding:16}}>
        {token ? (
          <>
            <NavBar />
            <div style={{height:1, background:'rgba(255,255,255,0.08)', margin:'8px 0 16px'}} />
          </>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}
