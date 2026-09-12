import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { revisionLabel, revisionExcerpt, versionDate, REWRITE_HISTORY_LIMIT } from '../utils/rewriteHistory';
import { SavedEditorialDecisions } from './EditorialDecisions';
import { RewriteResult } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Saved versions, newest first. Each row names the version and offers Open and
 * Delete; reading a version means opening it, so nothing is previewed here.
 */
export const RewriteHistory: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { rewriteHistory, rewriteResult, restoreRewriteVersion, deleteRewriteVersion, isRewriting, isPlanning, isLearningFeedback } = useWritingAssistant();
  const [message, setMessage] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RewriteResult | null>(null);
  const busy = isRewriting || isPlanning || isLearningFeedback;
  const remove = (entry: RewriteResult) => {
    setDeleteTarget(entry);
  };
  return (
    <div id="rewrite-history" className="studio-history">
      <p className="studio-panel-description">The last {REWRITE_HISTORY_LIMIT} versions are kept in this browser.</p>
      {rewriteHistory.length === 0 ? (
        <p className="studio-panel-description">Completed rewrites and edits will appear here.</p>
      ) : (
        <ul className="studio-history-list" aria-label="Saved versions">
          {rewriteHistory.map((entry) => {
            const current = entry.id === rewriteResult?.id;
            return <li key={entry.id} className={`studio-history-row${current ? ' is-current' : ''}`}>
              <div className="studio-history-text">
                <p className="studio-history-name">{revisionLabel(entry)}{current ? <span className="studio-note-state"> · Open</span> : null}</p>
                {revisionExcerpt(entry) && <p className="studio-history-meta">“{revisionExcerpt(entry)}”</p>}
                <p className="studio-history-meta"><time dateTime={entry.createdAt}>{versionDate(entry.createdAt)}</time> · {entry.profileName || 'Voice not recorded'} · {entry.writingModelUsed || entry.modelUsed || 'Writer not recorded'}</p>
              </div>
              <div className="studio-history-actions">
                {!current && <button type="button" className="studio-text-button" disabled={busy} onClick={() => { restoreRewriteVersion(entry.id); onOpen(); }}>Open</button>}
                <button type="button" className="studio-text-button" disabled={busy} onClick={() => remove(entry)}>Delete</button>
              </div>
            </li>;
          })}
        </ul>
      )}
      <p role="status" className="studio-panel-description">{message}</p>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.id === rewriteResult?.id ? 'Delete the open version?' : 'Delete this version?'}
        confirmLabel="Delete version"
        cancelLabel="Keep version"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          const current = deleteTarget.id === rewriteResult?.id;
          deleteRewriteVersion(deleteTarget.id);
          setMessage(current ? 'Version deleted. The original draft is open.' : 'Version deleted.');
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>
          {deleteTarget?.id === rewriteResult?.id
            ? 'The Studio returns to the original draft. This cannot be undone.'
            : 'This cannot be undone.'}
        </p>
      </ConfirmDialog>
    </div>
  );
};

export const RewriteVersionDetails: React.FC<{ version: RewriteResult }> = ({ version }) => (
  <div className="space-y-4 text-sm leading-7 text-neutral-700">
    {version.revision?.instruction && <details><summary className="cursor-pointer font-medium">Last edit</summary><p className="mt-2 whitespace-pre-wrap">{version.revision.instruction}</p></details>}
    <details><summary className="cursor-pointer font-medium">Summary of changes</summary><p className="mt-2 whitespace-pre-wrap">{version.changesExplanation}</p></details>
    {version.editorialPlan && <SavedEditorialDecisions state={version.editorialPlan}/>}
            <details className="text-neutral-700">
              <summary className="cursor-pointer font-medium">Source and settings used</summary>
              <div className="mt-2 space-y-3">
                <div><h3 className="font-medium">Original draft</h3><p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">{version.originalText}</p></div>
                <div><h3 className="font-medium">Project brief</h3><p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">{version.projectBrief || 'No brief saved with this version.'}</p></div>
                <div><h3 className="font-medium">Reader and purpose</h3><p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap">{version.readerPurpose || 'No reader and purpose saved with this version.'}</p></div>
                <p><strong>Additional instructions:</strong> {version.customInstructions || 'None recorded'}</p>
                <p><strong>Writer:</strong> {version.writingModelUsed || version.modelUsed || 'Not recorded'} · Reasoning: {version.modelSettings?.writingReasoningLevel || 'Not recorded'}</p>
                <p><strong>{version.review?.status === 'unavailable' ? 'Requested reviewer:' : 'Reviewer:'}</strong> {version.review?.modelUsed || version.analysisModelUsed || 'Not recorded'} · Reasoning: {version.modelSettings?.analysisReasoningLevel || 'Not recorded'}</p>
                <p><strong>Intensity:</strong> {version.revision?.kind === 'refine' || version.revision?.kind === 'selection' ? 'Edit request' : ({ polish: 'Light', faithful: 'Balanced', transform: 'Thorough' }[version.intensity] || 'Not recorded')}</p>
                {version.preservationSettings && <p><strong>Preservation:</strong> {[
                  version.preservationSettings.keepStructure && 'section order',
                  version.preservationSettings.headingTreatment === 'preserve_verbatim' && 'verbatim headings',
                  version.preservationSettings.preserveNumbers && 'numbers',
                  version.preservationSettings.preserveQuotes && 'quotes',
                  version.preservationSettings.preserveTerms && 'names and terms',
                ].filter(Boolean).join(', ') || 'Factual accuracy; no verbatim locks'}. {version.preservationSettings.customLocks}</p>}
                {!version.revision && <p className="text-neutral-600">Edit type not recorded for this version.</p>}
              </div>
            </details>
  </div>
);
