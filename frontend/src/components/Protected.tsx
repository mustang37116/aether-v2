import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function Protected({ children }: { children: any }) {
  const { token } = useAuth();
  if (!token) return <Navigate to='/' replace />;
  return children;
}
