import { Link, useParams } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Rating from '../components/ui/Rating';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/feedback';
import ProviderReviews from '../features/reviews/ProviderReviews';
import { ButtonLink } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { catalogApi } from '../services/catalogApi';
import { ROLES } from '../utils/constants';
import { formatDate, plural } from '../utils/format';

/** Providers' phone numbers and emails are private. They are shared with a customer only after the provider accepts their job. */
export function ContactDetails() {
  return <p className="text-ink-700">Contact details are private. Send a request: when the provider accepts your job, you both see each other’s phone and email.</p>;
}

export default function ProviderProfilePage() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const { data, loading, error, reload } = useAsync((signal) => catalogApi.getProvider(id, signal), [id]);
  const p = data?.provider;
  useDocumentTitle(p?.displayName ?? 'Provider');

  if (loading) return <PageLoader label="Loading provider" />;
  if (error?.status === 404) {
    return (
      <div className="container-page py-16 text-center">
        <h1 className="text-3xl font-bold">Provider not found</h1>
        <p className="mt-2 text-ink-700">This provider may not be verified yet, or the link is wrong.</p>
        <Link to="/search?type=providers" className="mt-6 inline-block font-semibold text-teal-700 underline">Browse providers</Link>
      </div>
    );
  }
  if (error) return <div className="container-page py-10"><ErrorState error={error} onRetry={reload} /></div>;

  return (
    <div className="container-page py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-700"><Link to="/search?type=providers" className="underline">Providers</Link> / {p.displayName}</nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <header className="flex flex-wrap items-start gap-5">
            <Avatar name={p.displayName} src={p.avatarUrl} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold">{p.displayName}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {p.verified && <VerifiedBadge />}
                <Rating value={p.ratingAvg} count={p.ratingCount} size="lg" />
              </div>
              <p className="mt-2 text-ink-700">
                {[p.location?.district && `Based in ${[p.location.sector, p.location.district].filter(Boolean).join(', ')}`, p.experienceYears != null && `${plural(p.experienceYears, 'year')} of experience`, `${plural(p.completedJobs, 'job')} completed`].filter(Boolean).join(' · ')}
              </p>
            </div>
          </header>

          {p.bio && <section aria-labelledby="about"><h2 id="about" className="mb-2 text-xl font-semibold">About</h2><p className="max-w-prose whitespace-pre-line text-ink-800">{p.bio}</p></section>}

          {(p.skills.length > 0 || p.categories.length > 0) && (
            <section aria-labelledby="skills">
              <h2 id="skills" className="mb-3 text-xl font-semibold">Skills and services</h2>
              {p.categories.length > 0 && (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {p.categories.map((c) => <li key={c.id}><Link to={`/search?category=${c.id}`} className="inline-block rounded-full bg-ink-900 px-3 py-1 text-sm font-medium text-white">{c.name}</Link></li>)}
                </ul>
              )}
              <ul className="flex flex-wrap gap-2">{p.skills.map((s) => <li key={s} className="rounded-full bg-ink-50 px-3 py-1 text-sm text-ink-800">{s}</li>)}</ul>
            </section>
          )}

          <ProviderReviews providerId={p.id} />

          <section aria-labelledby="portfolio">
            <h2 id="portfolio" className="mb-3 text-xl font-semibold">Portfolio</h2>
            {p.portfolio.length === 0 ? <p className="text-ink-700">No portfolio items yet.</p> : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {p.portfolio.map((item) => (
                  <li key={item.id} className="panel overflow-hidden">
                    <img src={item.imageUrl} alt={item.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    <div className="p-4"><h3 className="font-semibold">{item.title}</h3>{item.description && <p className="mt-1 text-sm text-ink-700">{item.description}</p>}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {(!user || hasRole(ROLES.CUSTOMER, ROLES.BUSINESS)) && (
            <ButtonLink to={`/dashboard/requests/new?provider=${p.id}${p.categories[0] ? `&category=${p.categories[0].id}` : ''}`} size="lg" className="w-full">Request a quotation</ButtonLink>
          )}
          <div className="panel p-5">
            <h2 className="text-lg font-semibold">Contact</h2>
            <div className="mt-3"><ContactDetails provider={p} /></div>
          </div>
          {p.coverage.length > 0 && (
            <div className="panel p-5">
              <h2 className="text-lg font-semibold">Where they work</h2>
              <p className="mt-2 text-ink-800">{p.coverage.join(', ')}</p>
            </div>
          )}
          <p className="text-sm text-ink-600">Member since {formatDate(p.memberSince, { month: 'long', year: 'numeric' })}</p>
        </aside>
      </div>
    </div>
  );
}
