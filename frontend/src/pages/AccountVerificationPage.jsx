import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { TextAreaField } from '../components/ui/Field';
import { PageLoader } from '../components/ui/Spinner';
import VerifiedBadge from '../components/ui/VerifiedBadge';
import { Alert, Badge, ErrorState } from '../components/ui/feedback';
import VerificationProgress from '../features/verification/VerificationProgress';
import { useToast } from '../context/ToastContext';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { verificationApi } from '../services/verificationApi';
import { VERIFICATION_STATUS } from '../utils/constants';
import { errorMessage } from '../utils/errors';
import { formatDate } from '../utils/format';

/** Customers and business accounts: ask to be verified, follow the review, answer questions. Free; the same document review as providers. */
export default function AccountVerificationPage() {
  useDocumentTitle('Get verified');
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => verificationApi.mineAccount(signal), []);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader label="Loading" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { application: app, documents, accountVerified } = data;
  const docsReady = documents?.complete ?? false;
  const canApply = docsReady && (!app || !app.active);
  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); return true; } catch (err) { toast.error(errorMessage(err)); return false; } finally { setBusy(false); }
  };
  const sendReply = async () => {
    if (reply.trim().length < 5) { setReplyError('Write a short answer.'); return; }
    setReplyError('');
    if (await act(() => verificationApi.respondAccount(reply.trim()), 'Sent. Your request is back in review.')) setReply('');
  };

  if (accountVerified) {
    return (
      <>
        <PageHeader title="Get verified" />
        <Alert tone="success" title="Your account is verified">
          <span className="mt-1 flex items-center gap-2"><VerifiedBadge /> {data.verifiedAt ? `Verified on ${formatDate(data.verifiedAt)}.` : 'Thank you for completing verification.'}</span>
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Get verified" description="Verification shows providers and Imbehe that your account belongs to a real, identified person or business. It is free." />
      <div className="space-y-6">
        {app && (
          <section className="panel space-y-4 p-5" aria-labelledby="status-h">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="status-h" className="text-lg font-semibold">Your request</h2>
              <Badge tone={VERIFICATION_STATUS[app.status].tone}>{VERIFICATION_STATUS[app.status].label}</Badge>
            </div>
            <VerificationProgress status={app.status} />
            <p className="text-sm text-ink-700">Requested {formatDate(app.createdAt)}</p>
            {(app.status === 'under_review' || app.status === 'payment_confirmed') && <p className="text-sm text-ink-800">Your documents have been sent to our team. You’ll get a notification when something changes.</p>}
            {app.status === 'recommended' && <p className="text-sm text-ink-800">An administrator checked your documents. The super administrator makes the final decision.</p>}
            {app.status === 'rejected' && <Alert tone="error" title="Not approved">{app.decision?.reason || 'Your request was not approved.'} You can fix the problem and ask again below.</Alert>}
          </section>
        )}

        {app?.status === 'more_info_required' && (
          <section className="panel space-y-3 p-5" aria-labelledby="ask-h">
            <h2 id="ask-h" className="text-lg font-semibold">We need more information</h2>
            <Alert tone="warning">{app.question}</Alert>
            <p className="text-sm text-ink-700">If it is about a document, <Link to="/dashboard/documents" className="font-semibold text-teal-700 underline">upload the new one</Link> first, then answer here.</p>
            <TextAreaField label="Your answer" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} error={replyError} maxLength={600} />
            <Button loading={busy} onClick={sendReply}>Send answer</Button>
          </section>
        )}

        {(!app || !app.active) && (
          <section className="panel space-y-3 p-5" aria-labelledby="apply-h">
            <h2 id="apply-h" className="text-lg font-semibold">{app ? 'Ask again' : 'Ask to be verified'}</h2>
            <p className="text-sm text-ink-800">Our team opens the documents you uploaded, checks them against your account, then approves, asks you for more, or explains why it can’t approve.</p>
            <ul className="space-y-1 text-sm">
              {(documents?.required ?? []).map((d) => <li key={d.kind}>{d.uploaded ? '✓' : '✗'} {d.label} {d.uploaded ? 'uploaded' : 'is missing'}</li>)}
            </ul>
            {!docsReady && <Alert tone="warning">Upload the missing documents first. <Link to="/dashboard/documents" className="font-semibold text-teal-700 underline">Go to my documents</Link></Alert>}
            <Button disabled={!canApply} loading={busy} onClick={() => act(() => verificationApi.applyAccount(), 'Request sent. Our team will review your documents.')}>Request verification</Button>
          </section>
        )}

        {app?.history?.length > 0 && (
          <section className="panel p-5" aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 text-lg font-semibold">History</h2>
            <ol className="space-y-2 text-sm">
              {[...app.history].reverse().map((h, i) => <li key={i}><span className="text-ink-600">{formatDate(h.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> · {h.action.replace(/_/g, ' ')}{h.note ? ` · ${h.note}` : ''}</li>)}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}
