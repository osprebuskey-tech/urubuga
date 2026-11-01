import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DisputesListPage from './DisputesListPage';
import { disputeApi } from '../../services/disputeApi';

vi.mock('../../services/disputeApi', () => ({ disputeApi: { list: vi.fn() } }));

const dispute = {
  id: 'd1', status: 'open', openerRole: 'customer', reason: 'The wiring was left unfinished.', createdAt: '2026-10-20T10:00:00Z',
  booking: { title: 'Rewire the shop', agreedPrice: 150000 }, customer: { name: 'Aline' }, provider: { name: 'Eric Electric' },
};
const page = (items) => ({ data: items, meta: { page: 1, limit: 10, total: items.length, totalPages: 1 } });
const renderPage = () => render(<MemoryRouter><DisputesListPage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('DisputesListPage', () => {
  it('lists my disputes with a link to each one', async () => {
    disputeApi.list.mockResolvedValue(page([dispute]));
    renderPage();
    const link = await screen.findByRole('link', { name: 'Rewire the shop' });
    expect(link).toHaveAttribute('href', '/dashboard/disputes/d1');
    expect(screen.getAllByText('Open')).toHaveLength(2); // the filter button and this dispute's status
  });

  it('explains where disputes come from when there are none', async () => {
    disputeApi.list.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText(/report it from the job’s page/i)).toBeInTheDocument();
  });
});
