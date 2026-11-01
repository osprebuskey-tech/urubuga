import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import BarChart from '../../components/ui/BarChart';
import { validateRange } from '../../pages/admin/AdminReportsPage';
import { validateSuspension } from '../../pages/admin/AdminUsersPage';
import { validateResolution } from '../../pages/disputes/DisputePage';

vi.mock('../../services/adminApi', () => ({
  adminApi: {
    dashboard: vi.fn().mockResolvedValue({
      data: {
        dashboard: {
          users: { total: 40, suspended: 1, joinedLast7Days: 6, byRole: { customer: 25, provider: 12, business: 3, admin: 1 } },
          providers: { total: 12, verified: 8, unverified: 2, pending: 2, rejected: 0 },
          requests: { total: 30, open: 9, accepted: 15, cancelled: 6 },
          jobs: { total: 15, active: 4, completed: 9, cancelled: 1, disputed: 1 },
          reviews: { published: 7, hidden: 0, reported: 1 },
          disputes: { open: 1, underReview: 0, resolved: 0 },
          finance: { grossTransactionValue: 1000000, refunds: 20000, platformRevenue: 117600, commissionRateBps: 1200, providerPayouts: { paid: 500000, pending: 380000 } },
          needsAttention: { providersToVerify: 2, reportedReviews: 1, openDisputes: 1, manualPaymentsWaiting: 0 },
          recentActivity: [{ id: 'a1', action: 'payment.refunded', actor: 'Admin One', at: '2026-10-24T10:00:00.000Z' }],
        },
      },
    }),
  },
}));

describe('validators', () => {
  it('validateRange needs both dates, in order, within a year', () => {
    expect(validateRange({ from: '', to: '2026-01-01' })).toBeTruthy();
    expect(validateRange({ from: '2026-02-01', to: '2026-01-01' })).toBeTruthy();
    expect(validateRange({ from: '2024-01-01', to: '2026-01-01' })).toBeTruthy();
    expect(validateRange({ from: '2026-01-01', to: '2026-01-31' })).toBe('');
  });
  it('validateSuspension needs a real reason', () => {
    expect(validateSuspension('no')).toBeTruthy();
    expect(validateSuspension('Abusive messages')).toBe('');
  });
  it('validateResolution needs an outcome and a note of 10+ characters', () => {
    expect(Object.keys(validateResolution({ outcome: '', note: 'short' })).sort()).toEqual(['note', 'outcome']);
    expect(validateResolution({ outcome: 'cancelled', note: 'Work was not delivered.' })).toEqual({});
  });
});

describe('BarChart', () => {
  it('always offers the numbers as a table', () => {
    render(<BarChart title="Jobs per day" data={[{ label: '2026-10-23', value: 2 }, { label: '2026-10-24', value: 0 }]} />);
    expect(screen.getByText('Jobs per day', { selector: 'figcaption' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('2026-10-23')).toBeInTheDocument();
  });
});

describe('AdminDashboard', () => {
  it('shows what needs attention and keeps gross value apart from revenue', async () => {
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('providers waiting for verification')).toBeInTheDocument();
    expect(screen.queryByText('manual payments waiting for confirmation')).not.toBeInTheDocument(); // zero items are not listed
    expect(screen.getByText('Gross transaction value')).toBeInTheDocument();
    expect(screen.getByText('Platform revenue')).toBeInTheDocument();
    expect(screen.getByText(/Revenue is not profit/)).toBeInTheDocument();
    expect(screen.getByText('1,000,000 RWF')).toBeInTheDocument();
    expect(screen.getByText('117,600 RWF')).toBeInTheDocument();
    expect(screen.getByText('Refund recorded')).toBeInTheDocument();
  });
});
