import type { EditorialConflict, EditorialPlan, EditorialPlanState } from '../types';
import { validateEditorialPlan } from '../editorialPlan';
import { cleanSourceText, getDraftParagraphs, headingText, isHeadingParagraph, sourceContainsPhrase } from '../sourceText';

type PlanItem = EditorialPlan['items'][number];

/** Presentation only: never shorten the saved plan or the writer's instructions. */
export function compactPlanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function planPreview(text: string, length = 180): string {
  const clean = compactPlanText(text);
  if (clean.length <= length) return clean;
  const end = clean.lastIndexOf(' ', length);
  return clean.slice(0, end > length / 2 ? end : length).trimEnd() + '…';
}

/** Name the exact inputs that changed so the stale notice can say what to re-check. */
export function planStaleReasons(state: EditorialPlanState, sources: EditorialPlanState['sources']): string[] {
  const reasons: string[] = [];
  if (cleanSourceText(state.sources.draft) !== cleanSourceText(sources.draft)) reasons.push('draft');
  if (cleanSourceText(state.sources.projectBrief) !== cleanSourceText(sources.projectBrief)) reasons.push('brief');
  if (state.sources.readerPurpose !== sources.readerPurpose) reasons.push('reader and purpose');
  if ((state.sources.customInstructions || '') !== (sources.customInstructions || '')) reasons.push('rewrite instructions');
  if ((state.sources.editorialPreferences || '') !== (sources.editorialPreferences || '')) reasons.push('standing preferences');
  return reasons;
}

/** One decision as the author reads it: the section's own name, then what changes. */
export interface PlanSection {
  /** Position in plan.items, for edits. */
  index: number;
  item: PlanItem;
  name: string;
  from: number;
  to: number;
}

/**
 * The plan as an editor's note. Sections are named by the draft's own
 * heading when the range starts with one; otherwise by the planner's label
 * for a keep, or by paragraph numbers. Order follows the draft. Grouping is
 * display only; the stored plan is unchanged.
 */
export function sectionPlan(plan: EditorialPlan, draft: string) {
  const paragraphs = getDraftParagraphs(draft);
  const sections: PlanSection[] = plan.items.map((item, index) => {
    const from = item.paragraphRange?.from ?? item.paragraphId ?? 0;
    const to = item.paragraphRange?.to ?? item.paragraphId ?? 0;
    const first = paragraphs[from - 1];
    const heading = first && isHeadingParagraph(first.text) ? headingText(first.text) : '';
    const label = item.decision === 'keep' ? compactPlanText(item.idea) : '';
    const numbers = from && to ? (from === to ? `Paragraph ${from}` : `Paragraphs ${from}–${to}`) : 'Untitled section';
    return { index, item, name: heading || label || numbers, from, to };
  }).sort((a, b) => a.from - b.from || a.to - b.to);
  const conflicts: EditorialConflict[] = plan.conflicts || [];
  const changes = sections.filter(section => section.item.decision !== 'keep');
  return {
    cuts: changes.filter(section => section.item.decision === 'cut'),
    tightens: changes.filter(section => section.item.decision === 'shorten'),
    keeps: sections.filter(section => section.item.decision === 'keep'),
    /** Suggestions the author has not yet accepted, rejected, or ignored. */
    pending: changes.filter(section => !section.item.response).length,
    requests: plan.requests || [],
    conflicts,
    unresolvedConflicts: conflicts.filter(conflict => !conflict.resolution).length,
  };
}

/**
 * Paragraph numbers no decision covers. Version-2 plans anchor by paragraph
 * number, version-3 plans by range; legacy plans anchor by phrase alone, so
 * they cannot be checked this way and report nothing.
 */
export function uncoveredParagraphRefs(plan: EditorialPlan, draft: string): number[] {
  if (plan.version !== 2 && plan.version !== 3) return [];
  return getDraftParagraphs(draft)
    .filter(paragraph => !plan.items.some(item => item.paragraphRange
      ? paragraph.id >= item.paragraphRange.from && paragraph.id <= item.paragraphRange.to
      : item.paragraphId === paragraph.id))
    .map(paragraph => paragraph.id);
}

/** Identify repairable rows, then use the real approval validator for the gate. */
export function planReadiness(plan: EditorialPlan, draft: string, projectBrief = '') {
  const paragraphs = getDraftParagraphs(draft);
  const incomplete = plan.items.flatMap((item, index) => {
    const anchored = plan.version === 3
      ? Boolean(item.paragraphRange) && sourceContainsPhrase(paragraphs.slice(item.paragraphRange!.from - 1, item.paragraphRange!.to).map(p => p.text).join('\n'), item.sourcePhrase)
      : plan.version === 2
        ? paragraphs.some(p => p.id === item.paragraphId && sourceContainsPhrase(p.text, item.sourcePhrase))
        : sourceContainsPhrase(draft, item.sourcePhrase) || sourceContainsPhrase(projectBrief, item.sourcePhrase);
    const conflictValid = !item.sourceConflict || (
      sourceContainsPhrase(draft, item.sourceConflict.draftQuote) && sourceContainsPhrase(projectBrief, item.sourceConflict.briefQuote)
    );
    const complete = plan.version === 3 ? item.decision === 'keep' || Boolean(item.response) || item.idea.trim() : item.idea.trim() && item.limit.trim();
    return !complete || !anchored || !conflictValid ? [index] : [];
  });
  let error: string | null = null;
  try { validateEditorialPlan(plan, { draft, projectBrief, readerPurpose: '' }); }
  catch (failure) { error = failure instanceof Error ? failure.message : 'Check the plan before rewriting.'; }
  return { incomplete, error };
}
