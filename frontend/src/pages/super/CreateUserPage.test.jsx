import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateUserPage from './CreateUserPage';
import { adminApi } from '../../services/adminApi';

vi.mock('../../services/adminApi', () => ({ adminApi: { createUser: vi.fn() } }));

const renderPage = () => render(<MemoryRouter><CreateUserPage /></MemoryRouter>);
const fill = async ({ name = 'Claudine Mukamana', email = 'claudine@example.rw', role = /payment follow-up/i } = {}) => {
  await userEvent.type(screen.getByLabelText(/full name/i), name);
  await userEvent.type(screen.getByLabelText(/email address/i), email);
  if (role) await userEvent.click(screen.getByRole('radio', { name: role }));
  await userEvent.click(screen.getByRole('button', { name: /create account/i }));
};

beforeEach(() => vi.clearAllMocks());

describe('CreateUserPage', () => {
  it('creates a staff account and says the person will choose their own password', async () => {
    adminApi.createUser.mockResolvedValue({ data: { user: { id: 'u1', fullName: 'Claudine Mukamana', email: 'claudine@example.rw' }, inviteSent: true } });
    renderPage();
    await fill();
    expect(adminApi.createUser).toHaveBeenCalledWith({ fullName: 'Claudine Mukamana', email: 'claudine@example.rw', roles: ['finance'] });
    expect(await screen.findByText(/invitation was sent to claudine@example\.rw/i)).toBeInTheDocument();
    expect(screen.getByText(/never see or set their password/i)).toBeInTheDocument();
  });

  it('offers every role, staff ones first', () => {
    renderPage();
    for (const name of [/^administrator/i, /payment follow-up/i, /super administrator/i, /service provider/i, /^customer/i, /business customer/i]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });

  it('warns when the account exists but the email could not be sent', async () => {
    adminApi.createUser.mockResolvedValue({ data: { user: { id: 'u1', fullName: 'A B', email: 'a@example.rw' }, inviteSent: false } });
    renderPage();
    await fill({ role: /^administrator/i });
    expect(await screen.findByText(/could not be sent/i)).toBeInTheDocument();
  });

  it('needs a role before it will ask the server', async () => {
    renderPage();
    await fill({ role: null });
    expect(screen.getByText(/choose what this person will do/i)).toBeInTheDocument();
    expect(adminApi.createUser).not.toHaveBeenCalled();
  });

  it('says so when the email is already used', async () => {
    adminApi.createUser.mockRejectedValue(Object.assign(new Error('An account with this email already exists'), { code: 'EMAIL_TAKEN' }));
    renderPage();
    await fill();
    expect(await screen.findByText(/someone already has an account with this email/i)).toBeInTheDocument();
  });
});
