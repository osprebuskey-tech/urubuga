import { useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { PageLoader } from '../components/ui/Spinner';
import { EmptyState, ErrorState } from '../components/ui/feedback';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { verificationApi } from '../services/verificationApi';
import { ROLES } from '../utils/constants';
import { formatDate } from '../utils/format';

/** Customers see the ratings they gave; providers see the ratings they received, with the average, the count and a month-by-month history. */
export default function RatingHistoryPage() {
  useDocumentTitle('Rating history');
  const { hasRole } = useAuth();
  const isProvider = hasRole(ROLES.PROVIDER);
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.history({ as: isProvider ? 'provider' : 'customer', page, limit: 10 }, signal), [page, isProvider]);

  if (loading) return <PageLoader label="Loading" />;
  if (error?.code === 'PROVIDER_NOT_FOUND') return <EmptyState title="No provider profile yet" description="Ratings you receive will appear here once you have one." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Rating history" description={isProvider ? 'What customers said about your completed jobs.' : 'The ratings you gave to providers after completed jobs.'} />
      {isProvider && data.summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="panel p-5"><p className="text-sm text-ink-700">Average rating</p><p className="font-display text-3xl font-bold">{data.summary.count ? data.summary.average.toFixed(1) : '–'}</p></div>
          <div className="panel p-5"><p className="text-sm text-ink-700">Reviews</p><p className="font-display text-3xl font-bold">{data.summary.count}</p></div>
          <div className="panel p-5"><p className="text-sm text-ink-700">Completed jobs</p><p className="font-display text-3xl font-bold">{data.summary.completedJobs}</p></div>
        </div>
      )}
      {isProvider && data.months.length > 0 && (
        <section className="panel mb-6 p-5" aria-labelledby="months-h">
          <h2 id="months-h" className="mb-3 text-lg font-semibold">By month</h2>
          <ul className="space-y-1.5 text-sm">{data.months.map((m) => <li key={m.month} className="flex items-center gap-3"><span className="w-20">{m.month}</span><span className="h-2 flex-1 rounded bg-ink-100"><span className="block h-2 rounded bg-sage-600" style={{ width: `${(m.average / 5) * 100}%` }} /></span><span className="w-28 text-right">{m.average.toFixed(1)} ★ ({m.count})</span></li>)}</ul>
        </section>
      )}
      {data.items.length === 0 ? <EmptyState title="No ratings yet" /> : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="panel p-5">
              <p className="font-semibold"><span aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span> <span className="ml-2 text-sm font-normal text-ink-700">{isProvider ? `${r.reviewer} · ` : `${r.provider} · `}{r.job} · {formatDate(r.createdAt)}</span></p>
              <p className="mt-1 text-ink-800">{r.comment}</p>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
