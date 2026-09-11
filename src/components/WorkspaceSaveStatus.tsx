import React from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';

/** Silent while saving works; when browser storage fails, one alert with the way to keep the work. */
export const WorkspaceSaveStatus: React.FC = () => {
  const { workspaceSaveError, historyStorageError, downloadWorkingCopy } = useWritingAssistant();
  const error = workspaceSaveError || historyStorageError;
  if (!error) return null;
  return (
    <aside aria-label="Working copy save status" className="workspace-save-status max-w-6xl w-full mx-auto px-6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs border border-amber-300 bg-amber-50 text-amber-900">
        <p role="alert">{error}</p>
        <button type="button" onClick={downloadWorkingCopy} className="shrink-0 underline font-medium text-neutral-800">
          Download working copy
        </button>
      </div>
    </aside>
  );
};
