import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { TextField } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { paymentApi } from '../../services/paymentApi';
import { PAYMENT_STATUS, ROLES } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { bpsLabel, formatDate, formatRWF, percentToBps } from '../../utils/format';

const FILTERS = [{ value: '', label: 'All' }, { value: 'pending', label: 'Waiting' }, { value: 'succeeded', label: 'Paid' }, { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' }];

function Stat({ label, value, note, tone }) {
  return (
    <div className={`panel p-5 ${tone === 'revenue' ? 'border-rose-300 bg-rose-50/40' : ''}`}>
      <p className="text-sm font-medium text-ink-700">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-600">{note}</p>}
    </div>
  );
}

function CommissionEditor({ currentBps, onSaved }) {
  const toast = useToast();
  const [text, setText] = useState(String(currentBps / 100));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const bps = percentToBps(text);
    if (bps === null) { setError('Enter a percentage from 0 to 50, with at most 2 decimals'); return; }
    setError('');
    setBusy(true);
    try {
      await paymentApi.setCommission(bps);
      toast.success(`Commission is now ${bpsLabel(bps)} for new payments.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="panel flex flex-wrap items-end gap-4 p-5">
      <TextField label="Platform commission (%)" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} error={error} className="w-48" hint="Applies to new payments only." />
      <Button type="submit" loading={busy} disabled={percentToBps(text) === currentBps}>Save rate</Button>
    </form>
  );
}

export default function AdminPaymentsPage() {
  useDocumentTitle('Payments');
  const { hasRole } = useAuth();
  const canSetCommission = hasRole(ROLES.ADMIN); // the payment follow-up role can see the rate but not change it (the API refuses too)
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const summary = useAsync((signal) => paymentApi.adminSummary(signal), []);
  const list = useAsync((signal) => paymentApi.adminList({ status, page, limit: 10 }, signal), [status, page]);
  const s = summary.data?.summary;

  return (
    <>
      <PageHeader title="Payments" description="Money that has passed through the platform, kept apart so gross value is never mistaken for revenue." actions={<Link to="/dashboard/admin/payments/follow-up" className="font-semibold underline">Payment follow-up</Link>} />

      {summary.loading && <PageLoader label="Loading totals" />}
      {summary.error && <ErrorState error={summary.error} onRetry={summary.reload} />}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Gross transaction value" value={formatRWF(s.grossTransactionValue)} note="What customers paid. Not the platform’s money." />
            <Stat label="Refunds" value={formatRWF(s.refunds)} note={`Net received ${formatRWF(s.netReceived)}`} />
            <Stat tone="revenue" label="Platform revenue" value={formatRWF(s.platformRevenue)} note={`${bpsLabel(s.commissionRateBps)} commission after refunds. Revenue is not profit: running costs aren’t subtracted.`} />
            <Stat label="Owed to providers" value={formatRWF(s.providerPayouts.pending)} note={`${formatRWF(s.providerPayouts.paid)} already paid out`} />
          </div>
          {s.providerPayouts.owedBackByProviders > 0 && <Alert tone="warning" className="mt-4">Providers owe back {formatRWF(s.providerPayouts.owedBackByProviders)} because of refunds recorded after payout.</Alert>}
          <p className="mt-3 text-sm text-ink-700">{s.counts.succeeded} paid · {s.counts.pending} waiting ({formatRWF(s.pendingPaymentsValue)}) · {s.counts.failed} failed · {s.counts.cancelled} cancelled</p>
          {canSetCommission
            ? <div className="mt-6"><CommissionEditor key={s.commissionRateBps} currentBps={s.commissionRateBps} onSaved={summary.reload} /></div>
            : <p className="mt-6 text-sm text-ink-700">Commission rate: {bpsLabel(s.commissionRateBps)}. Only administrators can change it.</p>}
        </>
      )}

      <h2 className="mb-3 mt-10 text-xl font-semibold">All payments</h2>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>
      {list.loading && <PageLoader label="Loading payments" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No payments" description="Payments appear here when customers pay for jobs." />}
      {list.data?.length > 0 && (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Payments</caption>
              <thead className="border-b border-ink-100 bg-ink-50 text-ink-800">
                <tr>{['Job', 'Customer → provider', 'Amount', 'Method', 'Status', 'Date'].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {list.data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3"><Link to={`/dashboard/bookings/${p.booking}`} className="font-medium underline">{p.bookingTitle}</Link></td>
                    <td className="px-4 py-3">{p.customerName} → {p.providerName}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatRWF(p.amount)}{p.refundedAmount > 0 && <span className="block text-xs text-ink-600">{formatRWF(p.refundedAmount)} refunded</span>}</td>
                    <td className="px-4 py-3 capitalize">{p.gateway}</td>
                    <td className="px-4 py-3"><Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
