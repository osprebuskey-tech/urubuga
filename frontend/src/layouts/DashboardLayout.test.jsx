import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { userHasRole } from '../utils/roles';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../components/NotificationBell', () => ({ default: () => <span>bell</span> }));
vi.mock('../components/EmailVerifyBanner', () => ({ default: () => null }));
vi.mock('../components/AnnouncementBar', () => ({ default: () => null }));

const as = (...roles) => {
  const user = { id: 'u1', fullName: 'Aline Uwase', email: 'aline@example.rw', roles };
  useAuth.mockReturnValue({ user, logout: vi.fn(), hasRole: (...wanted) => userHasRole(user, ...wanted) });
};
const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes><Route path="/dashboard" element={<DashboardLayout />}><Route index element={<p>overview content</p>} /></Route></Routes>
    </MemoryRouter>,
  );
const sidebar = () => within(screen.getByRole('navigation', { name: 'Dashboard' }));

beforeEach(() => vi.clearAllMocks());

describe('DashboardLayout', () => {
  it('offers no way back to the home page: that is for visitors, until you log out', () => {
    as('customer');
    renderLayout();
    expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').every((a) => a.getAttribute('href') !== '/')).toBe(true);
    expect(sidebar().getByRole('link', { name: 'Find services' })).toBeInTheDocument();
    expect(screen.getByText('overview content')).toBeInTheDocument();
  });

  it('shows a customer the hiring menu and no staff menus', () => {
    as('customer');
    renderLayout();
    expect(sidebar().getByText('Hiring')).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'New request' })).toBeInTheDocument();
    expect(sidebar().queryByText('Administration')).not.toBeInTheDocument();
    expect(sidebar().queryByText('Your services')).not.toBeInTheDocument();
  });

  it('shows a provider their services menu', () => {
    as('provider');
    renderLayout();
    expect(sidebar().getByRole('link', { name: 'My services' })).toBeInTheDocument();
    expect(sidebar().queryByText('Hiring')).not.toBeInTheDocument();
  });

  it('shows the payment follow-up role only the payments menu', () => {
    as('finance');
    renderLayout();
    expect(sidebar().getByRole('link', { name: 'Payment follow-up' })).toBeInTheDocument();
    expect(sidebar().queryByText('Administration')).not.toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows a super administrator the administration and super administrator menus', () => {
    as('super_admin');
    renderLayout();
    expect(sidebar().getByText('Administration')).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Activity report' })).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Add a user' })).toBeInTheDocument();
  });

  it('shows an administrator no super administrator menu', () => {
    as('admin');
    renderLayout();
    expect(sidebar().getByText('Administration')).toBeInTheDocument();
    expect(sidebar().queryByText('Super administrator')).not.toBeInTheDocument();
  });

  it('opens the menu on small screens and closes it with Escape', async () => {
    as('customer');
    renderLayout();
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(open).toHaveAttribute('aria-expanded', 'false');
  });
});
