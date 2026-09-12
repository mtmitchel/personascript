import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/** App-owned confirmation. Buttons name consequences; Escape and backdrop cancel; focus returns to the opener. */
export const ConfirmDialog: React.FC<Props> = ({ open, title, confirmLabel, cancelLabel, destructive, onConfirm, onCancel, children }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = React.useId();
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open, onCancel]);
  if (!open) return null;
  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4">
        <h3 id={titleId} className="text-sm font-semibold text-neutral-900">{title}</h3>
        {children && <div className="text-sm text-neutral-700 leading-relaxed">{children}</div>}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
          <button ref={cancelRef} type="button" onClick={onCancel} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={`px-3 py-2 rounded-lg text-sm font-medium text-white ${destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-neutral-900 hover:bg-neutral-800'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};
