import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CheckboxField, TextField } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/feedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errorMessage, fieldErrors } from '../utils/errors';

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { login, notice, clearNotice, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const prev = location.state?.from;
  const from = prev ? `${prev.pathname}${prev.search || ''}` : '/dashboard'; // after logging in you land on your dashboard (the welcome page is for visitors), unless a page that needs an account sent you here
  const message = location.state?.message;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const next = {};
    if (!form.email.trim()) next.email = 'Enter your email address';
    if (!form.password) next.password = 'Enter your password';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    clearNotice();
    try {
      await login({ email: form.email.trim(), password: form.password, remember: form.remember });
      navigate(from, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold">Log in</h1>
      <p className="mt-1 text-ink-700">Welcome back. Log in to manage your profile, services and account.</p>

      {user && <Alert tone="info" className="mt-4">You’re already logged in. <Link to="/dashboard" className="font-semibold underline">Go to your dashboard</Link>.</Alert>}
      {notice && <Alert tone="warning" className="mt-4">{notice}</Alert>}
      {message && !notice && <Alert tone="success" className="mt-4">{message}</Alert>}
      {formError && <Alert tone="error" className="mt-4">{formError}</Alert>}

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <TextField label="Email address" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
        <TextField label="Password" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} error={errors.password} required />
 <CheckboxField label="Keep me signed in on this device" hint="Stay signed in until you log out. Don’t use this on a shared computer. Administrators and finance staff are always signed out after an hour." checked={form.remember} onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))} />
        <div className="text-right text-sm"><Link to="/forgot-password" className="font-semibold text-teal-700 underline">Forgot your password?</Link></div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>Log in</Button>
      </form>
      <p className="mt-6 text-center text-ink-700">New to Imbehe? <Link to="/register" className="font-semibold text-teal-700 underline">Create an account</Link></p>
    </>
  );
}
