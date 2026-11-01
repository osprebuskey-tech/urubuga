import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { PAYMENT_METHOD_LABELS, ROLES } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const TONE = { pending: 'warning', succeeded: 'success', failed: 'danger', cancelled: 'neutral' };

function Row({ p, onChanged }) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const manualPending = p.status === 'pending' && p.gateway === 'manual';
  const confirm = async () => {
    if (reference.trim().length < 4) { setError('Enter the transaction reference from the mobile money, bank or card receipt.'); return; }
    setError('');
    setBusy(true);
    try { await verificationApi.confirmPayment(p.id, { reference: reference.trim() }); toast.success('Payment confirmed. The review can start.'); onChanged(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{p.applicant} · {Number(p.amount).toLocaleString('en-US')} {p.currency}</p>
          <p className="text-sm text-ink-700">{PAYMENT_METHOD_LABELS[p.method]} · {p.gateway === 'manual' ? 'paid outside the app' : 'online gateway'}{p.payerPhone ? ` · from ${p.payerPhone}` : ''} · {formatDate(p.createdAt)}{p.gatewayReference ? ` · ref ${p.gatewayReference}` : ''}</p>
        </div>
        <Badge tone={TONE[p.status]}>{p.status === 'succeeded' ? 'Confirmed' : p.status === 'pending' ? 'Waiting' : p.status}</Badge>
        {hasRole(ROLES.ADMIN) && <Link to={`/dashboard/admin/verification/${p.applicationId}`} className="text-sm font-semibold text-teal-700 underline">Application</Link>}
      </div>
      {manualPending && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <TextField label="Transaction reference" value={reference} onChange={(e) => setReference(e.target.value)} error={error} maxLength={100} className="w-64" />
          <Button size="sm" loading={busy} onClick={confirm}>I saw the money: confirm</Button>
        </div>
      )}
      {p.status === 'pending' && p.gateway !== 'manual' && <p className="mt-2 text-sm text-ink-600">Confirmed automatically when the gateway reports success. It cannot be confirmed by hand.</p>}
    </li>
  );
}

/** Staff confirm that a manual verification payment arrived, with its reference. Only then can the review start. */
export default function AdminVerificationPaymentsPage() {
  useDocumentTitle('Verification payments');
  const [filters, setFilters] = useState({ status: 'pending', page: 1 });
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.payments({ ...filters, limit: 20 }, signal), [filters.status, filters.page]);
  return (
    <>
      <PageHeader title="Verification payments" description="Confirm a payment only after you have seen the money. A payment never verifies anyone: it only opens the review." />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {[['pending', 'Waiting'], ['succeeded', 'Confirmed'], ['failed', 'Failed'], ['', 'All']].map(([value, label]) => (
          <Button key={label} size="sm" variant={filters.status === value ? 'primary' : 'outline'} aria-pressed={filters.status === value} onClick={() => setFilters({ status: value, page: 1 })}>{label}</Button>
        ))}
      </div>
      {loading ? <PageLoader label="Loading payments" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="Nothing here" description="No verification payments match this filter." />
          : <ul className="space-y-3">{data.map((p) => <Row key={p.id} p={p} onChanged={reload} />)}</ul>}
      <Pagination meta={meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
