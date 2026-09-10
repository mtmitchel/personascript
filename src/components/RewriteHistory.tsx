import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { revisionLabel, versionDate, REWRITE_HISTORY_LIMIT } from '../utils/rewriteHistory';
import { WritingReviewPanel } from './WritingReviewPanel';
import { SavedEditorialDecisions } from './EditorialDecisions';
import { RewriteResult } from '../types';

export const RewriteHistory: React.FC<{ expanded?: boolean; onContinue?: () => void }> = ({ expanded = false, onContinue }) => {
  const { rewriteHistory, rewriteResult, restoreRewriteVersion, isRewriting, isPlanning, isLearningFeedback } = useWritingAssistant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const selected = rewriteHistory.find((entry) => entry.id === selectedId);
  return (
    <details open={expanded || undefined} id="rewrite-history" className="rounded-xl border border-neutral-200 bg-white">
      <summary className={`${expanded ? 'hidden' : ''} cursor-pointer px-4 py-3 text-xs font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900`}>
        Version history ({rewriteHistory.length})
      </summary>
      <div className="px-4 pb-4 space-y-3 text-xs">
        <p className="text-neutral-600">The last {REWRITE_HISTORY_LIMIT} versions are saved in this browser. Previewing a version leaves your current work in place.</p>
        {rewriteHistory.length === 0 ? (
          <p className="text-neutral-600">Completed rewrites and edits will appear here.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100" aria-label="Saved versions">
            {rewriteHistory.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selectedId === entry.id}
                onClick={() => { setSelectedId(entry.id); setMessage(''); }}
                className={`w-full text-left px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900 ${selectedId === entry.id ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
              >
                <span className="flex flex-wrap justify-between gap-1 font-medium text-neutral-800">
                  <span>{revisionLabel(entry)}{entry.id === rewriteResult?.id ? ' · Current' : ''}</span>
                  <time dateTime={entry.createdAt} className="text-[11px] text-neutral-600">{versionDate(entry.createdAt)}</time>
                </span>
                <span className="block mt-1 text-[11px] text-neutral-600">{entry.profileName || 'Voice not recorded'} · {entry.writingModelUsed || entry.modelUsed || 'Writer not recorded'}</span>
                <span className="block mt-1 truncate text-neutral-600">{entry.rewrittenText}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <section aria-label="Version preview" className="space-y-3 border-t border-neutral-200 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-neutral-900">Version preview · {revisionLabel(selected)}</h2>
              <button type="button" onClick={() => setSelectedId(null)} className="underline text-neutral-700">Close preview</button>
            </div>
            <div tabIndex={0} aria-label="Saved draft text" className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 p-3 leading-relaxed text-neutral-900">{selected.rewrittenText}</div>
            <RewriteVersionDetails version={selected}/>
            {selected.review ? (
              <WritingReviewPanel key={selected.id} review={selected.review} sourceText={selected.originalText} projectBrief={selected.projectBrief} rewrittenText={selected.rewrittenText} />
            ) : <p className="text-neutral-600">No separate review is saved for this version. Any legacy score is an unverified historical assessment.</p>}
            <p className="text-neutral-600">Continue with this version’s original draft, saved brief, reader and purpose, and standing preferences for follow-up edits. Your current voice, model, and editing controls apply. Draft &amp; Brief inputs stay as they are; your current result stays in history.</p>
            <button
              id="btn-restore-version"
              type="button"
              disabled={isRewriting || isPlanning || isLearningFeedback || (selected.id === rewriteResult?.id && !onContinue)}
              onClick={() => {
                restoreRewriteVersion(selected.id);
                onContinue?.();
                setMessage('Saved rewrite opened. Your previous result is in history.');
              }}
              className="rounded-lg bg-neutral-900 text-white px-3 py-2 font-medium disabled:opacity-40"
            >{selected.id === rewriteResult?.id ? 'Open this rewrite' : 'Continue from this version'}</button>
          </section>
        )}
        <p role="status" className="text-neutral-700">{message}</p>
      </div>
    </details>
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
                <p><strong>Intensity:</strong> {version.revision?.kind === 'refine' || version.revision?.kind === 'selection' ? 'Edit request with shared voice and preservation controls' : ({ polish: 'Light', faithful: 'Balanced', transform: 'Thorough' }[version.intensity] || 'Not recorded')}</p>
                {version.preservationSettings && <p><strong>Preservation:</strong> {[
                  version.preservationSettings.keepStructure && 'section order',
                  version.preservationSettings.headingTreatment === 'preserve_verbatim' && 'verbatim headings',
                  version.preservationSettings.preserveNumbers && 'numbers',
                  version.preservationSettings.preserveQuotes && 'quotes',
                  version.preservationSettings.preserveTerms && 'names and terms',
                ].filter(Boolean).join(', ') || 'Factual accuracy; no verbatim locks'}. {version.preservationSettings.customLocks}</p>}
                {!version.revision && <p className="text-neutral-600">Older versions did not record the edit type or a separate edit timestamp.</p>}
              </div>
            </details>
  </div>
);
