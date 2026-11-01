import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Button, { ButtonLink } from '../../components/ui/Button';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { useAsync, allowCode } from '../../hooks/useAsync';
import { useCategories } from '../../hooks/useCategories';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { providerApi } from '../../services/providerApi';
import { LISTING_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { priceLabel } from '../../utils/format';

const FILTERS = [{ value: '', label: 'All' }, { value: 'active', label: 'Live' }, { value: 'draft', label: 'Drafts' }, { value: 'paused', label: 'Paused' }];

export default function MyServicesPage() {
  useDocumentTitle('My services');
  const toast = useToast();
  const { categories } = useCategories();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [archiving, setArchiving] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const list = useAsync((signal) => allowCode(providerApi.myServices({ page, limit: 10, status }, signal), 'PROFILE_REQUIRED'), [page, status]);
  const categoryName = (id) => categories.find((c) => c.id === id)?.name ?? '';

  const setListingStatus = async (listing, next) => {
    setBusyId(listing.id);
    try {
      await providerApi.updateService(listing.id, { status: next });
      toast.success(next === 'active' ? 'Your service is live.' : 'Your service is paused.');
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const archive = async () => {
    setArchiveBusy(true);
    try {
      await providerApi.archiveService(archiving.id);
      toast.success('Listing archived.');
      setArchiving(null);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setArchiveBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="My services" description="The services customers can find you through." actions={<ButtonLink to="/dashboard/provider/services/new">New service</ButtonLink>} />

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{f.label}</button>
        ))}
      </div>

      {list.loading && <PageLoader label="Loading your services" />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && !list.data && (
        <EmptyState title="Create your provider profile first" description="Listings belong to your provider profile." action={<ButtonLink to="/dashboard/provider/profile">Create profile</ButtonLink>} />
      )}
      {list.data && list.data.length === 0 && (
        <EmptyState title={status ? 'No services with this status' : 'You haven’t listed a service yet'} description="Add a service so customers can find and contact you." action={<ButtonLink to="/dashboard/provider/services/new">New service</ButtonLink>} />
      )}
      {list.data?.length > 0 && (
        <>
          <ul className="space-y-3">
            {list.data.map((l) => {
              const st = LISTING_STATUS[l.status];
              return (
                <li key={l.id} className="panel flex flex-wrap items-center gap-4 p-4">
                  {l.images?.[0] ? <img src={l.images[0].url} alt="" className="h-16 w-24 rounded-lg object-cover" /> : <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-ink-50 text-xs text-ink-500" aria-hidden="true">No photo</div>}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2"><span className="font-semibold">{l.title}</span><Badge tone={st.tone}>{st.label}</Badge></p>
                    <p className="text-sm text-ink-700">{[categoryName(l.category), priceLabel(l), l.location?.district].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {l.status === 'active' && <Link to={`/services/${l.id}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-teal-700 underline">View</Link>}
                    <ButtonLink to={`/dashboard/provider/services/${l.id}/edit`} variant="outline" size="sm">Edit<span className="sr-only"> {l.title}</span></ButtonLink>
                    {l.status === 'active'
                      ? <Button variant="outline" size="sm" loading={busyId === l.id} onClick={() => setListingStatus(l, 'paused')}>Pause<span className="sr-only"> {l.title}</span></Button>
                      : <Button variant="outline" size="sm" loading={busyId === l.id} onClick={() => setListingStatus(l, 'active')}>Publish<span className="sr-only"> {l.title}</span></Button>}
                    <Button variant="danger" size="sm" onClick={() => setArchiving(l)}>Archive<span className="sr-only"> {l.title}</span></Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination meta={list.meta} onPage={setPage} />
        </>
      )}

      <ConfirmDialog open={Boolean(archiving)} onClose={() => setArchiving(null)} onConfirm={archive} loading={archiveBusy} title="Archive this listing?" confirmLabel="Archive" danger>
        <p>“{archiving?.title}” will disappear from search and from this list. This can’t be undone from here.</p>
      </ConfirmDialog>
    </>
  );
}
