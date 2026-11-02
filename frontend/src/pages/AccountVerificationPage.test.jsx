import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountVerificationPage from './AccountVerificationPage';
import { verificationApi } from '../services/verificationApi';

vi.mock('../services/verificationApi', () => ({ verificationApi: { mineAccount: vi.fn(), applyAccount: vi.fn(), respondAccount: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const docs = (complete) => ({ complete, required: [{ kind: 'national_id', label: 'National ID', uploaded: complete }] });
const state = (over = {}) => ({ data: { accountVerified: false, application: null, documents: docs(true), ...over }, meta: null });
const renderPage = () => render(<MemoryRouter><AccountVerificationPage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('AccountVerificationPage', () => {
  it('lets a customer with their documents on file ask to be verified', async () => {
    verificationApi.mineAccount.mockResolvedValue(state());
    verificationApi.applyAccount.mockResolvedValue({ data: {} });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /request verification/i }));
    expect(verificationApi.applyAccount).toHaveBeenCalledTimes(1);
  });

  it('blocks the request and points to the documents page when one is missing', async () => {
    verificationApi.mineAccount.mockResolvedValue(state({ documents: docs(false) }));
    renderPage();
    expect(await screen.findByRole('button', { name: /request verification/i })).toBeDisabled();
    expect(screen.getByRole('link', { name: /go to my documents/i })).toHaveAttribute('href', '/dashboard/documents');
  });

  it('shows the reviewer’s question and sends the answer', async () => {
    verificationApi.mineAccount.mockResolvedValue(state({ application: { id: 'a1', status: 'more_info_required', active: true, question: 'Your ID photo is blurry.', createdAt: '2026-11-01T10:00:00Z', history: [] } }));
    verificationApi.respondAccount.mockResolvedValue({ data: {} });
    renderPage();
    expect(await screen.findByText('Your ID photo is blurry.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your answer'), 'I uploaded a clearer one.');
    await userEvent.click(screen.getByRole('button', { name: /send answer/i }));
    expect(verificationApi.respondAccount).toHaveBeenCalledWith('I uploaded a clearer one.');
  });

  it('shows the written reason when the request was rejected, and allows asking again', async () => {
    verificationApi.mineAccount.mockResolvedValue(state({ application: { id: 'a1', status: 'rejected', active: false, decision: { outcome: 'rejected', reason: 'The name on the ID does not match.' }, createdAt: '2026-11-01T10:00:00Z', history: [] } }));
    renderPage();
    expect(await screen.findByText(/name on the id does not match/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request verification/i })).toBeEnabled();
  });

  it('says so when the account is already verified', async () => {
    verificationApi.mineAccount.mockResolvedValue(state({ accountVerified: true }));
    renderPage();
    expect(await screen.findByText(/your account is verified/i)).toBeInTheDocument();
  });
});
