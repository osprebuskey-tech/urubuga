import { useState } from 'react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import BarChart from '../../components/ui/BarChart';
import { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/feedback';
import { TextField } from '../../components/ui/Field';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../services/adminApi';
import { formatRWF, isoDay } from '../../utils/format';

export function validateRange({ from, to }) {
  if (!from || !to) return 'Choose both dates';
  if (from > to) return 'The start date can’t be after the end date';
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 365) return 'Choose a range of at most one year';
  return '';
}

function Total({ label, value }) {
  return <div className="panel p-4"><p className="text-sm text-ink-700">{label}</p><p className="font-display text-2xl font-bold">{value}</p></div>;
}

export default function AdminReportsPage() {
  useDocumentTitle('Reports');
  const [draft, setDraft] = useState({ from: isoDay(-29), to: isoDay() });
  const [range, setRange] = useState(draft);
  const [error, setError] = useState('');
  const report = useAsync((signal) => adminApi.reports(range, signal), [range.from, range.to]);
  const r = report.data?.report;

  const apply = (e) => {
    e.preventDefault();
    const problem = validateRange(draft);
    setError(problem);
    if (!problem) setRange(draft);
  };
  const series = (key) => r.series.map((d) => ({ label: d.date, value: d[key] }));

  return (
    <>
      <PageHeader title="Reports" description="Day by day, in UTC. Gross value is what customers paid; commission is the platform’s revenue before any costs." />
      <form onSubmit={apply} noValidate className="panel mb-6 flex flex-wrap items-end gap-4 p-5">
        <TextField label="From" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
        <TextField label="To" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
        <Button type="submit">Show report</Button>
        {error && <p role="alert" className="w-full text-sm font-medium text-rose-700">{error}</p>}
      </form>

      {report.loading && <PageLoader label="Building the report" />}
      {report.error && <ErrorState error={report.error} onRetry={report.reload} />}
      {r && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Total label="New users" value={r.totals.newUsers} />
            <Total label="Service requests" value={r.totals.requests} />
            <Total label="Jobs completed" value={r.totals.completedJobs} />
            <Total label="Gross transaction value" value={formatRWF(r.totals.grossValue)} />
            <Total label="Commission (revenue)" value={formatRWF(r.totals.commission)} />
            <Total label="Refunds recorded" value={formatRWF(r.totals.refunds)} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <BarChart title="Gross transaction value per day" data={series('grossValue')} format={formatRWF} />
            <BarChart title="Commission per day" data={series('commission')} format={formatRWF} color="bg-sage-600" />
            <BarChart title="Jobs completed per day" data={series('completedJobs')} />
            <BarChart title="New users per day" data={series('newUsers')} />
            <BarChart title="Service requests per day" data={series('requests')} />
          </div>
        </>
      )}
    </>
  );
}
