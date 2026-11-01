import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CheckboxField, CheckGroup, TextField } from '../components/ui/Field';
import Button from '../components/ui/Button';
import { Alert } from '../components/ui/feedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { RW_PHONE_RE } from '../utils/constants';
import { errorMessage, fieldErrors } from '../utils/errors';
import { compact } from '../utils/format';

const ROLE_OPTIONS = [
  { value: 'customer', label: 'Hire services', description: 'Find and contact providers' },
  { value: 'provider', label: 'Offer my services', description: 'Create a profile and list what you do' },
  { value: 'business', label: 'Use it for my company', description: 'Add a company profile' },
];

function validate(form) {
  const e = {};
  if (form.fullName.trim().length < 2) e.fullName = 'Enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
  if (form.phone.trim() && !RW_PHONE_RE.test(form.phone.trim())) e.phone = 'Enter a valid Rwandan mobile number, like 0788 123 456';
  if (form.password.length < 8) e.password = 'Use at least 8 characters';
  else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Include at least one letter and one number';
  if (form.roles.length === 0) e.roles = 'Choose at least one';
  return e;
}

export default function RegisterPage() {
  useDocumentTitle('Create an account');
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', roles: ['customer'], remember: true });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      await register(compact({ fullName: form.fullName.trim(), email: form.email.trim(), phone: form.phone.replace(/\s/g, ''), password: form.password, roles: form.roles, remember: form.remember }));
      toast.success('Account created. Check your email to confirm your address.');
      navigate('/dashboard/documents', { replace: true }); // step two of signing up: upload your documents
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(err.code === 'EMAIL_TAKEN' ? { email: err.message } : fe);
      setFormError(err.code === 'EMAIL_TAKEN' || Object.keys(fe).length ? '' : errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-1 text-ink-700">It takes a minute. You can hire, offer services, or both.</p>
      {formError && <Alert tone="error" className="mt-4">{formError}</Alert>}

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <TextField label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
        <TextField label="Email address" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
        <TextField label="Mobile number (optional)" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="MTN or Airtel, like 0788 123 456" />
        <TextField label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number" required />
        <CheckGroup legend="I want to" options={ROLE_OPTIONS} value={form.roles} onChange={(roles) => setForm((f) => ({ ...f, roles }))} error={errors.roles} columns="grid-cols-1" />
        <CheckboxField label="Keep me signed in on this device" hint="Stay signed in until you log out. Don’t tick this on a shared computer." checked={form.remember} onChange={(e) => setForm((f) => ({ ...f, remember: e.target.checked }))} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-ink-700">Already registered? <Link to="/login" className="font-semibold text-teal-700 underline">Log in</Link></p>
    </>
  );
}
