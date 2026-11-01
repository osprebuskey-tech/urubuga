export const ROLES = Object.freeze({ CUSTOMER: 'customer', PROVIDER: 'provider', BUSINESS: 'business', ADMIN: 'admin', SUPER_ADMIN: 'super_admin', FINANCE: 'finance' });

export const ROLE_LABELS = {
  customer: 'Customer',
  provider: 'Service provider',
  business: 'Business',
  admin: 'Administrator',
  super_admin: 'Super administrator',
  finance: 'Payment follow-up',
};

export const STAFF_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.FINANCE];

// The 30 districts of Rwanda (must match the API's list).
export const DISTRICTS = [
  'Bugesera', 'Burera', 'Gakenke', 'Gasabo', 'Gatsibo', 'Gicumbi', 'Gisagara', 'Huye', 'Kamonyi', 'Karongi',
  'Kayonza', 'Kicukiro', 'Kirehe', 'Muhanga', 'Musanze', 'Ngoma', 'Ngororero', 'Nyabihu', 'Nyagatare',
  'Nyamagabe', 'Nyamasheke', 'Nyanza', 'Nyarugenge', 'Nyaruguru', 'Rubavu', 'Ruhango', 'Rulindo',
  'Rusizi', 'Rutsiro', 'Rwamagana',
];

export const PRICING_TYPES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'hourly', label: 'Per hour' },
  { value: 'quotation', label: 'By quotation' },
];

export const DAYS = [
  { value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' }, { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' }, { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' }, { value: 'sun', label: 'Sun' },
];

export const LISTING_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Live', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
};



export const SERVICE_SORTS = [
  { value: 'top', label: 'Top ranked' },
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

export const PROVIDER_SORTS = [
  { value: 'top', label: 'Top ranked' },
  { value: 'relevance', label: 'Best match' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'newest', label: 'Newest' },
];

export const MIN_RATINGS = [
  { value: '', label: 'Any rating' },
  { value: '3', label: '3 stars and up' },
  { value: '4', label: '4 stars and up' },
  { value: '4.5', label: '4.5 stars and up' },
];

// Rwandan mobile numbers (072/073/078/079); same rule as the API.
export const RW_PHONE_RE = /^(\+250|250|0)?7[2389]\d{7}$/;

export const REQUEST_STATUS = {
  open: { label: 'Open', tone: 'success' },
  accepted: { label: 'Quotation accepted', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const QUOTATION_STATUS = {
  pending: { label: 'Awaiting decision', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

export const BOOKING_STATUS = {
  accepted: { label: 'Booked', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  disputed: { label: 'Problem reported', tone: 'danger' },
};

// What each move is called on a button, and whether it needs a written reason.
export const BOOKING_ACTIONS = {
  in_progress: { label: 'Start work', variant: 'primary', needsNote: false },
  completed: { label: 'Mark as complete', variant: 'primary', needsNote: false },
  cancelled: { label: 'Cancel job', variant: 'danger', needsNote: true },
  disputed: { label: 'Report a problem', variant: 'danger', needsNote: true },
};

export const REPORT_REASONS = [
  { value: 'fake', label: 'This isn’t a real customer or job' },
  { value: 'abusive', label: 'Abusive or offensive language' },
  { value: 'unrelated', label: 'Not about the work done' },
  { value: 'other', label: 'Something else' },
];

export const PAYMENT_STATUS = {
  pending: { label: 'Waiting for payment', tone: 'warning' },
  succeeded: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const DISPUTE_STATUS = {
  open: { label: 'Open', tone: 'danger' },
  under_review: { label: 'Under review', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
};

// What a recorded action is called in the activity feed.
export const ACTIVITY_LABELS = {
  'provider.verification_changed': 'Provider verification changed',
  'review.hidden': 'Review hidden',
  'review.restored': 'Review restored',
  'quotation.accepted': 'Quotation accepted',
  'booking.cancelled': 'Job cancelled',
  'booking.completed': 'Job completed (administrator)',
  'booking.disputed': 'Problem reported on a job',
  'payment.succeeded': 'Payment received',
  'payment.manual_recorded': 'Manual payment recorded',
  'payment.refunded': 'Refund recorded',
  'payment.payout_recorded': 'Payout recorded',
  'payment.amount_mismatch': 'Payment amount mismatch',
  'payment.needs_attention': 'Payment needs attention',
  'settings.commission_changed': 'Commission rate changed',
  'dispute.review_started': 'Dispute taken for review',
  'user.suspended': 'Account suspended',
  'user.reinstated': 'Account reinstated',
  'user.created_by_admin': 'User account created',
  'user.invite_resent': 'Invitation sent again',
  'payment.follow_up_logged': 'Payment follow-up logged',
  'provider.verification_resubmitted': 'Provider answered and resubmitted',
  'provider.verification_requested': 'Provider asked to be verified',
  'settings.updated': 'Settings changed',
};

// The waiting-work lines of the activity report: what they are called and where to deal with them.
export const PENDING_ITEMS = {
  providers_awaiting_verification: { label: 'Providers waiting for verification', to: '/dashboard/admin/providers' },
  providers_asked_for_info: { label: 'Providers asked for more information (waiting for their reply)', to: '/dashboard/admin/providers' },
  disputes_open: { label: 'Disputes nobody has picked up yet', to: '/dashboard/admin/disputes' },
  disputes_under_review: { label: 'Disputes under review', to: '/dashboard/admin/disputes' },
  reviews_reported: { label: 'Reviews reported by providers', to: '/dashboard/admin/reviews' },
  payments_awaiting_confirmation: { label: 'Payments waiting to be confirmed', to: '/dashboard/admin/payments/follow-up' },
  jobs_unpaid: { label: 'Jobs under way or finished with no payment started', to: '/dashboard/admin/payments/follow-up' },
  payouts_due: { label: 'Payouts due to providers', to: '/dashboard/admin/payments/follow-up' },
  requests_without_quotations: { label: 'Requests with no quotation after 3 days' },
  quotations_awaiting_customer: { label: 'Quotations waiting for a customer’s answer' },
  jobs_not_started: { label: 'Accepted jobs not started after 3 days' },
  jobs_in_progress: { label: 'Jobs in progress' },
  jobs_past_preferred_date: { label: 'Jobs in progress past the customer’s preferred date' },
};

// Payment follow-up: the three kinds of money that need chasing, and what a contact can end with.
export const FOLLOW_UP_BUCKETS = {
  awaiting_confirmation: { label: 'Awaiting confirmation', hint: 'A customer started a manual payment and nobody has confirmed it yet.', kind: 'payment' },
  unpaid_jobs: { label: 'Unpaid jobs', hint: 'Work is under way or finished, and no payment was started.', kind: 'payment' },
  payouts_due: { label: 'Payouts due', hint: 'The customer paid and the job is complete, but the provider has not been paid.', kind: 'payout' },
};

export const FOLLOW_UP_OUTCOMES = {
  contacted: 'Contacted',
  promised: 'Promised to pay',
  no_answer: 'No answer',
  resolved: 'Sorted out',
  other: 'Other',
};

// Verification: the review status and the payment status are separate. Paying never decides the review.
export const VERIFICATION_STATUS = {
  pending_payment: { label: 'Pending Payment', tone: 'warning' },
  payment_confirmed: { label: 'Payment Confirmed', tone: 'info' },
  under_review: { label: 'Under Review', tone: 'info' },
  more_info_required: { label: 'More Information Required', tone: 'warning' },
  recommended: { label: 'Recommended for Verification', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};
export const VERIFICATION_PAYMENT_STATUS = {
  unpaid: { label: 'Not paid', tone: 'warning' },
  pending: { label: 'Waiting for confirmation', tone: 'warning' },
  confirmed: { label: 'Payment confirmed', tone: 'success' },
  failed: { label: 'Payment failed', tone: 'danger' },
  waived: { label: 'No fee', tone: 'neutral' },
};
export const PAYMENT_METHOD_LABELS = { mobile_money: 'Mobile Money', card: 'Bank card', bank_transfer: 'Bank transfer' };
