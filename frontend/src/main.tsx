import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RootLayout from './layouts/RootLayout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import TradePage from './pages/TradePage';
import TagsPage from './pages/TagsPage';
import StrategiesPage from './pages/StrategiesPage';
import PlaybooksPage from './pages/PlaybooksPage';
import AccountsPage from './pages/AccountsPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import { useParams } from 'react-router-dom';

const AccountSettingsWrapper: React.FC = () => {
  const { accountId } = useParams();
  if (!accountId) return <div>Missing account id</div>;
  return <AccountSettingsPage accountId={accountId} />;
};
import AuthPage from './pages/AuthPage';
import JournalPage from './pages/JournalPage';
import RecentlyDeletedTradesPage from './pages/RecentlyDeletedTradesPage';
import Protected from './components/Protected';
import { AuthProvider } from './context/AuthContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<RootLayout />}>
            <Route index element={<HomePage />} />
            <Route path='dashboard' element={<Protected><DashboardPage /></Protected>} />
            <Route path='trades' element={<Protected><TradePage /></Protected>} />
            <Route path='strategies' element={<Protected><StrategiesPage /></Protected>} />
            <Route path='playbooks' element={<Protected><PlaybooksPage /></Protected>} />
            <Route path='accounts' element={<Protected><AccountsPage /></Protected>} />
            <Route path='accounts/:accountId/settings' element={<Protected><AccountSettingsWrapper /></Protected>} />
            <Route path='auth' element={<AuthPage />} />
            <Route path='settings' element={<Navigate to='/auth' replace />} />
            <Route path='journal' element={<Protected><JournalPage /></Protected>} />
            <Route path='journal/deleted' element={<Protected><RecentlyDeletedTradesPage /></Protected>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
