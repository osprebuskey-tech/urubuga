import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserMenu from './UserMenu';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const logout = vi.fn().mockResolvedValue();
const renderMenu = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/" element={<p>home page</p>} />
        <Route path="/dashboard" element={<UserMenu />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { fullName: 'Aline Uwase', email: 'aline@example.rw', roles: ['customer', 'provider'] }, logout });
});

describe('UserMenu', () => {
  it('stays closed until opened, then shows who you are and where you can go', async () => {
    renderMenu();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    expect(screen.getByText('aline@example.rw')).toBeInTheDocument();
    expect(screen.getByText('Customer · Service provider')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Home page' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/dashboard/settings');
  });

  it('closes with Escape', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('logs out and returns to the home page', async () => {
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: /account menu/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('home page')).toBeInTheDocument();
  });

  it('renders nothing when nobody is signed in', () => {
    useAuth.mockReturnValue({ user: null });
    const { container } = renderMenu();
    expect(container).toBeEmptyDOMElement();
  });
});
