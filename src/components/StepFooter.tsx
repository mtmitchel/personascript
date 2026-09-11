import React from 'react';

interface StepFooterProps {
  /** Spec label including its trailing arrow, e.g. `Next: Voice Blueprint →`. */
  label: string;
  id: string;
  onClick: () => void;
}

export const StepFooter: React.FC<StepFooterProps> = ({ label, id, onClick }) => (
  <div className="flex justify-end pt-6 border-t border-neutral-200">
    <button
      id={id}
      type="button"
      onClick={onClick}
      className="px-3.5 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition shadow-2xs cursor-pointer"
    >
      {label}
    </button>
  </div>
);
