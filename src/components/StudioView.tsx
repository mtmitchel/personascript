import React, { useState, useRef, useEffect } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DiffViewer } from './DiffViewer';
import { RewriteFeedbackManager } from './RewriteFeedbackManager';
import { WritingReviewPanel } from './WritingReviewPanel';
import { RewriteHistory, RewriteVersionDetails } from './RewriteHistory';
import { EditorialDecisions } from './EditorialDecisions';
import { planReadiness, planStaleReasons, sectionPlan } from '../utils/editorialSummary';
import { keepOriginalText, type ParagraphBlock } from '../utils/diffHelper';
import { getDraftParagraphs } from '../sourceText';
import { StudioDraftControls } from './StudioDraftControls';
import { planMatchesSources } from '../editorialPlan';
import { SelectionRange } from '../types';
import { actionableReviewIssueCount } from '../utils/reviewEvidence';
import { Copy, Check, Download, RefreshCw, ArrowRight, History, X } from 'lucide-react';

/** A passage the author selected in the draft to write a request about. */
type SourceSelection = { text: string; from: number; to: number };

/** Paragraph number of the source paragraph element containing a DOM node. */
function paragraphNumber(node: Node): number | null {
  const element = node instanceof Element ? node : node.parentElement;
  const paragraph = element?.closest('.studio-source-paragraph');
  const match = paragraph?.id.match(/^draft-paragraph-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export const StudioView: React.FC = () => {
  const { draftText, projectBrief, readerPurpose, editorialPreferences, customDirectives, setCustomDirectives, isUploadingDraft, isUploadingBrief,
    performRewrite, generateEditorialPlan, approveEditorialPlan, editEditorialPlan, isLearningFeedback, isRewriting, isPlanning,
    editorialPlan, rewriteResult, setActiveTab, openModelSettings, restoreRewriteVersion, updateRewrittenText,
  } = useWritingAssistant();
  const [panel, setPanel] = useState<'edit' | 'review' | 'source'>('source');
  const [instructionOpen, setInstructionOpen] = useState(() => customDirectives.trim() !== '' && !editorialPlan);
  const [sourceSelection, setSourceSelection] = useState<SourceSelection | null>(null);
  const [requestText, setRequestText] = useState('');
  // Earlier texts of the current version, so "Keep original" can be undone without a model call.
  const [textHistory, setTextHistory] = useState<string[]>([]);
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
  const planSources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences, customInstructions: customDirectives };
  const decisionsReady = Boolean(editorialPlan?.approved && planMatchesSources(editorialPlan, planSources));
  // A plan prepared from different inputs, or in the earlier per-paragraph
  // format, is replaced rather than approved: the one primary action becomes
  // "Get new suggestions" until the plan matches.
  const planStale = Boolean(editorialPlan && !decisionsReady && (editorialPlan.plan.version !== 3 || planStaleReasons(editorialPlan, planSources).length > 0));
  const needsApproval = Boolean(editorialPlan && !decisionsReady && !planStale);
  // The action bar reports the same blockers the plan panel does, so approving
  // can never be offered for a plan the validator would refuse.
  const planIssue = editorialPlan && !decisionsReady && !planStale ? planReadiness(editorialPlan.plan, draftText, projectBrief).error : null;
  const planBlocked = Boolean(planIssue);
  // Suggestions the author has not answered yet; "Accept all and rewrite" names what approval does to them.
  const pendingSuggestions = editorialPlan && needsApproval && editorialPlan.plan.version === 3 ? sectionPlan(editorialPlan.plan, draftText).pending : 0;
  const canRequest = Boolean(editorialPlan && editorialPlan.plan.version === 3 && !editorialPlan.approved && !planStale);
  const showingRewrite = panel !== 'source' && Boolean(rewriteResult);
  const documentText = showingRewrite ? rewriteResult!.rewrittenText : draftText;
  const documentWords = documentText.trim() ? documentText.trim().split(/\s+/).length : 0;
  const documentStatus = showingRewrite
    ? viewMode === 'final' ? 'Select a passage to edit it' : viewMode === 'diff' ? 'Accept, keep the original, or revise each change' : 'Select passages in Draft view'
    : canRequest ? 'Select a passage to request a change' : 'Not being edited';
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
    setTextHistory([]);
    setEditRequest({ text: '', sequence: 0, resultId: rewriteResult?.id });
    setPanel(rewriteResult ? 'edit' : 'source');
  }, [rewriteResult?.id]);
  useEffect(() => {
    if (documentPanel) overlayClose.current?.focus({ preventScroll: true });
  }, [documentPanel]);

  const clearSelection = () => {
    setSelectedHighlight(''); setSelectedRange(undefined);
    setSourceSelection(null); setRequestText('');
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
  const keepOriginal = (index: number, blocks: ParagraphBlock[]) => {
    if (busy || !rewriteResult) return;
    setTextHistory(current => [...current, rewriteResult.rewrittenText]);
    updateRewrittenText(keepOriginalText(blocks, index));
  };
  const undoKeepOriginal = () => {
    if (busy || !textHistory.length) return;
    updateRewrittenText(textHistory[textHistory.length - 1]);
    setTextHistory(current => current.slice(0, -1));
  };
  const reviseBlock = (block: ParagraphBlock) => {
    if (busy || !rewriteResult) return;
    const text = rewriteResult.rewrittenText.slice(block.rewrittenStart, block.rewrittenEnd);
    if (!text.trim()) return;
    setSelectedHighlight(text); setSelectedRange({ start: block.rewrittenStart, end: block.rewrittenEnd }); setPanel('edit');
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
    if (busy || viewMode !== 'final' || documentPanel) return;
    const selection = window.getSelection();
    const root = proseRef.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !root) return;
    const text = selection.toString();
    if (!text.trim()) return;
    try {
      const range = selection.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      if (!showingRewrite) {
        // Selecting in the draft while suggestions are under review starts a request about that passage.
        if (!canRequest) return;
        const from = paragraphNumber(range.startContainer);
        const to = paragraphNumber(range.endContainer);
        if (from === null || to === null) return;
        setSourceSelection({ text: text.trim(), from: Math.min(from, to), to: Math.max(from, to) });
        return;
      }
      if (!rewriteResult) return;
      const start = document.createRange(); start.selectNodeContents(root); start.setEnd(range.startContainer, range.startOffset);
      const end = document.createRange(); end.selectNodeContents(root); end.setEnd(range.endContainer, range.endOffset);
      const offsets = { start: start.toString().length, end: end.toString().length };
      if (rewriteResult.rewrittenText.slice(offsets.start, offsets.end) !== text) return;
      setSelectedHighlight(text); setSelectedRange(offsets); setPanel('edit');
    } catch { /* A changing DOM selection is ignored rather than widening the edit. */ }
  };
  const addRequest = () => {
    if (!editorialPlan || !sourceSelection || !requestText.trim()) return;
    const request = { paragraphRange: { from: sourceSelection.from, to: sourceSelection.to }, sourcePhrase: sourceSelection.text, instruction: requestText.trim() };
    editEditorialPlan({ ...editorialPlan.plan, requests: [...(editorialPlan.plan.requests || []), request] });
    clearSelection();
  };
  const startRewrite = async () => {
    if (busy) return;
    if (!draftText.trim()) { setActiveTab('draft-brief'); return; }
    setRewriteError(null);
    try {
      if (!editorialPlan || planStale) {
        await generateEditorialPlan();
        setInstructionOpen(false);
        clearSelection();
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
            {showingRewrite && <button id="btn-review-draft" type="button" aria-pressed={panel === 'review'} className={needsReview ? 'has-attention' : ''} onClick={() => openPanel(panel === 'review' ? 'edit' : 'review')}>{attentionCount ? 'Review (' + attentionCount + ')' : !review ? 'Not reviewed' : review.status !== 'complete' ? 'Review failed' : needsReview ? 'Review differences' : 'Review'}</button>}
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
            aria-label={showingRewrite ? 'Rewritten draft. Select text to request an edit.' : canRequest ? 'Original draft. Select text to request a change.' : 'Original draft text'} className="studio-prose-scroll">
            {showingRewrite && rewriteResult && viewMode === 'diff' ? <DiffViewer original={rewriteResult.originalText} modified={rewriteResult.rewrittenText} onKeepOriginal={keepOriginal} onRevise={reviseBlock} onUndo={undoKeepOriginal} canUndo={textHistory.length > 0}/>
              : showingRewrite && rewriteResult && viewMode === 'side-by-side' ? <div className="studio-compare"><div><h2>Original</h2><div className="whitespace-pre-wrap">{rewriteResult.originalText}</div></div><div><h2>Current version</h2><div className="whitespace-pre-wrap">{rewriteResult.rewrittenText}</div></div></div>
              : documentText ? <div className="studio-prose">{/* Each source paragraph carries a stable id so plan rows can point at their passage. */}{getDraftParagraphs(documentText).map(p => <p key={p.id} id={`draft-paragraph-${p.id}`} className="studio-source-paragraph">{p.text}</p>)}</div>
              : <div className="studio-empty"><h2>Start with your draft.</h2><p>Add your writing and supporting facts in Draft &amp; Brief.</p></div>}
          </div>
        </>}
      </section>
      <aside className="studio-inspector" aria-label="Writing workspace">
        <header className="studio-work-header">
          <h2 ref={workHeading} tabIndex={-1} className="studio-panel-title">{panel === 'source' ? 'Suggested changes' : panel === 'review' ? 'Review' : 'Ask for a change'}</h2>
          {/* One quiet way out of each panel: the rewrite ↔ the draft it came from. */}
          {rewriteResult && (panel === 'edit'
            ? <button id="btn-new-source-rewrite" type="button" disabled={busy} onClick={() => openPanel('source')} className="studio-text-button">Start over from the draft</button>
            : panel === 'review'
              ? <button type="button" onClick={() => openPanel('edit')} className="studio-text-button">Back to the rewrite</button>
              : <button id="btn-open-saved-rewrite" type="button" disabled={busy} onClick={() => openPanel('edit')} className="studio-text-button">Back to the rewrite <ArrowRight size={14}/></button>)}
        </header>
        {rewriteResult && <div hidden={panel !== 'edit'} className="studio-work-content">
          <RewriteFeedbackManager key={rewriteResult.id} selectedText={selectedHighlight} selectionRange={selectedRange} onClearSelection={clearSelection} editRequest={editRequest.resultId === rewriteResult.id ? editRequest : undefined}/>
        </div>}
        {rewriteResult && <div hidden={panel !== 'review'} className="studio-inspector-scroll">
          {review ? <WritingReviewPanel key={rewriteResult?.id} id="writing-review-panel" review={review} sourceText={rewriteResult?.originalText} projectBrief={rewriteResult?.projectBrief} rewrittenText={rewriteResult?.rewrittenText}
            onCompareSources={() => { setViewMode('side-by-side'); clearSelection(); setDocumentPanel(null); }} onRequestEdit={requestCorrection} onConfigureReviewer={() => openModelSettings('analysis')}/>
            : <p className="studio-panel-description">No review is saved with this version. Compare it with the original before using it.</p>}
        </div>}
        {panel === 'source' && <div className="studio-work-content">
          <div ref={scrollPanel} className="studio-inspector-scroll">
            {!editorialPlan && <p className="studio-panel-description">Get suggestions for this draft, then accept or reject each one before rewriting.</p>}
            {sourceSelection && editorialPlan && <form className="studio-request-form" onSubmit={event => { event.preventDefault(); addRequest(); }}>
              <p className="studio-field-label">Rewrite this passage</p>
              <blockquote className="studio-request-quote">{sourceSelection.text}</blockquote>
              <textarea id="input-passage-request" rows={2} value={requestText} disabled={busy} autoFocus
                aria-label="What should change, and why?" placeholder="What should change, and why?"
                onChange={event => setRequestText(event.target.value)}/>
              <div className="studio-request-actions">
                <button type="submit" className="studio-secondary" disabled={busy || !requestText.trim()}>Add request</button>
                <button type="button" className="studio-text-button" onClick={clearSelection}>Cancel</button>
              </div>
            </form>}
            {editorialPlan && <div className="studio-decisions"><EditorialDecisions/></div>}
            {/* Before suggestions exist the instruction is an input to planning.
                Once they exist, the same field is how the author asks for
                different ones: changing it makes the primary action get new
                suggestions. */}
            {draftText.trim() && (!editorialPlan || instructionOpen) && <div className="studio-field studio-rewrite-request">
              <label htmlFor="input-rewrite-instructions" className="studio-field-label">{editorialPlan ? 'What should the suggestions do differently?' : 'Anything the suggestions should take into account? (optional)'}</label>
              <textarea id="input-rewrite-instructions" rows={2} value={customDirectives} disabled={busy} autoFocus={Boolean(editorialPlan)}
                onChange={event => setCustomDirectives(event.target.value)} placeholder={editorialPlan ? 'For example, keep the trade-offs section in full.' : 'For example, keep it under 500 words.'}/>
            </div>}
            {draftText.trim() && editorialPlan && !instructionOpen &&
              <button type="button" className="studio-text-button" disabled={busy} onClick={() => setInstructionOpen(true)}>Ask for different suggestions</button>}
            {draftText.trim() && <StudioDraftControls disabled={busy}/>}
          </div>
          <div className="studio-work-action">
            {rewriteError && <p role="alert" className="text-rose-700">{rewriteError}</p>}
            <p role="status">{isPlanning ? 'Reading your draft and brief…' : isRewriting ? 'Writing and reviewing…' : isUploadingDraft || isUploadingBrief ? 'Waiting for your upload…' : decisionsReady ? 'The rewrite follows the suggestions you accepted.' : planIssue || ''}</p>
            <button id="btn-start-source-rewrite" type="button" disabled={busy || planBlocked} onClick={startRewrite} className="studio-primary">
              {busy && <RefreshCw size={15} className="animate-spin"/>}
              {isPlanning ? 'Reading your draft…' : isRewriting ? 'Rewriting…' : !draftText.trim() ? 'Add draft' : planStale ? 'Get new suggestions' : needsApproval ? (pendingSuggestions > 0 ? 'Accept all and rewrite' : 'Rewrite') : decisionsReady ? 'Rewrite from source' : 'Suggest changes'}
            </button>
          </div>
        </div>}
        {rewriteError && panel !== 'source' && <p role="alert" className="studio-error">{rewriteError}</p>}
      </aside>
    </div>
  </div>;
};
