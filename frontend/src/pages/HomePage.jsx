import { Link } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import Icon from '../components/Icon';
import ListingCard from '../components/ListingCard';
import ProviderCard from '../components/ProviderCard';
import PartnersStrip from '../components/PartnersStrip';
import { ButtonLink } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/ui/Spinner';
import { useCategories } from '../hooks/useCategories';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { catalogApi } from '../services/catalogApi';
import { ROLES } from '../utils/constants';

// A line icon for a trade, picked from its name. Anything else gets a briefcase.
function tradeIcon(name = '') {
  if (/photo|video|camera|film/i.test(name)) return 'camera';
  if (/electric|wiring|solar|power/i.test(name)) return 'bolt';
  if (/interior|furnitur|decor|carpent/i.test(name)) return 'sofa';
  if (/\bit\b|software|develop|network|computer|tech|graphic|web/i.test(name)) return 'terminal';
  return 'briefcase';
}

const CHECKS = [
  'National ID (or RDB certificate for a business)',
  'CV and experience for individual providers',
  'Profile: bio, categories and district',
  'Review by an administrator, then final approval',
];

const STEPS = [
  { title: 'Describe the job', text: 'Say what you need, where it is, when it has to happen and what you can pay.' },
  { title: 'Verified providers quote', text: 'Verified professionals send you quotations in Rwandan francs.' },
  { title: 'Accept and agree', text: 'Accept a quotation and both sides agree the contract before work starts.' },
  { title: 'Work happens, then closes', text: 'Track progress, rate each other, and raise a dispute if something goes wrong.' },
];

// What a signed-in person most likely came back to do, by role (the dashboard has the rest).
function quickLinks(hasRole) {
  const links = [];
  if (hasRole(ROLES.CUSTOMER, ROLES.BUSINESS)) links.push({ to: '/dashboard/requests/new', label: 'Request a quotation' }, { to: '/dashboard/requests', label: 'My requests' });
  if (hasRole(ROLES.PROVIDER)) links.push({ to: '/dashboard/provider/requests', label: 'Requests for you' }, { to: '/dashboard/provider/services', label: 'My services' });
  if (hasRole(ROLES.FINANCE)) links.push({ to: '/dashboard/admin/payments/follow-up', label: 'Payment follow-up' });
  if (hasRole(ROLES.SUPER_ADMIN)) links.push({ to: '/dashboard/super/activity', label: 'Activity report' });
  if (hasRole(ROLES.ADMIN)) links.push({ to: '/dashboard/admin/providers', label: 'Provider verification' });
  return links.slice(0, 3);
}

export default function HomePage() {
  useDocumentTitle();
  const { user, hasRole } = useAuth();
  const firstName = user?.fullName?.split(' ')[0];
  const { categories, loading: catsLoading } = useCategories();
  const services = useAsync((signal) => catalogApi.listServices({ limit: 6, sort: 'top' }, signal), []);
  const providers = useAsync((signal) => catalogApi.listProviders({ limit: 3, sort: 'top' }, signal), []);

  return (
    <>
      <section className="on-tint relative overflow-hidden bg-teal-400 py-14 text-ink-950 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sun-300/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-sage-300/60 blur-3xl" />
        <div className={`container-page relative grid items-center gap-10 ${user ? '' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16'}`}>
          <div>
            {user ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-wider text-ink-800">Welcome back</p>
                <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-[1.05] text-ink-950 sm:text-6xl">Hello, <span className="mark-accent">{firstName}.</span></h1>
                <p className="mt-5 max-w-xl text-lg text-ink-800">You’re signed in. Find someone new, or pick up where you left off.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink to="/dashboard" variant="accent" size="lg">Go to your dashboard</ButtonLink>
                  {quickLinks(hasRole).map((l) => <ButtonLink key={l.to} to={l.to} variant="outline" size="lg" className="!border-ink-900/40 !bg-transparent !text-ink-950 hover:!bg-ink-900/10">{l.label}</ButtonLink>)}
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-bold text-ink-900"><Icon name="shield" className="h-5 w-5" />Every provider is checked before their services go live</p>
                <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] text-ink-950 sm:text-6xl">Hire a verified professional </h1>
                <p className="mt-6 max-w-xl text-lg text-ink-800">Designers, IT technicians, developers, electricians and more. Every provider is checked by our team before their services go live.</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink to="/search" variant="outline" size="lg"className="!border-ink-900 !bg-transparent !text-ink-950 hover:!bg-ink-900/10">Hire a professional</ButtonLink>
                  <ButtonLink to="/register" variant="outline" size="lg" className="!border-ink-900 !bg-transparent !text-ink-950 hover:!bg-ink-900/10">Offer your skills</ButtonLink>
                </div>
              </>
            )}
            <div className="mt-8 max-w-3xl"><SearchBar /></div>
            {categories.length > 0 && (
              <ul className="mt-6 flex flex-wrap gap-2" aria-label="Popular categories">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link to={`/search?category=${c.id}`} className="inline-block rounded-full border border-ink-900/30 px-3.5 py-1.5 text-sm font-medium text-ink-950 hover:bg-ink-900/10">{c.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!user && (
            <aside aria-labelledby="checks-h" className="rounded-3xl bg-white/90 p-7 shadow-lg ring-1 ring-ink-900/10">
              <h2 id="checks-h" className="text-xl font-bold text-ink-950">What gets checked</h2>
              <ul className="mt-5 space-y-4">
                {CHECKS.map((c) => (
                  <li key={c} className="flex items-start gap-3 text-ink-800"><span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600" />{c}</li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>

      <section className="bg-paper py-14" aria-labelledby="browse-heading">
        <div className="container-page">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="browse-heading" className="text-2xl font-bold sm:text-3xl">Browse by trade</h2>
            <Link to="/categories" className="text-sm font-semibold text-teal-700 underline">See all categories</Link>
          </div>
          {catsLoading ? <PageLoader label="Loading categories" /> : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {categories.slice(0, 8).map((c) => (
                <li key={c.id} className="panel relative p-6 shadow-sm transition-shadow hover:shadow-md">
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon name={tradeIcon(c.name)} className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-lg font-semibold"><Link to={`/search?category=${c.id}`} className="after:absolute after:inset-0 hover:underline">{c.name}</Link></h3>
                  <p className="mt-1.5 text-sm text-ink-700">{c.subcategories.slice(0, 4).map((s) => s.name).join(', ')}{c.subcategories.length > 4 ? '…' : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-white py-16" aria-labelledby="how-heading">
        <div className="container-page">
          <h2 id="how-heading" className="text-3xl font-bold sm:text-4xl">How a job moves</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span aria-hidden="true" className="font-display text-3xl font-bold text-rose-600">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-ink-700">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {services.data?.length > 0 && (
        <section className="bg-paper py-14" aria-labelledby="new-heading">
          <div className="container-page">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 id="new-heading" className="text-2xl font-bold sm:text-3xl">Top-ranked services</h2>
              <Link to="/search?sort=top" className="text-sm font-semibold text-teal-700 underline">View all</Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.data.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          </div>
        </section>
      )}

      {providers.data?.length > 0 && (
        <section className="container-page py-14" aria-labelledby="top-heading">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="top-heading" className="text-2xl font-bold sm:text-3xl">Top-ranked providers</h2>
            <Link to="/search?type=providers" className="text-sm font-semibold text-teal-700 underline">Browse providers</Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {providers.data.map((p) => <ProviderCard key={p.id} provider={p} />)}
          </div>
        </section>
      )}

      <PartnersStrip />

      <section className="container-page mb-16" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="sr-only">Why Imbehe</h2>
        <dl className="grid gap-8 border-y border-ink-100 py-10 md:grid-cols-3">
          <div><dt className="font-display text-lg font-semibold">Checked before they’re listed</dt><dd className="mt-1.5 text-ink-700">Providers only appear in search after an administrator verifies their profile.</dd></div>
          <div><dt className="font-display text-lg font-semibold">Local, district by district</dt><dd className="mt-1.5 text-ink-700">Filter by any of Rwanda’s 30 districts to find people who can reach you.</dd></div>
          <div><dt className="font-display text-lg font-semibold">Clear prices in RWF</dt><dd className="mt-1.5 text-ink-700">Fixed, hourly or by quotation, always shown in Rwandan francs.</dd></div>
        </dl>
      </section>

      {!user && (
        <section className="bg-paper py-16">
          <div className="container-page">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-ink-100 bg-white px-6 py-10 shadow-sm sm:px-12">
              <div className="max-w-xl">
                <h2 className="text-2xl font-bold sm:text-3xl">Do skilled work? Let clients find you.</h2>
                <p className="mt-2 text-ink-700">Create a provider profile, show your portfolio and list your services.</p>
              </div>
              <ButtonLink to="/register" size="lg">Offer your services</ButtonLink>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
