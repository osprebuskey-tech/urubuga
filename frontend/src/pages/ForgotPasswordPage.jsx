import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { TextField } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/feedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errorMessage } from '../utils/errors';

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address'); return; }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold">Reset your password</h1>
      {sent ? (
        <Alert tone="success" title="Check your email" className="mt-6">
          If an account exists for {email.trim()}, we’ve sent a link to reset the password. It expires in 30 minutes.
        </Alert>
      ) : (
        <>
          <p className="mt-1 text-ink-700">Enter your email and we’ll send you a reset link.</p>
          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <TextField label="Email address" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} required />
            <Button type="submit" size="lg" className="w-full" loading={loading}>Send reset link</Button>
          </form>
        </>
      )}
      <p className="mt-6 text-center"><Link to="/login" className="font-semibold text-teal-700 underline">Back to log in</Link></p>
    </>
  );
}
