import type { EditorialPlan, EditorialPlanState } from '../types';
import { validateEditorialPlan } from '../editorialPlan';
import { cleanSourceText, getDraftParagraphs, sourceContainsPhrase } from '../sourceText';

type PlanItem = EditorialPlan['items'][number];

/** One displayed plan row: a decision, or identical repeats shown together. */
export interface PlanRow { item: PlanItem; indices: number[] }

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

/** The part of a limit that adds information beyond the idea itself. */
export function extraLimitText(item: PlanItem): string {
  const limit = compactPlanText(item.limit);
  return limit && limit !== 'No additional limits.' && limit !== compactPlanText(item.idea) ? limit : '';
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

/**
 * Display grouping only; the stored plan keeps every item unchanged.
 * Identical decisions (same treatment, idea, and limit) show once with all
 * their source references. Conflicts are never grouped: each carries its own
 * quotations. Plain keeps collapse; keeps with a distinctive claim limit stay
 * visible as changes because the limit is part of the choice.
 */
export function summarizeEditorialPlan(plan: EditorialPlan) {
  const counts = { keep: 0, shorten: 0, cut: 0 };
  const conflicts: PlanRow[] = [];
  const changes: PlanRow[] = [];
  const plainKeeps: PlanRow[] = [];
  const groups = new Map<string, PlanRow>();
  plan.items.forEach((item, index) => {
    counts[item.decision]++;
    if (item.sourceConflict) {
      conflicts.push({ item, indices: [index] });
      return;
    }
    const bucket = item.decision === 'keep' && !extraLimitText(item) ? plainKeeps : changes;
    const key = JSON.stringify([item.decision, compactPlanText(item.idea), compactPlanText(item.limit)]);
    const existing = groups.get(key);
    if (existing) existing.indices.push(index);
    else {
      const row: PlanRow = { item, indices: [index] };
      groups.set(key, row);
      bucket.push(row);
    }
  });
  return { counts, conflicts, changes, plainKeeps, keptCount: plainKeeps.reduce((total, row) => total + row.indices.length, 0) };
}

/** Identify repairable rows, then use the real approval validator for the gate. */
export function planReadiness(plan: EditorialPlan, draft: string, projectBrief = '') {
  const paragraphs = getDraftParagraphs(draft);
  const incomplete = plan.items.flatMap((item, index) => {
    const anchored = plan.version === 2
      ? paragraphs.some(p => p.id === item.paragraphId && sourceContainsPhrase(p.text, item.sourcePhrase))
      : sourceContainsPhrase(draft, item.sourcePhrase) || sourceContainsPhrase(projectBrief, item.sourcePhrase);
    const conflictValid = !item.sourceConflict || (
      sourceContainsPhrase(draft, item.sourceConflict.draftQuote) && sourceContainsPhrase(projectBrief, item.sourceConflict.briefQuote)
    );
    return !item.idea.trim() || !item.limit.trim() || !anchored || !conflictValid ? [index] : [];
  });
  let error: string | null = null;
  try { validateEditorialPlan(plan, { draft, projectBrief, readerPurpose: '' }); }
  catch (failure) { error = failure instanceof Error ? failure.message : 'Check the plan before rewriting.'; }
  return { incomplete, error };
}
