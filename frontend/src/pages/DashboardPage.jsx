import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import BookingCard from '../features/bookings/BookingCard';
import { useCategories } from '../hooks/useCategories';
import { documentApi } from '../services/verificationApi';
import { useAuth } from '../context/AuthContext';
import { useAsync, allowCode } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { providerApi } from '../services/providerApi';
import { companyApi } from '../services/companyApi';
import { requestApi } from '../services/requestApi';
import { bookingApi } from '../services/bookingApi';
import { adminApi } from '../services/adminApi';
import PageHeader from '../components/ui/PageHeader';
import { ButtonLink } from '../components/ui/Button';
import { Alert, Badge, ErrorState } from '../components/ui/feedback';
import { PageLoader } from '../components/ui/Spinner';
import AdminDashboard from '../features/admin/AdminDashboard';
import { FOLLOW_UP_BUCKETS, ROLES, PROFILE_VERIFICATION_STATUS } from '../utils/constants';
import { formatRWF, plural } from '../utils/format';

function Card({ title, children, action }) {
  return (
    <section className="panel flex flex-col p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 flex-1 text-ink-800">{children}</div>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}

function ProviderCard() {
  const profile = useAsync(async (signal) => allowCode(providerApi.getMe(signal), 'PROFILE_NOT_FOUND'), []);
  const services = useAsync(async (signal) => allowCode(providerApi.myServices({ limit: 1 }, signal), 'PROFILE_REQUIRED'), []);
  if (profile.loading || services.loading) return <Card title="Your provider profile"><PageLoader label="Loading" /></Card>;
  if (profile.error) return <Card title="Your provider profile"><ErrorState error={profile.error} onRetry={profile.reload} /></Card>;

  const p = profile.data?.profile;
  if (!p) {
    return <Card title="Your provider profile" action={<ButtonLink to="/dashboard/provider/profile">Create your profile</ButtonLink>}>You haven’t set up your profile yet. Add your skills and location to get verified and listed.</Card>;
  }
  const v = PROFILE_VERIFICATION_STATUS[p.verificationStatus];
  return (
    <>
      <Card title="Your provider profile" action={<ButtonLink to="/dashboard/provider/profile" variant="outline">{p.verificationStatus === 'verified' ? 'Edit profile' : 'Continue setup'}</ButtonLink>}>
        <p className="mb-2 font-medium">{p.displayName}</p>
        <Badge tone={v.tone}>{v.label}</Badge>
        {p.verificationStatus === 'rejected' && p.verificationNote && <p className="mt-3 text-sm">Reason given: {p.verificationNote}</p>}
        {p.verificationStatus === 'needs_info' && p.verificationNote && <p className="mt-3 text-sm">The administrator asked: {p.verificationNote}</p>}
        {p.verificationStatus !== 'verified' && <p className="mt-3 text-sm text-ink-700">Your services can’t go live until an administrator verifies your profile.</p>}
      </Card>
      <Card title="Your services" action={<ButtonLink to="/dashboard/provider/services" variant="outline">Manage services</ButtonLink>}>
        <p><span className="font-display text-3xl font-bold">{services.data ? services.meta?.total ?? 0 : 0}</span> <span className="text-ink-700">listing{services.meta?.total === 1 ? '' : 's'}</span></p>
      </Card>
    </>
  );
}

function BusinessCard() {
  const company = useAsync(async (signal) => allowCode(companyApi.getMe(signal), 'COMPANY_NOT_FOUND'), []);
  if (company.loading) return <Card title="Your company"><PageLoader label="Loading" /></Card>;
  if (company.error) return <Card title="Your company"><ErrorState error={company.error} onRetry={company.reload} /></Card>;
  const c = company.data?.company;
  return (
    <Card title="Your company" action={<ButtonLink to="/dashboard/business/company" variant={c ? 'outline' : 'primary'}>{c ? 'Edit company profile' : 'Create company profile'}</ButtonLink>}>
      {c ? <p className="font-medium">{c.companyName}</p> : 'Add your company details so providers know who they’re working with.'}
    </Card>
  );
}

/** The payment follow-up officer's home: how much is waiting to be chased, and how much of it is overdue. */
function FollowUpCard() {
  const summary = useAsync((signal) => adminApi.followUpSummary(signal), []);
  const s = summary.data?.summary;
  return (
    <Card title="Payments to follow up" action={<ButtonLink to="/dashboard/admin/payments/follow-up">Open payment follow-up</ButtonLink>}>
      {summary.loading ? 'Loading…' : summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : (
        <ul className="space-y-2">
          {Object.entries(FOLLOW_UP_BUCKETS).map(([key, info]) => (
            <li key={key} className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{info.label}</span>
              <span><span className="font-display text-xl font-bold">{s[key].count}</span> <span className="text-sm text-ink-700">({formatRWF(s[key].value)})</span>{s[key].overdue > 0 && <span className="ml-2"><Badge tone="danger">{s[key].overdue} overdue</Badge></span>}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SuperAdminCard() {
  return (
    <Card title="Super administrator" action={<div className="flex flex-wrap gap-3"><ButtonLink to="/dashboard/super/activity">Activity report</ButtonLink><ButtonLink to="/dashboard/super/users/new" variant="outline">Add a user</ButtonLink><ButtonLink to="/dashboard/super/partners" variant="outline">Partners &amp; sponsors</ButtonLink></div>}>
      See what providers, service delivery and your team did, and what is still waiting. Create accounts for administrators, payment follow-up staff and providers.
    </Card>
  );
}

// Soft-fail for "you have no profile yet" style answers, so a tile shows 0 instead of an error.
const soft = async (promise, codes) => {
  try { return await promise; } catch (err) { if (codes.includes(err?.code)) return { data: null, meta: null }; throw err; }
};
const NONE = { data: null, meta: null };

/** One number, one tap. `featured` is the navy tile that leads the row. */
function Tile({ label, value, icon, to, featured, note }) {
  return (
    <Link to={to} className={`group relative block rounded-xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${featured ? 'bg-ink-900 text-white' : 'border border-ink-100 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${featured ? 'text-ink-100' : 'text-ink-700'}`}>{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${featured ? 'bg-white text-ink-900' : 'bg-sun-200 text-ink-900'}`}><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <p className={`mt-3 font-display text-4xl font-bold ${featured ? 'text-white' : 'text-ink-950'}`}>{value ?? '–'}</p>
      {note && <p className={`mt-1 text-xs ${featured ? 'text-ink-200' : 'text-ink-600'}`}>{note}</p>}
    </Link>
  );
}

function Donut({ done, active }) {
  const total = done + active;
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const arc = (n) => `${(c * n) / (total || 1)} ${c}`;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 140" className="h-40 w-40" role="img" aria-label={total ? `${pct}% of your jobs are completed` : 'No jobs yet'}>
        <g transform="rotate(-90 70 70)" fill="none" strokeWidth="18">
          <circle cx="70" cy="70" r={r} stroke="#e5e7f1" />
          {active > 0 && <circle cx="70" cy="70" r={r} stroke="#E8E085" strokeDasharray={arc(active)} />}
          {done > 0 && <circle cx="70" cy="70" r={r} stroke="#363199" strokeDasharray={arc(done)} strokeDashoffset={-(c * active) / total} />}
        </g>
        <text x="70" y="78" textAnchor="middle" className="fill-ink-950 font-display text-2xl font-bold">{total ? `${pct}%` : '0'}</text>
      </svg>
      <ul className="mt-3 w-full space-y-1.5 text-sm">
        <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-ink-900" />Completed</span><strong>{done}</strong></li>
        <li className="flex items-center justify-between"><span className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 rounded-sm bg-sun-400" />In progress</span><strong>{active}</strong></li>
      </ul>
    </div>
  );
}

/** This month, with the days people asked for a job to be done marked in navy and today in orange. */
function MiniCalendar({ marks }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return (
    <table className="w-full text-center text-xs">
      <caption className="mb-2 text-left text-sm font-semibold">{now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</caption>
      <thead><tr>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <th key={i} scope="col" className="pb-1 font-semibold text-rose-600">{d}</th>)}</tr></thead>
      <tbody>
        {weeks.map((w, i) => (
          <tr key={i}>{w.map((d, j) => {
            const marked = d && marks.has(iso(d));
            const today = d === now.getDate();
            return (
              <td key={j} className="p-0.5">
                {d && <span className={`inline-flex h-7 w-7 items-center justify-center rounded ${today ? 'bg-sun-400 font-bold text-ink-950' : marked ? 'bg-ink-900 font-bold text-white' : 'text-ink-800'}`}>{d}{marked && <span className="sr-only"> (job wanted this day)</span>}{today && <span className="sr-only"> (today)</span>}</span>}
              </td>
            );
          })}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** The signed-in person's work at a glance: four tiles, a get-a-service launcher, their latest jobs, a ring and a calendar. */
function Overview() {
  const { hasRole } = useAuth();
  const hiring = hasRole(ROLES.CUSTOMER, ROLES.BUSINESS);
  const isProvider = hasRole(ROLES.PROVIDER);
  const { categories } = useCategories();
  const docs = useAsync((signal) => documentApi.list(signal), []);
  const missingDocs = Object.values(docs.data?.requirements ?? {}).flatMap((r) => r.missing);
  const active = useAsync((signal) => bookingApi.list({ status: 'active', limit: 1 }, signal), []);
  const done = useAsync((signal) => bookingApi.list({ status: 'completed', limit: 1 }, signal), []);
  const recent = useAsync((signal) => bookingApi.list({ limit: 4 }, signal), []);
  const open = useAsync((signal) => (hiring ? requestApi.list({ scope: 'mine', status: 'open', limit: 100 }, signal) : Promise.resolve(NONE)), []);
  const incoming = useAsync((signal) => (isProvider ? soft(requestApi.list({ scope: 'incoming', limit: 1 }, signal), ['PROFILE_REQUIRED', 'PROVIDER_NOT_VERIFIED']) : Promise.resolve(NONE)), []);

  const nActive = active.meta?.total ?? 0;
  const nDone = done.meta?.total ?? 0;
  const marks = new Set((open.data ?? []).map((r) => r.preferredDate?.slice(0, 10)).filter(Boolean));

  return (
    <>
      {missingDocs.length > 0 && (
        <Alert tone="warning" className="mb-6" title="Upload your documents" action={<Link to="/dashboard/documents" className="rounded-lg bg-sun-400 px-3 py-1.5 text-sm font-semibold text-ink-950 hover:bg-sun-300">Upload now</Link>}>
          {hiring ? 'You need to upload your National ID (or your business documents) before you can request a service.' : 'Upload your documents to apply for verification.'}
        </Alert>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {hiring
          ? <Tile featured label="Open requests" icon="document" to="/dashboard/requests" value={open.meta?.total ?? 0} note="waiting for quotations" />
          : <Tile featured label="Requests to quote" icon="document" to="/dashboard/provider/requests" value={incoming.meta?.total ?? 0} note="from customers" />}
        <Tile label="Active jobs" icon="briefcase" to="/dashboard/bookings" value={nActive} />
        <Tile label="Completed jobs" icon="star" to="/dashboard/bookings" value={nDone} />
        {hiring
          ? <Tile label="Find a provider" icon="search" to="/search" value="Browse" note="verified people near you" />
          : <Tile label="My services" icon="pencil" to="/dashboard/provider/services" value="Manage" note="listings and prices" />}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {hiring && (
            <section className="panel p-5 sm:p-6" aria-labelledby="launch-h">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="launch-h" className="text-xl font-semibold">What do you need today?</h2>
                  <p className="mt-0.5 text-sm text-ink-700">Tap one. We’ll take you to a four-step request with it already chosen.</p>
                </div>
                <Link to="/dashboard/requests/new" className="rounded-lg bg-sun-400 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-sun-300">Start a request</Link>
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to={`/dashboard/requests/new?category=${c.id}`} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3 transition-colors hover:border-ink-400 hover:bg-ink-50">
                      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-600 font-display text-lg font-bold text-white">{c.name[0]}</span>
                      <span className="text-sm font-semibold leading-tight">{c.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="recent-h">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="recent-h" className="text-xl font-semibold">Latest jobs</h2>
              <Link to="/dashboard/bookings" className="text-sm font-semibold text-teal-700 underline">See all</Link>
            </div>
            {recent.loading ? <PageLoader label="Loading jobs" /> : recent.error ? <ErrorState error={recent.error} onRetry={recent.reload} />
              : recent.data?.length ? <ul className="space-y-3">{recent.data.map((b) => <BookingCard key={b.id} booking={b} />)}</ul>
                : <p className="panel p-5 text-ink-700">{hiring ? 'No jobs yet. Send a request and accept a quotation to start one.' : 'No jobs yet. They appear when a customer accepts your quotation.'}</p>}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5" aria-labelledby="ring-h">
            <h2 id="ring-h" className="mb-3 text-lg font-semibold">Jobs overview</h2>
            <Donut done={nDone} active={nActive} />
          </section>
          {hiring && (
            <section className="panel p-5" aria-labelledby="cal-h">
              <h2 id="cal-h" className="mb-3 text-lg font-semibold">When you need help</h2>
              <MiniCalendar marks={marks} />
              <p className="mt-3 text-xs text-ink-600">{marks.size ? `${plural(marks.size, 'day')} with an open request.` : 'Days you ask for a job to be done show up here.'}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user, hasRole } = useAuth();
  const works = hasRole(ROLES.CUSTOMER, ROLES.BUSINESS, ROLES.PROVIDER);

  return (
    <>
      {hasRole(ROLES.ADMIN) && <div className="mb-10"><AdminDashboard /></div>}
      <PageHeader title={`Hello, ${user.fullName.split(' ')[0]}`} description="Here’s where things stand." />
      {user.status === 'suspended' && <Alert tone="error" className="mb-6">Your account is suspended.</Alert>}
      {works && <Overview />}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {hasRole(ROLES.SUPER_ADMIN) && <SuperAdminCard />}
        {hasRole(ROLES.FINANCE) && <FollowUpCard />}
        {hasRole(ROLES.PROVIDER) && <ProviderCard />}
        {hasRole(ROLES.BUSINESS) && <BusinessCard />}
      </div>
      <p className="mt-8 text-sm text-ink-600">Want to change your details? <Link to="/dashboard/settings" className="font-semibold underline">Open settings</Link>.</p>
    </>
  );
}
