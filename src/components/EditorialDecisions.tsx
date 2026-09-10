import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { PLAN_FIELD_LIMITS, PLAN_MAX_ITEMS, planMatchesSources } from '../editorialPlan';
import { getDraftParagraphs, sourceContainsPhrase } from '../sourceText';
import { EDITORIAL_PREFERENCES_MAX_CHARS } from '../writingPipeline';
import type { EditorialPlan, EditorialPlanState } from '../types';

type PlanItem = EditorialPlan['items'][number];
type Paragraph = ReturnType<typeof getDraftParagraphs>[number];

interface ItemReference {
  item: PlanItem;
  index: number;
}

interface ParagraphSection {
  id: number | null;
  text: string;
  items: ItemReference[];
}

const fieldClass = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-500';
const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';
const inlineCheckboxClass = 'mt-0.5 h-4 w-4 shrink-0 accent-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900';

const TREATMENTS: Array<{ value: PlanItem['decision']; label: string }> = [
  { value: 'keep', label: 'Keep' },
  { value: 'shorten', label: 'Shorten' },
  { value: 'cut', label: 'Cut' },
];

function treatmentLabel(decision: PlanItem['decision']): string {
  return TREATMENTS.find((treatment) => treatment.value === decision)?.label || decision;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function findParagraphForItem(item: PlanItem, version: EditorialPlan['version'], paragraphs: Paragraph[]): Paragraph | undefined {
  if (version === 2) return paragraphs.find((paragraph) => paragraph.id === item.paragraphId);
  return paragraphs.find((paragraph) => sourceContainsPhrase(paragraph.text, item.sourcePhrase));
}

/** Missing text, or an anchor that no longer matches the draft. */
function itemIsIncomplete(item: PlanItem, version: EditorialPlan['version'], paragraphs: Paragraph[]): boolean {
  if (!item.idea.trim() || !item.sourcePhrase.trim() || !item.limit.trim()) return true;
  if (item.sourceConflict && (!item.sourceConflict.draftQuote.trim() || !item.sourceConflict.briefQuote.trim())) return true;
  if (version === 2) {
    const paragraph = findParagraphForItem(item, version, paragraphs);
    return !paragraph || !sourceContainsPhrase(paragraph.text, item.sourcePhrase);
  }
  return false;
}

/** A declared conflict whose two quotations have not both been evidenced yet. */
function conflictIsOpen(item: PlanItem): boolean {
  return Boolean(item.sourceConflict && (!item.sourceConflict.draftQuote.trim() || !item.sourceConflict.briefQuote.trim()));
}

/**
 * How many decisions still block approval, using the same shape checks the
 * validator applies so the panel and the action bar cannot disagree.
 */
export function planReadiness(plan: EditorialPlan, draftText: string): { blockers: number; total: number; openingJobMissing: boolean } {
  const paragraphs = getDraftParagraphs(draftText);
  const blockers = plan.items.filter((item) => {
    if (!item.idea.trim() || !item.sourcePhrase.trim() || !item.limit.trim()) return true;
    if (conflictIsOpen(item)) return true;
    const paragraph = plan.version === 2
      ? paragraphs.find((candidate) => candidate.id === item.paragraphId)
      : paragraphs.find((candidate) => sourceContainsPhrase(candidate.text, item.sourcePhrase));
    return !paragraph || !sourceContainsPhrase(paragraph.text, item.sourcePhrase);
  }).length;
  return { blockers, total: plan.items.length, openingJobMissing: !plan.openingJob.trim() };
}

function itemsDiffer(current: PlanItem, baseline: PlanItem | undefined): boolean {
  if (!baseline) return true;
  return current.decision !== baseline.decision
    || current.idea !== baseline.idea
    || current.limit !== baseline.limit
    || current.sourcePhrase !== baseline.sourcePhrase
    || current.paragraphId !== baseline.paragraphId;
}

/** Fixed-row textareas hid part of a long constraint behind an inner scrollbar. Grow to fit instead. */
const AutoGrowTextarea: React.FC<{
  id: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  ariaDescribedBy?: string;
}> = ({ id, value, maxLength, onChange, ariaDescribedBy }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = useCallback(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    // +2px absorbs sub-pixel line-box rounding so the last line is never clipped.
    field.style.height = `${field.scrollHeight + 2}px`;
  }, []);

  useLayoutEffect(grow, [grow, value]);

  return <textarea
    ref={ref}
    id={id}
    rows={1}
    value={value}
    maxLength={maxLength}
    aria-describedby={ariaDescribedBy}
    onChange={(event) => { onChange(event.target.value); grow(); }}
    className={`${fieldClass} resize-none overflow-hidden`}
  />;
};

/** Paragraphs are separators in a flat queue, not containers the reader must open first. */
function buildParagraphSections(plan: EditorialPlan, paragraphs: Paragraph[]): ParagraphSection[] {
  const sections = paragraphs.map((paragraph): ParagraphSection => ({ id: paragraph.id, text: paragraph.text, items: [] }));
  const byParagraph = new Map(sections.map((section) => [section.id, section]));
  const unassigned: ParagraphSection = { id: null, text: '', items: [] };

  plan.items.forEach((item, index) => {
    const paragraph = findParagraphForItem(item, plan.version, paragraphs);
    (paragraph ? byParagraph.get(paragraph.id)! : unassigned).items.push({ item, index });
  });

  if (unassigned.items.length) sections.push(unassigned);
  return sections;
}

export const EditorialDecisions: React.FC = () => {
  const {
    editorialPlan,
    isPlanning,
    generateEditorialPlan,
    editEditorialPlan,
    draftText,
    projectBrief,
    readerPurpose,
    editorialPreferences,
    isRewriting,
    isLearningFeedback,
    isUploadingDraft,
    isUploadingBrief,
  } = useWritingAssistant();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<'all' | 'attention'>('all');
  const [baseline, setBaseline] = useState<PlanItem[] | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusIndex = useRef<number | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const sources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences };
  const stale = Boolean(editorialPlan && !planMatchesSources(editorialPlan, sources));
  const approved = Boolean(editorialPlan?.approved && !stale);
  const busy = isPlanning || isRewriting || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  const plan = editorialPlan?.plan;
  const paragraphs = getDraftParagraphs(draftText);

  // The baseline is the plan as generated. It cannot see changes made before a
  // reload, so "changed by you" counts this session only.
  const wasPlanning = useRef(isPlanning);
  useEffect(() => {
    if (wasPlanning.current && !isPlanning && editorialPlan) setBaseline(editorialPlan.plan.items.map((item) => ({ ...item })));
    else if (baseline === null && editorialPlan) setBaseline(editorialPlan.plan.items.map((item) => ({ ...item })));
    wasPlanning.current = isPlanning;
  }, [isPlanning, editorialPlan, baseline]);

  const sections = useMemo(() => (plan ? buildParagraphSections(plan, paragraphs) : []), [plan, paragraphs]);

  const itemState = useMemo(() => {
    const rows = new Map<number, { item: PlanItem; index: number; incomplete: boolean; needsReview: boolean; changed: boolean; conflictOpen: boolean; hasConflict: boolean }>();
    if (!plan) return rows;
    sections.forEach((section) => section.items.forEach(({ item, index }) => {
      const incomplete = itemIsIncomplete(item, plan.version, paragraphs);
      const conflictOpen = conflictIsOpen(item);
      rows.set(index, {
        item, index, incomplete, conflictOpen,
        hasConflict: Boolean(item.sourceConflict),
        needsReview: incomplete || conflictOpen,
        changed: itemsDiffer(item, baseline?.[index]),
      });
    }));
    return rows;
  }, [plan, sections, paragraphs, baseline]);

  const queue = useMemo(() => sections
    .map((section) => ({ ...section, items: listFilter === 'attention' ? section.items.filter(({ index }) => itemState.get(index)?.needsReview) : section.items }))
    .filter((section) => section.items.length > 0), [sections, listFilter, itemState]);

  const flatQueue = useMemo(() => queue.flatMap((section) => section.items.map(({ index }) => index)), [queue]);
  const detailPosition = detailIndex === null ? -1 : flatQueue.indexOf(detailIndex);
  const detailEntry = detailIndex === null ? undefined : itemState.get(detailIndex);

  const distribution = useMemo(() => {
    const counts: Record<PlanItem['decision'], number> = { keep: 0, shorten: 0, cut: 0 };
    plan?.items.forEach((item) => { counts[item.decision] += 1; });
    return counts;
  }, [plan]);

  const changedCount = useMemo(() => [...(plan?.items ?? [])].reduce((total, item, index) => total + (itemsDiffer(item, baseline?.[index]) ? 1 : 0), 0), [plan, baseline]);
  const entries = useMemo(() => [...itemState.values()], [itemState]);
  const readiness = useMemo(() => (plan ? planReadiness(plan, draftText) : { blockers: 0, total: 0, openingJobMissing: false }), [plan, draftText]);
  const conflictCount = entries.filter((entry) => entry.hasConflict).length;
  const openConflictCount = entries.filter((entry) => entry.conflictOpen).length;
  const attentionCount = entries.filter((entry) => entry.needsReview).length;
  const canApprove = Boolean(plan?.items.length) && !readiness.blockers && !readiness.openingJobMissing;

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: 'center' });
    errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  // Detail replaces the queue. Entering lands on the title and returning scrolls
  // the decision the reader left back into view; both are done here rather than
  // by focus, which lets the browser pick an unpredictable offset.
  useLayoutEffect(() => {
    if (view === 'detail') {
      detailHeadingRef.current?.scrollIntoView({ block: 'start' });
      detailHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    if (returnFocusIndex.current === null) return;
    const index = returnFocusIndex.current;
    returnFocusIndex.current = null;
    const button = document.getElementById(`plan-open-${index}`);
    button?.scrollIntoView({ block: 'center' });
    button?.focus({ preventScroll: true });
  }, [view]);

  const openDetail = (index: number) => {
    returnFocusIndex.current = index;
    setDetailIndex(index);
    setView('detail');
  };

  const closeDetail = () => setView('list');

  const step = (offset: number) => {
    const next = detailPosition + offset;
    if (next < 0 || next >= flatQueue.length) return;
    setDetailIndex(flatQueue[next]);
  };

  const propose = async () => {
    if (busy) return;
    setError(null);
    setListFilter('all');
    setView('list');
    setDetailIndex(null);
    try {
      await generateEditorialPlan();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create the edit plan. Try again.');
    }
  };

  const update = (next: EditorialPlan) => {
    if (busy) return;
    setError(null);
    editEditorialPlan(next);
  };

  const updateItem = (index: number, changes: Partial<PlanItem>) => {
    if (!plan || busy) return;
    const nextItems = plan.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item);
    update({ ...plan, items: nextItems });
  };

  const removeItem = (index: number) => {
    if (!plan || busy) return;
    setView('list');
    setDetailIndex(null);
    update({ ...plan, items: plan.items.filter((_, itemIndex) => itemIndex !== index) });
  };

  const addDecision = () => {
    if (!plan || busy || plan.items.length >= PLAN_MAX_ITEMS) return;
    const index = plan.items.length;
    const target = plan.version === 2
      ? paragraphs.find((paragraph) => !plan.items.some((item) => item.paragraphId === paragraph.id)) || paragraphs[0]
      : undefined;
    update({
      ...plan,
      items: [...plan.items, {
        ...(plan.version === 2 ? { paragraphId: target?.id || 1 } : {}),
        idea: '',
        sourcePhrase: target?.text.slice(0, PLAN_FIELD_LIMITS.sourcePhrase) || '',
        decision: 'keep',
        limit: '',
      }],
    });
    setListFilter('all');
    openDetail(index);
  };

  if (!plan || plan.items.length === 0) {
    return <section aria-label="Rewrite plan" className="studio-review-panel">
      <div className="studio-review-head">
        <button id="btn-propose-decisions" type="button" disabled={busy} onClick={propose} className="studio-text-button">{isPlanning ? 'Refreshing…' : 'Refresh suggestions'}</button>
      </div>
      {stale && <p role="status" className="studio-notice is-warning">The draft, brief, reader and purpose, or standing preferences changed. Review and approve the plan again before rewriting.</p>}
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-notice is-error focus:outline-none">{error}</p>}
      {isPlanning && <p role="status" className="studio-notice">Reading your draft, brief, reader and purpose, and standing preferences. These suggestions stay available until the new plan is ready.</p>}
    </section>;
  }

  const renderRow = (index: number, paragraphText: string) => {
    const entry = itemState.get(index);
    if (!entry) return null;
    const { item, incomplete, changed, conflictOpen, hasConflict } = entry;
    const idea = item.idea.trim();
    const phrase = item.sourcePhrase.trim();
    const limit = item.limit.trim();
    // The separator above already shows the paragraph. Repeat the wording only
    // when this decision anchors to a fragment of it rather than the whole.
    const showPhrase = Boolean(phrase) && phrase !== paragraphText.trim();
    return <li key={index} className="studio-decision">
      <h3 className={`studio-decision-text ${idea ? '' : 'is-missing'}`}>{idea || 'This decision still needs an instruction.'}</h3>
      {showPhrase && <blockquote className="studio-decision-excerpt">{phrase}</blockquote>}
      {!phrase && <p className="studio-decision-excerpt is-missing">This decision lost the wording it was anchored to.</p>}
      {limit && <p className="studio-decision-limit">{limit}</p>}

      <fieldset className="studio-treatment">
        <legend className="studio-treatment-label">Treatment</legend>
        <div className="studio-treatment-options">
          {TREATMENTS.map((treatment) => <label key={treatment.value} className={`studio-treatment-option is-${treatment.value}`}>
            <input type="radio" name={`plan-decision-${index}`} value={treatment.value} checked={item.decision === treatment.value} onChange={() => updateItem(index, { decision: treatment.value })} className="sr-only" aria-label={`Treatment for this decision: ${treatment.label}`} />
            <span>{treatment.label}</span>
          </label>)}
        </div>
      </fieldset>

      <div className="studio-decision-foot">
        <div className="studio-chips">
          {incomplete && <span className="studio-chip is-attention">Needs review</span>}
          {hasConflict && <span className={`studio-chip ${conflictOpen ? 'is-conflict' : 'is-resolved'}`}>{conflictOpen ? 'Conflict needs evidence' : 'Conflict evidenced'}</span>}
          {changed && <span className="studio-chip">Changed by you</span>}
        </div>
        <button id={`plan-open-${index}`} type="button" onClick={() => openDetail(index)} className="studio-decision-button">Open decision</button>
      </div>
    </li>;
  };

  const renderDetail = (index: number) => {
    const entry = itemState.get(index);
    if (!entry) return null;
    const { item, incomplete, conflictOpen } = entry;
    return <div className="studio-detail">
      <div className="studio-detail-head">
        <button type="button" onClick={closeDetail} className="studio-decision-button">← Rewrite plan</button>
        <p className="studio-detail-progress">Decision {detailPosition + 1} of {flatQueue.length}</p>
        <div className="studio-detail-steps">
          <button type="button" disabled={detailPosition <= 0} onClick={() => step(-1)} className="studio-decision-button">‹ Previous</button>
          <button type="button" disabled={detailPosition >= flatQueue.length - 1} onClick={() => step(1)} className="studio-decision-button">Next ›</button>
        </div>
      </div>

      <h3 ref={detailHeadingRef} tabIndex={-1} className="studio-detail-title">{item.idea.trim() || 'Decision without an instruction'}</h3>
      <div className="studio-chips">
        {incomplete && <span className="studio-chip is-attention">Needs review</span>}
        {conflictOpen && <span className="studio-chip is-conflict">Conflict</span>}
      </div>

      <fieldset disabled={busy} className="studio-detail-fields">
        <legend className="sr-only">Decision {detailPosition + 1} of {flatQueue.length}</legend>

        <div className="studio-field">
          <label htmlFor={`plan-idea-${index}`} className="studio-field-label">Instruction</label>
          <AutoGrowTextarea id={`plan-idea-${index}`} value={item.idea} maxLength={PLAN_FIELD_LIMITS.idea} onChange={(value) => updateItem(index, { idea: value })} />
        </div>

        <div className="studio-treatment studio-treatment-detail">
          <span className="studio-treatment-label">Treatment</span>
          <div className="studio-treatment-options">
            {TREATMENTS.map((treatment) => <label key={treatment.value} className={`studio-treatment-option is-${treatment.value}`}>
              <input type="radio" name={`plan-detail-decision-${index}`} value={treatment.value} checked={item.decision === treatment.value} onChange={() => updateItem(index, { decision: treatment.value })} className="sr-only" aria-label={`Treatment for this decision: ${treatment.label}`} />
              <span>{treatment.label}</span>
            </label>)}
          </div>
        </div>

        <div className="studio-field">
          <label htmlFor={`plan-source-${index}`} className="studio-field-label">Source anchor</label>
          <AutoGrowTextarea id={`plan-source-${index}`} value={item.sourcePhrase} maxLength={PLAN_FIELD_LIMITS.sourcePhrase}
            ariaDescribedBy={`plan-source-note-${index}`} onChange={(value) => updateItem(index, { sourcePhrase: value })} />
          <p id={`plan-source-note-${index}`} className="studio-field-note">Must match the source word for word. The rewrite may still reword it.</p>
        </div>

        <div className="studio-field">
          <label htmlFor={`plan-limit-${index}`} className="studio-field-label">Constraint</label>
          <AutoGrowTextarea id={`plan-limit-${index}`} value={item.limit} maxLength={PLAN_FIELD_LIMITS.limit} onChange={(value) => updateItem(index, { limit: value })} />
        </div>

        <div className="studio-field">
          <label className="studio-checkbox">
            <input type="checkbox" checked={Boolean(item.sourceConflict)} onChange={(event) => updateItem(index, { sourceConflict: event.target.checked ? { draftQuote: '', briefQuote: '' } : undefined })} className={inlineCheckboxClass} />
            <span>The draft and the brief make conflicting statements here</span>
          </label>
          {item.sourceConflict && <div className="studio-conflict" role="group" aria-label="Conflict evidence">
            <p className="studio-field-note">Quote both statements. A missing statement is not a contradiction.</p>
            <div className="studio-field">
              <label htmlFor={`plan-conflict-draft-${index}`} className="studio-field-label">Draft wording</label>
              <AutoGrowTextarea id={`plan-conflict-draft-${index}`} value={item.sourceConflict.draftQuote} maxLength={PLAN_FIELD_LIMITS.sourcePhrase}
                onChange={(value) => updateItem(index, { sourceConflict: { ...item.sourceConflict!, draftQuote: value } })} />
            </div>
            <div className="studio-field">
              <label htmlFor={`plan-conflict-brief-${index}`} className="studio-field-label">Brief wording</label>
              <AutoGrowTextarea id={`plan-conflict-brief-${index}`} value={item.sourceConflict.briefQuote} maxLength={PLAN_FIELD_LIMITS.sourcePhrase}
                onChange={(value) => updateItem(index, { sourceConflict: { ...item.sourceConflict!, briefQuote: value } })} />
            </div>
          </div>}
        </div>

        <details className="studio-detail-more">
          <summary>More options</summary>
          <div className="studio-detail-more-body">
            {plan!.version === 2 && <div className="studio-field">
              <label htmlFor={`plan-paragraph-${index}`} className="studio-field-label">Paragraph this passage comes from</label>
              <select id={`plan-paragraph-${index}`} value={item.paragraphId || ''} onChange={(event) => {
                const value = Number(event.target.value);
                updateItem(index, { paragraphId: Number.isInteger(value) && value > 0 ? value : undefined });
              }} className={fieldClass}>
                <option value="">Choose a paragraph</option>
                {paragraphs.map((paragraph) => <option key={paragraph.id} value={paragraph.id}>Paragraph {paragraph.id}</option>)}
              </select>
            </div>}
            <button type="button" disabled={busy} onClick={() => removeItem(index)} className="studio-decision-button is-danger">Remove this decision</button>
          </div>
        </details>

        <button type="button" onClick={closeDetail} className={buttonClass}>Done</button>
      </fieldset>
    </div>;
  };

  return (
    <section aria-label="Rewrite plan" className="studio-review-panel">
      <div className="studio-review-head">
        <button id="btn-propose-decisions" type="button" disabled={busy} onClick={propose} className="studio-text-button">{isPlanning ? 'Refreshing…' : 'Refresh suggestions'}</button>
      </div>

      {stale && <p role="status" className="studio-notice is-warning">The draft, brief, reader and purpose, or standing preferences changed. Review and approve the plan again before rewriting.</p>}
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-notice is-error focus:outline-none">{error}</p>}
      {isPlanning && <p role="status" className="studio-notice">Reading your draft, brief, reader and purpose, and standing preferences. These suggestions stay available until the new plan is ready.</p>}

      {view === 'detail' && detailIndex !== null
        ? renderDetail(detailIndex)
        : <div className="studio-review-body">
          <div className="studio-overview">
            <p className="studio-scope-count">
              <span>{paragraphs.length} {pluralize(paragraphs.length, 'paragraph')}</span>
              <span>{plan.items.length} {pluralize(plan.items.length, 'decision')}</span>
            </p>
            <p className="studio-treatment-mix">
              <span>{distribution.keep} Keep</span>
              <span>{distribution.shorten} Shorten</span>
              <span>{distribution.cut} Cut</span>
            </p>
            <p className="studio-overview-flags">
              <span className={conflictCount ? 'is-conflict' : ''}>{conflictCount} {pluralize(conflictCount, 'conflict')}</span>
              <span className={changedCount ? 'is-changed' : ''} title="Counted for this session only; it cannot see changes made before a reload.">{changedCount} changed by you</span>
            </p>            <div className="studio-filter" role="group" aria-label="Filter decisions">
              <button type="button" aria-pressed={listFilter === 'all'} onClick={() => { setListFilter('all'); setView('list'); }}>All decisions</button>
              <button type="button" aria-pressed={listFilter === 'attention'} onClick={() => { setListFilter('attention'); setView('list'); }}>Needs review{attentionCount ? ` (${attentionCount})` : ''}</button>
            </div>
          </div>

          <fieldset disabled={busy} className="studio-review-fieldset">
            <legend className="sr-only">Rewrite plan</legend>

            <div className="studio-field studio-opening-job">
              <label htmlFor="plan-opening-job" className="studio-field-label">What this rewrite must open with</label>
              <AutoGrowTextarea id="plan-opening-job" value={plan.openingJob} maxLength={PLAN_FIELD_LIMITS.openingJob}
                onChange={(value) => update({ ...plan, openingJob: value })} />
            </div>

            <ol aria-label="Decisions in draft order" className="studio-decision-list">
              {queue.map((section) => {
                const label = section.id === null ? 'Not attached to a paragraph' : `Paragraph ${section.id}`;
                return <li key={section.id === null ? 'unassigned' : section.id} className="studio-paragraph-section">
                  <div className="studio-paragraph-separator">
                    <h3 className="studio-paragraph-name">{label}</h3>
                  </div>
                  {section.text && <p className="studio-paragraph-passage">{section.text}</p>}
                  <ol aria-label={`Decisions for ${label.toLowerCase()}`} className="studio-decision-items">
                    {section.items.map(({ index }) => renderRow(index, section.text))}
                  </ol>
                </li>;
              })}
            </ol>

            {flatQueue.length === 0 && (
              <p role="status" className="studio-check">
                {listFilter === 'attention' ? 'Nothing needs review. Choose All decisions to read every one.' : 'No decisions to show.'}
              </p>
            )}

            <div className="studio-review-footer">
              <button type="button" disabled={busy || plan.items.length >= PLAN_MAX_ITEMS} onClick={addDecision} className={buttonClass}>Add a decision</button>
              <p>{plan.items.length >= PLAN_MAX_ITEMS
                ? `The plan has reached its ${PLAN_MAX_ITEMS}-decision limit.`
                : 'The rewrite may reword anything it keeps. “Keep” retains the instruction and its reasoning, “Shorten” retains it in less space, and “Cut” removes it, including paraphrases.'}</p>
            </div>
          </fieldset>
        </div>}

      <div className="studio-summary">
        <h3 className="studio-summary-title">Review summary</h3>
        <p className="studio-treatment-mix">
          <span>{distribution.keep} Keep</span>
          <span>{distribution.shorten} Shorten</span>
          <span>{distribution.cut} Cut</span>
          <span>{conflictCount} {pluralize(conflictCount, 'conflict')}</span>
          <span>{changedCount} changed by you</span>
        </p>
        <p role="status" className={`studio-check ${canApprove ? '' : 'is-blocked'}`}>
          {!canApprove
            ? readiness.blockers
              ? `Approval is refused until ${readiness.blockers} of ${readiness.total} decisions ${readiness.blockers === 1 ? 'has' : 'have'} an instruction, a source anchor that still matches the draft, a constraint, and evidence for any conflict.${openConflictCount ? ` ${openConflictCount} of those ${pluralize(openConflictCount, 'conflict')} still need both quoted statements.` : ''}`
              : 'Approval is refused until the rewrite has an opening job.'
            : approved
              ? 'Approved for the current draft and preferences.'
              : stale
                ? 'The sources changed. Approve the plan again before rewriting.'
                : 'Every decision has an instruction, a source anchor, and a constraint. Approving applies all of them to the rewrite.'}
        </p>
      </div>
    </section>
  );
};

export const SavedEditorialDecisions: React.FC<{ state: EditorialPlanState }> = ({ state }) => (
  <details className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
    <summary className="cursor-pointer font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">Edit plan used for this version · {state.plan.items.length} {pluralize(state.plan.items.length, 'suggestion')}</summary>
    <div className="mt-3 space-y-3">
      <p><strong>Opening job:</strong> {state.plan.openingJob}</p>
      {state.sources.editorialPreferences !== undefined && <details className="rounded-md bg-neutral-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">Your standing preferences used for this version</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{state.sources.editorialPreferences || 'No standing preferences.'}</p>
      </details>}
      <ol className="max-h-96 overflow-y-auto divide-y divide-neutral-200">
        {state.plan.items.map((item, index) => <li key={index} className="space-y-1.5 py-3">
          <p><strong>{index + 1}. {treatmentLabel(item.decision)}:</strong> {item.idea}</p>
          <p className="text-neutral-600">Exact source phrase: “{item.sourcePhrase}”</p>
          <p>{item.limit}</p>
          {item.sourceConflict && <div className="border-l-2 border-amber-300 pl-2 text-neutral-600">
            <p>Draft: “{item.sourceConflict.draftQuote}”</p>
            <p>Brief: “{item.sourceConflict.briefQuote}”</p>
          </div>}
        </li>)}
      </ol>
    </div>
  </details>
);

export const DefaultEditorialRules: React.FC = () => {
  const { editorialPreferences, setEditorialPreferences, isPlanning, isRewriting, isLearningFeedback, isUploadingDraft, isUploadingBrief } = useWritingAssistant();
  const busy = isPlanning || isRewriting || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  return <details className="text-sm">
    <summary className="cursor-pointer font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">Standing editorial preferences</summary>
    <div className="mt-3 space-y-2.5">
      <label htmlFor="standing-editorial-preferences" className="block text-sm font-medium text-neutral-800">Preferences for new rewrites</label>
      <textarea
        id="standing-editorial-preferences"
        rows={7}
        value={editorialPreferences}
        disabled={busy}
        aria-invalid={editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS}
        aria-describedby={editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS ? 'editorial-preferences-error' : undefined}
        maxLength={EDITORIAL_PREFERENCES_MAX_CHARS}
        onChange={(event) => setEditorialPreferences(event.target.value)}
        className={fieldClass}
      />
      {editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS && (
        <p id="editorial-preferences-error" role="alert" className="text-sm leading-5 text-rose-700">Shorten these preferences to {EDITORIAL_PREFERENCES_MAX_CHARS.toLocaleString()} characters or fewer before creating an edit plan or rewriting. Your saved text is available above.</p>
      )}
      <p className="text-sm leading-5 text-neutral-600">Saved across cases in this browser. Edit or clear these preferences at any time. Changes require reviewing the current suggestions again.</p>
    </div>
  </details>;
};
