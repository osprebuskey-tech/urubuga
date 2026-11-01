import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/ui/Spinner';
import { Alert } from '../components/ui/feedback';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errorMessage } from '../utils/errors';

export default function VerifyEmailPage() {
  useDocumentTitle('Confirm your email');
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, refreshUser } = useAuth();
  const started = useRef(false); // the token is single-use, so never send it twice (React StrictMode runs effects twice in dev)
  const [state, setState] = useState(/^[a-f0-9]{64}$/.test(token) ? { status: 'working' } : { status: 'error', message: 'This confirmation link is incomplete.' });

  useEffect(() => {
    if (started.current || state.status !== 'working') return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(async () => {
        if (user) await refreshUser().catch(() => {});
        setState({ status: 'done' });
      })
      .catch((err) => setState({ status: 'error', message: errorMessage(err) }));
  }, [token, state.status, user, refreshUser]);

  return (
    <>
      <h1 className="text-3xl font-bold">Confirm your email</h1>
      <div className="mt-6">
        {state.status === 'working' && <PageLoader label="Confirming your email" />}
        {state.status === 'done' && (
          <>
            <Alert tone="success" title="Email confirmed">Thanks. Your address is verified.</Alert>
            <div className="mt-6"><ButtonLink to={user ? '/dashboard' : '/login'} size="lg">{user ? 'Go to your dashboard' : 'Log in'}</ButtonLink></div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <Alert tone="error" title="We couldn’t confirm your email">{state.message}</Alert>
            <p className="mt-4 text-ink-700">Links expire after 24 hours. <Link to={user ? '/dashboard' : '/login'} className="font-semibold text-teal-700 underline">{user ? 'Go to your dashboard' : 'Log in'}</Link> to request a new one.</p>
          </>
        )}
      </div>
    </>
  );
}
