import { useEffect, useRef } from 'react';
import Button from './Button';

/** Native <dialog>: focus is trapped, Escape closes it, and the page behind is inert. */
export default function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-lg rounded-xl p-0 shadow-2xl backdrop:bg-ink-950/60"
    >
      {open && (
        <div className="p-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <div className="mt-4">{children}</div>
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'secondary' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-ink-800">{children}</div>
    </Dialog>
  );
}
