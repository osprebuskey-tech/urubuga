import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import BookingActions from '../../features/bookings/BookingActions';
import BookingTimeline from '../../features/bookings/BookingTimeline';
import BookingReviewPanel from '../../features/reviews/BookingReviewPanel';
import PaymentPanel from '../../features/payments/PaymentPanel';
import ContractPanel from '../../features/contracts/ContractPanel';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { bookingApi } from '../../services/bookingApi';
import { BOOKING_STATUS } from '../../utils/constants';
import { formatDate, formatRWF } from '../../utils/format';

function Contact({ phone, email }) {
  return (
    <p className="mt-1 space-y-1 text-sm">
      {phone && <span className="block"><a href={`tel:${phone}`} className="font-semibold text-teal-700 underline">{phone}</a></span>}
      {email && <span className="block"><a href={`mailto:${email}`} className="break-all font-semibold text-teal-700 underline">{email}</a></span>}
    </p>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync((signal) => bookingApi.get(id, signal), [id]);
  const b = data?.booking;
  useDocumentTitle(b?.title ?? 'Job');

  if (loading) return <PageLoader label="Loading job" />;
  if (error?.status === 404) return <EmptyState title="Job not found" description="It may not be one of yours." action={<ButtonLink to="/dashboard/bookings">Back to your jobs</ButtonLink>} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const st = BOOKING_STATUS[b.status];
  const live = b.status === 'accepted' || b.status === 'in_progress';
  const isAdmin = b.myRole === 'admin';

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-700"><Link to="/dashboard/bookings" className="underline">Jobs</Link> / {b.title}</nav>
      <PageHeader title={b.title} description={`${b.category.name} · ${[b.location.sector, b.location.district].filter(Boolean).join(', ')}`} actions={<BookingActions booking={b} onChanged={reload} />} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="font-display text-2xl font-bold text-rose-700">{formatRWF(b.agreedPrice)}</span>
        <span className="text-sm text-ink-600">agreed price</span>
      </div>

      {b.dispute && (
        <Alert tone={b.status === 'disputed' ? 'error' : 'info'} title={b.status === 'disputed' ? 'A problem was reported' : 'A problem was reported earlier'} className="mb-6" action={<ButtonLink to={`/dashboard/disputes/${b.dispute.id}`} size="sm" variant="outline">Open the dispute</ButtonLink>}>
          {b.status === 'disputed' ? 'An administrator is reviewing this job. Add messages and photos in the dispute. You’ll be told the decision.' : 'See the discussion and the decision.'}
        </Alert>
      )}
      {b.status === 'completed' && b.disputeWindowEndsAt && b.allowedActions.includes('disputed') && (
        <Alert tone="info" className="mb-6">If something isn’t right you can report a problem until {formatDate(b.disputeWindowEndsAt)}.</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="panel p-6" aria-labelledby="timeline">
          <h2 id="timeline" className="mb-4 text-xl font-semibold">Progress</h2>
          <BookingTimeline history={b.history} />
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Customer</h2>
            <p className="mt-1 font-medium">{b.customer.name}</p>
            <Contact phone={b.customer.phone} email={b.customer.email} />
          </div>
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Provider</h2>
            <p className="mt-1 font-medium"><Link to={`/providers/${b.provider.id}`} className="underline">{b.provider.displayName}</Link></p>
            <Contact phone={b.provider.phone} email={b.provider.email} />
          </div>
          {live && !isAdmin && (b.contactRevealed
            ? <p className="text-sm text-ink-600">The provider accepted the job, so you can now see each other’s phone and email while the job is live.</p>
            : <p className="rounded-lg bg-sun-100 px-3 py-2 text-sm text-ink-900">Phone numbers and emails are hidden until the provider accepts the job. {b.myRole === 'provider' ? 'Accept the contract below to share yours and see the customer’s.' : 'You’ll see them as soon as the provider accepts.'}</p>)}
          <div className="panel p-5 text-sm">
            <p><Link to={`/dashboard/requests/${b.request}`} className="font-semibold text-teal-700 underline">View the original request and quotation</Link></p>
          </div>
        </aside>
      </div>

      <ContractPanel booking={b} onChanged={reload} />
      <PaymentPanel booking={b} />
      <BookingReviewPanel booking={b} onChanged={reload} />
    </>
  );
}
