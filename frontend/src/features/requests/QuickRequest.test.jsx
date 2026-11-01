import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuickRequest, { buildRequest } from './QuickRequest';
import { validateRequest } from './RequestForm';
import { isoDay } from '../../utils/format';

const categories = [{ id: 'c1', name: 'Plumbing', subcategories: [{ slug: 'leaks', name: 'Leak repair' }] }, { id: 'c2', name: 'IT support', subcategories: [] }];
const base = { categories, category: 'c1', subcategory: 'leaks', district: 'Gasabo', when: 'tomorrow', budget: '20-50', description: 'The kitchen tap leaks all day.' };

beforeEach(() => localStorage.clear());

describe('buildRequest', () => {
  it('turns taps into a request the API accepts', () => {
    const { form, body } = buildRequest(base);
    expect(validateRequest(form)).toEqual({});
    expect(body).toMatchObject({ title: 'Leak repair in Gasabo', category: 'c1', subcategory: 'leaks', preferredDate: isoDay(1), budgetMin: 20000, budgetMax: 50000, location: { district: 'Gasabo' } });
  });
  it('leaves budget and date out when the person is flexible or unsure', () => {
    const { body } = buildRequest({ ...base, when: 'flexible', budget: 'unsure' });
    expect(body).not.toHaveProperty('preferredDate');
    expect(body).not.toHaveProperty('budgetMin');
    expect(body).not.toHaveProperty('budgetMax');
  });
  it('is not valid until a category, district and sentence are given', () => {
    expect(Object.keys(validateRequest(buildRequest({ ...base, category: '', district: '', description: '' }).form)).sort()).toEqual(['category', 'description', 'location.district', 'title']);
  });
});

describe('QuickRequest', () => {
  it('sends a request after a few taps and one sentence', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue();
    render(<QuickRequest categories={categories} onSubmit={onSubmit} />);
    expect(screen.queryByText('Where and when?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Plumbing/ }));
    await user.click(screen.getByRole('button', { name: 'Leak repair' }));
    await user.click(screen.getByRole('button', { name: 'Kicukiro' }));
    await user.click(screen.getByRole('button', { name: 'Tomorrow' }));
    await user.click(screen.getByRole('button', { name: 'Please come and have a look at leak repair for me.' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Leak repair in Kicukiro', category: 'c1', location: { district: 'Kicukiro' }, preferredDate: isoDay(1) });
  });

  it('says what is still missing instead of sending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<QuickRequest categories={categories} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/what you need/);
  });

  it('starts on step two when a category is chosen from the dashboard', () => {
    render(<QuickRequest categories={categories} defaults={{ category: 'c2' }} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /IT support/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gasabo' })).toBeInTheDocument();
  });

  it('sends the request only to the chosen provider', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue();
    render(<QuickRequest categories={categories} provider={{ id: 'p1', displayName: 'Jean' }} defaults={{ category: 'c1' }} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Gasabo' }));
    await user.type(screen.getByLabelText('Describe the job'), 'Pipe under the sink drips.');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ provider: 'p1' });
  });
});
