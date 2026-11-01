import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnnouncementBar from './AnnouncementBar';
import { announcementApi } from '../services/announcementApi';

vi.mock('../services/announcementApi', () => ({ announcementApi: { list: vi.fn() } }));

const item = (over = {}) => ({ id: 'a1', message: 'Verification is open for providers', status: 'active', ...over });

beforeEach(() => vi.clearAllMocks());

describe('AnnouncementBar', () => {
  it('renders nothing when there are no announcements', async () => {
    announcementApi.list.mockResolvedValue({ data: [], meta: null });
    const { container } = render(<AnnouncementBar />);
    await vi.waitFor(() => expect(announcementApi.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing, and does not break the page, when the announcements cannot be loaded', async () => {
    announcementApi.list.mockRejectedValue(new Error('offline'));
    const { container } = render(<AnnouncementBar />);
    await vi.waitFor(() => expect(announcementApi.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the message once to assistive technology (the looping copy is hidden) and links when there is a link', async () => {
    announcementApi.list.mockResolvedValue({ data: [item(), item({ id: 'a2', message: 'Read the new terms', linkUrl: 'https://example.rw/terms' })], meta: null });
    render(<AnnouncementBar />);
    expect(await screen.findByRole('region', { name: 'Announcements' })).toBeInTheDocument();
    expect(screen.getAllByText('Verification is open for providers')).toHaveLength(2); // visible text and its hidden loop copy
    expect(screen.getAllByRole('link')).toHaveLength(1); // the hidden copy's link is not exposed
    expect(screen.getByRole('link', { name: /read the new terms/i })).toHaveAttribute('href', 'https://example.rw/terms');
  });

  it('can be paused', async () => {
    announcementApi.list.mockResolvedValue({ data: [item()], meta: null });
    render(<AnnouncementBar />);
    const pause = await screen.findByRole('button', { name: /pause announcements/i });
    await userEvent.click(pause);
    expect(screen.getByRole('button', { name: /play announcements/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
