import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { PageLoader } from '../../components/ui/Spinner';
import { Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { SelectField } from '../../components/ui/Field';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { VERIFICATION_PAYMENT_STATUS, VERIFICATION_STATUS } from '../../utils/constants';
import { formatDate } from '../../utils/format';

const STATUS = [{ value: '', label: 'Any status' }, ...Object.entries(VERIFICATION_STATUS).map(([value, v]) => ({ value, label: v.label }))];
const PAYMENT = [{ value: '', label: 'Any payment' }, ...Object.entries(VERIFICATION_PAYMENT_STATUS).map(([value, v]) => ({ value, label: v.label }))];

/** Every verification application, with its review status and (separately) its payment status. */
export default function AdminVerificationPage() {
  useDocumentTitle('Verification review');
  const [filters, setFilters] = useState({ status: '', paymentStatus: '', page: 1 });
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.list({ ...filters, limit: 20 }, signal), [filters.status, filters.paymentStatus, filters.page]);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value, page: 1 }));

  return (
    <>
      <PageHeader title="Verification review" description="Payment is confirmed first, then you review documents and recommend. The super administrator decides." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <SelectField label="Review status" value={filters.status} onChange={set('status')} options={STATUS} />
        <SelectField label="Payment" value={filters.paymentStatus} onChange={set('paymentStatus')} options={PAYMENT} />
      </div>
      {loading ? <PageLoader label="Loading applications" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="No applications match" description="Try another filter." />
          : (
            <ul className="space-y-3">
              {data.map((a) => (
                <li key={a.id}>
                  <Link to={`/dashboard/admin/verification/${a.id}`} className="panel flex flex-wrap items-center gap-4 p-4 hover:border-teal-300">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.provider.displayName}</p>
                      <p className="text-sm text-ink-700">{a.applicant.name} · {a.provider.providerType} · applied {formatDate(a.createdAt)}</p>
                      <p className="text-sm text-ink-600">{a.provider.ratingCount ? `${a.provider.ratingAvg.toFixed(1)} stars from ${a.provider.ratingCount} reviews, ${a.provider.completedJobs} jobs` : 'No customer ratings yet'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={VERIFICATION_STATUS[a.status].tone}>{VERIFICATION_STATUS[a.status].label}</Badge>
                      <Badge tone={VERIFICATION_PAYMENT_STATUS[a.paymentStatus].tone}>{VERIFICATION_PAYMENT_STATUS[a.paymentStatus].label}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      <Pagination meta={meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
    </>
  );
}
