import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { formatDate } from '../../utils/format';

/** Super administrator only: the fee providers pay for verification, its currency and how to pay. Every change is published and audited. */
export default function VerificationFeePage() {
  useDocumentTitle('Verification fee');
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => verificationApi.fee(signal), []);
  const [form, setForm] = useState({ amount: '', currency: 'RWF', instructions: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const fee = data?.fee;

  useEffect(() => { if (fee) setForm({ amount: String(fee.amount), currency: fee.currency, instructions: fee.instructions }); }, [fee]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (loading) return <PageLoader label="Loading" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const publish = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = {};
    if (!/^\d{1,8}$/.test(form.amount.trim())) found.amount = 'Enter a whole amount, 0 or more.';
    if (form.instructions.trim().length < 10) found.instructions = 'Tell applicants how to pay (at least 10 characters).';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await verificationApi.setFee({ amount: Number(form.amount), currency: form.currency, instructions: form.instructions.trim() });
      toast.success('The new fee is published.');
      reload();
    } catch (err) { setErrors(fieldErrors(err)); setFormError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Verification fee" description="The fee providers pay for a verification review. Applicants see it before they apply, and keep the fee they were shown." />
      {fee ? <Alert tone="info" className="mb-6" title={`Published: ${Number(fee.amount).toLocaleString('en-US')} ${fee.currency} (version ${fee.version})`}>Published {formatDate(fee.publishedAt)}. A change affects only new applications.</Alert>
        : <Alert tone="warning" className="mb-6" title="No fee is published">Providers cannot apply for verification until you publish one.</Alert>}
      <form onSubmit={publish} noValidate className="panel max-w-xl space-y-4 p-6">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Amount" inputMode="numeric" value={form.amount} onChange={set('amount')} error={errors.amount} hint="0 means verification is free for now." required />
          <SelectField label="Currency" value={form.currency} onChange={set('currency')} options={[{ value: 'RWF', label: 'RWF (Rwandan franc)' }, { value: 'USD', label: 'USD (US dollar)' }]} />
        </div>
        <TextAreaField label="Payment instructions" rows={4} value={form.instructions} onChange={set('instructions')} error={errors.instructions} maxLength={800} hint="Shown to applicants: for example the Mobile Money number or bank account, and what reference to use." required />
        <Button type="submit" loading={busy}>Save and publish</Button>
      </form>
    </>
  );
}
