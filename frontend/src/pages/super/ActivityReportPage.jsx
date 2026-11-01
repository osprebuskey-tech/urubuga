import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { ACTIVITY_LABELS, PENDING_ITEMS, ROLE_LABELS } from '../../utils/constants';
import { downloadCsv } from '../../utils/csv';
import { formatDate, formatRWF, isoDay } from '../../utils/format';

const TABS = [
  { id: 'pending', label: 'Pending work' },
  { id: 'providers', label: 'Providers' },
  { id: 'delivery', label: 'Service delivery' },
  { id: 'staff', label: 'Staff work' },
];
const RANGES = [{ label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 }, { label: 'Last 90 days', days: 90 }];
const DAY_MS = 86_400_000;
const ageDays = (date) => (date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS)) : null);
const actionLabel = (a) => ACTIVITY_LABELS[a] ?? a;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Th({ children, align }) {
  return <th scope="col" className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : ''}`}>{children}</th>;
}
const Table = ({ caption, children, min = '40rem' }) => (
  <div className="panel overflow-x-auto"><table className="w-full text-left text-sm" style={{ minWidth: min }}><caption className="sr-only">{caption}</caption>{children}</table></div>
);
const Head = ({ children }) => <thead className="border-b border-ink-100 bg-ink-50 text-ink-800"><tr>{children}</tr></thead>;

function Stat({ label, value, note }) {
  return (
    <div className="panel p-4">
      <p className="text-sm text-ink-700">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-xs text-ink-600">{note}</p>}
    </div>
  );
}

function PendingTab({ report }) {
  const rows = report.pendings;
  const groups = [...new Set(rows.map((r) => r.group))];
  const total = rows.filter((r) => !['jobs_in_progress', 'quotations_awaiting_customer'].includes(r.key)).reduce((s, r) => s + r.count, 0);
  const csv = () => downloadCsv('imbehe-pending-work.csv', ['Area', 'What', 'How many', 'Oldest since', 'Oldest (days)', 'Value (RWF)', 'Overdue'], rows.map((r) => [r.group, PENDING_ITEMS[r.key]?.label ?? r.key, r.count, r.oldestAt ? formatDate(r.oldestAt) : '', ageDays(r.oldestAt) ?? '', r.value ?? '', r.overdue ?? '']));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-800">What is waiting <strong>right now</strong>, whatever dates you chose above. {total === 0 ? 'Nothing needs action.' : `${plural(total, 'item needs', 'items need')} someone’s attention.`}</p>
        <Button variant="outline" size="sm" onClick={csv}>Download CSV</Button>
      </div>
      <Table caption="Pending work">
        <Head><Th>What</Th><Th align="right">How many</Th><Th>Waiting since</Th><Th align="right">Value</Th></Head>
        <tbody className="divide-y divide-ink-100">
          {groups.map((g) => (
            <FragmentRows key={g} group={g} rows={rows.filter((r) => r.group === g)} />
          ))}
        </tbody>
      </Table>
    </>
  );
}

function FragmentRows({ group, rows }) {
  return (
    <>
      <tr className="bg-ink-50/60"><th scope="rowgroup" colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-700">{group}</th></tr>
      {rows.map((r) => {
        const meta = PENDING_ITEMS[r.key] ?? { label: r.key };
        const age = ageDays(r.oldestAt);
        return (
          <tr key={r.key}>
            <td className="px-4 py-3">{meta.to && r.count > 0 ? <Link to={meta.to} className="font-medium underline">{meta.label}</Link> : meta.label}{r.overdue > 0 && <span className="ml-2"><Badge tone="danger">{r.overdue} overdue</Badge></span>}</td>
            <td className="px-4 py-3 text-right font-display text-lg font-bold">{r.count}</td>
            <td className="whitespace-nowrap px-4 py-3">{r.count > 0 && r.oldestAt ? `${formatDate(r.oldestAt)} (${plural(age, 'day', 'days')})` : '–'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right">{r.value ? formatRWF(r.value) : ''}</td>
          </tr>
        );
      })}
    </>
  );
}

function ProvidersTab({ report }) {
  const p = report.providers;
  const csv = () => downloadCsv(`imbehe-providers-${report.from}-to-${report.to}.csv`, ['Provider', 'Quotations sent', 'Quotations accepted', 'Jobs won', 'Jobs completed', 'Jobs cancelled', 'Value completed (RWF)', 'New reviews', 'Average of new reviews', 'Overall rating', 'Disputes'], p.rows.map((r) => [r.name, r.quotationsSent, r.quotationsAccepted, r.jobsWon, r.jobsCompleted, r.jobsCancelled, r.completedValue, r.reviews, r.avgRating ?? '', r.overallRating ?? '', r.disputes]));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-800">{plural(p.activeProviders, 'provider was', 'providers were')} active. {p.inactiveVerifiedProviders > 0 && <>{plural(p.inactiveVerifiedProviders, 'verified provider', 'verified providers')} did nothing in this period.</>}{p.truncated && ' Showing the top 100.'}</p>
        {p.rows.length > 0 && <Button variant="outline" size="sm" onClick={csv}>Download CSV</Button>}
      </div>
      {p.rows.length === 0 ? <EmptyState title="No provider activity" description="No quotations, jobs or reviews in this period." /> : (
        <Table caption="Provider activity" min="60rem">
          <Head><Th>Provider</Th><Th align="right">Quotes sent</Th><Th align="right">Accepted</Th><Th align="right">Jobs won</Th><Th align="right">Completed</Th><Th align="right">Cancelled</Th><Th align="right">Value completed</Th><Th align="right">New reviews</Th><Th align="right">Disputes</Th></Head>
          <tbody className="divide-y divide-ink-100">
            {p.rows.map((r) => (
              <tr key={r.providerId}>
                <td className="px-4 py-3"><Link to={`/providers/${r.providerId}`} className="font-medium underline">{r.name}</Link>{r.overallRating != null && <span className="ml-2 text-ink-700">{r.overallRating}★</span>}</td>
                <td className="px-4 py-3 text-right">{r.quotationsSent}</td>
                <td className="px-4 py-3 text-right">{r.quotationsAccepted}</td>
                <td className="px-4 py-3 text-right">{r.jobsWon}</td>
                <td className="px-4 py-3 text-right font-semibold">{r.jobsCompleted}</td>
                <td className="px-4 py-3 text-right">{r.jobsCancelled}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{formatRWF(r.completedValue)}</td>
                <td className="px-4 py-3 text-right">{r.reviews}{r.avgRating != null && <span className="text-ink-700"> ({r.avgRating}★)</span>}</td>
                <td className="px-4 py-3 text-right">{r.disputes > 0 ? <Badge tone="danger">{r.disputes}</Badge> : 0}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

function DeliveryTab({ report }) {
  const d = report.delivery;
  const rows = [['Accepted, not started', d.jobs.accepted], ['In progress', d.jobs.in_progress], ['Completed', d.jobs.completed], ['Cancelled', d.jobs.cancelled], ['In dispute', d.jobs.disputed]];
  const csv = () => downloadCsv(`imbehe-delivery-${report.from}-to-${report.to}.csv`, ['Category', 'Jobs', 'Completed', 'Value (RWF)'], d.byCategory.map((c) => [c.category, c.jobs, c.completed, c.value]));
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Jobs started" value={d.jobs.total} note="Quotations accepted in this period" />
        <Stat label="Completed" value={d.jobs.completed} note={formatRWF(d.completedValue)} />
        <Stat label="Completion rate" value={d.completionRate == null ? '–' : `${d.completionRate}%`} note="Of jobs that have ended" />
        <Stat label="Average time to finish" value={d.avgDaysToComplete == null ? '–' : `${d.avgDaysToComplete} days`} note="From start to completion" />
        <Stat label="Average time to start" value={d.avgDaysToStart == null ? '–' : `${d.avgDaysToStart} days`} note="From acceptance to start" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="where-jobs">
          <h2 id="where-jobs" className="mb-2 text-lg font-semibold">Where these jobs stand now</h2>
          <Table caption="Jobs by status" min="18rem">
            <Head><Th>Status</Th><Th align="right">Jobs</Th></Head>
            <tbody className="divide-y divide-ink-100">{rows.map(([label, n]) => <tr key={label}><td className="px-4 py-2.5">{label}</td><td className="px-4 py-2.5 text-right font-semibold">{n}</td></tr>)}</tbody>
          </Table>
        </section>
        <section aria-labelledby="funnel">
          <h2 id="funnel" className="mb-2 text-lg font-semibold">From request to job</h2>
          <Table caption="Requests and quotations" min="18rem">
            <Head><Th>Step</Th><Th align="right">Requests</Th></Head>
            <tbody className="divide-y divide-ink-100">
              <tr><td className="px-4 py-2.5">Requests made</td><td className="px-4 py-2.5 text-right font-semibold">{d.funnel.requests}</td></tr>
              <tr><td className="px-4 py-2.5">Received at least one quotation</td><td className="px-4 py-2.5 text-right font-semibold">{d.funnel.withQuotations}</td></tr>
              <tr><td className="px-4 py-2.5">A quotation was accepted</td><td className="px-4 py-2.5 text-right font-semibold">{d.funnel.accepted}</td></tr>
              <tr><td className="px-4 py-2.5">Cancelled by the customer</td><td className="px-4 py-2.5 text-right font-semibold">{d.funnel.cancelled}</td></tr>
            </tbody>
          </Table>
        </section>
      </div>
      <section aria-labelledby="by-category" className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3"><h2 id="by-category" className="text-lg font-semibold">By category</h2>{d.byCategory.length > 0 && <Button variant="outline" size="sm" onClick={csv}>Download CSV</Button>}</div>
        {d.byCategory.length === 0 ? <EmptyState title="No jobs in this period" description="Jobs appear here once a customer accepts a quotation." /> : (
          <Table caption="Jobs by category" min="30rem">
            <Head><Th>Category</Th><Th align="right">Jobs</Th><Th align="right">Completed</Th><Th align="right">Agreed value</Th></Head>
            <tbody className="divide-y divide-ink-100">{d.byCategory.map((c) => <tr key={c.category}><td className="px-4 py-2.5">{c.category}</td><td className="px-4 py-2.5 text-right">{c.jobs}</td><td className="px-4 py-2.5 text-right">{c.completed}</td><td className="whitespace-nowrap px-4 py-2.5 text-right">{formatRWF(c.value)}</td></tr>)}</tbody>
          </Table>
        )}
      </section>
    </>
  );
}

function StaffTab({ report }) {
  const w = report.adminWork;
  const csv = () => downloadCsv(`imbehe-staff-work-${report.from}-to-${report.to}.csv`, ['Name', 'Roles', 'Account', 'Actions in period', 'Last action', 'Last sign-in', 'Breakdown'], w.members.map((m) => [m.name, m.roles.map((r) => ROLE_LABELS[r] ?? r).join(' + '), m.status, m.total, m.lastActionAt ? formatDate(m.lastActionAt) : '', m.lastSignInAt ? formatDate(m.lastSignInAt) : 'Never', m.actions.map((a) => `${actionLabel(a.action)}: ${a.count}`).join('; ')]));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-800">Everything each person with a staff account did in this period, from the audit log. Signing in is not counted as work.</p>
        <Button variant="outline" size="sm" onClick={csv}>Download CSV</Button>
      </div>
      <Table caption="Staff work" min="50rem">
        <Head><Th>Person</Th><Th align="right">Actions</Th><Th>What they did</Th><Th>Last action</Th><Th>Last sign-in</Th></Head>
        <tbody className="divide-y divide-ink-100">
          {w.members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3 align-top"><p className="font-medium">{m.name}</p><div className="mt-1 flex flex-wrap gap-1">{m.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r] ?? r}</Badge>)}{m.status !== 'active' && <Badge tone="danger">Suspended</Badge>}</div></td>
              <td className="px-4 py-3 text-right align-top font-display text-lg font-bold">{m.total}</td>
              <td className="px-4 py-3 align-top">{m.actions.length === 0 ? <span className="text-ink-600">Nothing recorded</span> : <ul className="space-y-0.5">{m.actions.map((a) => <li key={a.action}>{actionLabel(a.action)} <span className="font-semibold">×{a.count}</span></li>)}</ul>}</td>
              <td className="whitespace-nowrap px-4 py-3 align-top">{m.lastActionAt ? formatDate(m.lastActionAt) : '–'}</td>
              <td className="whitespace-nowrap px-4 py-3 align-top">{m.lastSignInAt ? formatDate(m.lastSignInAt) : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

/** Super admin only: what providers, delivery and staff did over a period, and everything still waiting. */
export default function ActivityReportPage() {
  useDocumentTitle('Activity report');
  const [tab, setTab] = useState('pending');
  const [range, setRange] = useState({ from: isoDay(-29), to: isoDay(0) });
  const [draft, setDraft] = useState(range);
  const invalid = !draft.from || !draft.to || draft.from > draft.to;

  const result = useAsync((signal) => adminApi.activityReport({ from: range.from, to: range.to }, signal), [range.from, range.to]);
  const report = result.data?.report;

  const apply = (e) => { e.preventDefault(); if (!invalid) setRange(draft); };
  const quick = (days) => { const next = { from: isoDay(-(days - 1)), to: isoDay(0) }; setDraft(next); setRange(next); };

  return (
    <>
      <PageHeader title="Activity report" description="What providers, service delivery and the staff did, and what is still waiting. Only super administrators can see this." />

      <form onSubmit={apply} className="panel mb-5 flex flex-wrap items-end gap-4 p-4" aria-label="Report period">
        <TextField label="From" type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
        <TextField label="To" type="date" value={draft.to} min={draft.from} max={isoDay(0)} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
        <Button type="submit" disabled={invalid}>Show report</Button>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick periods">
          {RANGES.map((r) => <button key={r.days} type="button" onClick={() => quick(r.days)} className="rounded-full border border-ink-200 px-3 py-1.5 text-sm font-semibold hover:bg-ink-50">{r.label}</button>)}
        </div>
        {invalid && <p role="alert" className="w-full text-sm font-medium text-rose-700">Choose a start date that is not after the end date.</p>}
      </form>

      <div role="tablist" aria-label="Report sections" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="report-panel" onClick={() => setTab(t.id)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === t.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:bg-ink-50'}`}>{t.label}</button>
        ))}
      </div>

      <div id="report-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {result.loading && !report && <PageLoader label="Building the report" />}
        {result.error && <ErrorState error={result.error} onRetry={result.reload} />}
        {report && (
          <>
            <p className="mb-3 text-sm text-ink-700">{tab === 'pending' ? 'Snapshot' : `${formatDate(report.from)} to ${formatDate(report.to)}`} · created {formatDate(report.generatedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            {tab === 'pending' && <PendingTab report={report} />}
            {tab === 'providers' && <ProvidersTab report={report} />}
            {tab === 'delivery' && <DeliveryTab report={report} />}
            {tab === 'staff' && <StaffTab report={report} />}
          </>
        )}
      </div>
    </>
  );
}
