import { Link, useLocation } from 'react-router-dom';
import { FiHome, FiBookOpen, FiDollarSign, FiLayers, FiSettings, FiUser, FiPlusSquare } from 'react-icons/fi';
import './NavBar.css';

export default function NavBar(){
  const { pathname } = useLocation();
  const isActive = (path: string) => pathname === path;
  return (
    <nav className="nav-bar glass" aria-label="Primary">
      <div className="nav-group-left">
        <div className="nav-group">
          <Link to="/dashboard" className={`nav-icon-link ${isActive('/dashboard')?'active':''}`} aria-label="Dashboard" title="Dashboard">
            <FiHome size={20} />
            <span className="nav-icon-label">Home</span>
          </Link>
          <Link to="/journal" className={`nav-icon-link ${isActive('/journal')?'active':''}`} aria-label="Journal" title="Journal">
            <FiBookOpen size={20} />
            <span className="nav-icon-label">Journal</span>
          </Link>
          <Link to="/accounts" className={`nav-icon-link ${isActive('/accounts')?'active':''}`} aria-label="Accounts" title="Accounts">
            <FiDollarSign size={20} />
            <span className="nav-icon-label">Accounts</span>
          </Link>
          <Link to="/strategies" className={`nav-icon-link ${isActive('/strategies')?'active':''}`} aria-label="Strategies" title="Strategies">
            <FiLayers size={20} />
            <span className="nav-icon-label">Strategies</span>
          </Link>
          <Link to="/settings" className={`nav-icon-link ${isActive('/settings')?'active':''}`} aria-label="Settings" title="Settings">
            <FiSettings size={20} />
            <span className="nav-icon-label">Settings</span>
          </Link>
        </div>
      </div>
      <div className="nav-group nav-group-right">
        <Link to="/auth" className={`nav-icon-link ${isActive('/auth')?'active':''}`} aria-label="Account" title="Account">
          <FiUser size={20} />
          <span className="nav-icon-label">Account</span>
        </Link>
        <Link to="/trades" className="nav-icon-button primary" aria-label="New Trade" title="New Trade">
          <FiPlusSquare size={20} />
          <span className="nav-icon-label">New</span>
        </Link>
      </div>
    </nav>
  );
}
