import { useState } from 'react';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

function Evidence({ id, onClose, onRecommended }) {
  const toast = useToast();
  const { data, loading, error } = useAsync((signal) => (id ? verificationApi.evidence(id, signal) : Promise.resolve({ data: null })), [id]);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const p = data?.provider;

  const send = async () => {
    if (note.trim().length < 10) { setFormError('Explain your recommendation in at least 10 characters.'); return; }
    setBusy(true);
    setFormError('');
    try { await verificationApi.recommendProvider(id, note.trim()); toast.success('Sent to the super administrator.'); setNote(''); onRecommended(); onClose(); } catch (err) { setFormError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Dialog open={Boolean(id)} onClose={onClose} title={p ? p.displayName : 'Provider'} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {loading && <PageLoader label="Loading evidence" />}
      {error && <ErrorState error={error} />}
      {p && (
        <div className="space-y-4 text-sm">
          <p><strong>{p.ratingAvg.toFixed(1)} stars</strong> from {p.ratingCount} reviews · {p.completedJobs} completed jobs</p>
          <div aria-label="Rating spread">
            {[5, 4, 3, 2, 1].map((n) => <p key={n} className="flex items-center gap-2"><span className="w-12">{n} stars</span><span className="h-2 flex-1 rounded bg-ink-100"><span className="block h-2 rounded bg-teal-600" style={{ width: `${p.ratingCount ? (p.distribution[n] / p.ratingCount) * 100 : 0}%` }} /></span><span className="w-6 text-right">{p.distribution[n]}</span></p>)}
          </div>
          <div><h3 className="font-semibold">Latest reviews</h3><ul className="mt-1 space-y-1.5">{p.reviews.slice(0, 5).map((r, i) => <li key={i}>{'★'.repeat(r.rating)} “{r.comment}” <span className="text-ink-600">({r.reviewer}, {r.job})</span></li>)}</ul></div>
          <div><h3 className="font-semibold">Recent completed jobs</h3><ul className="mt-1 space-y-1">{p.completedJobList.slice(0, 5).map((j, i) => <li key={i}>{j.title} <span className="text-ink-600">· {formatDate(j.completedAt)}</span></li>)}</ul></div>
          {p.verificationStatus === 'verified'
            ? <Alert tone="success">Already verified.</Alert>
            : (
              <div className="space-y-2 border-t border-ink-100 pt-4">
                <Alert tone="info">A recommendation goes to the super administrator. It does not verify the provider: they still need to apply, pay and be reviewed.</Alert>
                <TextAreaField label="Why do you recommend this provider?" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={formError} maxLength={600} />
                <Button loading={busy} onClick={send}>Recommend for verification</Button>
              </div>
            )}
        </div>
      )}
    </Dialog>
  );
}

/** Highly rated providers with their completed jobs. Administrators can recommend them to the super administrator. */
export default function AdminRatingsPage() {
  useDocumentTitle('Ratings report');
  const [f, setF] = useState({ minRating: '4', minReviews: '3', minJobs: '3', verification: '', page: 1 });
  const [openId, setOpenId] = useState(null);
  const { data, meta, loading, error, reload } = useAsync((signal) => verificationApi.ratings({ ...f, limit: 20 }, signal), [f.minRating, f.minReviews, f.minJobs, f.verification, f.page]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, page: 1 }));

  return (
    <>
      <PageHeader title="Ratings report" description="Providers whose customers rate them highly, with their completed jobs. Use it to recommend providers for verification." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="Average rating at least" value={f.minRating} onChange={set('minRating')} options={['0', '3', '3.5', '4', '4.5'].map((v) => ({ value: v, label: v === '0' ? 'Any' : `${v} stars` }))} />
        <TextField label="At least this many reviews" type="number" min="0" value={f.minReviews} onChange={set('minReviews')} />
        <TextField label="At least this many jobs" type="number" min="0" value={f.minJobs} onChange={set('minJobs')} />
        <SelectField label="Verification" value={f.verification} onChange={set('verification')} options={[{ value: '', label: 'All' }, { value: 'not_verified', label: 'Not verified yet' }, { value: 'verified', label: 'Verified' }]} />
      </div>
      {loading ? <PageLoader label="Loading report" /> : error ? <ErrorState error={error} onRetry={reload} />
        : data.length === 0 ? <EmptyState title="No providers match" description="Lower the thresholds to see more." />
          : (
            <div className="overflow-x-auto rounded-xl border border-ink-100">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Highly rated providers</caption>
                <thead className="bg-ink-50 text-ink-800"><tr>{['Provider', 'Rating', 'Reviews', 'Completed jobs', 'Verification', ''].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {data.map((p) => (
                    <tr key={p.id}>
                      <th scope="row" className="px-4 py-3 font-semibold">{p.displayName}<span className="block text-xs font-normal text-ink-600">{p.categories.join(', ')}</span></th>
                      <td className="px-4 py-3">{p.ratingAvg.toFixed(1)} ★</td>
                      <td className="px-4 py-3">{p.ratingCount}</td>
                      <td className="px-4 py-3">{p.completedJobs}</td>
                      <td className="px-4 py-3">{p.verificationStatus === 'verified' ? <Badge tone="success">Verified</Badge> : p.application ? <Badge tone="info">Applying</Badge> : <Badge>Not verified</Badge>}{p.recommended && <span className="ml-2"><Badge tone="warning">Recommended</Badge></span>}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setOpenId(p.id)}>Evidence{p.verificationStatus !== 'verified' && !p.recommended ? ' and recommend' : ''}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      <Pagination meta={meta} onPage={(page) => setF((x) => ({ ...x, page }))} />
      <Evidence id={openId} onClose={() => setOpenId(null)} onRecommended={reload} />
    </>
  );
}
