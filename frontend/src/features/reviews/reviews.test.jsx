import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ReviewForm, { validateReview } from './ReviewForm';
import { ApiError } from '../../services/api';

describe('validateReview', () => {
  it('needs a rating from 1 to 5 and a comment of at least 10 characters', () => {
    expect(validateReview({ rating: 0, comment: 'Great work done here.' }).rating).toBeTruthy();
    expect(validateReview({ rating: 6, comment: 'Great work done here.' }).rating).toBeTruthy();
    expect(validateReview({ rating: 5, comment: 'Too short' }).comment).toBeTruthy();
    expect(validateReview({ rating: 5, comment: 'Great work done here.' })).toEqual({});
  });
});

describe('ReviewForm', () => {
  it('will not submit without a rating', async () => {
    const onSubmit = vi.fn();
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/your review/i), 'Great work done here.');
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(screen.getByText('Choose a rating from 1 to 5 stars')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the chosen stars and the trimmed comment', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText(/4 stars/i));
    await userEvent.type(screen.getByLabelText(/your review/i), '  Great work done here.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(onSubmit).toHaveBeenCalledWith({ rating: 4, comment: 'Great work done here.' });
  });

  it('shows the API message when posting fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError({ status: 409, code: 'REVIEW_EXISTS', message: 'You have already reviewed this job' }));
    render(<ReviewForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByLabelText(/5 stars/i));
    await userEvent.type(screen.getByLabelText(/your review/i), 'Great work done here.');
    await userEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already reviewed this job');
  });
});
