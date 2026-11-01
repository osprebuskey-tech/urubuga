import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { contractApi } from '../../services/verificationApi';
import { formatDate } from '../../utils/format';

/** Every service contract, newest first. Open the job to read the full contract and its acceptance record. */
export default function AdminContractsPage() {
  useDocumentTitle('Contracts');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useAsync((signal) => contractApi.adminList({ page, limit: 20 }, signal), [page]);
  return (
    <>
      <PageHeader title="Service contracts" description="One contract per accepted job. Both sides must accept before work begins." />
      {loading ? <PageLoader label="Loading contracts" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="No contracts yet" />
          : (
            <ul className="space-y-3">
              {data.map((c) => (
                <li key={c.id}>
                  <Link to={`/dashboard/bookings/${c.booking}`} className="panel flex flex-wrap items-center gap-4 p-4 hover:border-teal-300">
                    <div className="min-w-0 flex-1"><p className="font-semibold">{c.bookingTitle}</p><p className="text-sm text-ink-700">{c.customer} with {c.provider} · version {c.version} · {formatDate(c.createdAt)}</p></div>
                    {c.legacy && <Badge>Created by migration</Badge>}
                    <Badge tone={c.status === 'accepted' ? 'success' : 'warning'}>{c.status === 'accepted' ? 'Signed by both' : 'Waiting for signatures'}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      <Pagination meta={meta} onPage={setPage} />
    </>
  );
}
