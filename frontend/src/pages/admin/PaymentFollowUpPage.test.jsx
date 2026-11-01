import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentFollowUpPage from './PaymentFollowUpPage';
import { ToastProvider } from '../../context/ToastContext';
import { adminApi } from '../../services/adminApi';

vi.mock('../../services/adminApi', () => ({ adminApi: { followUpSummary: vi.fn(), followUpList: vi.fn(), createFollowUp: vi.fn() } }));

const summary = {
  awaiting_confirmation: { count: 2, value: 90000, overdue: 1 },
  unpaid_jobs: { count: 1, value: 40000, overdue: 1 },
  payouts_due: { count: 0, value: 0, overdue: 0 },
};
const item = {
  bookingId: 'b1', kind: 'payment', title: 'Rewire the shop', customerName: 'Aline Uwase', providerName: 'Eric Electric', amount: 40000,
  bookingStatus: 'completed', since: '2026-10-20T10:00:00Z', ageDays: 5, followUpCount: 0, overdue: true, followUpDueAt: '2026-10-23T10:00:00Z',
};
const list = (items) => ({ data: items, meta: { page: 1, limit: 10, total: items.length, totalPages: 1 } });
const renderPage = () => render(<MemoryRouter><ToastProvider><PaymentFollowUpPage /></ToastProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.followUpSummary.mockResolvedValue({ data: { summary } });
  adminApi.followUpList.mockResolvedValue(list([item]));
  adminApi.createFollowUp.mockResolvedValue({ data: {} });
});

describe('PaymentFollowUpPage', () => {
  it('shows the size of each backlog and what is overdue', async () => {
    renderPage();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(within(tabs[0]).getByText('2')).toBeInTheDocument();
    expect(within(tabs[0]).getByText(/1 overdue/i)).toBeInTheDocument();
    expect(within(tabs[2]).getByText(/none overdue/i)).toBeInTheDocument();
  });

  it('lists the jobs with who owes what, and starts on unpaid jobs', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Rewire the shop' })).toHaveAttribute('href', '/dashboard/bookings/b1');
    expect(screen.getByText(/Aline Uwase/)).toBeInTheDocument();
    expect(screen.getByText(/waiting 5 days/i)).toBeInTheDocument();
    expect(screen.getByText(/nobody has followed this up yet/i)).toBeInTheDocument();
    expect(adminApi.followUpList).toHaveBeenCalledWith('unpaid_jobs', { page: 1, limit: 10 }, expect.anything());
  });

  it('switches to another backlog', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Rewire the shop' });
    await userEvent.click(screen.getAllByRole('tab')[2]);
    expect(adminApi.followUpList).toHaveBeenCalledWith('payouts_due', { page: 1, limit: 10 }, expect.anything());
  });

  it('logs a follow-up with a note, a date and a reminder', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /log follow-up/i }));
    await userEvent.selectOptions(screen.getByLabelText(/what happened/i), 'promised');
    await userEvent.type(screen.getByLabelText(/^note/i), 'Will pay by mobile money on Friday.');
    await userEvent.type(screen.getByLabelText(/look at this again on/i), '2099-01-01');
    await userEvent.click(screen.getByLabelText(/also send the customer a payment reminder/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    expect(adminApi.createFollowUp).toHaveBeenCalledWith({ bookingId: 'b1', kind: 'payment', outcome: 'promised', note: 'Will pay by mobile money on Friday.', nextFollowUpAt: '2099-01-01', remindCustomer: true });
  });

  it('does not offer a customer reminder for a payout', async () => {
    adminApi.followUpList.mockResolvedValue(list([{ ...item, kind: 'payout' }]));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /log follow-up/i }));
    expect(screen.queryByLabelText(/payment reminder/i)).not.toBeInTheDocument();
  });

  it('wants a note before it saves', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /log follow-up/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    expect(screen.getByText(/write what happened/i)).toBeInTheDocument();
    expect(adminApi.createFollowUp).not.toHaveBeenCalled();
  });
});
