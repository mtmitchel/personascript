import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { PLAN_FIELD_LIMITS, PLAN_MAX_ITEMS } from '../editorialPlan';
import { getDraftParagraphs, sourceContainsPhrase } from '../sourceText';
import { compactPlanText, extraLimitText, planPreview, planReadiness, planStaleReasons, summarizeEditorialPlan } from '../utils/editorialSummary';
import type { PlanRow } from '../utils/editorialSummary';
import type { EditorialPlan, EditorialPlanState } from '../types';

type PlanItem = EditorialPlan['items'][number];
const fieldClass = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:bg-neutral-50 disabled:text-neutral-500';
const TREATMENTS: Array<{ value: PlanItem['decision']; label: string }> = [
  { value: 'keep', label: 'Keep' }, { value: 'shorten', label: 'Shorten' }, { value: 'cut', label: 'Cut' },
];
const treatmentLabel = (decision: PlanItem['decision']) => TREATMENTS.find(treatment => treatment.value === decision)?.label || decision;
const pluralize = (count: number, singular: string) => count === 1 ? singular : `${singular}s`;
const joinNames = (names: string[]) => names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

const AutoGrowTextarea: React.FC<{
  id: string; value: string; maxLength: number; onChange: (value: string) => void;
}> = ({ id, value, maxLength, onChange }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = useCallback(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    // +2px absorbs sub-pixel line-box rounding so the last line is never clipped.
    field.style.height = `${field.scrollHeight + 2}px`;
  }, []);
  useLayoutEffect(grow, [grow, value]);
  return <textarea ref={ref} id={id} rows={1} value={value} maxLength={maxLength}
    onChange={event => { onChange(event.target.value); grow(); }} className={`${fieldClass} resize-none overflow-hidden`}/>;
};

/**
 * The plan is one list, not a queue or a wall: every cut, shorten, conflict,
 * and claim-bearing keep is a visible row in draft order; identical repeats
 * share one row; plain keeps collapse to a count. Editing expands a row in
 * place — the list itself never navigates away.
 */
export const EditorialDecisions: React.FC = () => {
  const { editorialPlan, isPlanning, generateEditorialPlan, editEditorialPlan, draftText, projectBrief,
    readerPurpose, editorialPreferences, customDirectives, isRewriting, isLearningFeedback, isUploadingDraft, isUploadingBrief } = useWritingAssistant();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [keepsOpen, setKeepsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const busy = isPlanning || isRewriting || isLearningFeedback || isUploadingDraft || isUploadingBrief;
  const plan = editorialPlan?.plan;
  const sources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences, customInstructions: customDirectives };
  const staleReasons = editorialPlan ? planStaleReasons(editorialPlan, sources) : [];
  const paragraphs = getDraftParagraphs(draftText);
  const readiness = plan ? planReadiness(plan, draftText, projectBrief) : undefined;
  const summary = plan ? summarizeEditorialPlan(plan) : undefined;
  const incomplete = new Set(readiness?.incomplete ?? []);

  useLayoutEffect(() => {
    if (expanded !== null) editor.current?.querySelector<HTMLElement>('textarea, select, input')?.focus({ preventScroll: true });
  }, [expanded]);

  const update = (next: EditorialPlan) => {
    if (busy || !plan) return;
    setError(null);
    editEditorialPlan(next);
  };
  const updateItems = (indices: number[], changes: Partial<PlanItem>) => {
    if (!plan) return;
    update({ ...plan, items: plan.items.map((entry, i) => indices.includes(i) ? { ...entry, ...changes } : entry) });
  };
  const propose = async () => {
    if (busy) return;
    setError(null);
    try { await generateEditorialPlan(); setExpanded(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare the plan. Try again.'); }
  };
  const add = () => {
    if (!plan || busy || plan.items.length >= PLAN_MAX_ITEMS) return;
    const target = paragraphs.find(p => !plan.items.some(entry => entry.paragraphId === p.id)) || paragraphs[0];
    setExpanded(plan.items.length);
    update({ ...plan, items: [...plan.items, { idea: '', limit: '', sourcePhrase: target?.text.slice(0, PLAN_FIELD_LIMITS.sourcePhrase) || '', decision: 'keep',
      ...(plan.version === 2 ? { paragraphId: target?.id || 1 } : {}) }] });
  };
  const removeIndices = (indices: number[]) => {
    if (!plan || busy) return;
    setExpanded(null);
    update({ ...plan, items: plan.items.filter((_, i) => !indices.includes(i)) });
  };
  const collapse = (rowKey: number) => {
    setExpanded(null);
    requestAnimationFrame(() => document.getElementById(`plan-row-edit-${rowKey}`)?.focus({ preventScroll: true }));
  };

  if (!plan || !summary || !readiness) return null;
  const paragraphRef = (item: PlanItem) => item.paragraphId ?? paragraphs.find(p => sourceContainsPhrase(p.text, item.sourcePhrase))?.id;
  const rowRefs = (row: PlanRow) => [...new Set(row.indices.map(i => paragraphRef(plan.items[i])).filter((id): id is number => id !== undefined))].map(id => `¶${id}`).join(', ');

  const renderEditor = (row: PlanRow) => {
    const { indices } = row;
    const grouped = indices.length > 1;
    const item = plan.items[indices[0]];
    const key = indices[0];
    return <div ref={editor} id={`plan-editor-${key}`} className="studio-plan-editor">
      <fieldset disabled={busy} className="studio-detail-fields">
        <div className="studio-field">
          <label htmlFor={`plan-idea-${key}`} className="studio-field-label">{grouped ? `Instruction · applies to all ${indices.length} passages` : 'Instruction'}</label>
          <AutoGrowTextarea id={`plan-idea-${key}`} value={item.idea} maxLength={PLAN_FIELD_LIMITS.idea} onChange={value => updateItems(indices, { idea: value })}/>
        </div>
        <div className="studio-field">
          <span className="studio-field-label" id={`plan-treatment-label-${key}`}>Use this idea</span>
          <div className="studio-treatment-options" role="radiogroup" aria-labelledby={`plan-treatment-label-${key}`}>
            {TREATMENTS.map(treatment => <label key={treatment.value} className={`studio-treatment-option${item.decision === treatment.value ? ' is-selected' : ''}`}>
              <input type="radio" name={`plan-treatment-${key}`} checked={item.decision === treatment.value}
                onChange={() => updateItems(indices, { decision: treatment.value })}/>
              <span>{treatment.label}</span>
            </label>)}
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor={`plan-limit-${key}`} className="studio-field-label">What must stay true?</label>
          <AutoGrowTextarea id={`plan-limit-${key}`} value={item.limit} maxLength={PLAN_FIELD_LIMITS.limit} onChange={value => updateItems(indices, { limit: value })}/>
        </div>
        {grouped ? <div className="studio-field">
          <span className="studio-field-label">Source passages</span>
          <ul className="studio-plan-occurrences">
            {indices.map(i => {
              const entry = plan.items[i];
              const ref = paragraphRef(entry);
              return <li key={i}>
                <div className="studio-plan-occurrence-head">
                  <span className="studio-plan-refs">{ref ? `¶${ref}` : 'Source'}</span>
                  <button type="button" className="studio-decision-button is-danger" onClick={() => removeIndices([i])}>Remove</button>
                </div>
                {incomplete.has(i)
                  ? <><label className="sr-only" htmlFor={`plan-source-${i}`}>Exact source wording for passage {ref ?? i + 1}</label>
                      <AutoGrowTextarea id={`plan-source-${i}`} value={entry.sourcePhrase} maxLength={PLAN_FIELD_LIMITS.sourcePhrase} onChange={value => updateItems([i], { sourcePhrase: value })}/></>
                  : <blockquote>{entry.sourcePhrase || 'Missing source wording'}</blockquote>}
              </li>;
            })}
          </ul>
          <p className="studio-field-note">These passages share the instruction above. Remove one to edit it separately.</p>
        </div> : <>
          <div className="studio-field">
            <label htmlFor={`plan-source-${key}`} className="studio-field-label">Exact source wording</label>
            <AutoGrowTextarea id={`plan-source-${key}`} value={item.sourcePhrase} maxLength={PLAN_FIELD_LIMITS.sourcePhrase} onChange={value => updateItems(indices, { sourcePhrase: value })}/>
            <p className="studio-field-note">Must match the source word for word. The rewrite may still reword it.</p>
          </div>
          {plan.version === 2 && <label className="studio-field">
            <span className="studio-field-label">Source paragraph</span>
            <select value={item.paragraphId || ''} onChange={event => updateItems(indices, { paragraphId: Number(event.target.value) || undefined })} className={fieldClass}>
              <option value="">Choose a paragraph</option>
              {paragraphs.map(p => <option key={p.id} value={p.id}>{p.id}. {planPreview(p.text, 90)}</option>)}
            </select>
          </label>}
          <label className="studio-checkbox"><input type="checkbox" checked={Boolean(item.sourceConflict)}
            onChange={event => updateItems(indices, { sourceConflict: event.target.checked ? { draftQuote: '', briefQuote: '' } : undefined })}/>The draft and brief conflict</label>
          {item.sourceConflict && <div className="studio-conflict" role="group" aria-label="Source conflict">
            <p className="studio-field-note">Quote both statements exactly. A missing statement is not a contradiction.</p>
            {(['draftQuote', 'briefQuote'] as const).map(quoteKey => <div className="studio-field" key={quoteKey}>
              <label htmlFor={`plan-conflict-${quoteKey}-${key}`} className="studio-field-label">{quoteKey === 'draftQuote' ? 'Draft quotation' : 'Brief quotation'}</label>
              <AutoGrowTextarea id={`plan-conflict-${quoteKey}-${key}`} value={item.sourceConflict![quoteKey]} maxLength={PLAN_FIELD_LIMITS.sourcePhrase}
                onChange={value => updateItems(indices, { sourceConflict: { ...item.sourceConflict!, [quoteKey]: value } })}/>
            </div>)}
          </div>}
          <button type="button" className="studio-decision-button is-danger" onClick={() => removeIndices(indices)}>Remove decision</button>
        </>}
      </fieldset>
    </div>;
  };

  const renderRow = (row: PlanRow) => {
    const { item, indices } = row;
    const key = indices[0];
    const isOpen = expanded !== null && indices.includes(expanded);
    const limit = extraLimitText(item);
    const refs = rowRefs(row);
    const needsFixing = indices.some(i => incomplete.has(i));
    return <li key={key} className="studio-plan-row">
      <div className="studio-plan-row-head">
        {item.sourceConflict && <span className="studio-plan-chip is-conflict">Conflict</span>}
        <span className="studio-plan-chip">{treatmentLabel(item.decision)}</span>
        <p className="studio-plan-idea">{compactPlanText(item.idea) || 'Missing instruction'}</p>
        {refs && <span className="studio-plan-refs">{refs}</span>}
        {needsFixing && <span className="studio-plan-chip is-attention">Needs fixing</span>}
        <button id={`plan-row-edit-${key}`} type="button" className="studio-text-button" aria-expanded={isOpen} aria-controls={`plan-editor-${key}`}
          onClick={() => isOpen ? collapse(key) : setExpanded(key)}>{isOpen ? 'Done' : 'Edit'}</button>
      </div>
      {limit && <p className="studio-plan-limit">{limit}</p>}
      {item.sourceConflict && <div className="studio-conflict">
        <p className="studio-field-label">Draft</p><blockquote>{item.sourceConflict.draftQuote || 'Quotation needed'}</blockquote>
        <p className="studio-field-label">Brief</p><blockquote>{item.sourceConflict.briefQuote || 'Quotation needed'}</blockquote>
      </div>}
      {isOpen && renderEditor(row)}
    </li>;
  };

  return <section aria-label="Rewrite plan" className="studio-plan">
    {staleReasons.length > 0 && <p role="status" className="studio-notice is-warning">Your {joinNames(staleReasons)} changed. Check the plan again before rewriting.</p>}
    {error && <p role="alert" className="studio-notice is-error">{error}</p>}
    {readiness.error && <div className="studio-notice is-warning" role="status">
      <p>{readiness.incomplete.length
        ? `${readiness.incomplete.length} ${pluralize(readiness.incomplete.length, 'decision')} ${readiness.incomplete.length === 1 ? 'needs' : 'need'} fixing before rewriting.`
        : readiness.error}</p>
      {readiness.incomplete.length > 0 && <button type="button" className="studio-text-button" onClick={() => {
        const target = readiness.incomplete[0];
        if (summary.plainKeeps.some(row => row.indices.includes(target))) setKeepsOpen(true);
        setExpanded(target);
      }}>Fix missing details</button>}
    </div>}

    <fieldset disabled={busy} className="studio-field">
      <label htmlFor="plan-opening-job" className="studio-field-label">What the opening should do</label>
      <AutoGrowTextarea id="plan-opening-job" value={plan.openingJob} maxLength={PLAN_FIELD_LIMITS.openingJob} onChange={value => update({ ...plan, openingJob: value })}/>
    </fieldset>

    {summary.conflicts.length > 0 && <section aria-label="Source conflicts">
      <h3>Check these conflicts</h3>
      <ul className="studio-plan-rows">{summary.conflicts.map(renderRow)}</ul>
    </section>}

    {summary.changes.length > 0 && <section aria-label="Planned changes">
      <h3>What changes</h3>
      <ul className="studio-plan-rows">{summary.changes.map(renderRow)}</ul>
    </section>}

    {summary.keptCount > 0 && <details className="studio-kept" open={keepsOpen} onToggle={event => setKeepsOpen((event.target as HTMLDetailsElement).open)}>
      <summary>{summary.keptCount} {pluralize(summary.keptCount, 'passage')} kept</summary>
      <ul className="studio-plan-rows">{summary.plainKeeps.map(renderRow)}</ul>
    </details>}

    <div className="studio-plan-edit-actions">
      <button id="btn-propose-decisions" type="button" onClick={propose} disabled={busy} className="studio-text-button">{isPlanning ? 'Refreshing…' : 'Refresh plan'}</button>
      {plan.items.length < PLAN_MAX_ITEMS && <button type="button" onClick={add} disabled={busy} className="studio-text-button">Add a decision</button>}
    </div>
  </section>;
};

export const SavedEditorialDecisions: React.FC<{ state: EditorialPlanState }> = ({ state }) => (
  <details className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
    <summary className="cursor-pointer font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">Edit plan used for this version · {state.plan.items.length} {pluralize(state.plan.items.length, 'suggestion')}</summary>
    <div className="mt-3 space-y-3">
      <p><strong>Opening:</strong> {state.plan.openingJob}</p>
      {state.sources.editorialPreferences !== undefined && <details className="rounded-md bg-neutral-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">Writing preferences used</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{state.sources.editorialPreferences || 'No standing preferences.'}</p>
      </details>}
      <ol className="max-h-96 overflow-y-auto divide-y divide-neutral-200">
        {state.plan.items.map((item, index) => <li key={index} className="space-y-1.5 py-3">
          <p><strong>{index + 1}. {treatmentLabel(item.decision)}:</strong> {item.idea}</p>
          <p className="text-neutral-600">Source: “{item.sourcePhrase}”</p>
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
