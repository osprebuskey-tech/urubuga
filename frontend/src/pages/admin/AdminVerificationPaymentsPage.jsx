import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import DocumentPreview from '../../components/DocumentPreview';
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

/** The applicant's uploaded documents. Opening each one (audited) is what unlocks confirming the payment, for administrators. */
function Documents({ docs, onOpen }) {
  if (!docs) return null;
  if (docs.length === 0) return <p className="mt-3 text-sm text-ink-700">No documents are attached to this application.</p>;
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold">Uploaded documents</p>
      <ul className="mt-1 space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm">
            <span><strong>{d.label}</strong> <span className="text-ink-700">{d.originalName}</span></span>
            <span className="flex items-center gap-2">
              <Badge tone={d.openedByMe ? 'success' : 'warning'}>{d.openedByMe ? 'Opened' : 'Not opened yet'}</Badge>
              <Button size="sm" variant="outline" onClick={() => onOpen(d)}>{d.openedByMe ? 'Open again' : 'Open'}<span className="sr-only"> {d.label}</span></Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ p, onChanged, onOpen }) {
  const toast = useToast();
  const { hasRole } = useAuth();
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const manualPending = p.status === 'pending' && p.gateway === 'manual';
  const isAdminViewer = Array.isArray(p.documents); // only administrators receive the documents
  const unopened = isAdminViewer ? p.documents.filter((d) => !d.openedByMe).length : 0;
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
          {isAdminViewer && <p className="text-sm text-ink-700">{p.applicantEmail}{p.applicantPhone ? ` · ${p.applicantPhone}` : ''}</p>}
          <p className="text-sm text-ink-700">{PAYMENT_METHOD_LABELS[p.method]} · {p.gateway === 'manual' ? 'paid outside the app' : 'online gateway'}{p.payerPhone ? ` · from ${p.payerPhone}` : ''} · {formatDate(p.createdAt)}{p.gatewayReference ? ` · ref ${p.gatewayReference}` : ''}</p>
        </div>
        <Badge tone={TONE[p.status]}>{p.status === 'succeeded' ? 'Confirmed' : p.status === 'pending' ? 'Waiting' : p.status}</Badge>
        {hasRole(ROLES.ADMIN) && <Link to={`/dashboard/admin/verification/${p.applicationId}`} className="text-sm font-semibold text-teal-700 underline">Full application and details</Link>}
      </div>
      {manualPending && (
        <>
          <Documents docs={p.documents} onOpen={onOpen} />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <TextField label="Transaction reference" value={reference} onChange={(e) => setReference(e.target.value)} error={error} maxLength={100} className="w-64" />
            <Button size="sm" loading={busy} disabled={unopened > 0} onClick={confirm}>I saw the money: confirm</Button>
          </div>
          {unopened > 0 && <p className="mt-2 text-sm font-medium text-amber-900">Open {unopened === 1 ? 'the uploaded document' : `all ${unopened} uploaded documents`} and check them against the applicant’s details before confirming the payment.</p>}
        </>
      )}
      {!manualPending && <Documents docs={p.documents} onOpen={onOpen} />}
      {p.status === 'pending' && p.gateway !== 'manual' && <p className="mt-2 text-sm text-ink-600">Confirmed automatically when the gateway reports success. It cannot be confirmed by hand.</p>}
    </li>
  );
}

/** Staff confirm that a manual verification payment arrived, with its reference. Only then can the review start. */
export default function AdminVerificationPaymentsPage() {
  useDocumentTitle('Verification payments');
  const [filters, setFilters] = useState({ status: 'pending', page: 1 });
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.payments({ ...filters, limit: 20 }, signal), [filters.status, filters.page]);
  const [preview, setPreview] = useState(null);
  return (
    <>
      <PageHeader title="Verification payments" description="Open the applicant’s documents and check their details first, then confirm a payment only after you have seen the money. A payment never verifies anyone: it only opens the review." />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {[['pending', 'Waiting'], ['succeeded', 'Confirmed'], ['failed', 'Failed'], ['', 'All']].map(([value, label]) => (
          <Button key={label} size="sm" variant={filters.status === value ? 'primary' : 'outline'} aria-pressed={filters.status === value} onClick={() => setFilters({ status: value, page: 1 })}>{label}</Button>
        ))}
      </div>
      {loading ? <PageLoader label="Loading payments" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="Nothing here" description="No verification payments match this filter." />
          : <ul className="space-y-3">{data.map((p) => <Row key={p.id} p={p} onChanged={reload} onOpen={setPreview} />)}</ul>}
      <Pagination meta={meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
      <DocumentPreview doc={preview} onClose={() => { setPreview(null); reload(); }} />
    </>
  );
}
