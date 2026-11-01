import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import RequestCard from '../../features/requests/RequestCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { requestApi } from '../../services/requestApi';

const FILTERS = [{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'accepted', label: 'Accepted' }, { value: 'cancelled', label: 'Cancelled' }];

export default function RequestsPage() {
  useDocumentTitle('My requests');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => requestApi.list({ scope: 'mine', status, page, limit: 10 }, signal), [status, page]);

  return (
    <>
      <PageHeader title="My requests" description="Jobs you’ve asked providers to quote for." actions={<ButtonLink to="/dashboard/requests/new">New request</ButtonLink>} />
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>
      {list.loading && <PageLoader label="Loading your requests" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <EmptyState title={status ? 'No requests with this status' : 'You haven’t made a request yet'} description="Describe a job and verified providers in that category can send you quotations to compare." action={<ButtonLink to="/dashboard/requests/new">Request a quotation</ButtonLink>} />
      )}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-3">{list.data.map((r) => <RequestCard key={r.id} request={r} />)}</ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
