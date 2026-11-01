import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { VERIFICATION_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

/** Administrators' recommendations of highly rated providers. Advice only: approval still needs the provider's own paid application. */
export default function RecommendationsPage() {
  useDocumentTitle('Recommendations');
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.recommendations({ status, page, limit: 20 }, signal), [status, page]);
  const resolve = async (id, next) => {
    try { await verificationApi.resolveRecommendation(id, { status: next }); toast.success(next === 'dismissed' ? 'Dismissed.' : 'Marked as actioned.'); reload(); } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <>
      <PageHeader title="Recommendations" description="Providers an administrator recommends for verification, with the ratings behind it. You make the final decision on each application." />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter">
        {[['open', 'Open'], ['actioned', 'Actioned'], ['dismissed', 'Dismissed'], ['', 'All']].map(([v, l]) => <Button key={l} size="sm" variant={status === v ? 'primary' : 'outline'} aria-pressed={status === v} onClick={() => { setStatus(v); setPage(1); }}>{l}</Button>)}
      </div>
      {loading ? <PageLoader label="Loading" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="No recommendations" />
          : (
            <ul className="space-y-3">
              {data.map((r) => (
                <li key={r.id} className="panel space-y-2 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold">{r.provider.displayName}</h2>
                    <Badge tone={r.status === 'open' ? 'warning' : 'neutral'}>{r.status}</Badge>
                    {r.application ? <Badge tone="info">Application: {VERIFICATION_STATUS[r.application.status].label}</Badge> : <Badge>Has not applied yet</Badge>}
                  </div>
                  <p className="text-sm text-ink-800">{r.ratings.average.toFixed(1)} stars from {r.ratings.count} reviews · {r.ratings.completedJobs} completed jobs</p>
                  <p className="text-sm">“{r.note}” <span className="text-ink-600">· {r.recommendedBy}, {formatDate(r.createdAt)}</span></p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.application && <Link to={`/dashboard/admin/verification/${r.application.id}`} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700">Open the application</Link>}
                    {r.status === 'open' && <><Button size="sm" variant="outline" onClick={() => resolve(r.id, 'actioned')}>Mark as actioned</Button><Button size="sm" variant="outline" onClick={() => resolve(r.id, 'dismissed')}>Dismiss</Button></>}
                  </div>
                </li>
              ))}
            </ul>
          )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
