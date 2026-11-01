import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminVerificationDetailPage from './AdminVerificationDetailPage';
import { ToastProvider } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { verificationApi } from '../../services/verificationApi';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/verificationApi', () => ({ verificationApi: { get: vi.fn(), startReview: vi.fn(), requestInfo: vi.fn(), recommend: vi.fn(), reject: vi.fn(), decide: vi.fn(), reopen: vi.fn() }, documentApi: { blob: vi.fn() } }));

const app = (over = {}) => ({
  id: 'a1', status: 'under_review', paymentStatus: 'confirmed', fee: { amount: 5000, currency: 'RWF' }, createdAt: '2026-10-20T10:00:00Z',
  provider: { displayName: 'Eric IT', providerType: 'individual' }, applicant: { name: 'Eric M', email: 'eric@example.com' },
  documents: [{ id: 'd1', label: 'National ID', originalName: 'id.pdf', mime: 'application/pdf' }], payments: [], infoRequests: [], history: [],
  ratingsNow: { average: 4.8, count: 12, completedJobs: 15 }, ...over,
});
const roles = (...r) => useAuth.mockReturnValue({ hasRole: (...wanted) => wanted.some((w) => r.includes(w)) });
const renderPage = () => render(<MemoryRouter initialEntries={['/v/a1']}><ToastProvider><Routes><Route path="/v/:id" element={<AdminVerificationDetailPage />} /></Routes></ToastProvider></MemoryRouter>);

beforeEach(() => { vi.clearAllMocks(); verificationApi.get.mockResolvedValue({ data: { application: app() } }); roles('admin'); });

describe('AdminVerificationDetailPage', () => {
  it('shows the documents, the ratings and the history, with payment and review status apart', async () => {
    renderPage();
    expect(await screen.findByText('Under Review')).toBeInTheDocument();
    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
    expect(screen.getByText(/4.8 stars/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });

  it('offers no review actions until payment is confirmed', async () => {
    verificationApi.get.mockResolvedValue({ data: { application: app({ status: 'pending_payment', paymentStatus: 'unpaid' }) } });
    renderPage();
    expect(await screen.findByText(/Payment is not confirmed yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recommend|Reject|Start review|Ask for more/ })).not.toBeInTheDocument();
  });

  it('an administrator can recommend or reject but not approve', async () => {
    verificationApi.get.mockResolvedValue({ data: { application: app({ status: 'recommended' }) } });
    renderPage();
    expect(await screen.findByText(/Waiting for the super administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });

  it('recommending needs written evidence', async () => {
    verificationApi.recommend.mockResolvedValue({ data: {} });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Recommend for verification' }));
    expect(verificationApi.recommend).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/Why you recommend approval/), 'Genuine documents and strong ratings.');
    await userEvent.click(screen.getByRole('button', { name: 'Recommend for verification' }));
    expect(verificationApi.recommend).toHaveBeenCalledWith('a1', 'Genuine documents and strong ratings.');
  });

  it('only the super administrator sees the final approval, and only for a recommended application', async () => {
    roles('admin', 'super_admin');
    verificationApi.get.mockResolvedValue({ data: { application: app({ status: 'recommended' }) } });
    verificationApi.decide.mockResolvedValue({ data: {} });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Approve verification' }));
    expect(verificationApi.decide).toHaveBeenCalledWith('a1', { outcome: 'approved' });
  });

  it('the super administrator can reopen an application an administrator rejected', async () => {
    roles('admin', 'super_admin');
    verificationApi.get.mockResolvedValue({ data: { application: app({ status: 'rejected', decision: { outcome: 'rejected', byRole: 'admin', reason: 'Unreadable', at: '2026-10-21T10:00:00Z' } }) } });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Reopen for review' })).toBeInTheDocument();
  });
});
