import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState, ErrorState } from '../../components/ui/feedback';
import { ButtonLink } from '../../components/ui/Button';
import BookingCard from '../../features/bookings/BookingCard';
import { useAuth } from '../../context/AuthContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { bookingApi } from '../../services/bookingApi';
import { ROLES } from '../../utils/constants';

const FILTERS = [
  { value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Problems' }, { value: 'cancelled', label: 'Cancelled' },
];

export default function BookingsPage() {
  useDocumentTitle('Jobs');
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ROLES.ADMIN);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [everyone, setEveryone] = useState(false);
  const list = useAsync((signal) => bookingApi.list({ status, page, limit: 10, scope: everyone ? 'all' : undefined }, signal), [status, page, everyone]);

  return (
    <>
      <PageHeader title="Jobs" description="Work you’ve booked or been booked for, from acceptance to completion." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
          ))}
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={everyone} onChange={(e) => { setEveryone(e.target.checked); setPage(1); }} className="h-4 w-4 accent-rose-700" />
            Show every job (administrator)
          </label>
        )}
      </div>

      {list.loading && <PageLoader label="Loading jobs" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <EmptyState
          title={status ? 'No jobs with this status' : 'No jobs yet'}
          description="A job is created when a customer accepts a provider’s quotation."
          action={hasRole(ROLES.CUSTOMER, ROLES.BUSINESS) ? <ButtonLink to="/dashboard/requests/new">Request a quotation</ButtonLink> : hasRole(ROLES.PROVIDER) ? <ButtonLink to="/dashboard/provider/requests">See requests for you</ButtonLink> : null}
        />
      )}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-3">{list.data.map((b) => <BookingCard key={b.id} booking={b} />)}</ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
