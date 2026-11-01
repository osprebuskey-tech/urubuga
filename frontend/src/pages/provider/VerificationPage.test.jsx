import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerificationPage from './VerificationPage';
import { ToastProvider } from '../../context/ToastContext';
import { verificationApi } from '../../services/verificationApi';

vi.mock('../../services/verificationApi', () => ({ verificationApi: { mine: vi.fn(), apply: vi.fn(), pay: vi.fn(), cancelPayment: vi.fn(), respond: vi.fn(), sandbox: vi.fn() } }));

const fee = { amount: 15000, currency: 'RWF', instructions: 'Send the fee by MoMo to 0788 000 000.', version: 1 };
const docs = (complete) => ({ required: [{ kind: 'national_id', label: 'National ID', uploaded: true }, { kind: 'cv', label: 'CV', uploaded: complete }], missing: complete ? [] : ['cv'], complete });
const mine = (over = {}) => ({ data: { verificationStatus: 'unverified', fee, application: null, documents: docs(true), paymentMethods: { methods: [], gateways: [{ name: 'manual' }] }, ...over } });
const app = (over = {}) => ({ id: 'a1', status: 'pending_payment', paymentStatus: 'unpaid', active: true, fee: { amount: 15000, currency: 'RWF' }, createdAt: '2026-10-20T10:00:00Z', history: [], payment: null, ...over });
const renderPage = () => render(<MemoryRouter><ToastProvider><VerificationPage /></ToastProvider></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); verificationApi.mine.mockResolvedValue(mine()); verificationApi.apply.mockResolvedValue({ data: {} }); verificationApi.pay.mockResolvedValue({ data: {} }); });

describe('VerificationPage', () => {
  it('shows the fee and the payment instructions before anything is submitted', async () => {
    renderPage();
    expect(await screen.findByText('15,000 RWF')).toBeInTheDocument();
    expect(screen.getByText(/Send the fee by MoMo/)).toBeInTheDocument();
    expect(screen.getByText(/does not make you verified/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Apply and continue to payment/ }));
    expect(verificationApi.apply).toHaveBeenCalled();
  });

  it('cannot apply with documents missing, and points to the upload page', async () => {
    verificationApi.mine.mockResolvedValue(mine({ documents: docs(false) }));
    renderPage();
    expect(await screen.findByText(/CV is missing/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply and continue to payment/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Go to my documents' })).toHaveAttribute('href', '/dashboard/documents');
  });

  it('cannot apply while no fee is published', async () => {
    verificationApi.mine.mockResolvedValue(mine({ fee: null }));
    renderPage();
    expect(await screen.findByText(/fee has not been published yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply and continue to payment/ })).toBeDisabled();
  });

  it('shows the review status and the payment status as two separate things', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app() }));
    renderPage();
    expect(await screen.findByText('Pending Payment')).toBeInTheDocument();
    expect(screen.getByText('Not paid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pay the fee: 15,000 RWF/ })).toBeInTheDocument();
  });

  it('lets the applicant choose Mobile Money, card or bank transfer, and sends only the method', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app() }));
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: 'Bank card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(verificationApi.pay).toHaveBeenCalledWith({ method: 'card' }); // the amount is never sent: the server uses the fee shown
    expect(screen.getByRole('radio', { name: 'Mobile Money' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Bank transfer' })).toBeInTheDocument();
  });

  it('a payment waiting for confirmation does not say the provider is verified', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app({ paymentStatus: 'pending', payment: { method: 'mobile_money', status: 'pending', gateway: 'manual', instructions: 'Wait for our staff to confirm.' } }) }));
    renderPage();
    expect(await screen.findByText(/Waiting for your payment to be confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/starts only after the payment is confirmed/i)).toBeInTheDocument();
  });

  it('after payment the status reads Payment Confirmed and says payment alone does not verify', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app({ status: 'payment_confirmed', paymentStatus: 'confirmed' }) }));
    renderPage();
    expect(await screen.findAllByText('Payment Confirmed')).not.toHaveLength(0);
    expect(screen.getByText(/Payment alone does not verify you/)).toBeInTheDocument();
  });

  it('answers an administrator\'s question', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app({ status: 'more_info_required', paymentStatus: 'confirmed', question: 'Please upload a clearer ID.' }) }));
    verificationApi.respond.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Please upload a clearer ID.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your answer'), 'Uploaded it again.');
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(verificationApi.respond).toHaveBeenCalledWith('Uploaded it again.');
  });

  it('shows the reason for a rejection and allows applying again', async () => {
    verificationApi.mine.mockResolvedValue(mine({ application: app({ status: 'rejected', active: false, decision: { outcome: 'rejected', reason: 'The ID does not match.' } }) }));
    renderPage();
    expect(await screen.findByText('The ID does not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply and continue to payment/ })).toBeEnabled();
  });
});
