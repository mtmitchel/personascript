import React, { useEffect } from 'react';
import { Trash2, X, FileText } from 'lucide-react';
import { WritingSample } from '../types';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  sample: WritingSample | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  sample,
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !sample) return null;

  return (
    <div
      id="modal-delete-confirm-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="modal-delete-confirm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3
              id="delete-modal-title"
              className="text-sm font-semibold text-neutral-900"
            >
              Delete sample
            </h3>
          </div>
          <button
            id="btn-close-delete-modal"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sample card preview */}
        <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100 space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-xs font-medium text-neutral-900 truncate">
              {sample.title}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span className="font-mono">{sample.fileType}</span>
            <span>•</span>
            <span>{sample.wordCount} words</span>
          </div>
        </div>

        <p className="text-xs text-neutral-600 leading-relaxed">
          Are you sure you want to remove <strong className="text-neutral-900 font-medium">"{sample.title}"</strong> from your writing samples?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-100">
          <button
            id="btn-cancel-delete"
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-delete"
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};
