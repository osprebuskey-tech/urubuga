import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button, { ButtonLink } from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { RW_PHONE_RE } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';

// Staff roles cannot be combined with marketplace roles (the API refuses it), so one role is chosen per account.
const ROLE_CHOICES = [
  { group: 'People who run Imbehe', options: [
    { value: 'admin', label: 'Administrator', hint: 'Verifies providers, moderates reviews, resolves disputes, manages categories and users.' },
    { value: 'finance', label: 'Payment follow-up', hint: 'Chases unpaid jobs, confirms and records payments, and handles refunds and payouts. Nothing else.' },
    { value: 'super_admin', label: 'Super administrator', hint: 'Everything an administrator can do, plus creating accounts and reading the activity report.' },
  ] },
  { group: 'Marketplace accounts', options: [
    { value: 'provider', label: 'Service provider', hint: 'Lists services and sends quotations.' },
    { value: 'customer', label: 'Customer', hint: 'Requests services and hires providers.' },
    { value: 'business', label: 'Business customer', hint: 'A company that requests services and tracks several jobs.' },
  ] },
];

const EMPTY = { fullName: '', email: '', phone: '', role: '' };

/** Super admin only. The new person gets an email to choose their own password: nobody ever sets or sees it for them. */
export default function CreateUserPage() {
  useDocumentTitle('Add a user');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (form.fullName.trim().length < 2) found.fullName = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = 'Enter a valid email address';
    if (form.phone.trim() && !RW_PHONE_RE.test(form.phone.trim().replace(/\s/g, ''))) found.phone = 'Enter a valid Rwandan mobile number, like 0788 123 456';
    if (!form.role) found.role = 'Choose what this person will do';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const res = await adminApi.createUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        roles: [form.role],
      });
      setCreated(res.data);
    } catch (err) {
      const fields = fieldErrors(err);
      if (err.code === 'EMAIL_TAKEN') fields.email = 'Someone already has an account with this email';
      setErrors(fields);
      if (!Object.keys(fields).length) setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const { user, inviteSent } = created;
    return (
      <>
        <PageHeader title="Account created" />
        <div className="panel max-w-2xl p-6">
          {inviteSent
            ? <Alert tone="success" title={`An invitation was sent to ${user.email}`}>{user.fullName} will receive an email with a link, valid for 72 hours, to choose their own password.</Alert>
            : <Alert tone="warning" title="The account exists, but the invitation email could not be sent">Check the email settings, then open the user in the Users list and send the invitation again.</Alert>}
          <p className="mt-4 text-ink-800">You never see or set their password. Every account creation is written to the audit log.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => { setCreated(null); setForm(EMPTY); }}>Add another user</Button>
            <ButtonLink to="/dashboard/admin/users" variant="outline">See all users</ButtonLink>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add a user" description="Create an account for a colleague or a provider. They choose their own password from an email." />
      <form onSubmit={submit} noValidate className="panel grid max-w-2xl gap-5 p-6">
        <TextField label="Full name" autoComplete="off" value={form.fullName} onChange={set('fullName')} error={errors.fullName} required />
        <TextField label="Email address" type="email" autoComplete="off" value={form.email} onChange={set('email')} error={errors.email} required />
        <TextField label="Mobile number" type="tel" autoComplete="off" value={form.phone} onChange={set('phone')} error={errors.phone} hint="Optional" />

        <fieldset aria-describedby={errors.role ? 'role-error' : undefined}>
          <legend className="mb-2 font-semibold">What will they do?</legend>
          {ROLE_CHOICES.map((g) => (
            <div key={g.group} className="mb-4">
              <p className="mb-2 text-sm font-semibold text-ink-700">{g.group}</p>
              <div className="space-y-2">
                {g.options.map((o) => (
                  <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.role === o.value ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:bg-ink-50'}`}>
                    <input type="radio" name="role" value={o.value} checked={form.role === o.value} onChange={set('role')} className="mt-1" />
                    <span><span className="block font-semibold">{o.label}</span><span className="block text-sm text-ink-700">{o.hint}</span></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {errors.role && <p id="role-error" role="alert" className="text-sm font-medium text-rose-700">{errors.role}</p>}
        </fieldset>

        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy}>Create account and send invitation</Button>
          <Link to="/dashboard/admin/users" className="font-semibold underline">Cancel</Link>
        </div>
      </form>
    </>
  );
}
