import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';
import { ToastProvider } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const user = { id: 'u1', fullName: 'Aline Uwase', email: 'aline@example.rw', phone: '+250788123456', roles: ['customer'], emailVerified: true, createdAt: '2026-09-01T00:00:00Z' };
let auth;

const renderPage = () => render(<MemoryRouter><ToastProvider><SettingsPage /></ToastProvider></MemoryRouter>);

beforeEach(() => {
  auth = { user, logout: vi.fn(), updateProfile: vi.fn().mockResolvedValue({ ...user, fullName: 'Aline U.' }), changePassword: vi.fn().mockResolvedValue({}) };
  useAuth.mockReturnValue(auth);
});

describe('SettingsPage profile', () => {
  it('saves a changed name', async () => {
    renderPage();
    const name = screen.getByLabelText(/full name/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Aline U.');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(auth.updateProfile).toHaveBeenCalledWith({ fullName: 'Aline U.', phone: '+250788123456' });
  });

  it('sends null when the phone number is cleared', async () => {
    renderPage();
    await userEvent.clear(screen.getByLabelText(/mobile number/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(auth.updateProfile).toHaveBeenCalledWith({ fullName: 'Aline Uwase', phone: null });
  });

  it('refuses a number that is not Rwandan', async () => {
    renderPage();
    const phone = screen.getByLabelText(/mobile number/i);
    await userEvent.clear(phone);
    await userEvent.type(phone, '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText(/valid Rwandan mobile number/i)).toBeInTheDocument();
    expect(auth.updateProfile).not.toHaveBeenCalled();
  });
});

describe('SettingsPage password', () => {
  const fill = async (current, next) => {
    await userEvent.type(screen.getByLabelText(/current password/i), current);
    await userEvent.type(screen.getByLabelText(/new password/i), next);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  };

  it('changes the password', async () => {
    renderPage();
    await fill('Old1Password', 'New1Password');
    expect(auth.changePassword).toHaveBeenCalledWith({ currentPassword: 'Old1Password', newPassword: 'New1Password' });
  });

  it('checks the new password before asking the server', async () => {
    renderPage();
    await fill('Old1Password', 'short');
    expect(screen.getByText(/use at least 8 characters/i)).toBeInTheDocument();
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('shows the wrong-password answer beside the field', async () => {
    auth.changePassword.mockRejectedValue(Object.assign(new Error('Your current password is not correct'), { code: 'WRONG_PASSWORD' }));
    renderPage();
    await fill('Wrong1Password', 'New1Password');
    expect(await screen.findByText(/not your current password/i)).toBeInTheDocument();
  });
});
