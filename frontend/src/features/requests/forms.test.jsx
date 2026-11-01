import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import QuotationForm, { validateQuotation } from './QuotationForm';
import { validateRequest } from './RequestForm';
import { ApiError } from '../../services/api';
import { isoDay } from '../../utils/format';

describe('validateRequest', () => {
  const ok = { title: 'Fix my network', description: 'Wi-Fi drops every hour.', category: 'c1', district: 'Gasabo', budgetMin: '', budgetMax: '', preferredDate: '' };
  it('accepts a complete request', () => expect(validateRequest(ok)).toEqual({}));
  it('requires title, details, category and district', () => {
    expect(Object.keys(validateRequest({ ...ok, title: 'x', description: 'short', category: '', district: '' })).sort()).toEqual(['category', 'description', 'location.district', 'title']);
  });
  it('checks budgets are whole numbers in order, and dates are not in the past', () => {
    expect(validateRequest({ ...ok, budgetMax: '12.5' }).budgetMax).toBeTruthy();
    expect(validateRequest({ ...ok, budgetMin: '9000', budgetMax: '1000' }).budgetMin).toBeTruthy();
    expect(validateRequest({ ...ok, preferredDate: isoDay(-1) }).preferredDate).toBeTruthy();
    expect(validateRequest({ ...ok, preferredDate: isoDay(3) }).preferredDate).toBeUndefined();
  });
});

describe('validateQuotation', () => {
  const ok = { price: '35000', description: 'I will fix it and document it.', estimatedDuration: '2 days', expiresAt: isoDay(7) };
  it('accepts a complete quotation', () => expect(validateQuotation(ok)).toEqual({}));
  it('rejects non-integer or zero prices', () => {
    for (const price of ['', '0', '12.5', 'abc', '-5']) expect(validateQuotation({ ...ok, price }).price).toBeTruthy();
  });
  it('limits the validity date to today..90 days', () => {
    expect(validateQuotation({ ...ok, expiresAt: isoDay(-1) }).expiresAt).toBeTruthy();
    expect(validateQuotation({ ...ok, expiresAt: isoDay(120) }).expiresAt).toBeTruthy();
    expect(validateQuotation({ ...ok, expiresAt: '' }).expiresAt).toBeTruthy();
  });
});

describe('QuotationForm', () => {
  it('shows errors and does not submit an incomplete form', async () => {
    const onSubmit = vi.fn();
    render(<QuotationForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    expect(screen.getByText(/whole number of rwf/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits integer RWF and a date string', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<QuotationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your price/i), '35000');
    await userEvent.type(screen.getByLabelText(/how long/i), '2 days');
    await userEvent.type(screen.getByLabelText(/what you will do/i), 'I will fix it and document it.');
    await userEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ price: 35000, estimatedDuration: '2 days', deliverables: [] });
    expect(onSubmit.mock.calls[0][0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('terms'); // empty optional field is omitted on create
  });

  it('shows the API’s message when sending fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError({ status: 409, code: 'QUOTATION_EXISTS', message: 'You have already sent a quotation for this request.' }));
    render(<QuotationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your price/i), '35000');
    await userEvent.type(screen.getByLabelText(/how long/i), '2 days');
    await userEvent.type(screen.getByLabelText(/what you will do/i), 'I will fix it and document it.');
    await userEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already sent a quotation');
  });
});
