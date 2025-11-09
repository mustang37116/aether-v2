import { Outlet, Link } from 'react-router-dom';
export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <nav style={{ display: 'flex', gap: 12 }}>
        <Link to='/dashboard'>Dashboard</Link>
        <Link to='/trades'>Trades</Link>
      </nav>
      <hr />
      <Outlet />
    </div>
  );
}
