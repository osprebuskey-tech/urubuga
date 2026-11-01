import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/ui/Spinner';
import { userHasRole } from '../utils/roles';

/**
 * UX guard only: it hides screens people cannot use. The API enforces every permission again on the server,
 * so removing this component would not expose any data.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageLoader label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !userHasRole(user, ...roles)) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-8 text-center" role="alert">
        <h1 className="text-2xl font-bold">You don’t have access to this page</h1>
        <p className="mt-2 text-ink-700">Your account doesn’t have the role this page needs.</p>
        <Link to="/dashboard" className="mt-5 inline-block font-semibold text-teal-700 underline">Back to your dashboard</Link>
      </div>
    );
  }
  return children ?? <Outlet />;
}
