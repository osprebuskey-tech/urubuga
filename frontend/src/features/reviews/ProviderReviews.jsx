import { useState } from 'react';
import Pagination from '../../components/ui/Pagination';
import { Stars } from '../../components/ui/Rating';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { reviewApi } from '../../services/reviewApi';
import ReviewCard from './ReviewCard';

function Summary({ summary }) {
  const max = Math.max(1, ...Object.values(summary.distribution));
  return (
    <div className="flex flex-wrap items-center gap-8">
      <div>
        <p className="font-display text-5xl font-bold">{summary.average.toFixed(1)}</p>
        <Stars value={Math.round(summary.average)} className="h-5 w-5" />
        <p className="mt-1 text-sm text-ink-700">{summary.count} review{summary.count === 1 ? '' : 's'}</p>
      </div>
      <ul className="min-w-[14rem] flex-1 space-y-1.5" aria-label="Ratings breakdown">
        {[5, 4, 3, 2, 1].map((n) => (
          <li key={n} className="flex items-center gap-3 text-sm">
            <span className="w-12 shrink-0 text-ink-700">{n} star{n === 1 ? '' : 's'}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-amber-500" style={{ width: `${(summary.distribution[n] / max) * 100}%` }} /></span>
            <span className="w-6 text-right text-ink-700">{summary.distribution[n]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProviderReviews({ providerId }) {
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => reviewApi.forProvider(providerId, { page, limit: 5 }, signal), [providerId, page]);
  const summary = list.meta?.summary;

  return (
    <section aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="mb-3 text-xl font-semibold">Reviews</h2>
      {list.loading && !list.data && <PageLoader label="Loading reviews" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} title="Reviews didn’t load" />}
      {summary && summary.count === 0 && <p className="text-ink-700">No reviews yet. Customers can review a provider after a completed job.</p>}
      {summary && summary.count > 0 && (
        <>
          <Summary summary={summary} />
          <div className="mt-4">{list.data?.map((r) => <ReviewCard key={r.id} review={r} />)}</div>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </section>
  );
}
