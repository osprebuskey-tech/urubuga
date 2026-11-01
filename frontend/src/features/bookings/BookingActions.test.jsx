import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookingActions, { validateNote } from './BookingActions';
import { bookingApi } from '../../services/bookingApi';

vi.mock('../../services/bookingApi', () => ({ bookingApi: { setStatus: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const booking = (overrides) => ({ id: 'b1', myRole: 'provider', status: 'accepted', allowedActions: ['in_progress', 'cancelled'], ...overrides });

describe('validateNote', () => {
  it('requires a reason to cancel or report a problem', () => {
    expect(validateNote('cancelled', 'customer', 'short')).toBeTruthy();
    expect(validateNote('disputed', 'provider', '')).toBeTruthy();
    expect(validateNote('cancelled', 'customer', 'The plans changed for us.')).toBe('');
  });
  it('does not need a note to start or complete work, but admins always do', () => {
    expect(validateNote('in_progress', 'provider', '')).toBe('');
    expect(validateNote('completed', 'provider', '')).toBe('');
    expect(validateNote('completed', 'admin', '')).toBeTruthy();
  });
});

describe('BookingActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows only the moves the server allows', () => {
    render(<BookingActions booking={booking()} onChanged={() => {}} />);
    expect(screen.getByRole('button', { name: 'Start work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel job' })).toBeInTheDocument();
    expect(screen.queryByText('Mark as complete')).not.toBeInTheDocument();
  });

  it('renders nothing when there is nothing to do', () => {
    const { container } = render(<BookingActions booking={booking({ allowedActions: [] })} onChanged={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms a move, sends it to the API and refreshes', async () => {
    bookingApi.setStatus.mockResolvedValue({ data: {} });
    const onChanged = vi.fn();
    render(<BookingActions booking={booking()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start work' }));
    fireEvent.click(screen.getByText('Yes, start work'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(bookingApi.setStatus).toHaveBeenCalledWith('b1', 'in_progress', '');
  });

  it('will not send a cancellation without a reason', async () => {
    render(<BookingActions booking={booking()} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));
    fireEvent.click(screen.getByText('Yes, cancel job'));
    expect(await screen.findByText('Give a reason of at least 10 characters')).toBeInTheDocument();
    expect(bookingApi.setStatus).not.toHaveBeenCalled();
  });
});
