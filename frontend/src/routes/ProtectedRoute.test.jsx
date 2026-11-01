import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const renderGuard = () =>
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/secret" element={<ProtectedRoute roles={['admin']}><p>secret area</p></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits while the session is being restored', () => {
    useAuth.mockReturnValue({ user: null, status: 'loading' });
    renderGuard();
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
  });

  it('sends anonymous visitors to the login page', () => {
    useAuth.mockReturnValue({ user: null, status: 'anonymous' });
    renderGuard();
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('blocks signed-in users who lack the role', () => {
    useAuth.mockReturnValue({ user: { roles: ['customer'] }, status: 'authenticated' });
    renderGuard();
    expect(screen.getByRole('alert')).toHaveTextContent(/have access to this page/i);
    expect(screen.queryByText('secret area')).not.toBeInTheDocument();
  });

  it('lets users with the role through', () => {
    useAuth.mockReturnValue({ user: { roles: ['admin'] }, status: 'authenticated' });
    renderGuard();
    expect(screen.getByText('secret area')).toBeInTheDocument();
  });
});
