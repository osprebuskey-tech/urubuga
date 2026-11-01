import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentsPage from './DocumentsPage';
import { ToastProvider } from '../context/ToastContext';
import { documentApi } from '../services/verificationApi';

vi.mock('../services/verificationApi', () => ({ documentApi: { list: vi.fn(), upload: vi.fn(), blob: vi.fn() } }));

const status = (uploaded) => ({
  data: {
    documents: uploaded ? [{ id: 'd1', kind: 'national_id', label: 'National ID', originalName: 'id.pdf', mime: 'application/pdf', uploadedAt: '2026-10-20T10:00:00Z' }] : [],
    requirements: { hire: { required: [{ kind: 'national_id', label: 'National ID', uploaded }], missing: uploaded ? [] : ['national_id'], complete: uploaded } },
    allowedKinds: [{ kind: 'national_id', label: 'National ID' }],
  },
});
const renderPage = () => render(<MemoryRouter><ToastProvider><DocumentsPage /></ToastProvider></MemoryRouter>);
const file = (name, type, size = 100) => { const f = new File(['x'], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };

beforeEach(() => { vi.clearAllMocks(); documentApi.list.mockResolvedValue(status(false)); documentApi.upload.mockResolvedValue({ data: {} }); });

describe('DocumentsPage', () => {
  it('says what is needed and what happens without it', async () => {
    renderPage();
    expect(await screen.findByText(/can’t request a service until/)).toBeInTheDocument();
    expect(screen.getByText('Needed')).toBeInTheDocument();
  });

  it('uploads a PDF, JPG or PNG', async () => {
    renderPage();
    await userEvent.upload(await screen.findByLabelText('Choose your National ID', { selector: 'input' }), file('id.pdf', 'application/pdf'), { applyAccept: false });
    expect(documentApi.upload).toHaveBeenCalledWith('national_id', expect.any(File));
  });

  it('refuses other file types and files over the size limit before sending them', async () => {
    renderPage();
    const input = await screen.findByLabelText('Choose your National ID', { selector: 'input' });
    await userEvent.upload(input, file('id.docx', 'application/msword'), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/PDF, JPG or PNG/);
    await userEvent.upload(input, file('big.pdf', 'application/pdf', 9 * 1024 * 1024), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(/too big/);
    expect(documentApi.upload).not.toHaveBeenCalled();
  });

  it('shows an uploaded document with replace and preview, and confirms everything is ready', async () => {
    documentApi.list.mockResolvedValue(status(true));
    renderPage();
    expect(await screen.findByText(/All the documents your account needs are uploaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });
});
