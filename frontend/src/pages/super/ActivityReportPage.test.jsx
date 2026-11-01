import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityReportPage from './ActivityReportPage';
import { adminApi } from '../../services/adminApi';
import { downloadCsv } from '../../utils/csv';

vi.mock('../../services/adminApi', () => ({ adminApi: { activityReport: vi.fn() } }));
vi.mock('../../utils/csv', () => ({ downloadCsv: vi.fn() }));

const report = {
  from: '2026-10-01', to: '2026-10-30', generatedAt: '2026-10-30T10:00:00Z',
  pendings: [
    { key: 'providers_awaiting_verification', group: 'Providers', count: 3, oldestAt: '2026-10-20T10:00:00Z' },
    { key: 'payouts_due', group: 'Payments', count: 2, oldestAt: '2026-10-18T10:00:00Z', value: 70400, overdue: 2 },
    { key: 'disputes_open', group: 'Disputes', count: 0 },
  ],
  providers: {
    rows: [{ providerId: 'p1', name: '=Evil Ltd', quotationsSent: 5, quotationsAccepted: 2, jobsWon: 2, jobsCancelled: 0, jobsCompleted: 2, completedValue: 80000, reviews: 1, avgRating: 5, overallRating: 4.8, disputes: 1 }],
    activeProviders: 1, verifiedProviders: 4, inactiveVerifiedProviders: 3, truncated: false,
  },
  delivery: {
    jobs: { total: 4, accepted: 0, in_progress: 1, completed: 2, cancelled: 1, disputed: 0 }, completedValue: 80000, completionRate: 66.7, avgDaysToComplete: 3, avgDaysToStart: 1.5,
    funnel: { requests: 6, withQuotations: 5, accepted: 4, cancelled: 1 }, byCategory: [{ category: 'Electrical Services', jobs: 4, completed: 2, value: 160000 }],
  },
  adminWork: {
    members: [
      { id: 'a1', name: 'Alice Admin', email: 'a@example.rw', roles: ['admin'], status: 'active', total: 5, lastActionAt: '2026-10-29T10:00:00Z', lastSignInAt: '2026-10-29T08:00:00Z', actions: [{ action: 'provider.verification_changed', count: 5 }] },
      { id: 'f1', name: 'Fred Finance', email: 'f@example.rw', roles: ['finance'], status: 'active', total: 0, actions: [] },
    ],
    byAction: [{ action: 'provider.verification_changed', count: 5 }],
  },
};

const renderPage = () => render(<MemoryRouter><ActivityReportPage /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks();
  adminApi.activityReport.mockResolvedValue({ data: { report } });
});

describe('ActivityReportPage', () => {
  it('starts with what is waiting, grouped, linking to where it is dealt with', async () => {
    renderPage();
    expect(await screen.findByText('Providers waiting for verification')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Providers waiting for verification' })).toHaveAttribute('href', '/dashboard/admin/providers');
    expect(screen.getByText(/2 overdue/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payouts due to providers' })).toHaveAttribute('href', '/dashboard/admin/payments/follow-up');
  });

  it('asks for the last 30 days at first', async () => {
    renderPage();
    await screen.findByText('Providers waiting for verification');
    expect(adminApi.activityReport).toHaveBeenCalledWith({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }, expect.anything());
  });

  it('shows provider activity and exports it, formulas and all, to the CSV helper', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Providers' }));
    expect(screen.getByText(/3 verified providers did nothing/i)).toBeInTheDocument();
    const row = screen.getByRole('link', { name: '=Evil Ltd' }).closest('tr');
    expect(within(row).getByText('2', { selector: 'td.font-semibold' })).toBeInTheDocument(); // completed jobs
    await userEvent.click(screen.getByRole('button', { name: /download csv/i }));
    expect(downloadCsv).toHaveBeenCalledWith(expect.stringMatching(/providers.*\.csv$/), expect.arrayContaining(['Provider']), [expect.arrayContaining(['=Evil Ltd', 80000])]);
  });

  it('shows how service delivery went', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Service delivery' }));
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('3 days')).toBeInTheDocument();
    expect(screen.getByText('Electrical Services')).toBeInTheDocument();
  });

  it('shows what each staff member did, including those who did nothing', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Staff work' }));
    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText(/Provider verification changed/)).toBeInTheDocument();
    expect(screen.getByText('Fred Finance')).toBeInTheDocument();
    expect(screen.getByText(/nothing recorded/i)).toBeInTheDocument();
  });

  it('will not ask for a period that ends before it starts', async () => {
    renderPage();
    await screen.findByText('Providers waiting for verification');
    await userEvent.clear(screen.getByLabelText('From'));
    await userEvent.type(screen.getByLabelText('From'), '2099-01-01');
    expect(screen.getByRole('alert')).toHaveTextContent(/not after the end date/i);
    expect(screen.getByRole('button', { name: 'Show report' })).toBeDisabled();
  });
});
