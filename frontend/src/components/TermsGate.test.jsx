import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TermsGate from './TermsGate';
import { useAuth } from '../context/AuthContext';
import { termsApi } from '../services/verificationApi';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/verificationApi', () => ({ termsApi: { status: vi.fn(), accept: vi.fn() } }));

const status = (over = {}) => ({ data: { accepted: false, terms: { version: 3, title: 'Imbehe Terms', body: 'Contact details are private.', publishedAt: '2026-10-01T00:00:00Z' }, ...over } });

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { id: 'u1', roles: ['customer'] } });
  termsApi.status.mockResolvedValue(status());
  termsApi.accept.mockResolvedValue({ data: {} });
});

describe('TermsGate', () => {
  it('blocks the dashboard until the current terms are accepted, and the button needs the checkbox', async () => {
    render(<TermsGate />);
    expect(await screen.findByRole('dialog', { name: 'Imbehe Terms' })).toBeInTheDocument();
    expect(screen.getByText('Contact details are private.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Accept and continue' });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(button);
    expect(termsApi.accept).toHaveBeenCalledWith(3);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so when the terms changed since the last acceptance', async () => {
    termsApi.status.mockResolvedValue(status({ previouslyAcceptedVersion: 2 }));
    render(<TermsGate />);
    expect(await screen.findByText(/terms changed since you last accepted/i)).toBeInTheDocument();
  });

  it('shows nothing to someone who already accepted', async () => {
    termsApi.status.mockResolvedValue(status({ accepted: true }));
    render(<TermsGate />);
    await vi.waitFor(() => expect(termsApi.status).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never asks staff, who neither request nor offer services', async () => {
    useAuth.mockReturnValue({ user: { id: 'a1', roles: ['admin'] } });
    render(<TermsGate />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(termsApi.status).not.toHaveBeenCalled();
  });
});
