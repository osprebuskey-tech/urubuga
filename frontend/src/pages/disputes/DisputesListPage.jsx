import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { ButtonLink } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { disputeApi } from '../../services/disputeApi';
import { DISPUTE_STATUS } from '../../utils/constants';
import { formatDate, formatRWF } from '../../utils/format';

const FILTERS = [{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'under_review', label: 'Under review' }, { value: 'resolved', label: 'Resolved' }];

/** Problems you reported, or that were reported on your jobs. Open one to read the conversation and add a message or photo. */
export default function DisputesListPage() {
  useDocumentTitle('My disputes');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => disputeApi.list({ status, page, limit: 10 }, signal), [status, page]);

  return (
    <>
      <PageHeader title="My disputes" description="Problems reported on your jobs. An administrator reads both sides before deciding." />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>
      {list.loading && !list.data && <PageLoader label="Loading disputes" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="No disputes"
          description={status ? 'No disputes match this filter.' : 'If something goes wrong on a job, you can report it from the job’s page. It will appear here.'}
          action={<ButtonLink to="/dashboard/bookings" variant="outline">Go to my jobs</ButtonLink>}
        />
      )}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-3">
            {list.data.map((d) => (
              <li key={d.id} className="panel relative p-5 hover:border-ink-300">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold"><Link to={`/dashboard/disputes/${d.id}`} className="after:absolute after:inset-0 hover:underline">{d.booking.title}</Link></h3>
                    <p className="mt-1 text-sm text-ink-700">{d.customer.name} and {d.provider.name} · {formatRWF(d.booking.agreedPrice)} · opened by the {d.openerRole} on {formatDate(d.createdAt)}</p>
                    <p className="mt-2 line-clamp-2 max-w-prose text-ink-800">{d.reason}</p>
                  </div>
                  <Badge tone={DISPUTE_STATUS[d.status].tone}>{DISPUTE_STATUS[d.status].label}</Badge>
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
