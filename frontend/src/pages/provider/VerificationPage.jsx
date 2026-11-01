import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button, { ButtonLink } from '../../components/ui/Button';
import PageHeader from '../../components/ui/PageHeader';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, ErrorState } from '../../components/ui/feedback';
import VerificationProgress from '../../features/verification/VerificationProgress';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { verificationApi } from '../../services/verificationApi';
import { PAYMENT_METHOD_LABELS, VERIFICATION_PAYMENT_STATUS, VERIFICATION_STATUS } from '../../utils/constants';
import { errorMessage } from '../../utils/errors';
import { formatDate } from '../../utils/format';

const money = (n, c = 'RWF') => `${Number(n).toLocaleString('en-US')} ${c}`;

function FeeBox({ fee }) {
  if (!fee) return <Alert tone="warning" title="The verification fee has not been published yet">You can apply as soon as the fee is announced.</Alert>;
  return (
    <section className="panel border-2 border-teal-200 p-5" aria-labelledby="fee-h">
      <h2 id="fee-h" className="text-lg font-semibold">Verification fee</h2>
      <p className="mt-1 font-display text-3xl font-bold text-teal-700">{fee.amount === 0 ? 'Free for now' : money(fee.amount, fee.currency)}</p>
      {fee.instructions && <p className="mt-2 text-sm text-ink-800">{fee.instructions}</p>}
      <p className="mt-3 text-sm font-medium text-ink-900">Paying covers the review of your documents. It does not make you verified: Imbehe decides after reviewing.</p>
    </section>
  );
}

function PaymentForm({ app, methods, onDone }) {
  const toast = useToast();
  const [method, setMethod] = useState(app.payment?.method ?? 'mobile_money');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = app.payment?.status === 'pending';
  const sandbox = methods.gateways?.some((g) => g.name === 'sandbox');

  const run = async (fn, ok) => {
    setBusy(true);
    setError('');
    try { await fn(); if (ok) toast.success(ok); onDone(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const submit = (e) => {
    e.preventDefault();
    if (method === 'mobile_money' && phone && !/^\+?[0-9 ]{9,15}$/.test(phone.trim())) { setError('Enter a valid phone number, or leave it empty.'); return; }
    run(() => verificationApi.pay({ method, ...(phone.trim() ? { payerPhone: phone.trim() } : {}) }), 'Payment started.');
  };

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="pay-h">
      <h2 id="pay-h" className="text-lg font-semibold">Pay the fee: {money(app.fee.amount, app.fee.currency)}</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">How will you pay?</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 ${method === value ? 'border-teal-600 bg-teal-50' : 'border-ink-200 bg-white'}`}>
                <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="accent-teal-600" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {method === 'mobile_money' && <TextField label="Mobile Money number you will pay from (optional)" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 7xx xxx xxx" className="max-w-sm" />}
        {!pending && <Button type="submit" loading={busy}>Continue to payment</Button>}
        {pending && <Button type="submit" variant="outline" loading={busy}>Change method</Button>}
      </form>

      {pending && (
        <div className="rounded-lg bg-sun-100 p-4 text-sm text-ink-900" role="status">
          <p className="font-semibold">Waiting for your payment to be confirmed</p>
          {app.payment.instructions && <p className="mt-1">{app.payment.instructions}</p>}
          <p className="mt-2">Your review starts only after the payment is confirmed by our system or by our staff. You’ll get a notification.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => verificationApi.cancelPayment(), 'Payment cancelled.')}>Cancel this payment</Button>
            {sandbox && app.payment.gateway === 'sandbox' && (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => verificationApi.sandbox('success'))}>Test: simulate success</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => verificationApi.sandbox('fail'))}>Test: simulate failure</Button>
              </>
            )}
          </div>
        </div>
      )}
      {app.paymentStatus === 'failed' && <Alert tone="error">Your last payment did not go through. You can try again.</Alert>}
    </section>
  );
}

/** Provider side of paid verification: see the fee, apply, pay, follow the review, answer questions. */
export default function VerificationPage() {
  useDocumentTitle('Get verified');
  const toast = useToast();
  const { data, loading, error, reload } = useAsync((signal) => verificationApi.mine(signal), []);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader label="Loading" />;
  if (error?.code === 'PROFILE_REQUIRED') return <Alert tone="info" title="Create your provider profile first" action={<ButtonLink to="/dashboard/provider/profile" size="sm">Create profile</ButtonLink>}>Your profile is what we verify.</Alert>;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { fee, application: app, documents } = data;
  const docsReady = documents?.complete ?? false;
  const canApply = docsReady && Boolean(fee) && (!app || !app.active);
  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); reload(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };
  const sendReply = async () => {
    if (reply.trim().length < 5) { setReplyError('Write a short answer.'); return; }
    setReplyError('');
    await act(() => verificationApi.respond(reply.trim()), 'Sent. Your application is back in review.');
    setReply('');
  };

  if (data.verificationStatus === 'verified' && (!app || app.status === 'approved')) {
    return (<><PageHeader title="Get verified" /><Alert tone="success" title="Your profile is verified">You appear in search and can publish services. Thank you for completing verification.</Alert></>);
  }

  return (
    <>
      <PageHeader title="Get verified" description="Verified providers are the only ones shown to customers. Verification is a paid review of your documents." />
      <div className="space-y-6">
        {!app?.active && <FeeBox fee={fee} />}

        {app && (
          <section className="panel space-y-4 p-5" aria-labelledby="status-h">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="status-h" className="text-lg font-semibold">Your application</h2>
              <Badge tone={VERIFICATION_STATUS[app.status].tone}>{VERIFICATION_STATUS[app.status].label}</Badge>
              <Badge tone={VERIFICATION_PAYMENT_STATUS[app.paymentStatus].tone}>{VERIFICATION_PAYMENT_STATUS[app.paymentStatus].label}</Badge>
            </div>
            <VerificationProgress status={app.status} />
            <p className="text-sm text-ink-700">Fee shown when you applied: {money(app.fee.amount, app.fee.currency)} · applied {formatDate(app.createdAt)}</p>
            {app.status === 'under_review' || app.status === 'payment_confirmed' ? <p className="text-sm text-ink-800">Payment received. An administrator will review your documents. Payment alone does not verify you.</p> : null}
            {app.status === 'recommended' && <p className="text-sm text-ink-800">An administrator reviewed your documents. The super administrator makes the final decision.</p>}
            {app.status === 'rejected' && <Alert tone="error" title="Not approved">{app.decision?.reason || 'Your application was not approved.'}</Alert>}
          </section>
        )}

        {app?.status === 'pending_payment' && <PaymentForm app={app} methods={data.paymentMethods} onDone={reload} />}

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
            <h2 id="apply-h" className="text-lg font-semibold">{app ? 'Apply again' : 'Apply for verification'}</h2>
            <ul className="space-y-1 text-sm">
              {(documents?.required ?? []).map((d) => <li key={d.kind}>{d.uploaded ? '✓' : '✗'} {d.label} {d.uploaded ? 'uploaded' : 'is missing'}</li>)}
            </ul>
            {!docsReady && <Alert tone="warning">Upload the missing documents first. <Link to="/dashboard/documents" className="font-semibold text-teal-700 underline">Go to my documents</Link></Alert>}
            <Button disabled={!canApply} loading={busy} onClick={() => act(() => verificationApi.apply(), 'Application started. Next: pay the fee.')}>Apply and continue to payment</Button>
            <p className="text-sm text-ink-600">You’ll see the fee again before you pay. Your profile must also be complete (bio, categories, district).</p>
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
