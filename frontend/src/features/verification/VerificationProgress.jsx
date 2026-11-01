import { VERIFICATION_STATUS } from '../../utils/constants';

const STEPS = [
  ['pending_payment', 'Pay the fee'],
  ['payment_confirmed', 'Payment confirmed'],
  ['under_review', 'Documents reviewed'],
  ['recommended', 'Recommended'],
  ['approved', 'Approved'],
];

/** Where an application stands. The side outcomes (more information, rejected) are shown beside the path, not as steps. */
export default function VerificationProgress({ status }) {
  const side = status === 'more_info_required' || status === 'rejected';
  const index = status === 'more_info_required' ? 2 : status === 'rejected' ? -1 : STEPS.findIndex(([s]) => s === status);
  return (
    <div>
      <ol className="flex flex-wrap gap-2" aria-label="Verification progress">
        {STEPS.map(([key, label], i) => {
          const done = i < index || (status === 'approved' && i <= index);
          const current = i === index && !side || (status === 'more_info_required' && i === 2);
          return (
            <li key={key} aria-current={current ? 'step' : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${done ? 'bg-teal-600 text-white' : current ? 'bg-sun-400 text-ink-950' : 'bg-ink-50 text-ink-600'}`}>
              <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs">{done ? '✓' : i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>
      {side && <p className={`mt-3 text-sm font-semibold ${status === 'rejected' ? 'text-rose-700' : 'text-ink-900'}`}>Current status: {VERIFICATION_STATUS[status].label}</p>}
    </div>
  );
}
