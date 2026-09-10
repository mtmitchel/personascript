import React, { useState, useRef, useEffect } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DiffViewer } from './DiffViewer';
import { RewriteFeedbackManager } from './RewriteFeedbackManager';
import { WritingReviewPanel } from './WritingReviewPanel';
import { RewriteHistory, RewriteVersionDetails } from './RewriteHistory';
import { EditorialDecisions } from './EditorialDecisions';
import { StudioDraftControls } from './StudioDraftControls';
import { planMatchesSources } from '../editorialPlan';
import { SelectionRange } from '../types';
import { versionDate } from '../utils/rewriteHistory';
import { actionableReviewIssueCount } from '../utils/reviewEvidence';
import { Copy, Check, Download, RefreshCw, ArrowRight, History, X } from 'lucide-react';

export const StudioView: React.FC = () => {
  const { draftText, projectBrief, readerPurpose, editorialPreferences, isUploadingDraft, isUploadingBrief,
    performRewrite, generateEditorialPlan, approveEditorialPlan, isLearningFeedback, isRewriting, isPlanning,
    editorialPlan, rewriteResult, setActiveTab, openModelSettings, restoreRewriteVersion,
  } = useWritingAssistant();
  const [panel, setPanel] = useState<'edit' | 'review' | 'source'>('source');
  const previousResultId = useRef(rewriteResult?.id);
  const [documentPanel, setDocumentPanel] = useState<'history' | 'details' | null>(null);
  const [editRequest, setEditRequest] = useState({ text: '', sequence: 0, resultId: rewriteResult?.id });
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'diff' | 'side-by-side' | 'final'>('final');
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState('');
  const [selectedRange, setSelectedRange] = useState<SelectionRange | undefined>();
  const resultRef = useRef<HTMLElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const workHeading = useRef<HTMLHeadingElement>(null);
  const scrollPanel = useRef<HTMLDivElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const overlayClose = useRef<HTMLButtonElement>(null);
  const busy = isRewriting || isPlanning || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  const decisionsReady = Boolean(editorialPlan?.approved && planMatchesSources(editorialPlan, { draft: draftText, projectBrief, readerPurpose, editorialPreferences }));
  const needsApproval = Boolean(editorialPlan && !decisionsReady);
  const showingRewrite = panel !== 'source' && Boolean(rewriteResult);
  const documentText = showingRewrite ? rewriteResult!.rewrittenText : draftText;
  const documentWords = documentText.trim() ? documentText.trim().split(/\s+/).length : 0;
  const documentStatus = showingRewrite
    ? viewMode === 'final' ? 'Select a passage to edit it' : 'Select passages in Draft view'
    : 'Not being edited';
  const review = rewriteResult?.review;
  const attentionCount = actionableReviewIssueCount(review, rewriteResult?.originalText, rewriteResult?.rewrittenText);
  const needsReview = Boolean(review && (review.status !== 'complete' || attentionCount || review.localChecks.some((check) => !check.passed)));

  useEffect(() => {
    if (previousResultId.current === rewriteResult?.id) return;
    previousResultId.current = rewriteResult?.id;
    setDocumentPanel(null);
    setSelectedHighlight('');
    setSelectedRange(undefined);
    setCopied(false);
    setEditRequest({ text: '', sequence: 0, resultId: rewriteResult?.id });
    setPanel(rewriteResult ? 'edit' : 'source');
  }, [rewriteResult?.id]);
  useEffect(() => {
    if (documentPanel) overlayClose.current?.focus({ preventScroll: true });
  }, [documentPanel]);

  const clearSelection = () => {
    setSelectedHighlight(''); setSelectedRange(undefined);
    window.getSelection()?.removeAllRanges();
  };
  const openPanel = (next: typeof panel) => {
    if (next === 'edit' && panel === 'source' && rewriteResult) restoreRewriteVersion(rewriteResult.id);
    setPanel(next);
    setDocumentPanel(null);
    clearSelection();
    if (next === 'source') setViewMode('final');
    requestAnimationFrame(() => workHeading.current?.focus({ preventScroll: true }));
  };
  const closeDocumentPanel = () => {
    const trigger = documentPanel === 'history' ? historyButton : detailsButton;
    setDocumentPanel(null);
    trigger.current?.focus({ preventScroll: true });
  };
  const requestCorrection = (instruction: string) => {
    clearSelection(); setPanel('edit');
    setEditRequest((current) => ({ text: instruction, sequence: current.sequence + 1, resultId: rewriteResult?.id }));
  };
  const handleCopy = async () => {
    if (!rewriteResult) return;
    try {
      await navigator.clipboard.writeText(rewriteResult.rewrittenText);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { setRewriteError('The draft could not be copied. Try exporting it instead.'); }
  };
  const download = (format: 'txt' | 'md') => {
    if (!rewriteResult) return;
    const url = URL.createObjectURL(new Blob([rewriteResult.rewrittenText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'rewritten-draft.' + format;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };
  const handleTextSelection = () => {
    if (busy || !showingRewrite || viewMode !== 'final' || documentPanel || !rewriteResult) return;
    const selection = window.getSelection();
    const root = proseRef.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root) return;
    const text = selection.toString();
    if (!text.trim()) return;
    try {
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      const start = document.createRange(); start.selectNodeContents(root); start.setEnd(range.startContainer, range.startOffset);
      const end = document.createRange(); end.selectNodeContents(root); end.setEnd(range.endContainer, range.endOffset);
      const offsets = { start: start.toString().length, end: end.toString().length };
      if (rewriteResult.rewrittenText.slice(offsets.start, offsets.end) !== text) return;
      setSelectedHighlight(text); setSelectedRange(offsets); setPanel('edit');
    } catch { /* A changing DOM selection is ignored rather than widening the edit. */ }
  };
  const startRewrite = async () => {
    if (busy) return;
    if (!draftText.trim()) { setActiveTab('draft-brief'); return; }
    setRewriteError(null);
    try {
      if (!editorialPlan) {
        await generateEditorialPlan();
        requestAnimationFrame(() => { scrollPanel.current?.scrollTo({ top: 0 }); workHeading.current?.focus({ preventScroll: true }); });
      } else {
        await performRewrite(decisionsReady ? undefined : approveEditorialPlan());
        requestAnimationFrame(() => resultRef.current?.focus({ preventScroll: true }));
      }
    } catch (failure) {
      setRewriteError(failure instanceof Error ? failure.message : 'Could not complete the rewrite. Your current work is still available.');
    }
  };

  return <div className="studio-shell">
    <div className="studio-split">
      <section ref={resultRef} tabIndex={-1} id="rewrite-result" className="studio-document" aria-label={showingRewrite ? 'Current rewritten version' : 'Original draft'}>
        <div className="studio-document-toolbar">
          {showingRewrite ? <div className="studio-view-switcher" aria-label="Document view">
            {([{ id: 'final', label: 'Draft' }, { id: 'side-by-side', label: 'Side by side' }, { id: 'diff', label: 'Changes' }] as const).map((view) =>
              <button key={view.id} id={'view-mode-' + view.id} type="button" aria-pressed={viewMode === view.id} disabled={!rewriteResult && view.id !== 'final'}
                onClick={() => { setViewMode(view.id); clearSelection(); setDocumentPanel(null); }}>{view.label}</button>)}
          </div> : <div className="studio-document-identity">
            <span className="studio-document-label">Source preview</span>
            <span className="studio-document-fact">{documentWords} words</span>
            <span className="studio-document-fact">{documentStatus}</span>
          </div>}
          <div className="studio-document-actions">
            {showingRewrite && <button id="btn-review-draft" type="button" aria-pressed={panel === 'review'} className={needsReview ? 'has-attention' : ''} onClick={() => openPanel(panel === 'review' ? 'edit' : 'review')}>{attentionCount ? 'Review (' + attentionCount + ')' : review?.status !== 'complete' ? 'Review unavailable' : needsReview ? 'Review differences' : 'Review'}</button>}
            {!showingRewrite && rewriteResult && <button id="btn-open-saved-rewrite" type="button" disabled={busy} className="studio-open-saved" onClick={() => openPanel('edit')}>
              <span>Open saved rewrite</span><span className="studio-saved-date">{versionDate(rewriteResult.createdAt)}</span>
            </button>}
            <button ref={historyButton} type="button" aria-expanded={documentPanel === 'history'} aria-controls="studio-document-panel" onClick={() => setDocumentPanel(documentPanel === 'history' ? null : 'history')}><History size={15}/><span>History</span></button>
            {showingRewrite && <>
              <button ref={detailsButton} type="button" aria-expanded={documentPanel === 'details'} aria-controls="studio-document-panel" onClick={() => setDocumentPanel(documentPanel === 'details' ? null : 'details')}>Details</button>
              <button id="btn-copy-rewritten" type="button" onClick={handleCopy}>{copied ? <Check size={15}/> : <Copy size={15}/>}<span>{copied ? 'Copied' : 'Copy'}</span></button>
              <details className="studio-export"><summary><Download size={15}/><span>Export</span></summary><div>
                <button id="btn-download-txt" type="button" onClick={() => download('txt')}>Plain text (.txt)</button>
                <button id="btn-download-md" type="button" onClick={() => download('md')}>Markdown (.md)</button>
              </div></details>
            </>}
          </div>
        </div>
        {documentPanel ? <div id="studio-document-panel" className="studio-document-panel" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeDocumentPanel(); } }}>
          <div className="flex justify-between items-center gap-4 mb-5"><h2 className="font-semibold">{documentPanel === 'history' ? 'Version history' : 'Version details'}</h2><button ref={overlayClose} type="button" onClick={closeDocumentPanel} aria-label={'Close ' + (documentPanel === 'history' ? 'version history' : 'version details')}><X size={18}/></button></div>
          {documentPanel === 'history' ? <RewriteHistory expanded onContinue={() => openPanel('edit')}/> : rewriteResult && <RewriteVersionDetails version={rewriteResult}/>}
        </div> : <>
          <div id="rendered-prose-container" ref={proseRef} onMouseUp={handleTextSelection} onKeyUp={handleTextSelection} tabIndex={0}
            aria-label={showingRewrite ? 'Rewritten draft. Select text to request an edit.' : 'Original draft text'} className="studio-prose-scroll">
            {showingRewrite && rewriteResult && viewMode === 'diff' ? <DiffViewer original={rewriteResult.originalText} modified={rewriteResult.rewrittenText}/>
              : showingRewrite && rewriteResult && viewMode === 'side-by-side' ? <div className="studio-compare"><div><h2>Original</h2><div className="whitespace-pre-wrap">{rewriteResult.originalText}</div></div><div><h2>Current version</h2><div className="whitespace-pre-wrap">{rewriteResult.rewrittenText}</div></div></div>
              : documentText ? <div className="studio-prose whitespace-pre-wrap">{documentText}</div>
              : <div className="studio-empty"><h2>Start with your draft.</h2><p>Add your writing and supporting facts in Draft &amp; Brief.</p></div>}
          </div>
        </>}
      </section>
      <aside className="studio-inspector" aria-label="Writing workspace">
        <header className="studio-work-header">
          <h2 ref={workHeading} tabIndex={-1} className="studio-panel-title">{panel === 'source' ? 'Rewrite your draft' : panel === 'review' ? 'Review this rewrite' : 'Edit this rewrite'}</h2>
          {rewriteResult && (panel === 'edit'
            ? <button id="btn-new-source-rewrite" type="button" disabled={busy} onClick={() => openPanel('source')} className="studio-text-button">New rewrite from source <ArrowRight size={14}/></button>
            : panel === 'review' && <button type="button" onClick={() => openPanel('edit')} className="studio-text-button">Back to editing</button>)}
        </header>
        {rewriteResult && <div hidden={panel !== 'edit'} className="studio-work-content">
          <RewriteFeedbackManager key={rewriteResult.id} selectedText={selectedHighlight} selectionRange={selectedRange} onClearSelection={clearSelection} editRequest={editRequest.resultId === rewriteResult.id ? editRequest : undefined}>
            {panel === 'edit' && <StudioDraftControls disabled={busy}/>}
          </RewriteFeedbackManager>
        </div>}
        {rewriteResult && <div hidden={panel !== 'review'} className="studio-inspector-scroll">
          {review ? <WritingReviewPanel key={rewriteResult?.id} id="writing-review-panel" review={review} sourceText={rewriteResult?.originalText} projectBrief={rewriteResult?.projectBrief} rewrittenText={rewriteResult?.rewrittenText}
            onCompareSources={() => { setViewMode('side-by-side'); clearSelection(); setDocumentPanel(null); }} onRequestEdit={requestCorrection} onConfigureReviewer={() => openModelSettings('analysis')}/>
            : <p className="studio-panel-description">No review is saved with this version. Compare it with the original before using it.</p>}
        </div>}
        {panel === 'source' && <div className="studio-work-content">
          <div ref={scrollPanel} className="studio-inspector-scroll">
            <p className="studio-panel-description">You’re viewing your original draft. Prepare suggested changes, then approve them to create a rewrite.</p>
            {draftText.trim() && <><button id="btn-edit-draft-brief" type="button" onClick={() => setActiveTab('draft-brief')} className="studio-text-button">Edit draft &amp; brief <ArrowRight size={14}/></button>
              <StudioDraftControls sourceRewrite disabled={busy}/>
            </>}
            {editorialPlan && <div className="studio-decisions"><EditorialDecisions/></div>}
          </div>
          <div className="studio-work-action">
            {rewriteError && <p role="alert" className="text-rose-700">{rewriteError}</p>}
            <p role="status">{isPlanning ? 'Preparing suggestions…' : isRewriting ? 'Writing and reviewing your new version…' : isUploadingDraft || isUploadingBrief ? 'Waiting for your upload…' : decisionsReady ? 'Uses the approved plan and your source.' : draftText.trim() ? 'Preparing suggestions does not rewrite your draft.' : 'Add your source to begin.'}</p>
            <button id="btn-start-source-rewrite" type="button" disabled={busy} onClick={startRewrite} className="studio-primary">
              {busy && <RefreshCw size={15} className="animate-spin"/>}
              {isPlanning ? 'Preparing suggestions…' : isRewriting ? 'Rewriting…' : !draftText.trim() ? 'Add draft' : needsApproval ? 'Approve and rewrite' : decisionsReady ? 'Rewrite from source' : 'Prepare suggestions'}
            </button>
          </div>
        </div>}
        {rewriteError && panel !== 'source' && <p role="alert" className="studio-error">{rewriteError}</p>}
      </aside>
    </div>
  </div>;
};
