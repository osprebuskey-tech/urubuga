import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/ui/Spinner';

/**
 * The welcome page is for visitors. Someone who is signed in is sent to their dashboard, and stays there until they log out:
 * no link leads back to it, and the browser's Back button lands here and bounces straight back to the dashboard.
 */
export default function GuestOnly({ children }) {
  const { user, status } = useAuth();
  if (status === 'loading') return <PageLoader label="Checking your session" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children ?? <Outlet />;
}
