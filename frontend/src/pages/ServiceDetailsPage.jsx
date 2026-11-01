import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Rating from '../components/ui/Rating';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import { Badge, ErrorState } from '../components/ui/feedback';
import { ButtonLink } from '../components/ui/Button';
import { PageLoader } from '../components/ui/Spinner';
import { ContactDetails } from './ProviderProfilePage';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useCategories } from '../hooks/useCategories';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { catalogApi } from '../services/catalogApi';
import { DAYS, LISTING_STATUS, ROLES } from '../utils/constants';
import { priceLabel, pricingTypeLabel, unslug } from '../utils/format';

function Gallery({ images, title }) {
  const [index, setIndex] = useState(0);
  if (!images.length) {
    return <div className="flex aspect-[16/10] items-center justify-center rounded-xl bg-ink-50 text-ink-400">No photos yet</div>;
  }
  const current = images[Math.min(index, images.length - 1)];
  return (
    <div>
      <img src={current.url} alt={`${title}, photo ${index + 1} of ${images.length}`} className="aspect-[16/10] w-full rounded-xl object-cover" />
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <li key={img.id}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === index} className={`block h-16 w-24 overflow-hidden rounded-lg border-2 ${i === index ? 'border-rose-700' : 'border-transparent'}`}>
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ServiceDetailsPage() {
  const { id } = useParams();
  const { categories } = useCategories();
  const { user, hasRole } = useAuth();
  const { data, loading, error, reload } = useAsync((signal) => catalogApi.getService(id, signal), [id]);
  const s = data?.service;
  const providerId = s?.provider?.id;
  const provider = useAsync((signal) => (providerId ? catalogApi.getProvider(providerId, signal) : Promise.resolve({ data: null })), [providerId]);
  useDocumentTitle(s?.title ?? 'Service');

  if (loading) return <PageLoader label="Loading service" />;
  if (error?.status === 404) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-3xl font-bold">Service not found</h1>
        <p className="mt-2 text-ink-700">It may have been removed, or it isn’t live.</p>
        <Link to="/search" className="mt-6 inline-block font-semibold text-teal-700 underline">Find other services</Link>
      </div>
    );
  }
  if (error) return <div className="container-page py-10"><ErrorState error={error} onRetry={reload} /></div>;

  const subName = categories.find((c) => c.id === s.category.id)?.subcategories.find((x) => x.slug === s.subcategory)?.name ?? unslug(s.subcategory);
  const days = DAYS.filter((d) => s.availability.days.includes(d.value));

  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-700">
        <Link to="/search" className="underline">Services</Link> / <Link to={`/search?category=${s.category.id}`} className="underline">{s.category.name}</Link>
      </nav>

      {s.status && s.status !== 'active' && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <Badge tone={LISTING_STATUS[s.status].tone}>{LISTING_STATUS[s.status].label}</Badge>
          <span>Only you can see this listing until it’s live.</span>
          <Link to={`/dashboard/provider/services/${s.id}/edit`} className="font-semibold underline">Edit listing</Link>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          <Gallery images={s.images} title={s.title} />
          <header>
            <p className="text-ink-700">{s.category.name}{subName ? ` · ${subName}` : ''}</p>
            <h1 className="mt-1 text-3xl font-bold">{s.title}</h1>
          </header>
          <section aria-labelledby="desc"><h2 id="desc" className="mb-2 text-xl font-semibold">About this service</h2><p className="max-w-prose whitespace-pre-line text-ink-800">{s.description}</p></section>
          <section aria-labelledby="details">
            <h2 id="details" className="mb-3 text-xl font-semibold">Details</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-sm text-ink-600">Pricing</dt><dd className="font-medium">{pricingTypeLabel(s.pricingType)}</dd></div>
              {s.estimatedDuration && <div><dt className="text-sm text-ink-600">Usually takes</dt><dd className="font-medium">{s.estimatedDuration}</dd></div>}
              <div><dt className="text-sm text-ink-600">Location</dt><dd className="font-medium">{[s.location.sector, s.location.district].filter(Boolean).join(', ')}</dd></div>
              {(days.length > 0 || s.availability.notes) && (
                <div><dt className="text-sm text-ink-600">Availability</dt><dd className="font-medium">{days.map((d) => d.label).join(', ')}{s.availability.notes ? `${days.length ? '. ' : ''}${s.availability.notes}` : ''}</dd></div>
              )}
            </dl>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="panel p-5">
            <p className="font-display text-2xl font-bold text-rose-700">{priceLabel(s)}</p>
            <p className="mt-1 text-sm text-ink-600">Final price is agreed with the provider.</p>
            {(!user || hasRole(ROLES.CUSTOMER, ROLES.BUSINESS)) && (
              <ButtonLink to={`/dashboard/requests/new?provider=${s.provider.id}&category=${s.category.id}`} size="lg" className="mt-4 w-full">Request a quotation</ButtonLink>
            )}
          </div>
          <div className="panel p-5">
            <div className="flex items-start gap-3">
              <Avatar name={s.provider.displayName} src={s.provider.avatarUrl} />
              <div className="min-w-0">
                <h2 className="font-semibold">{s.provider.displayName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">{s.provider.verified && <VerifiedBadge />}<Rating value={s.provider.ratingAvg} count={s.provider.ratingCount} /></div>
              </div>
            </div>
            <ButtonLink to={`/providers/${s.provider.id}`} variant="outline" className="mt-4 w-full">View profile and portfolio</ButtonLink>
          </div>
          <div className="panel p-5">
            <h2 className="mb-3 text-lg font-semibold">Contact</h2>
            {provider.loading ? <p className="text-ink-600">Loading…</p> : provider.data?.provider ? <ContactDetails provider={provider.data.provider} /> : <p className="text-ink-700">Contact details aren’t available right now.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
