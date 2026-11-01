import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';
import { useAuth } from '../context/AuthContext';
import { userHasRole } from '../utils/roles';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../hooks/useCategories', () => ({ useCategories: () => ({ categories: [], loading: false }) }));
vi.mock('../components/SearchBar', () => ({ default: () => <form aria-label="Search" /> }));
vi.mock('../services/partnerApi', () => ({ partnerApi: { list: vi.fn().mockResolvedValue({ data: [], meta: null }) } }));
vi.mock('../services/catalogApi', () => ({
  catalogApi: { listServices: vi.fn().mockResolvedValue({ data: [], meta: null }), listProviders: vi.fn().mockResolvedValue({ data: [], meta: null }) },
}));

const as = (user) => useAuth.mockReturnValue({ user, hasRole: (...r) => userHasRole(user, ...r) });
const renderHome = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('HomePage', () => {
  it('invites a visitor to hire someone', () => {
    as(null);
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/hire a verified professional/i);
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
  });

  it('greets a signed-in customer by name and offers what they likely came for', () => {
    as({ fullName: 'Aline Uwase', roles: ['customer'] });
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello, Aline.');
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Request a quotation' })).toHaveAttribute('href', '/dashboard/requests/new');
  });

  it('offers a provider their requests and services', () => {
    as({ fullName: 'Eric Electric', roles: ['provider'] });
    renderHome();
    expect(screen.getByRole('link', { name: 'Requests for you' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Request a quotation' })).not.toBeInTheDocument();
  });

  it('offers the payment follow-up role their work', () => {
    as({ fullName: 'Fred Finance', roles: ['finance'] });
    renderHome();
    expect(screen.getByRole('link', { name: 'Payment follow-up' })).toHaveAttribute('href', '/dashboard/admin/payments/follow-up');
  });
});
