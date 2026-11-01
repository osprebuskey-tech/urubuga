import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuestOnly from './GuestOnly';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<GuestOnly />}><Route index element={<p>welcome page</p>} /></Route>
        <Route path="/dashboard" element={<p>dashboard page</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe('GuestOnly (the welcome page)', () => {
  it('shows the welcome page to a visitor', () => {
    useAuth.mockReturnValue({ user: null, status: 'anonymous' });
    renderAt('/');
    expect(screen.getByText('welcome page')).toBeInTheDocument();
  });

  it('sends a signed-in person to their dashboard instead', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, status: 'authenticated' });
    renderAt('/');
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('welcome page')).not.toBeInTheDocument();
  });

  it('waits while the session is being restored, without flashing the welcome page', () => {
    useAuth.mockReturnValue({ user: null, status: 'loading' });
    renderAt('/');
    expect(screen.queryByText('welcome page')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
  });
});
