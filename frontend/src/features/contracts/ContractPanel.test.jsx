import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractPanel from './ContractPanel';
import { ToastProvider } from '../../context/ToastContext';
import { contractApi } from '../../services/verificationApi';

vi.mock('../../services/verificationApi', () => ({ contractApi: { forBooking: vi.fn(), accept: vi.fn(), propose: vi.fn() } }));

const contract = (over = {}) => ({
  id: 'c1', booking: 'b1', status: 'pending', version: 2, myRole: 'provider', intact: true, iHaveAccepted: false, waitingFor: ['customer', 'provider'], acceptedAt: null,
  content: {
    serviceDescription: 'Fix my office network', agreedPrice: 40000, currency: 'RWF', deliverables: ['Audit report'], deadline: null, estimatedDuration: '3 days',
    customerResponsibilities: ['Give access'], providerResponsibilities: ['Do the work'], paymentTerms: 'Pay through Imbehe.', cancellationTerms: 'Cancel before work starts.', disputeResolution: 'An administrator decides.',
  },
  versions: [{ number: 1, createdAt: '2026-10-20T10:00:00Z', acceptedBy: [], contentHash: 'a'.repeat(64) }, { number: 2, createdAt: '2026-10-21T10:00:00Z', note: 'Added a report', acceptedBy: [], contentHash: 'b'.repeat(64) }],
  ...over,
});
const renderPanel = (booking = { id: 'b1', status: 'accepted' }) => render(<MemoryRouter><ToastProvider><ContractPanel booking={booking} onChanged={vi.fn()} /></ToastProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  contractApi.forBooking.mockResolvedValue({ data: { contract: contract() } });
  contractApi.accept.mockResolvedValue({ data: {} });
});

describe('ContractPanel', () => {
  it('shows every part of the contract', async () => {
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Service contract' })).toBeInTheDocument();
    for (const name of ['The service', 'Agreed price', 'Deliverables', 'Deadline and duration', 'The customer will', 'The provider will', 'Payment', 'Cancellation', 'If something goes wrong']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Waiting for customer and provider/)).toBeInTheDocument();
  });

  it('the provider accepts the job and contract, naming the version they read', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept this job and contract' }));
    expect(contractApi.accept).toHaveBeenCalledWith('c1', 2);
  });

  it('the customer accepts a contract and can propose changes', async () => {
    contractApi.forBooking.mockResolvedValue({ data: { contract: contract({ myRole: 'customer' }) } });
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Accept this contract' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose changes' })).toBeInTheDocument();
  });

  it('after accepting you wait for the other side and cannot accept again', async () => {
    contractApi.forBooking.mockResolvedValue({ data: { contract: contract({ iHaveAccepted: true, waitingFor: ['customer'] }) } });
    renderPanel();
    expect(await screen.findByText(/You accepted version 2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Accept/ })).not.toBeInTheDocument();
  });

  it('a signed contract offers nothing more to do, and administrators can only read it', async () => {
    contractApi.forBooking.mockResolvedValue({ data: { contract: contract({ status: 'accepted', waitingFor: [], acceptedAt: '2026-10-22T10:00:00Z', iHaveAccepted: true }) } });
    renderPanel({ id: 'b1', status: 'in_progress' });
    expect(await screen.findByText('Signed by both')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept|Propose/ })).not.toBeInTheDocument();
  });

  it('administrators see the contract but no buttons to accept or change it', async () => {
    contractApi.forBooking.mockResolvedValue({ data: { contract: contract({ myRole: 'admin', iHaveAccepted: undefined }) } });
    renderPanel();
    await screen.findByRole('heading', { name: 'Service contract' });
    expect(screen.queryByRole('button', { name: /Accept|Propose/ })).not.toBeInTheDocument();
  });

  it('shows the version history with fingerprints', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Show version history/ }));
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByText(/Fingerprint bbbbbbbbbbbbbbbb/)).toBeInTheDocument();
  });

  it('warns if a stored contract fails its integrity check', async () => {
    contractApi.forBooking.mockResolvedValue({ data: { contract: contract({ intact: false }) } });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/integrity check/i);
  });
});
