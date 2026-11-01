import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { CheckboxField, SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { FOLLOW_UP_BUCKETS, FOLLOW_UP_OUTCOMES } from '../../utils/constants';
import { errorMessage, fieldErrors } from '../../utils/errors';
import { formatDate, formatRWF, isoDay } from '../../utils/format';

const BUCKETS = Object.keys(FOLLOW_UP_BUCKETS);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function FollowUpForm({ item, onClose, onDone }) {
  const toast = useToast();
  const isPayment = item.kind === 'payment';
  const [form, setForm] = useState({ outcome: 'contacted', note: '', nextFollowUpAt: '', remindCustomer: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.note.trim().length < 3) { setErrors({ note: 'Write what happened (at least 3 characters)' }); return; }
    setErrors({});
    setFormError('');
    setBusy(true);
    try {
      await adminApi.createFollowUp({
        bookingId: item.bookingId,
        kind: item.kind,
        outcome: form.outcome,
        note: form.note.trim(),
        ...(form.nextFollowUpAt ? { nextFollowUpAt: form.nextFollowUpAt } : {}),
        ...(isPayment && form.remindCustomer ? { remindCustomer: true } : {}),
      });
      toast.success(form.remindCustomer ? 'Saved, and the customer was reminded.' : 'Follow-up saved.');
      onDone();
    } catch (err) {
      const fields = fieldErrors(err);
      setErrors(fields);
      setFormError(Object.keys(fields).length ? '' : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <p className="text-ink-800"><strong>{item.title}</strong><br />{isPayment ? `${item.customerName} owes ${formatRWF(item.amount)}` : `${item.providerName} is owed ${formatRWF(item.amount)}`}</p>
      {item.lastFollowUp && <p className="rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-800">Last time ({formatDate(item.lastFollowUp.at)}): {item.lastFollowUp.note}</p>}
      <SelectField label="What happened?" value={form.outcome} onChange={set('outcome')} options={Object.entries(FOLLOW_UP_OUTCOMES).map(([value, label]) => ({ value, label }))} />
      <TextAreaField label="Note" value={form.note} onChange={set('note')} error={errors.note} rows={3} maxLength={500} hint="Who you spoke to and what was agreed. The whole team can read this." required />
      <TextField label="Look at this again on" type="date" min={isoDay(0)} value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} error={errors.nextFollowUpAt} hint="Optional. Until then it is not counted as overdue." />
      {isPayment && <CheckboxField label="Also send the customer a payment reminder" hint="They get a notification in the app. Once a day at most." checked={form.remindCustomer} onChange={(e) => setForm((f) => ({ ...f, remindCustomer: e.target.checked }))} />}
      {formError && <p role="alert" className="text-sm font-medium text-rose-700">{formError}</p>}
      <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" loading={busy}>Save follow-up</Button></div>
    </form>
  );
}

function BucketList({ bucket, summary, onLog }) {
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => adminApi.followUpList(bucket, { page, limit: 10 }, signal), [bucket, page, summary]);
  const info = FOLLOW_UP_BUCKETS[bucket];
  return (
    <>
      <p className="mb-3 text-ink-800">{info.hint}</p>
      {list.loading && !list.data && <PageLoader label="Loading" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="Nothing to chase here" description="Everything in this group has been dealt with." />}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-3">
            {list.data.map((it) => (
              <li key={`${it.bookingId}-${it.kind}`} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold"><Link to={`/dashboard/bookings/${it.bookingId}`} className="hover:underline">{it.title}</Link></h3>
                    <p className="mt-1 text-sm text-ink-700">{it.customerName} → {it.providerName}</p>
                    <p className="mt-1 text-sm text-ink-800"><span className="font-semibold">{formatRWF(it.amount)}</span> · waiting {plural(it.ageDays, 'day', 'days')} (since {formatDate(it.since)})</p>
                    {it.lastFollowUp
                      ? <p className="mt-2 text-sm text-ink-800"><span className="font-semibold">{FOLLOW_UP_OUTCOMES[it.lastFollowUp.outcome]}</span> on {formatDate(it.lastFollowUp.at)}: {it.lastFollowUp.note} <span className="text-ink-600">({plural(it.followUpCount, 'contact', 'contacts')})</span></p>
                      : <p className="mt-2 text-sm text-ink-600">Nobody has followed this up yet.</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {it.overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="success">Followed up until {formatDate(it.followUpDueAt)}</Badge>}
                    <Button size="sm" onClick={() => onLog(it)}>Log follow-up<span className="sr-only"> for {it.title}</span></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

/** For administrators and the payment follow-up role: money that is owed, and who has chased it. */
export default function PaymentFollowUpPage() {
  useDocumentTitle('Payment follow-up');
  const [bucket, setBucket] = useState('unpaid_jobs');
  const [logging, setLogging] = useState(null);
  const summary = useAsync((signal) => adminApi.followUpSummary(signal), []);
  const s = summary.data?.summary;

  return (
    <>
      <PageHeader
        title="Payment follow-up"
        description="Money that is owed, and who has chased it. Record a payment or payout in Payments once it has really arrived."
        actions={<Link to="/dashboard/admin/payments" className="font-semibold underline">Open payments</Link>}
      />
      {summary.loading && !s && <PageLoader label="Loading the backlog" />}
      {summary.error && <ErrorState error={summary.error} onRetry={summary.reload} />}
      {s && (
        <>
          <div role="tablist" aria-label="What to chase" className="mb-5 grid gap-3 md:grid-cols-3">
            {BUCKETS.map((b) => (
              <button key={b} role="tab" aria-selected={bucket === b} onClick={() => setBucket(b)} className={`panel p-4 text-left ${bucket === b ? 'border-ink-900 ring-2 ring-ink-900' : 'hover:border-ink-300'}`}>
                <span className="block text-sm font-semibold text-ink-700">{FOLLOW_UP_BUCKETS[b].label}</span>
                <span className="mt-1 block font-display text-3xl font-bold">{s[b].count}{s[b].truncated && '+'}</span>
                <span className="mt-1 block text-sm text-ink-800">{formatRWF(s[b].value)}</span>
                {s[b].overdue > 0 ? <span className="mt-2 inline-block"><Badge tone="danger">{s[b].overdue} overdue</Badge></span> : <span className="mt-2 block text-sm text-ink-600">None overdue</span>}
              </button>
            ))}
          </div>
          <div role="tabpanel"><BucketList key={bucket} bucket={bucket} summary={s} onLog={setLogging} /></div>
        </>
      )}
      <Dialog open={Boolean(logging)} onClose={() => setLogging(null)} title="Log a follow-up">
        {logging && <FollowUpForm item={logging} onClose={() => setLogging(null)} onDone={() => { setLogging(null); summary.reload(); }} />}
      </Dialog>
    </>
  );
}
