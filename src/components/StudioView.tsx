import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { DiffViewer } from './DiffViewer';
import { RewriteFeedbackManager } from './RewriteFeedbackManager';
import { WritingReviewPanel } from './WritingReviewPanel';
import { RewriteHistory, RewriteVersionDetails } from './RewriteHistory';
import { EditorialDecisions } from './EditorialDecisions';
import { planNeedsReplacement, planReadiness, planStaleReasons, sectionPlan } from '../utils/editorialSummary';
import { keepOriginalText, paragraphBlocks, type ParagraphBlock } from '../utils/diffHelper';
import { resolvePassageSelection, elementOf, type PassageSelectionMode } from '../utils/passageSelection';
import { getDraftParagraphs } from '../sourceText';
import { plainText, RichParagraph } from '../utils/richText';
import { StudioDraftControls } from './StudioDraftControls';
import { planMatchesSources } from '../editorialPlan';
import { RewriteResult, SelectionRange } from '../types';
import { actionableReviewIssueCount } from '../utils/reviewEvidence';
import { suggestionsStatus } from '../utils/studioStatus';
import { Copy, Check, Download, History, Loader2, RefreshCw, X } from 'lucide-react';
import { SelectionToolbar } from './SelectionToolbar';
import { ConfirmDialog } from './ConfirmDialog';
import { modelDisplayName } from '../modelChoice';

/** A passage the author selected in the draft to write a request about. */
type SourceSelection = { text: string; from: number; to: number };

type RailTab = 'suggestions' | 'review' | 'change' | 'settings';
type DocView = 'original' | 'rewrite' | 'changes';
type DocPanel = 'history' | 'details' | null;

/** True when the reviewer flagged something the author should look at before editing. */
function reviewNeedsAttention(result: RewriteResult | null): boolean {
  const review = result?.review;
  if (!result || !review) return false;
  return review.status !== 'complete'
    || actionableReviewIssueCount(review, result.originalText, result.rewrittenText) > 0
    || review.localChecks.some(check => !check.passed);
}

export const StudioView: React.FC = () => {
  const {
    draftText, projectBrief, readerPurpose, editorialPreferences, customDirectives,
    isUploadingDraft, isUploadingBrief, performRewrite, generateEditorialPlan, approveEditorialPlan,
    editEditorialPlan, isLearningFeedback, isRewriting, isPlanning, editorialPlan, rewriteResult,
    setActiveTab, openModelSettings, updateRewrittenText, setReviewFindingIgnored,
  } = useWritingAssistant();

  // A saved rewrite opens on its changes and review, the same as when a rewrite arrives.
  const [railTab, setRailTab] = useState<RailTab>(() => (rewriteResult ? (reviewNeedsAttention(rewriteResult) ? 'review' : 'change') : 'suggestions'));
  const [docView, setDocView] = useState<DocView>(() => (rewriteResult ? 'changes' : 'original'));
  const [docPanel, setDocPanel] = useState<DocPanel>(null);

  const [sourceSelection, setSourceSelection] = useState<SourceSelection | null>(null);
  const [requestText, setRequestText] = useState('');
  // Earlier texts of the current version, so "Keep original" can be undone without a model call.
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const previousResultId = useRef(rewriteResult?.id);
  const [editRequest, setEditRequest] = useState({ text: '', sequence: 0, resultId: rewriteResult?.id });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState('');
  const [selectedRange, setSelectedRange] = useState<SelectionRange | undefined>();

  const resultRef = useRef<HTMLElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const scrollPanel = useRef<HTMLDivElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const overlayClose = useRef<HTMLButtonElement>(null);

  const hasDraft = draftText.trim() !== '';
  const hasRewrite = Boolean(rewriteResult);
  const draftDiffers = hasRewrite && rewriteResult!.originalText !== draftText;
  const busy = isRewriting || isPlanning || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  const planSources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences, customInstructions: customDirectives };
  const plan = editorialPlan;
  const planApproved = Boolean(plan?.approved && planMatchesSources(plan, planSources));
  const planStale = Boolean(plan && !planApproved && planNeedsReplacement(plan, planSources));
  const needsApproval = Boolean(plan && !planApproved && !planStale);
  const planIssue = plan && needsApproval ? planReadiness(plan.plan, draftText, projectBrief).error : null;
  const staleReasons = plan ? planStaleReasons(plan, planSources) : [];
  const pending = plan && needsApproval && (plan.plan.version === 3 || plan.plan.version === 4) ? sectionPlan(plan.plan, draftText).pending : 0;
  const canRequest = Boolean(plan && (plan.plan.version === 3 || plan.plan.version === 4) && !plan.approved && !planStale);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const hasPlanWork = Boolean(plan && !plan.approved && (plan.plan.items.some(item => item.response) || (plan.plan.requests || []).length > 0));
  const answeredCount = plan?.plan.items.filter(i => i.response).length ?? 0;
  const requestCount = plan?.plan.requests?.length ?? 0;

  const draftWords = draftText.trim() ? draftText.trim().split(/\s+/).length : 0;
  const review = rewriteResult?.review;
  const attentionCount = actionableReviewIssueCount(review, rewriteResult?.originalText, rewriteResult?.rewrittenText);
  const needsReview = reviewNeedsAttention(rewriteResult);
  const blocks = useMemo<ParagraphBlock[]>(() => (rewriteResult ? paragraphBlocks(rewriteResult.originalText, rewriteResult.rewrittenText) : []), [rewriteResult?.originalText, rewriteResult?.rewrittenText]);

  // Handle version arrival and clearing
  useEffect(() => {
    if (previousResultId.current === rewriteResult?.id) return;
    previousResultId.current = rewriteResult?.id;
    if (rewriteResult) {
      setDocView('changes');
      setRailTab(needsReview ? 'review' : 'change');
    } else {
      setDocView('original');
      setRailTab('suggestions');
    }
    setDocPanel(null);
    clearSelection();
    setTextHistory([]);
    setEditRequest({ text: '', sequence: 0, resultId: rewriteResult?.id });
  }, [rewriteResult?.id, needsReview]);

  useEffect(() => {
    if (docPanel) overlayClose.current?.focus({ preventScroll: true });
  }, [docPanel]);

  const clearSelection = () => {
    setSelectedHighlight('');
    setSelectedRange(undefined);
    setSourceSelection(null);
    setRequestText('');
    window.getSelection()?.removeAllRanges();
  };

  const handleSelectRailTab = (tab: RailTab) => {
    if ((tab === 'change' || tab === 'review') && !hasRewrite) return;
    setRailTab(tab);
  };

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const tabs: RailTab[] = hasRewrite ? ['suggestions', 'review', 'change', 'settings'] : ['suggestions', 'settings'];
    const currentIndex = tabs.indexOf(railTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextTab = tabs[(currentIndex + 1) % tabs.length];
      handleSelectRailTab(nextTab);
      document.getElementById('rail-tab-' + nextTab)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
      handleSelectRailTab(prevTab);
      document.getElementById('rail-tab-' + prevTab)?.focus();
    }
  };

  const closeDocumentPanel = () => {
    const trigger = docPanel === 'history' ? historyButton : detailsButton;
    setDocPanel(null);
    trigger.current?.focus({ preventScroll: true });
  };

  const requestCorrection = (instruction: string) => {
    clearSelection();
    setRailTab('change');
    setEditRequest(current => ({ text: instruction, sequence: current.sequence + 1, resultId: rewriteResult?.id }));
  };

  const keepOriginal = (index: number) => {
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
    setSelectedHighlight(text);
    setSelectedRange({ start: block.rewrittenStart, end: block.rewrittenEnd });
    setRailTab('change');
  };

  const handleCopy = async () => {
    if (!rewriteResult) return;
    try {
      await navigator.clipboard.writeText(rewriteResult.rewrittenText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2500);
  };

  const download = (format: 'txt' | 'md') => {
    if (!rewriteResult) return;
    const url = URL.createObjectURL(new Blob([rewriteResult.rewrittenText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rewritten-draft.' + format;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const [selectionSide, setSelectionSide] = useState<'original' | 'rewrite' | 'mixed' | null>(null);

  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const root = proseRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !root) {
        setSelectionSide(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelectionSide(null);
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
          setSelectionSide(null);
          return;
        }
        const startElement = elementOf(range.startContainer);
        const endElement = elementOf(range.endContainer);
        const startSide = startElement?.closest('[data-side]')?.getAttribute('data-side');
        const endSide = endElement?.closest('[data-side]')?.getAttribute('data-side');
        if (startSide === 'rewrite' && endSide === 'rewrite') {
          setSelectionSide('rewrite');
        } else if (startSide === 'original' && endSide === 'original') {
          setSelectionSide('original');
        } else {
          setSelectionSide('mixed');
        }
      } catch {
        setSelectionSide(null);
      }
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  let selectionEnabled = false;
  let selectionLabel = '';
  let onSelectionAct = () => {};

  const applyResolvedSelection = (mode: PassageSelectionMode) => {
    const resolved = resolvePassageSelection(proseRef.current, window.getSelection(), mode);
    if (!resolved) return;
    if (resolved.kind === 'source') {
      setSourceSelection({ text: resolved.text, from: resolved.from, to: resolved.to });
      setRailTab('suggestions');
      requestAnimationFrame(() => {
        const input = document.getElementById('input-passage-request');
        if (input) input.focus();
      });
    } else {
      setSelectedHighlight(resolved.text);
      setSelectedRange(resolved.range);
      setRailTab('change');
    }
  };

  if (!busy && !docPanel) {
    selectionLabel = 'Ask for a change';
    if (docView === 'original' || !hasRewrite) {
      if (canRequest) {
        selectionEnabled = true;
        onSelectionAct = () => applyResolvedSelection({ type: 'source-request', draftText });
      } else if (rewriteResult) {
        selectionEnabled = true;
        onSelectionAct = () => applyResolvedSelection({ type: 'original-highlight' });
      }
    } else if (rewriteResult && docView === 'rewrite') {
      selectionEnabled = true;
      onSelectionAct = () => applyResolvedSelection({ type: 'rewrite-prose', rewrittenText: rewriteResult.rewrittenText });
    } else if (rewriteResult && docView === 'changes' && selectionSide === 'rewrite') {
      selectionEnabled = true;
      onSelectionAct = () => applyResolvedSelection({ type: 'changes-rewrite', rewrittenText: rewriteResult.rewrittenText, blocks });
    } else if (rewriteResult && docView === 'changes' && selectionSide === 'original') {
      selectionEnabled = true;
      onSelectionAct = () => applyResolvedSelection({ type: 'changes-original' });
    }
  }

  const addRequest = () => {
    if (!editorialPlan || !sourceSelection || !requestText.trim()) return;
    const request = {
      paragraphRange: { from: sourceSelection.from, to: sourceSelection.to },
      sourcePhrase: sourceSelection.text,
      instruction: requestText.trim(),
    };
    editEditorialPlan({ ...editorialPlan.plan, requests: [...(editorialPlan.plan.requests || []), request] });
    clearSelection();
  };

  const runGetSuggestions = async () => {
    setRewriteError(null);
    try {
      await generateEditorialPlan();
      clearSelection();
      requestAnimationFrame(() => {
        scrollPanel.current?.scrollTo({ top: 0 });
      });
    } catch (failure) {
      setRewriteError(failure instanceof Error ? failure.message : 'Could not get suggestions. Your current work is still available.');
    }
  };

  const handleGetSuggestions = () => {
    if (busy || !hasDraft) return;
    if (hasPlanWork) {
      setConfirmReplace(true);
      return;
    }
    void runGetSuggestions();
  };

  const acceptAllPending = () => {
    if (!plan) return;
    editEditorialPlan({
      ...plan.plan,
      items: plan.plan.items.map(item => item.decision !== 'keep' && !item.response ? { ...item, response: 'accepted' as const } : item),
    });
  };

  const handleRewrite = async () => {
    if (busy || !hasDraft || !plan || planStale || Boolean(planIssue)) return;
    setRewriteError(null);
    try {
      await performRewrite(planApproved ? undefined : approveEditorialPlan());
      requestAnimationFrame(() => resultRef.current?.focus({ preventScroll: true }));
    } catch (failure) {
      setRewriteError(failure instanceof Error ? failure.message : 'Could not complete the rewrite. Your current work is still available.');
    }
  };

  const renderProse = (text: string, side: 'draft' | 'original' | 'rewrite') => {
    const prefix = side === 'rewrite' ? 'rewrite' : 'draft';
    const containerSide = side === 'rewrite' ? 'rewrite' : 'original';
    return (
      <div className="studio-prose" data-side={containerSide}>
        {getDraftParagraphs(text).map(p => (
          <RichParagraph key={p.id} id={`${prefix}-paragraph-${p.id}`} className="studio-source-paragraph" text={p.text} />
        ))}
      </div>
    );
  };

  const planModel = plan?.modelUsed ? modelDisplayName(plan.modelUsed) : '';
  const provenanceLine = !plan
    ? 'The review model reads your draft, brief, reader and purpose, and your instructions, then suggests what each section should keep, shorten, or cut. Answer the ones you disagree with; the rest are used when you rewrite.'
    : plan.approved
      ? `Prepared${planModel ? ` by ${planModel}` : ''}. The last rewrite followed them.`
      : `Prepared${planModel ? ` by ${planModel}` : ''} from your draft, brief, reader and purpose, and instructions.`;

  const statusResult = suggestionsStatus({
    hasDraft,
    isPlanning,
    isRewriting,
    isUploading: isUploadingDraft || isUploadingBrief,
    isSavingVoice: isLearningFeedback,
    rewriteError,
    hasPlan: Boolean(plan),
    planStale,
    staleReasons,
    planIssue,
    planApproved,
    hasRewrite,
    pendingSuggestions: pending,
  });

  return (
    <div className="studio-shell">
      <div className="studio-split">
        {/* Document pane */}
        <section
          ref={resultRef}
          tabIndex={-1}
          id="rewrite-result"
          className="studio-document"
          aria-label={hasRewrite ? 'Rewrite and original draft' : 'Original draft'}
        >
          <div className="studio-document-toolbar">
            {hasRewrite ? (
              <div className="studio-document-identity">
                <div className="studio-view-switcher" role="group" aria-label="Document view">
                  {(
                    [
                      { id: 'original', label: 'Original' },
                      { id: 'rewrite', label: 'Rewrite' },
                      { id: 'changes', label: 'Changes' },
                    ] as const
                  ).map(view => (
                    <button
                      key={view.id}
                      id={'view-mode-' + view.id}
                      type="button"
                      aria-pressed={docView === view.id}
                      onClick={() => {
                        setDocView(view.id);
                        clearSelection();
                        setDocPanel(null);
                      }}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
                {draftDiffers && <span className="studio-document-fact">Draft changed since this version</span>}
              </div>
            ) : (
              <div className="studio-document-identity">
                <span className="studio-document-label">Original draft</span>
                <span className="studio-document-fact">{draftWords} words</span>
              </div>
            )}
            <div className="studio-document-actions">
              <button
                ref={historyButton}
                type="button"
                aria-expanded={docPanel === 'history'}
                aria-controls="studio-document-panel"
                onClick={() => setDocPanel(docPanel === 'history' ? null : 'history')}
              >
                <History size={15} />
                <span>History</span>
              </button>
              {hasRewrite && (
                <>
                  <button id="btn-copy-rewritten" type="button" onClick={handleCopy}>
                    {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Could not copy — use Export' : 'Copy rewrite'}</span>
                  </button>
                  <details className="studio-export">
                    <summary>
                      <Download size={15} />
                      <span>Export rewrite</span>
                    </summary>
                    <div>
                      <button id="btn-download-txt" type="button" onClick={() => download('txt')}>
                        Plain text (.txt)
                      </button>
                      <button id="btn-download-md" type="button" onClick={() => download('md')}>
                        Markdown (.md)
                      </button>
                    </div>
                  </details>
                  <span className="sr-only" role="status">
                    {copyState === 'copied' ? 'Rewrite copied.' : copyState === 'failed' ? 'Could not copy. Use Export.' : ''}
                  </span>
                  <button
                    ref={detailsButton}
                    type="button"
                    aria-expanded={docPanel === 'details'}
                    aria-controls="studio-document-panel"
                    onClick={() => setDocPanel(docPanel === 'details' ? null : 'details')}
                  >
                    Details
                  </button>
                </>
              )}
            </div>
          </div>

          {docPanel ? (
            <div
              id="studio-document-panel"
              className="studio-document-panel"
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeDocumentPanel();
                }
              }}
            >
              <div className="flex justify-between items-center gap-4 mb-5">
                <h2 className="font-semibold">{docPanel === 'history' ? 'Version history' : 'Version details'}</h2>
                <button
                  ref={overlayClose}
                  type="button"
                  onClick={closeDocumentPanel}
                  aria-label={'Close ' + (docPanel === 'history' ? 'version history' : 'version details')}
                >
                  <X size={18} />
                </button>
              </div>
              {docPanel === 'history' ? (
                <RewriteHistory
                  onOpen={() => {
                    setDocPanel(null);
                  }}
                />
              ) : (
                rewriteResult && <RewriteVersionDetails version={rewriteResult} />
              )}
            </div>
          ) : (
            <div
              id="rendered-prose-container"
              ref={proseRef}
              tabIndex={0}
              aria-label={
                docView === 'changes'
                  ? 'Rewrite beside the original draft. Select text to ask for a change.'
                  : docView === 'rewrite'
                  ? 'Rewrite. Select text to ask for a change.'
                  : 'Current draft. Select text to ask for a change.'
              }
              className="studio-prose-scroll"
            >
              <SelectionToolbar
                container={proseRef}
                label={selectionLabel}
                onAct={onSelectionAct}
                enabled={selectionEnabled}
              />
              {hasRewrite && rewriteResult && docView === 'changes' ? (
                <DiffViewer
                  blocks={blocks}
                  onKeepOriginal={keepOriginal}
                  onRevise={reviseBlock}
                  onUndo={undoKeepOriginal}
                  canUndo={textHistory.length > 0}
                />
              ) : hasRewrite && rewriteResult && docView === 'rewrite' ? (
                renderProse(rewriteResult.rewrittenText, 'rewrite')
              ) : draftText.trim() ? (
                renderProse(draftText, 'draft')
              ) : (
                <div className="studio-empty">
                  <h2>Start with your draft.</h2>
                  <p>Add your writing and supporting facts in Draft &amp; Brief.</p>
                  <button
                    type="button"
                    className="studio-secondary mt-2"
                    onClick={() => setActiveTab('draft-brief')}
                  >
                    Open Draft &amp; Brief
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Rail */}
        <aside className="studio-inspector" aria-label="Writing workspace">
          {/* Tab strip */}
          <div className="studio-rail-tabs">
            <div className="studio-view-switcher" role="tablist" aria-label="Writing workspace" onKeyDown={onTabKeyDown}>
              <button
                id="rail-tab-suggestions"
                role="tab"
                type="button"
                tabIndex={railTab === 'suggestions' ? 0 : -1}
                aria-selected={railTab === 'suggestions'}
                aria-controls="rail-panel-suggestions"
                onClick={() => handleSelectRailTab('suggestions')}
              >
                Suggestions
              </button>
              <button
                id="rail-tab-review"
                role="tab"
                type="button"
                tabIndex={railTab === 'review' ? 0 : -1}
                aria-selected={railTab === 'review'}
                aria-controls="rail-panel-review"
                aria-disabled={!hasRewrite}
                title={!hasRewrite ? 'Available after the first rewrite' : undefined}
                onClick={() => handleSelectRailTab('review')}
              >
                {attentionCount > 0 ? `Possible issues (${attentionCount})` : 'Possible issues'}
              </button>
              <button
                id="rail-tab-change"
                role="tab"
                type="button"
                tabIndex={railTab === 'change' ? 0 : -1}
                aria-selected={railTab === 'change'}
                aria-controls="rail-panel-change"
                aria-disabled={!hasRewrite}
                title={!hasRewrite ? 'Available after the first rewrite' : undefined}
                onClick={() => handleSelectRailTab('change')}
              >
                Ask for a change
              </button>
              <button
                id="rail-tab-settings"
                role="tab"
                type="button"
                tabIndex={railTab === 'settings' ? 0 : -1}
                aria-selected={railTab === 'settings'}
                aria-controls="rail-panel-settings"
                onClick={() => handleSelectRailTab('settings')}
              >
                Rewrite settings
              </button>
            </div>
          </div>

          {/* Suggestions Tab */}
          <div
            id="rail-panel-suggestions"
            role="tabpanel"
            aria-labelledby="rail-tab-suggestions"
            hidden={railTab !== 'suggestions'}
            className="studio-work-content"
          >
            {/* Scroll Region */}
            <div ref={scrollPanel} className="studio-inspector-scroll">
              {sourceSelection && plan && (
                <form
                  className="studio-request-form mb-4"
                  onSubmit={event => {
                    event.preventDefault();
                    addRequest();
                  }}
                >
                  <p className="studio-field-label">Request for the next rewrite</p>
                  <blockquote className="studio-request-quote">{plainText(sourceSelection.text)}</blockquote>
                  <label htmlFor="input-passage-request" className="studio-field-label">What should change, and why?</label>
                  <textarea
                    id="input-passage-request"
                    rows={2}
                    value={requestText}
                    disabled={busy}
                    autoFocus
                    placeholder=""
                    onChange={event => setRequestText(event.target.value)}
                  />
                  <div className="studio-request-actions">
                    <button type="submit" className="studio-secondary" disabled={busy || !requestText.trim()}>
                      Add request
                    </button>
                    <button type="button" className="studio-text-button" onClick={clearSelection}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {hasDraft && (
                <section className="studio-suggestions" aria-labelledby="suggestions-heading">
                  <div className="studio-suggestions-header">
                    <h2 id="suggestions-heading">Suggested changes</h2>
                    <div className="studio-suggestions-actions">
                      {plan && !plan.approved && pending > 0 && (
                        <button type="button" className="studio-text-button" onClick={acceptAllPending}>Accept the rest</button>
                      )}
                      {plan && (
                        <button id="btn-get-suggestions" type="button" className="studio-icon-button"
                          disabled={busy} onClick={handleGetSuggestions}
                          aria-label={isPlanning ? 'Getting suggestions…' : 'Get new suggestions'}
                          title="Get new suggestions">
                          {isPlanning ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="studio-suggestions-source">{provenanceLine}</p>
                  {plan ? <EditorialDecisions /> : (
                    <button id="btn-get-suggestions" type="button" className="studio-secondary" disabled={busy}
                      onClick={handleGetSuggestions}>
                      {isPlanning && <Loader2 size={15} className="animate-spin" />}
                      {isPlanning ? 'Getting suggestions…' : 'Get suggestions'}
                    </button>
                  )}
                </section>
              )}

              <ConfirmDialog
                open={confirmReplace}
                title="Replace these suggestions?"
                confirmLabel="Replace suggestions"
                cancelLabel="Keep current suggestions"
                onConfirm={() => { setConfirmReplace(false); void runGetSuggestions(); }}
                onCancel={() => setConfirmReplace(false)}
              >
                <p>Your {answeredCount} {answeredCount === 1 ? 'answer' : 'answers'} and {requestCount} {requestCount === 1 ? 'request' : 'requests'} will be removed. The draft is not changed.</p>
              </ConfirmDialog>
            </div>

            {/* Pinned Action Bar */}
            <div className="studio-rail-actions studio-rail-footer">
              {statusResult.text && (
                <p
                  role={statusResult.tone === 'alert' ? 'alert' : 'status'}
                  className={`studio-rail-status${statusResult.tone === 'alert' ? ' studio-error' : ''}`}
                >
                  {statusResult.text}
                  {statusResult.action && (
                    <button
                      type="button"
                      className="studio-text-button underline ml-1"
                      onClick={() => setActiveTab(statusResult.action!.targetTab)}
                    >
                      {statusResult.action.label}
                    </button>
                  )}
                </p>
              )}
              {statusResult.detail && (
                <details className="studio-status-detail"><summary>Details</summary><p>{statusResult.detail}</p></details>
              )}
              <div>
                <button
                  id="btn-rewrite"
                  type="button"
                  disabled={busy || !hasDraft || !plan || planStale || Boolean(planIssue)}
                  onClick={handleRewrite}
                  className="studio-primary"
                >
                  {isRewriting && <Loader2 size={15} className="animate-spin" />}
                  {isRewriting ? 'Rewriting…' : 'Rewrite'}
                </button>
              </div>
            </div>
          </div>

          {/* Review Tab */}
          <div
            id="rail-panel-review"
            role="tabpanel"
            aria-labelledby="rail-tab-review"
            hidden={railTab !== 'review'}
            className="studio-work-content"
          >
            {hasRewrite && rewriteResult && (
              <div className="studio-inspector-scroll">
                {review ? (
                  <WritingReviewPanel
                    key={rewriteResult.id}
                    id="writing-review-panel"
                    review={review}
                    sourceText={rewriteResult.originalText}
                    projectBrief={rewriteResult.projectBrief}
                    rewrittenText={rewriteResult.rewrittenText}
                    onCompareSources={() => {
                      setDocView('changes');
                      clearSelection();
                      setDocPanel(null);
                    }}
                    onRequestEdit={requestCorrection}
                    onIgnore={setReviewFindingIgnored}
                    onConfigureReviewer={() => openModelSettings('analysis')}
                  />
                ) : (
                  <p className="studio-panel-description">
                    No review is saved with this version. Compare it with the original before using it.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Ask for a change Tab */}
          <div
            id="rail-panel-change"
            role="tabpanel"
            aria-labelledby="rail-tab-change"
            hidden={railTab !== 'change'}
            className="studio-work-content"
          >
            {hasRewrite && rewriteResult && (
              <RewriteFeedbackManager
                key={rewriteResult.id}
                selectedText={selectedHighlight}
                selectionRange={selectedRange}
                onClearSelection={clearSelection}
                editRequest={editRequest.resultId === rewriteResult.id ? editRequest : undefined}
              />
            )}
          </div>

          {/* Rewrite settings Tab */}
          <div
            id="rail-panel-settings"
            role="tabpanel"
            aria-labelledby="rail-tab-settings"
            hidden={railTab !== 'settings'}
            className="studio-work-content"
          >
            <div className="studio-inspector-scroll">
              <StudioDraftControls disabled={busy} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
