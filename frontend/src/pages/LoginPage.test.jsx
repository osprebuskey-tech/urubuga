import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const login = vi.fn();
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<p>home page</p>} />
        <Route path="/dashboard" element={<p>dashboard page</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ login, notice: null, clearNotice: vi.fn(), user: null });
  });

  it('asks for both fields before calling the API', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('logs in and lands on the dashboard, staying signed in by default', async () => {
    login.mockResolvedValue({ id: 'u1' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email address/i), 'customer@imbehe.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'ChangeMe123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledWith({ email: 'customer@imbehe.test', password: 'ChangeMe123!', remember: true });
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('can be told not to keep the session', async () => {
    login.mockResolvedValue({ id: 'u1' });
    renderPage();
    await userEvent.type(screen.getByLabelText(/email address/i), 'customer@imbehe.test');
    await userEvent.type(screen.getByLabelText(/^password/i), 'ChangeMe123!');
    await userEvent.click(screen.getByLabelText(/keep me signed in/i));
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).toHaveBeenCalledWith({ email: 'customer@imbehe.test', password: 'ChangeMe123!', remember: false });
  });

  it('shows the API error when the credentials are wrong', async () => {
    login.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }));
    renderPage();
    await userEvent.type(screen.getByLabelText(/email address/i), 'x@y.rw');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
