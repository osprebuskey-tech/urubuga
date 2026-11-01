import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminProvidersPage from './AdminProvidersPage';
import { ToastProvider } from '../../context/ToastContext';
import { adminApi } from '../../services/adminApi';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ hasRole: () => true }) }));

vi.mock('../../services/adminApi', () => ({
  adminApi: { providers: vi.fn(), setVerification: vi.fn() },
}));

const provider = {
  id: 'p1', displayName: 'Eric Mugisha IT', verificationStatus: 'pending', bio: 'Computer and network repair.',
  skills: ['Laptop repair'], categories: [{ id: 'c1', name: 'IT Maintenance' }], portfolio: [], updatedAt: '2026-10-20T10:00:00Z',
  user: { fullName: 'Eric Mugisha', email: 'eric@example.com' },
};
const page = (items) => ({ data: items, meta: { page: 1, limit: 10, total: items.length, totalPages: 1 } });

const renderPage = () => render(<MemoryRouter><ToastProvider><AdminProvidersPage /></ToastProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.providers.mockResolvedValue(page([provider]));
  adminApi.setVerification.mockResolvedValue({ data: {} });
});

describe('AdminProvidersPage decisions', () => {
  it('cannot accept a request directly: it sends the admin to the paid verification review', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /open verification review/i })).toHaveAttribute('href', '/dashboard/admin/verification');
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(adminApi.setVerification).not.toHaveBeenCalled();
  });

  it('asks for more information with a question the provider will read', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /ask for more info/i }));
    await userEvent.type(screen.getByLabelText(/what do you need to know/i), 'Please add two portfolio items.');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(adminApi.setVerification).toHaveBeenCalledWith('p1', { status: 'needs_info', note: 'Please add two portfolio items.' });
  });

  it('will not send an empty question', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /ask for more info/i }));
    await userEvent.type(screen.getByLabelText(/what do you need to know/i), 'no');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(screen.getByText(/at least 5 characters/i)).toBeInTheDocument();
    expect(adminApi.setVerification).not.toHaveBeenCalled();
  });

  it('rejects only with a reason', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /^reject/i }));
    await userEvent.type(screen.getByLabelText(/why isn’t eric mugisha it approved/i), 'Bio is too vague to approve.');
    await userEvent.click(screen.getByRole('button', { name: 'Reject request' }));
    expect(adminApi.setVerification).toHaveBeenCalledWith('p1', { status: 'rejected', note: 'Bio is too vague to approve.' });
  });

  it('shows the provider’s reply next to the question', async () => {
    adminApi.providers.mockResolvedValue(page([{ ...provider, verificationNote: 'Add portfolio items.', verificationResponse: 'Done, see portfolio.' }]));
    renderPage();
    expect(await screen.findByText(/Done, see portfolio\./)).toBeInTheDocument();
    expect(screen.getByText(/Add portfolio items\./)).toBeInTheDocument();
  });
});
