import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { Stars } from '../../components/ui/Rating';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import Dialog, { ConfirmDialog } from '../../components/ui/Dialog';
import { TextAreaField } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { reviewApi } from '../../services/reviewApi';
import { REPORT_REASONS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const FILTERS = [
  { key: 'reported', label: 'Reported', query: { reported: 'true', status: 'published' } },
  { key: 'published', label: 'Published', query: { status: 'published' } },
  { key: 'hidden', label: 'Hidden', query: { status: 'hidden' } },
  { key: 'all', label: 'All', query: {} },
];
const reasonLabel = (v) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

function HideDialog({ review, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 5) { setError('Give a reason of at least 5 characters. The author will see it.'); return; }
    setBusy(true);
    try {
      await reviewApi.moderate(review.id, { status: 'hidden', reason: reason.trim() });
      toast.success('Review hidden. The provider’s rating was updated.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <TextAreaField label="Why is it being hidden?" value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} maxLength={500} required hint="The customer who wrote it is told this reason." />
      <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="secondary" onClick={submit} loading={busy}>Hide review</Button></div>
    </div>
  );
}

export default function AdminReviewsPage() {
  useDocumentTitle('Review moderation');
  const toast = useToast();
  const [filter, setFilter] = useState('reported');
  const [page, setPage] = useState(1);
  const [hiding, setHiding] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const [busy, setBusy] = useState(false);
  const query = FILTERS.find((f) => f.key === filter).query;
  const list = useAsync((signal) => reviewApi.adminList({ ...query, page, limit: 10 }, signal), [filter, page]);

  const restore = async () => {
    setBusy(true);
    try {
      await reviewApi.moderate(restoring.id, { status: 'published' });
      toast.success('Review restored.');
      setRestoring(null);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
      setRestoring(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Review moderation" description="Providers can report reviews. Hiding one removes it from public view and from the provider’s rating." />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter reviews">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${filter === f.key ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>

      {list.loading && <PageLoader label="Loading reviews" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="Nothing to review" description={filter === 'reported' ? 'No published reviews have been reported.' : 'No reviews match this filter.'} />}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-4">
            {list.data.map((r) => (
              <li key={r.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={r.rating} />
                  <Badge tone={r.status === 'published' ? 'success' : 'danger'}>{r.status === 'published' ? 'Published' : 'Hidden'}</Badge>
                  {r.reportCount > 0 && <Badge tone="warning">Reported {r.reportCount}×</Badge>}
                  <span className="text-sm text-ink-700">{formatDate(r.createdAt)}</span>
                </div>
                <p className="mt-2 max-w-prose whitespace-pre-line text-ink-800">{r.comment}</p>
                <p className="mt-2 text-sm text-ink-700">By {r.reviewer.name} about <Link to={`/providers/${r.provider.id}`} className="underline">{r.provider.displayName}</Link> · <Link to={`/dashboard/bookings/${r.booking}`} className="underline">view the job</Link></p>
                {r.reports.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm">
                    {r.reports.map((x, i) => <li key={i}><span className="font-semibold">{reasonLabel(x.reason)}</span>{x.note ? `: ${x.note}` : ''}</li>)}
                  </ul>
                )}
                {r.status === 'hidden' && r.hiddenReason && <p className="mt-2 text-sm text-rose-700">Hidden because: {r.hiddenReason}</p>}
                <div className="mt-4">
                  {r.status === 'published'
                    ? <Button variant="danger" size="sm" onClick={() => setHiding(r)}>Hide review</Button>
                    : <Button variant="outline" size="sm" onClick={() => setRestoring(r)}>Restore review</Button>}
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}

      <Dialog open={Boolean(hiding)} onClose={() => setHiding(null)} title="Hide this review?">
        {hiding && <HideDialog review={hiding} onClose={() => setHiding(null)} onDone={() => { setHiding(null); list.reload(); }} />}
      </Dialog>
      <ConfirmDialog open={Boolean(restoring)} onClose={() => setRestoring(null)} onConfirm={restore} loading={busy} title="Restore this review?" confirmLabel="Restore">
        <p>It will show on the provider’s profile again and count towards their rating.</p>
      </ConfirmDialog>
    </>
  );
}
