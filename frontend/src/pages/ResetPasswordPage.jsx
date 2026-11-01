import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/authApi';
import { TextField } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/feedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { errorMessage, fieldErrors } from '../utils/errors';

export default function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const invited = params.get('invite') === '1'; // arrived from an invitation email, not a forgotten-password email
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return (
      <>
        <h1 className="text-3xl font-bold">This link isn’t valid</h1>
        <p className="mt-2 text-ink-700">The reset link is incomplete or has been changed. Request a new one.</p>
        <Link to="/forgot-password" className="mt-6 inline-block font-semibold text-teal-700 underline">Send a new reset link</Link>
      </>
    );
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (form.password.length < 8) found.password = 'Use at least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) found.password = 'Include at least one letter and one number';
    if (form.confirm !== form.password) found.confirm = 'The passwords don’t match';
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      await authApi.resetPassword({ token, password: form.password });
      navigate('/login', { replace: true, state: { message: 'Password updated. Log in with your new password.' } });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold">{invited ? 'Welcome to Imbehe. Choose your password' : 'Choose a new password'}</h1>
      {formError && <Alert tone="error" className="mt-4" action={formError.includes('expired') ? <Link to="/forgot-password" className="font-semibold underline">Get a new link</Link> : null}>{formError}</Alert>}
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <TextField label="New password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number" required />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={errors.confirm} required />
        <Button type="submit" size="lg" className="w-full" loading={loading}>Update password</Button>
      </form>
    </>
  );
}
