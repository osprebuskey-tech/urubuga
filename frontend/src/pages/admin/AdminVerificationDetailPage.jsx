import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button, { ButtonLink } from '../../components/ui/Button';
import DocumentPreview from '../../components/DocumentPreview';
import PageHeader from '../../components/ui/PageHeader';
import { TextAreaField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, EmptyState, ErrorState } from '../../components/ui/feedback';
import VerificationProgress from '../../features/verification/VerificationProgress';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { ROLES, VERIFICATION_PAYMENT_STATUS, VERIFICATION_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const money = (n, c = 'RWF') => `${Number(n).toLocaleString('en-US')} ${c}`;

function Reason({ label, onSend, busy, variant = 'primary', min = 5, placeholder }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const send = async () => {
    if (text.trim().length < min) { setError(`Write at least ${min} characters.`); return; }
    setError('');
    if (await onSend(text.trim())) setText('');
  };
  return (
    <div className="space-y-2">
      <TextAreaField label={placeholder} rows={3} value={text} onChange={(e) => setText(e.target.value)} error={error} maxLength={600} />
      <Button variant={variant} loading={busy} onClick={send}>{label}</Button>
    </div>
  );
}

/** One application: payment, documents (secure preview), ratings, history, and the actions this person's role allows. */
export default function AdminVerificationDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => verificationApi.get(id, signal), [id]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const app = data?.application;
  useDocumentTitle(app ? `Verification: ${app.provider.displayName}` : 'Verification');

  if (loading) return <PageLoader label="Loading application" />;
  if (error?.status === 404) return <EmptyState title="Application not found" action={<ButtonLink to="/dashboard/admin/verification">Back to the list</ButtonLink>} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const isSuper = hasRole(ROLES.SUPER_ADMIN);
  const paid = app.paymentStatus === 'confirmed' || app.paymentStatus === 'waived';
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); return true; } catch (err) { toast.error(errorMessage(err)); return false; } finally { setBusy(false); }
  };
  const s = app.status;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-700"><Link to="/dashboard/admin/verification" className="underline">Verification review</Link> / {app.provider.displayName}</nav>
      <PageHeader title={app.provider.displayName} description={`${app.applicant.name} · ${app.applicant.email} · applied ${formatDate(app.createdAt)}`} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={VERIFICATION_STATUS[s].tone}>{VERIFICATION_STATUS[s].label}</Badge>
        <Badge tone={VERIFICATION_PAYMENT_STATUS[app.paymentStatus].tone}>{VERIFICATION_PAYMENT_STATUS[app.paymentStatus].label}</Badge>
        <span className="text-sm text-ink-700">Fee {money(app.fee.amount, app.fee.currency)}</span>
      </div>
      <div className="mb-6"><VerificationProgress status={s} /></div>

      {!paid && <Alert tone="warning" className="mb-6" title="Payment is not confirmed yet">The review opens only after the fee is confirmed. Payments are confirmed on the <Link to="/dashboard/admin/verification-payments" className="font-semibold underline">verification payments</Link> page.</Alert>}
      {app.adminRecommendationOpen && <Alert tone="info" className="mb-6" title="An administrator also flagged this provider from the ratings report">{app.adminRecommendationOpen.note}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="docs-h">
          <h2 id="docs-h" className="mb-3 text-lg font-semibold">Documents</h2>
          {app.documents.length === 0 ? <p className="text-ink-700">No documents were attached.</p> : (
            <ul className="space-y-2">
              {app.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
                  <span><strong>{d.label}</strong> <span className="text-sm text-ink-700">{d.originalName}</span></span>
                  <Button size="sm" variant="outline" onClick={() => setPreview(d)}>Preview</Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-600">Opening a document is recorded in the audit log.</p>
        </section>

        <section className="panel p-5" aria-labelledby="rat-h">
          <h2 id="rat-h" className="mb-3 text-lg font-semibold">Ratings and service history</h2>
          <p>{app.ratingsNow.count ? <><strong>{app.ratingsNow.average.toFixed(1)} stars</strong> from {app.ratingsNow.count} reviews</> : 'No customer ratings yet'} · {app.ratingsNow.completedJobs} completed jobs</p>
          <p className="mt-2 text-sm text-ink-700">Ratings support a recommendation. They never verify anyone by themselves.</p>
          {app.recommendation && <p className="mt-3 rounded-lg bg-sun-100 px-3 py-2 text-sm"><strong>Recommended</strong> on {formatDate(app.recommendation.at)}: {app.recommendation.note}</p>}
          {app.decision && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm"><strong>{app.decision.outcome === 'approved' ? 'Approved' : 'Rejected'}</strong> by the {app.decision.byRole === 'super_admin' ? 'super administrator' : 'administrator'} on {formatDate(app.decision.at)}{app.decision.reason ? `: ${app.decision.reason}` : ''}</p>}
        </section>
      </div>

      <section className="panel mt-6 p-5" aria-labelledby="pay-h">
        <h2 id="pay-h" className="mb-3 text-lg font-semibold">Payments</h2>
        {app.payments.length === 0 ? <p className="text-ink-700">The applicant has not started a payment.</p> : (
          <ul className="space-y-1 text-sm">
            {app.payments.map((p) => <li key={p.id}>{formatDate(p.createdAt)} · {money(p.amount, p.currency)} · {p.method.replace('_', ' ')} · {p.status}{p.gatewayReference ? ` · ref ${p.gatewayReference}` : ''}</li>)}
          </ul>
        )}
      </section>

      {paid && !['approved', 'rejected'].includes(s) && (
        <section className="panel mt-6 space-y-5 p-5" aria-labelledby="act-h">
          <h2 id="act-h" className="text-lg font-semibold">Your actions</h2>
          {s === 'payment_confirmed' && <Button loading={busy} onClick={() => run(() => verificationApi.startReview(app.id), 'Review started.')}>Start review</Button>}
          {(s === 'payment_confirmed' || s === 'under_review') && (
            <Reason label="Ask for more information" variant="outline" min={10} placeholder="Question for the applicant" busy={busy} onSend={(t) => run(() => verificationApi.requestInfo(app.id, t), 'The applicant was asked.')} />
          )}
          {s === 'under_review' && (
            <Reason label="Recommend for verification" min={10} placeholder="Why you recommend approval (your evidence)" busy={busy} onSend={(t) => run(() => verificationApi.recommend(app.id, t), 'Recommended. The super administrator decides next.')} />
          )}
          {s === 'recommended' && !isSuper && <p className="text-sm text-ink-700">Recommended. Waiting for the super administrator’s final decision.</p>}
          <Reason label="Reject with a reason" variant="danger" placeholder="Reason shown to the applicant" busy={busy} onSend={(t) => run(() => verificationApi.reject(app.id, t), 'Rejected.')} />
          {isSuper && s === 'recommended' && (
            <div className="space-y-3 rounded-lg border-2 border-teal-200 p-4">
              <h3 className="font-semibold">Final decision (super administrator)</h3>
              <Button loading={busy} onClick={() => run(() => verificationApi.decide(app.id, { outcome: 'approved' }), 'Approved. The provider is now verified.')}>Approve verification</Button>
            </div>
          )}
        </section>
      )}
      {isSuper && s === 'rejected' && app.decision?.byRole === 'admin' && (
        <section className="panel mt-6 p-5"><h2 className="mb-3 text-lg font-semibold">Reopen (super administrator)</h2><Reason label="Reopen for review" placeholder="Why this should be reviewed again" busy={busy} onSend={(t) => run(() => verificationApi.reopen(app.id, t), 'Reopened.')} /></section>
      )}

      <section className="panel mt-6 p-5" aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 text-lg font-semibold">History</h2>
        <ol className="space-y-2 text-sm">
          {app.history.map((h, i) => <li key={i}><span className="text-ink-600">{formatDate(h.at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> · <strong>{h.role.replace('_', ' ')}</strong> · {h.action.replace(/_/g, ' ')}{h.note ? ` · ${h.note}` : ''}</li>)}
        </ol>
        {app.infoRequests.length > 0 && <div className="mt-4 space-y-2">{app.infoRequests.map((r, i) => <p key={i} className="rounded-lg bg-ink-50 px-3 py-2 text-sm"><strong>Asked:</strong> {r.message}{r.response ? <><br /><strong>Answered:</strong> {r.response}</> : <><br /><em>No answer yet</em></>}</p>)}</div>}
      </section>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
