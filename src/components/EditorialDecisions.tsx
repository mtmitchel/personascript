import React, { useEffect, useRef, useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { PLAN_FIELD_LIMITS, PLAN_MAX_ITEMS, planMatchesSources } from '../editorialPlan';
import { getDraftParagraphs, sourceContainsPhrase } from '../sourceText';
import { EDITORIAL_PREFERENCES_MAX_CHARS } from '../writingPipeline';
import { modelDisplayName } from '../modelChoice';
import type { EditorialPlan, EditorialPlanState } from '../types';

type PlanItem = EditorialPlan['items'][number];
type Paragraph = ReturnType<typeof getDraftParagraphs>[number];

interface ItemReference {
  item: PlanItem;
  index: number;
  incomplete: boolean;
}

interface ParagraphGroup {
  id: number | null;
  text: string;
  items: ItemReference[];
  needsAttention: boolean;
}

const fieldClass = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-500';
const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-40';

const DECISION_LABELS: Record<PlanItem['decision'], string> = {
  keep: 'Keep',
  shorten: 'Shorten',
  cut: 'Cut',
};

const DECISION_OPTIONS: Array<{ value: PlanItem['decision']; label: string }> = [
  { value: 'keep', label: 'Keep the point' },
  { value: 'shorten', label: 'Keep it, shorter' },
  { value: 'cut', label: 'Drop the point' },
];

function findParagraphForItem(item: PlanItem, version: EditorialPlan['version'], paragraphs: Paragraph[]): Paragraph | undefined {
  if (version === 2) return paragraphs.find((paragraph) => paragraph.id === item.paragraphId);
  return paragraphs.find((paragraph) => sourceContainsPhrase(paragraph.text, item.sourcePhrase));
}

/** Missing text or an anchor that no longer matches the draft. */
function itemIsIncomplete(item: PlanItem, version: EditorialPlan['version'], paragraphs: Paragraph[]): boolean {
  if (!item.idea.trim() || !item.sourcePhrase.trim() || !item.limit.trim()) return true;
  if (item.sourceConflict && (!item.sourceConflict.draftQuote.trim() || !item.sourceConflict.briefQuote.trim())) return true;
  if (version === 2) {
    const paragraph = findParagraphForItem(item, version, paragraphs);
    return !paragraph || !sourceContainsPhrase(paragraph.text, item.sourcePhrase);
  }
  return false;
}

function itemNeedsAttention(item: PlanItem, version: EditorialPlan['version'], paragraphs: Paragraph[]): boolean {
  return itemIsIncomplete(item, version, paragraphs) || Boolean(item.sourceConflict);
}

function decisionLabel(decision: PlanItem['decision']): string {
  return DECISION_LABELS[decision] || decision;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function scrollItemIntoView(index: number) {
  requestAnimationFrame(() => {
    const field = document.getElementById(`plan-idea-${index}`) as HTMLTextAreaElement | null;
    if (!field) return;
    (field.closest('details') as HTMLDetailsElement | null)?.setAttribute('open', '');
    field.focus();
  });
}

function buildParagraphGroups(plan: EditorialPlan, paragraphs: Paragraph[]): ParagraphGroup[] {
  const groups = paragraphs.map((paragraph): ParagraphGroup => ({
    id: paragraph.id,
    text: paragraph.text,
    items: [],
    needsAttention: false,
  }));
  const byParagraph = new Map(groups.map((group) => [group.id, group]));
  const unassigned: ParagraphGroup = { id: null, text: '', items: [], needsAttention: false };

  plan.items.forEach((item, index) => {
    const paragraph = findParagraphForItem(item, plan.version, paragraphs);
    (paragraph ? byParagraph.get(paragraph.id)! : unassigned).items.push({ item, index, incomplete: itemIsIncomplete(item, plan.version, paragraphs) });
  });

  if (unassigned.items.length) groups.push(unassigned);
  return groups.map((group) => ({
    ...group,
    needsAttention: (group.id === null || (plan.version === 2 && group.items.length === 0))
      || group.items.some(({ item, incomplete }) => incomplete || Boolean(item.sourceConflict)),
  }));
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
    modelSettings,
  } = useWritingAssistant();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(!editorialPlan?.approved);
  const sources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences };
  const stale = Boolean(editorialPlan && !planMatchesSources(editorialPlan, sources));
  const approved = Boolean(editorialPlan?.approved && !stale);
  const busy = isPlanning || isRewriting || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  const plan = editorialPlan?.plan;
  const paragraphs = getDraftParagraphs(draftText);
  const groups = plan ? buildParagraphGroups(plan, paragraphs) : [];
  const attentionCount = groups.reduce((total, group) => total + group.items.filter(({ item, incomplete }) => incomplete || Boolean(item.sourceConflict)).length, 0);
  const showAttentionOnly = onlyAttention && attentionCount > 0;
  const visible = showAttentionOnly ? groups.filter((group) => group.needsAttention) : groups;
  const visibleGroupCount = visible.length;

  useEffect(() => {
    setExpanded(!approved);
  }, [approved]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: 'center' });
    errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  const propose = async () => {
    if (busy) return;
    setError(null);
    setOnlyAttention(false);
    try {
      await generateEditorialPlan();
      setExpanded(true);
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
    // An edited decision can become the last one needing attention. Drop the
    // attention-only view before it can resolve to an empty list.
    if (onlyAttention) setOnlyAttention(false);
    update({ ...plan, items: nextItems });
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
    setOnlyAttention(false);
    setExpanded(true);
    scrollItemIntoView(index);
  };

  const renderItem = (item: PlanItem, index: number, incomplete: boolean) => <li key={index} className="studio-decision">
    <div className="studio-decision-row">
      <p className="studio-decision-excerpt">{item.sourcePhrase.trim() || 'This decision lost the wording it was anchored to.'}</p>
      <fieldset className="studio-decision-answer">
        <legend>What happens to the quoted wording</legend>
        <div className="studio-answer-group">
          {DECISION_OPTIONS.map((option) => <label key={option.value} className="studio-answer-option">
            <input type="radio" name={`plan-decision-${index}`} value={option.value} checked={item.decision === option.value} onChange={() => updateItem(index, { decision: option.value })} className="sr-only" />
            <span>{option.label}</span>
          </label>)}
        </div>
      </fieldset>
      <p className="studio-decision-text">{item.idea.trim() || <em className="text-neutral-500">This decision still needs an instruction.</em>}</p>
      {item.limit.trim() && <p className="studio-decision-limit" title={item.limit.trim()}>{item.limit.trim()}</p>}
      {incomplete && <p className="studio-decision-flag">This decision is incomplete. Open it to finish the instruction.</p>}
      <div className="studio-chips">
        {item.sourceConflict && <span className="studio-chip is-conflict">Sources disagree</span>}
      </div>
    </div>

    <details className="studio-decision-details">
      <summary>Edit this decision</summary>
      <div className="studio-decision-details-body">
        {plan!.version === 2 && (
          <div className="space-y-2">
            <label htmlFor={`plan-paragraph-${index}`} className="block text-sm font-medium text-neutral-800">Paragraph this passage comes from</label>
            <select id={`plan-paragraph-${index}`} value={item.paragraphId || ''} onChange={(event) => {
              const value = Number(event.target.value);
              updateItem(index, { paragraphId: Number.isInteger(value) && value > 0 ? value : undefined });
            }} className={fieldClass}>
              <option value="">Choose a paragraph</option>
              {paragraphs.map((paragraph) => <option key={paragraph.id} value={paragraph.id}>Paragraph {paragraph.id}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor={`plan-idea-${index}`} className="block text-sm font-medium text-neutral-800">Instruction for the rewrite</label>
          <textarea id={`plan-idea-${index}`} rows={3} value={item.idea} maxLength={PLAN_FIELD_LIMITS.idea} onChange={(event) => updateItem(index, { idea: event.target.value })} className={fieldClass} />
        </div>

        <div className="space-y-2">
          <label htmlFor={`plan-limit-${index}`} className="block text-sm font-medium text-neutral-800">Preserve or avoid</label>
          <textarea id={`plan-limit-${index}`} rows={3} value={item.limit} maxLength={PLAN_FIELD_LIMITS.limit} onChange={(event) => updateItem(index, { limit: event.target.value })} className={fieldClass} />
        </div>

        <details className="studio-decision-advanced">
          <summary>More options</summary>
          <div className="studio-decision-advanced-body">
            <div className="space-y-2">
              <label htmlFor={`plan-source-${index}`} className="block text-sm font-medium text-neutral-800">Exact wording this decision is anchored to</label>
              <textarea id={`plan-source-${index}`} rows={2} value={item.sourcePhrase} maxLength={PLAN_FIELD_LIMITS.sourcePhrase} onChange={(event) => updateItem(index, { sourcePhrase: event.target.value })} className={fieldClass} />
              <p className="text-sm leading-5 text-neutral-600">The phrase is checked against {plan!.version === 2 ? 'this paragraph' : 'the draft or brief'}. Keep it word for word.</p>
            </div>

            <label className="flex items-start gap-2 text-sm leading-6 text-neutral-800">
              <input type="checkbox" checked={Boolean(item.sourceConflict)} onChange={(event) => updateItem(index, { sourceConflict: event.target.checked ? { draftQuote: '', briefQuote: '' } : undefined })} className="mt-1 h-4 w-4 shrink-0 accent-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900" />
              <span>The draft and the brief make conflicting statements here</span>
            </label>

            {item.sourceConflict && (
              <div className="space-y-3 border-l-2 border-amber-300 pl-3" role="group" aria-label="Conflict evidence">
                <p className="text-sm leading-5 text-amber-950">Quote both statements. A missing statement is not a contradiction.</p>
                <div className="space-y-2">
                  <label htmlFor={`plan-conflict-draft-${index}`} className="block text-sm font-medium text-neutral-800">Draft wording</label>
                  <textarea id={`plan-conflict-draft-${index}`} rows={2} maxLength={PLAN_FIELD_LIMITS.sourcePhrase} value={item.sourceConflict.draftQuote} onChange={(event) => updateItem(index, { sourceConflict: { ...item.sourceConflict!, draftQuote: event.target.value } })} className={fieldClass} />
                </div>
                <div className="space-y-2">
                  <label htmlFor={`plan-conflict-brief-${index}`} className="block text-sm font-medium text-neutral-800">Brief wording</label>
                  <textarea id={`plan-conflict-brief-${index}`} rows={2} maxLength={PLAN_FIELD_LIMITS.sourcePhrase} value={item.sourceConflict.briefQuote} onChange={(event) => updateItem(index, { sourceConflict: { ...item.sourceConflict!, briefQuote: event.target.value } })} className={fieldClass} />
                </div>
              </div>
            )}

            <button type="button" onClick={() => update({ ...plan!, items: plan!.items.filter((_, itemIndex) => itemIndex !== index) })} className="studio-decision-button is-danger">Remove this decision</button>
          </div>
        </details>
      </div>
    </details>
  </li>;

  return (
    <section aria-labelledby="editorial-decisions-title" className={`studio-review-panel ${!plan || (approved && !expanded) ? 'is-compact' : ''}`}>
      <div className="studio-review-head">
        <h2 id="editorial-decisions-title">{approved ? 'Suggestions approved' : 'Suggested changes'}</h2>
        {plan && <button id="btn-propose-decisions" type="button" disabled={busy} onClick={propose} className="studio-text-button">{isPlanning ? 'Refreshing…' : 'Refresh suggestions'}</button>}
      </div>

      {stale && <p role="status" className="studio-notice is-warning">The draft, brief, reader and purpose, or standing preferences changed. Review and approve the suggestions again before rewriting.</p>}

      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="studio-notice is-error focus:outline-none">{error}</p>}
      {isPlanning && <p role="status" className="studio-notice">Reading your draft, brief, reader and purpose, and standing preferences. These suggestions stay available until the new plan is ready.</p>}

      {plan && (
        <>
          {approved && (
            <button type="button" aria-expanded={expanded} aria-controls="editorial-decision-fields" disabled={busy} onClick={() => setExpanded((current) => !current)} className={buttonClass}>
              {expanded ? 'Hide suggestions' : 'Review suggestions'}
            </button>
          )}

          {(!approved || expanded) && (
            <fieldset id="editorial-decision-fields" disabled={busy} className="studio-review-fieldset">
              <legend className="sr-only">Suggested edit plan</legend>

              <div className="studio-decision-scope">
                <p className="studio-scope-count">
                  <span>{paragraphs.length} {pluralize(paragraphs.length, 'paragraph')}</span>
                  <span>{plan.items.length} {pluralize(plan.items.length, 'decision')}</span>
                  {attentionCount > 0
                    ? <span className="is-attention">{attentionCount} {pluralize(attentionCount, 'decision')} need you</span>
                    : <span>Nothing needs you</span>}
                </p>
                {attentionCount > 0 && (
                  <label className="studio-scope-toggle">
                    <input type="checkbox" checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)} className="h-4 w-4 shrink-0 accent-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900" />
                    <span>Show only what needs me</span>
                  </label>
                )}
              </div>

              <ol aria-label="Suggested decisions grouped by paragraph" className="studio-decision-list">
                {visible.map((group) => {
                  const newDecisions = group.id === null || group.items.length === 0;
                  const label = group.id === null ? 'Without a paragraph' : `Paragraph ${group.id}`;
                  return (
                    <li key={group.id === null ? 'unassigned' : group.id} className="studio-paragraph-group">
                      <details open={newDecisions}>
                        <summary className="studio-paragraph-header">
                          <span className="studio-paragraph-name">{label}</span>
                          <span className="studio-paragraph-meta">
                            {group.items.length > 0 && <span>{group.items.length} {pluralize(group.items.length, 'decision')}</span>}
                            {group.needsAttention && <span className="studio-chip is-attention">Needs you</span>}
                          </span>
                        </summary>

                        {group.text && (
                          <blockquote className="studio-paragraph-passage">{group.text}</blockquote>
                        )}

                        {group.items.length > 0 ? (
                          <ol aria-label={`Decisions for ${label.toLowerCase()}`} className="studio-decision-items">
                            {group.items.map(({ item, index, incomplete }) => renderItem(item, index, incomplete))}
                          </ol>
                        ) : (
                          <div className="studio-paragraph-empty">
                            <p>{group.id === null ? 'These decisions are not attached to a paragraph in the current draft. Open one and choose its paragraph.' : 'No decision covers this paragraph yet.'}</p>
                            <button type="button" disabled={plan.items.length >= PLAN_MAX_ITEMS} onClick={addDecision} className={buttonClass}>Add a decision</button>
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ol>

              {visibleGroupCount === 0 && (
                <p role="status" className="studio-check">
                  {showAttentionOnly ? 'Nothing needs your attention. Clear the filter to read every decision.' : 'No decisions to show.'}
                </p>
              )}

              <div className="studio-review-footer">
                <button type="button" disabled={plan.items.length >= PLAN_MAX_ITEMS} onClick={addDecision} className={buttonClass}>Add a decision</button>
                <p>{plan.items.length >= PLAN_MAX_ITEMS
                  ? `The plan has reached its ${PLAN_MAX_ITEMS}-decision limit.`
                  : 'The rewrite may reword anything it keeps. “Keep the point” retains this idea and its reasoning. “Keep it, shorter” retains the idea in less space. “Drop the point” removes it, including paraphrases.'}</p>
              </div>
            </fieldset>
          )}

          {(!approved || expanded) && <p className="studio-check" role="status">
            {approved ? 'Approved for the current source and preferences.' : stale ? 'Review these suggestions again before rewriting.' : 'Approving applies every decision above to the rewrite.'}
          </p>}
        </>
      )}
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
          <p><strong>{index + 1}. {decisionLabel(item.decision)}:</strong> {item.idea}</p>
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
