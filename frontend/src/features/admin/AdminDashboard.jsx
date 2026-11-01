import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { adminApi } from '../../services/adminApi';
import { ACTIVITY_LABELS } from '../../utils/constants';
import { bpsLabel, formatDate, formatRWF } from '../../utils/format';

function Stat({ label, value, note, to, tone, featured }) {
  const body = (
    <>
      <p className={`text-sm font-medium ${featured ? 'text-ink-100' : 'text-ink-700'}`}>{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {note && <p className={`mt-1 text-xs ${featured ? 'text-ink-200' : 'text-ink-600'}`}>{note}</p>}
    </>
  );
  const cls = `panel block p-5 shadow-sm ${featured ? '!border-ink-900 !bg-ink-900 text-white' : ''} ${tone === 'revenue' ? 'border-rose-300 bg-rose-50/40' : ''} ${to ? 'hover:border-ink-300' : ''}`;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

const ATTENTION = [
  { key: 'providersToVerify', label: 'providers waiting for verification', to: '/dashboard/admin/providers' },
  { key: 'openDisputes', label: 'open disputes', to: '/dashboard/admin/disputes' },
  { key: 'reportedReviews', label: 'reported reviews', to: '/dashboard/admin/reviews' },
  { key: 'manualPaymentsWaiting', label: 'manual payments waiting for confirmation', to: '/dashboard/admin/payments' },
];

export default function AdminDashboard() {
  const { data, loading, error, reload } = useAsync((signal) => adminApi.dashboard(signal), []);
  if (loading) return <PageLoader label="Loading the dashboard" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const d = data.dashboard;
  const f = d.finance;
  const todo = ATTENTION.filter((a) => d.needsAttention[a.key] > 0);

  return (
    <>
      <PageHeader title="Administration" description="How the marketplace is doing, and what needs you." />

      <section aria-labelledby="attention-h" className="mb-8">
        <h2 id="attention-h" className="mb-3 text-xl font-semibold">Needs your attention</h2>
        {todo.length === 0 ? <p className="panel p-5 text-ink-700">Nothing is waiting.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {todo.map((a) => (
              <li key={a.key}><Link to={a.to} className="panel flex items-center gap-4 p-4 hover:border-teal-300"><span className="font-display text-3xl font-bold text-rose-700">{d.needsAttention[a.key]}</span><span>{a.label}</span></Link></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="people-h" className="mb-8">
        <h2 id="people-h" className="mb-3 text-xl font-semibold">People and work</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat featured label="Users" value={d.users.total} to="/dashboard/admin/users" note={`${d.users.joinedLast7Days} joined this week${d.users.suspended ? ` · ${d.users.suspended} suspended` : ''}`} />
          <Stat label="Providers" value={d.providers.total} to="/dashboard/admin/providers" note={`${d.providers.verified} verified · ${d.providers.unverified + d.providers.rejected} not verified · ${d.providers.pending} waiting${d.providers.needsInfo ? ` · ${d.providers.needsInfo} asked for more info` : ''}`} />
          <Stat label="Service requests" value={d.requests.total} note={`${d.requests.open} open · ${d.requests.accepted} accepted · ${d.requests.cancelled} cancelled`} />
          <Stat label="Jobs" value={d.jobs.total} to="/dashboard/bookings" note={`${d.jobs.active} active · ${d.jobs.completed} completed · ${d.jobs.disputed} disputed`} />
        </div>
        <p className="mt-3 text-sm text-ink-700">By role: {d.users.byRole.customer} customers · {d.users.byRole.provider} providers · {d.users.byRole.business} businesses · {d.users.byRole.admin} administrators (a person can have more than one role)</p>
      </section>

      <section aria-labelledby="money-h" className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="money-h" className="text-xl font-semibold">Money</h2>
          <Link to="/dashboard/admin/payments" className="text-sm font-semibold text-teal-700 underline">Payments and commission rate</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Gross transaction value" value={formatRWF(f.grossTransactionValue)} note="What customers paid. Not the platform’s money." />
          <Stat tone="revenue" label="Platform revenue" value={formatRWF(f.platformRevenue)} note={`${bpsLabel(f.commissionRateBps)} commission after refunds. Revenue is not profit.`} />
          <Stat label="Refunds" value={formatRWF(f.refunds)} />
          <Stat label="Owed to providers" value={formatRWF(f.providerPayouts.pending)} note={`${formatRWF(f.providerPayouts.paid)} already paid out`} />
        </div>
      </section>

      <section aria-labelledby="activity-h">
        <h2 id="activity-h" className="mb-3 text-xl font-semibold">Recent activity</h2>
        {d.recentActivity.length === 0 ? <p className="text-ink-700">Nothing has happened yet.</p> : (
          <ul className="panel divide-y divide-ink-100">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                <span><span className="font-medium">{ACTIVITY_LABELS[a.action] ?? a.action}</span> <span className="text-ink-700">by {a.actor}</span></span>
                <time dateTime={a.at} className="text-sm text-ink-600">{formatDate(a.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm"><Link to="/dashboard/admin/reports" className="font-semibold text-teal-700 underline">Daily reports</Link></p>
      </section>
    </>
  );
}
