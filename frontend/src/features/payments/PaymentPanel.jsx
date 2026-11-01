import { useState } from 'react';
import Button from '../../components/ui/Button';
import { PageLoader } from '../../components/ui/Spinner';
import { Alert, Badge, ErrorState } from '../../components/ui/feedback';
import { useToast } from '../../context/ToastContext';
import { useAsync } from '../../hooks/useAsync';
import { paymentApi } from '../../services/paymentApi';
import { PAYMENT_STATUS } from '../../utils/constants';
import { bpsLabel, formatDate, formatRWF } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import AdminPaymentActions from './AdminPaymentActions';

const PAYABLE = ['accepted', 'in_progress', 'completed'];

function Row({ label, value, strong, note }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-ink-700">{label}{note && <span className="block text-xs text-ink-600">{note}</span>}</dt>
      <dd className={strong ? 'font-display text-lg font-bold' : 'font-medium'}>{value}</dd>
    </div>
  );
}

function Refunds({ payment }) {
  if (!payment.refunds.length) return null;
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">Refunds</p>
      <ul className="mt-1 space-y-1 text-sm text-ink-800">{payment.refunds.map((r, i) => <li key={i}>{formatRWF(r.amount)} on {formatDate(r.at)}: {r.reason}</li>)}</ul>
    </div>
  );
}

/** Choose a method and pay, or follow up on a payment already started. */
function CustomerPayment({ booking, payment, onChanged }) {
  const toast = useToast();
  const options = useAsync((signal) => (payment ? Promise.resolve({ data: null }) : paymentApi.options(signal)), [payment?.id]);
  const [gateway, setGateway] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (label, fn, success) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      if (success) toast.success(success);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  };

  if (!payment) {
    if (!PAYABLE.includes(booking.status)) return <p className="text-ink-700">This job is closed, so there is nothing to pay.</p>;
    if (options.loading) return <PageLoader label="Loading payment options" />;
    if (options.error) return <ErrorState error={options.error} onRetry={options.reload} />;
    const { gateways, defaultGateway } = options.data;
    const chosen = gateway || defaultGateway;
    return (
      <div className="space-y-4">
        <p className="text-ink-800">Amount due: <strong className="font-display text-xl text-rose-700">{formatRWF(booking.agreedPrice)}</strong></p>
        {error && <Alert tone="error">{error}</Alert>}
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">How would you like to pay?</legend>
          <div className="space-y-2">
            {gateways.map((g) => (
              <label key={g.name} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ink-100 px-3 py-2.5 hover:bg-ink-50 has-[:checked]:border-ink-500 has-[:checked]:bg-ink-50">
                <input type="radio" name="gateway" value={g.name} checked={chosen === g.name} onChange={() => setGateway(g.name)} className="mt-1 h-4 w-4 accent-rose-700" />
                <span><span className="font-medium">{g.label}</span>{g.name === 'sandbox' && <span className="block text-sm text-amber-800">For development. No real money moves.</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button loading={busy === 'checkout'} onClick={() => run('checkout', () => paymentApi.checkout({ bookingId: booking.id, gateway: chosen }))}>Continue to payment</Button>
      </div>
    );
  }

  if (payment.status === 'pending') {
    return (
      <div className="space-y-4">
        <p className="text-ink-800">Amount: <strong>{formatRWF(payment.amount)}</strong></p>
        {error && <Alert tone="error">{error}</Alert>}
        {payment.gateway === 'manual' && (
          <Alert tone="info" title="Pay outside the app, then wait for confirmation">
            {payment.instructions}
            <span className="mt-1 block">An administrator confirms the payment once they see the money. You’ll get a notification.</span>
          </Alert>
        )}
        {payment.gateway === 'sandbox' && (
          <Alert tone="warning" title="Test mode: no real money moves">
            Use these buttons to send the payment result the way a real gateway would.
            <span className="mt-3 flex flex-wrap gap-3">
              <Button size="sm" loading={busy === 'ok'} onClick={() => run('ok', () => paymentApi.simulate(payment.id, 'succeed'), 'Test payment succeeded.')}>Simulate successful payment</Button>
              <Button size="sm" variant="outline" loading={busy === 'fail'} onClick={() => run('fail', () => paymentApi.simulate(payment.id, 'fail'))}>Simulate failed payment</Button>
            </span>
          </Alert>
        )}
        <Button variant="outline" size="sm" loading={busy === 'cancel'} onClick={() => run('cancel', () => paymentApi.cancel(payment.id), 'Payment cancelled.')}>Cancel this payment</Button>
      </div>
    );
  }

  return (
    <dl>
      <Row label="Paid" value={formatRWF(payment.amount)} strong />
      {payment.refundedAmount > 0 && <Row label="Refunded" value={formatRWF(payment.refundedAmount)} />}
      {payment.refundedAmount > 0 && <Row label="You paid in total" value={formatRWF(payment.netPaid)} />}
      <Row label="Confirmed" value={formatDate(payment.confirmedAt)} />
      {payment.gatewayReference && <Row label="Reference" value={payment.gatewayReference} />}
      <Refunds payment={payment} />
    </dl>
  );
}

function ProviderPayment({ booking, payment }) {
  if (!payment || payment.status !== 'succeeded') {
    return <p className="text-ink-800">{payment?.status === 'pending' ? 'The customer has started a payment. You’ll be told when it’s confirmed.' : PAYABLE.includes(booking.status) ? 'The customer hasn’t paid yet.' : 'No payment.'}</p>;
  }
  return (
    <dl>
      <Row label="Job price (paid by the customer)" value={formatRWF(payment.amount)} />
      <Row label={`Platform commission (${bpsLabel(payment.commissionRateBps ?? 0)})`} value={`− ${formatRWF(payment.commission)}`} />
      <Row label="Your share" value={formatRWF(payment.providerShare)} strong />
      {payment.refundedAmount > 0 && <Row label="After refunds" value={formatRWF(payment.providerNet)} note="Refunds come out of your share and the commission in proportion." />}
      <Row label="Paid out to you" value={formatRWF(payment.paidOut)} />
      <Row label="Still due to you" value={formatRWF(payment.payoutDue)} note={booking.status === 'completed' ? undefined : 'Paid out after the job is completed.'} />
      {payment.payouts.length > 0 && <ul className="mt-2 space-y-1 text-sm text-ink-800">{payment.payouts.map((p, i) => <li key={i}>{formatRWF(p.amount)} on {formatDate(p.at)} (ref. {p.reference})</li>)}</ul>}
      <Refunds payment={payment} />
    </dl>
  );
}

function AdminPayment({ booking, payment, onChanged }) {
  return (
    <div className="space-y-4">
      {!payment ? <p className="text-ink-800">No payment yet.</p> : payment.status !== 'succeeded' ? (
        <p className="text-ink-800">{payment.gateway === 'manual' ? 'A manual payment is waiting for confirmation.' : `A ${payment.gateway} payment is ${payment.status}.`}</p>
      ) : (
        <dl>
          <Row label="Gross (paid by customer)" value={formatRWF(payment.financials.gross)} strong />
          <Row label="Refunded to customer" value={formatRWF(payment.financials.refunded)} />
          <Row label={`Platform commission (${bpsLabel(payment.financials.commissionRateBps)})`} value={formatRWF(payment.financials.netCommission)} note="Revenue, not profit" />
          <Row label="Provider’s share" value={formatRWF(payment.financials.providerNet)} />
          <Row label="Paid out so far" value={formatRWF(payment.financials.paidOut)} />
          <Row label="Still due to provider" value={formatRWF(payment.financials.payoutDue)} />
          {payment.financials.providerOwes > 0 && <Row label="Provider owes back" value={formatRWF(payment.financials.providerOwes)} note="A refund was recorded after payout." />}
          {payment.gatewayReference && <Row label="Reference" value={payment.gatewayReference} />}
          <Refunds payment={payment} />
        </dl>
      )}
      <AdminPaymentActions booking={booking} payment={payment} onChanged={onChanged} />
    </div>
  );
}

const pick = (list) => list?.find((p) => p.status === 'succeeded' || p.status === 'pending') ?? list?.[0] ?? null;

/** The payment section of a job page, for whoever is looking: customer, provider or administrator. */
export default function PaymentPanel({ booking, onChanged }) {
  const role = booking.myRole;
  const payments = useAsync(
    (signal) => (role === 'admin' ? paymentApi.adminList({ bookingId: booking.id, limit: 10 }, signal) : paymentApi.list({ bookingId: booking.id, limit: 10 }, signal)),
    [booking.id, booking.status],
  );
  const shown = pick(payments.data);
  const active = shown && ['pending', 'succeeded'].includes(shown.status) ? shown : null;
  const refresh = () => { payments.reload(); onChanged?.(); };
  const status = shown ? PAYMENT_STATUS[shown.status] : null;

  return (
    <section className="panel mt-6 p-6" aria-labelledby="payment-h">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="payment-h" className="text-xl font-semibold">Payment</h2>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>
      {payments.loading && !payments.data && <PageLoader label="Loading payment" />}
      {payments.error && <ErrorState error={payments.error} onRetry={payments.reload} />}
      {payments.data && (
        <>
          {shown && !active && shown.status === 'failed' && <Alert tone="error" className="mb-4">The last payment didn’t go through{shown.failureReason ? `: ${shown.failureReason}` : ''}.</Alert>}
          {role === 'customer' && <CustomerPayment booking={booking} payment={active} onChanged={refresh} />}
          {role === 'provider' && <ProviderPayment booking={booking} payment={active} />}
          {role === 'admin' && <AdminPayment booking={booking} payment={active} onChanged={refresh} />}
        </>
      )}
    </section>
  );
}
