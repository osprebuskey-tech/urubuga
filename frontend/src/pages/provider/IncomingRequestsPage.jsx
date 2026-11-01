import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, EmptyState, ErrorState } from '../../components/ui/feedback';
import { SelectField } from '../../components/ui/Field';
import RequestCard from '../../features/requests/RequestCard';
import { useAsync } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { requestApi } from '../../services/requestApi';

export default function IncomingRequestsPage() {
  useDocumentTitle('Requests for you');
  const { categories } = useCategories();
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const list = useAsync((signal) => requestApi.list({ scope: 'incoming', category, page, limit: 10 }, signal), [category, page]);

  const blocked = list.error && ['PROFILE_REQUIRED', 'PROVIDER_NOT_VERIFIED'].includes(list.error.code);

  return (
    <>
      <PageHeader title="Requests for you" description="Open jobs in your categories, and requests sent directly to you." />
      {blocked && (
        <Alert tone="warning" title={list.error.code === 'PROFILE_REQUIRED' ? 'Create your provider profile first' : 'Your profile isn’t verified yet'}>
          {list.error.code === 'PROFILE_REQUIRED' ? 'Requests are matched to the categories on your profile.' : 'You’ll see and answer requests once an administrator verifies your profile.'}{' '}
          <Link to="/dashboard/provider/profile" className="font-semibold underline">Open your profile</Link>
        </Alert>
      )}
      {!blocked && (
        <>
          <SelectField label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} placeholder="All my categories" options={categories.map((c) => ({ value: c.id, label: c.name }))} className="mb-5 max-w-xs" />
          {list.loading && <PageLoader label="Loading requests" />}
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {list.data?.length === 0 && <EmptyState title="No open requests right now" description="New requests in your categories will appear here, and you’ll get a notification." />}
          {list.data?.length > 0 && (
            <>
              <ul className="space-y-3">{list.data.map((r) => <RequestCard key={r.id} request={r} />)}</ul>
              <Pagination meta={list.meta} onPage={setPage} />
            </>
          )}
        </>
      )}
    </>
  );
}
