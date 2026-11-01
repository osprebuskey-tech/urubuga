import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/authApi';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { TextField } from '../components/ui/Field';
import { Alert, Badge } from '../components/ui/feedback';
import { ConfirmDialog } from '../components/ui/Dialog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLE_LABELS, RW_PHONE_RE } from '../utils/constants';
import { errorMessage, fieldErrors } from '../utils/errors';
import { formatDate } from '../utils/format';

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone || '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (form.fullName.trim().length < 2) found.fullName = 'Enter your full name';
    if (form.phone.trim() && !RW_PHONE_RE.test(form.phone.trim().replace(/\s/g, ''))) found.phone = 'Enter a valid Rwandan mobile number, like 0788 123 456';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const saved = await updateProfile({ fullName: form.fullName.trim(), phone: form.phone.trim() ? form.phone.trim() : null });
      setForm({ fullName: saved.fullName, phone: saved.phone || '' });
      toast.success('Your details are saved.');
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel mb-6 p-6" aria-labelledby="edit-profile">
      <h2 id="edit-profile" className="mb-1 text-xl font-semibold">Your details</h2>
      <p className="mb-4 text-ink-700">Your name and mobile number. Your email address and roles can’t be changed here.</p>
      <form onSubmit={submit} noValidate className="grid max-w-xl gap-4">
        <TextField label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
        <TextField label="Mobile number" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={errors.phone} hint="Optional. Clear it to remove your number." />
        {formError && !Object.keys(errors).length && <Alert tone="error">{formError}</Alert>}
        <div><Button type="submit" loading={busy}>Save details</Button></div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!form.currentPassword) found.currentPassword = 'Enter your current password';
    if (form.newPassword.length < 8) found.newPassword = 'Use at least 8 characters';
    else if (!/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) found.newPassword = 'Include at least one letter and one number';
    else if (form.newPassword === form.currentPassword) found.newPassword = 'Choose a different password';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await changePassword(form);
      setForm({ currentPassword: '', newPassword: '' });
      toast.success('Password changed. Your other devices have been signed out.');
    } catch (err) {
      const fields = fieldErrors(err);
      if (err.code === 'WRONG_PASSWORD') fields.currentPassword = 'That is not your current password';
      setErrors(fields);
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel mb-6 p-6" aria-labelledby="change-password">
      <h2 id="change-password" className="mb-1 text-xl font-semibold">Change password</h2>
      <p className="mb-4 text-ink-700">Changing it signs you out on your other devices.</p>
      <form onSubmit={submit} noValidate className="grid max-w-xl gap-4">
        <TextField label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} required />
        <TextField label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword} hint="At least 8 characters, with a letter and a number" required />
        {formError && <Alert tone="error">{formError}</Alert>}
        <div><Button type="submit" loading={busy}>Change password</Button></div>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const resend = async () => {
    setSending(true);
    try { await authApi.resendVerification(); toast.success('Verification email sent.'); } catch (err) { toast.error(errorMessage(err)); } finally { setSending(false); }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your account details, password and sign-in." />
      <section className="panel mb-6 p-6" aria-labelledby="account">
        <h2 id="account" className="mb-4 text-xl font-semibold">Account</h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div><dt className="text-sm text-ink-600">Name</dt><dd className="font-medium">{user.fullName}</dd></div>
          <div><dt className="text-sm text-ink-600">Email</dt><dd className="flex flex-wrap items-center gap-2 font-medium break-all">{user.email} <Badge tone={user.emailVerified ? 'success' : 'warning'}>{user.emailVerified ? 'Confirmed' : 'Not confirmed'}</Badge></dd></div>
          <div><dt className="text-sm text-ink-600">Mobile number</dt><dd className="font-medium">{user.phone || 'Not added'}</dd></div>
          <div><dt className="text-sm text-ink-600">Roles</dt><dd className="flex flex-wrap gap-2">{user.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r] ?? r}</Badge>)}</dd></div>
          <div><dt className="text-sm text-ink-600">Member since</dt><dd className="font-medium">{formatDate(user.createdAt)}</dd></div>
        </dl>
        {!user.emailVerified && <div className="mt-5"><Button variant="outline" onClick={resend} loading={sending}>Resend confirmation email</Button></div>}
      </section>

      <ProfileForm />
      <PasswordForm />

      <section className="panel p-6" aria-labelledby="security">
        <h2 id="security" className="mb-1 text-xl font-semibold">Sign-in</h2>
        <p className="mb-4 text-ink-700">Logging out ends your session on every device where you’re signed in.</p>
        <Button variant="danger" onClick={() => setConfirming(true)}>Log out everywhere</Button>
      </section>

      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} title="Log out everywhere?" confirmLabel="Log out" onConfirm={async () => { await logout(); navigate('/'); }}>
        <p>You’ll be signed out on this and every other device.</p>
      </ConfirmDialog>
    </>
  );
}
