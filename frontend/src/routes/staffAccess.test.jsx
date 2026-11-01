import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const guard = (roles) =>
  render(
    <MemoryRouter initialEntries={['/page']}>
      <Routes><Route path="/page" element={<ProtectedRoute roles={roles}><p>the page</p></ProtectedRoute>} /></Routes>
    </MemoryRouter>,
  );
const as = (...roles) => useAuth.mockReturnValue({ user: { id: 'u', roles }, status: 'ready' });

describe('who sees which staff screens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets a super administrator into administrator screens', () => {
    as('super_admin');
    guard(['admin']);
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('keeps administrators out of super administrator screens', () => {
    as('admin');
    guard(['super_admin']);
    expect(screen.getByRole('alert')).toHaveTextContent(/don’t have access/i);
  });

  it('lets the payment follow-up role into money screens but not administrator screens', () => {
    as('finance');
    guard(['admin', 'finance']);
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('shows the payment follow-up role no moderation screens', () => {
    as('finance');
    guard(['admin']);
    expect(screen.queryByText('the page')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
