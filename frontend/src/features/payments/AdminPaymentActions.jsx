import { useState } from 'react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { paymentApi } from '../../services/paymentApi';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { formatRWF } from '../../utils/format';

const isRwf = (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000_000;

export function validateManual({ reference }) {
  return reference.trim().length >= 4 ? {} : { reference: 'Enter the bank or mobile money transaction reference' };
}
export function validateRefund({ amount, reason }, refundable) {
  const e = {};
  if (!isRwf(amount)) e.amount = 'Enter a whole number of RWF';
  else if (Number(amount) > refundable) e.amount = `At most ${formatRWF(refundable)} can still be refunded`;
  if (reason.trim().length < 5) e.reason = 'Give a reason of at least 5 characters';
  return e;
}
export function validatePayout({ amount, reference }, due) {
  const e = {};
  if (amount && !isRwf(amount)) e.amount = 'Enter a whole number of RWF, or leave it empty to pay everything due';
  else if (amount && Number(amount) > due) e.amount = `At most ${formatRWF(due)} is due`;
  if (reference.trim().length < 3) e.reference = 'Enter the payout reference';
  return e;
}

const KINDS = {
  manual: {
    title: 'Record a payment you have verified',
    help: 'Use this once you have seen the money in the bank or mobile money account. The customer and provider will be told, and this is written to the audit log.',
    fields: { reference: '', note: '' },
    submit: 'Record payment',
  },
  refund: {
    title: 'Record a refund you have already sent',
    help: 'Imbehe does not send the money. Send the refund yourself first, then record it here. It comes out of the commission and the provider’s share in proportion.',
    fields: { amount: '', reason: '' },
    submit: 'Record refund',
  },
  payout: {
    title: 'Record a payout you have already sent',
    help: 'Send the money to the provider first, then record it here with the transaction reference.',
    fields: { amount: '', reference: '' },
    submit: 'Record payout',
  },
};

function ActionForm({ kind, booking, payment, onClose, onDone }) {
  const toast = useToast();
  const cfg = KINDS[kind];
  const [form, setForm] = useState(cfg.fields);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const f = payment?.financials;
  const refundable = payment ? payment.amount - payment.refundedAmount : 0;

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = kind === 'manual' ? validateManual(form) : kind === 'refund' ? validateRefund(form, refundable) : validatePayout(form, f?.payoutDue ?? 0);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      if (kind === 'manual') await paymentApi.recordManual({ bookingId: booking.id, reference: form.reference.trim(), ...(form.note.trim() ? { note: form.note.trim() } : {}) });
      if (kind === 'refund') await paymentApi.refund(payment.id, { amount: Number(form.amount), reason: form.reason.trim() });
      if (kind === 'payout') await paymentApi.payout(payment.id, { reference: form.reference.trim(), ...(form.amount ? { amount: Number(form.amount) } : {}) });
      toast.success('Recorded.');
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form id="payment-action-form" onSubmit={submit} noValidate className="space-y-4">
      <p className="text-ink-800">{cfg.help}</p>
      {kind === 'refund' && <p className="text-sm text-ink-700">Refundable: <strong>{formatRWF(refundable)}</strong></p>}
      {kind === 'payout' && <p className="text-sm text-ink-700">Due to the provider: <strong>{formatRWF(f?.payoutDue ?? 0)}</strong></p>}
      {kind === 'manual' && <p className="text-sm text-ink-700">Amount: <strong>{formatRWF(booking.agreedPrice)}</strong> (the agreed price)</p>}
      {formError && <Alert tone="error">{formError}</Alert>}
      {kind === 'manual' && (
        <>
          <TextField label="Transaction reference" value={form.reference} onChange={set('reference')} error={errors.reference} maxLength={100} required />
          <TextAreaField label="Note (optional)" value={form.note} onChange={set('note')} rows={2} maxLength={300} />
        </>
      )}
      {kind === 'refund' && (
        <>
          <TextField label="Amount refunded (RWF)" inputMode="numeric" value={form.amount} onChange={set('amount')} error={errors.amount} required />
          <TextAreaField label="Reason" value={form.reason} onChange={set('reason')} error={errors.reason} rows={3} maxLength={300} required hint="The customer and provider see this." />
        </>
      )}
      {kind === 'payout' && (
        <>
          <TextField label="Amount paid (RWF)" inputMode="numeric" value={form.amount} onChange={set('amount')} error={errors.amount} hint="Leave empty to record everything that is due." />
          <TextField label="Payout reference" value={form.reference} onChange={set('reference')} error={errors.reference} maxLength={100} required />
        </>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy}>{cfg.submit}</Button>
      </div>
    </form>
  );
}

/** The money actions an administrator can take on a job's payment. */
export default function AdminPaymentActions({ booking, payment, onChanged }) {
  const [kind, setKind] = useState(null);
  const succeeded = payment?.status === 'succeeded';
  const canRecord = !payment || (payment.status === 'pending' && payment.gateway === 'manual');
  const payable = ['accepted', 'in_progress', 'completed'].includes(booking.status);
  const refundable = succeeded ? payment.amount - payment.refundedAmount : 0;
  const due = succeeded ? payment.financials.payoutDue : 0;
  const buttons = [
    canRecord && payable && { k: 'manual', label: 'Record payment received' },
    refundable > 0 && { k: 'refund', label: 'Record a refund' },
    due > 0 && booking.status === 'completed' && { k: 'payout', label: 'Record a payout' },
  ].filter(Boolean);
  if (buttons.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-3">{buttons.map((b) => <Button key={b.k} variant="outline" onClick={() => setKind(b.k)}>{b.label}</Button>)}</div>
      <Dialog open={Boolean(kind)} onClose={() => setKind(null)} title={kind ? KINDS[kind].title : ''}>
        {kind && <ActionForm kind={kind} booking={booking} payment={payment} onClose={() => setKind(null)} onDone={() => { setKind(null); onChanged(); }} />}
      </Dialog>
    </>
  );
}
