import type { EditorialConflict, EditorialPlan, EditorialPlanState } from '../types';
import { validateEditorialPlan } from '../editorialPlan';
import { cleanSourceText, getDraftParagraphs, headingText, isHeadingParagraph, sourceContainsPhrase } from '../sourceText';
import { plainText } from './richText';

type PlanItem = EditorialPlan['items'][number];

/** Presentation only: never shorten the saved plan or the writer's instructions. */
export function compactPlanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A quoted passage as the reader saw it: Markdown marks removed, then shortened. */
export function planPreview(text: string, length = 180): string {
  const clean = compactPlanText(plainText(text));
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

/** A run of paragraphs under one heading, with the suggestions that touch it. */
export interface PlanSectionGroup {
  /** headingText(first paragraph) or `Paragraphs a–b`. */
  name: string;
  from: number;
  to: number;
  /** In draft order. */
  items: PlanSection[];
  /** shorten + cut. */
  changes: number;
  /** Items with a non-empty limit. */
  limited: number;
}

/**
 * Whether to offer the plan back to the author. A plan in the earlier
 * per-paragraph format is replaced, not approved, even when it was approved
 * before; a version 3 or 4 plan is offered whenever its inputs are unchanged.
 */
export function planNeedsReplacement(state: EditorialPlanState, sources: EditorialPlanState['sources']): boolean {
  if (state.plan.version !== 3 && state.plan.version !== 4) return true;
  return planStaleReasons(state, sources).length > 0;
}

/**
 * The plan as an editor's note. Sections are named by the draft's own
 * heading when the range starts with one; otherwise by paragraph numbers.
 * Order follows the draft. Grouping is display only; the stored plan is
 * unchanged, and a suggestion narrower than its section is named by its own
 * quotation.
 */
export function sectionPlan(plan: EditorialPlan, draft: string) {
  const paragraphs = getDraftParagraphs(draft);
  const sections: PlanSection[] = plan.items.map((item, index) => {
    const from = item.paragraphRange?.from ?? item.paragraphId ?? 0;
    const to = item.paragraphRange?.to ?? item.paragraphId ?? 0;
    const first = paragraphs[from - 1];
    const heading = first && isHeadingParagraph(first.text) ? headingText(first.text) : '';
    const numbers = from && to ? (from === to ? `Paragraph ${from}` : `Paragraphs ${from}–${to}`) : 'Untitled section';
    return { index, item, name: heading || numbers, from, to };
  }).sort((a, b) => a.from - b.from || a.to - b.to);

  if (plan.version === undefined) {
    const legacyGroup: PlanSectionGroup = {
      name: 'Suggestions',
      from: 1,
      to: paragraphs.length || 1,
      items: sections,
      changes: sections.filter(s => s.item.decision !== 'keep').length,
      limited: sections.filter(s => Boolean(s.item.limit?.trim())).length,
    };
    sections.forEach(section => {
      section.name = `“${planPreview(section.item.sourcePhrase, 70)}”`;
    });
    const conflicts: EditorialConflict[] = plan.conflicts || [];
    const changes = sections.filter(section => section.item.decision !== 'keep');
    return {
      cuts: changes.filter(section => section.item.decision === 'cut'),
      tightens: changes.filter(section => section.item.decision === 'shorten'),
      keeps: sections.filter(section => section.item.decision === 'keep'),
      pending: changes.filter(section => !section.item.response).length,
      requests: plan.requests || [],
      conflicts,
      unresolvedConflicts: conflicts.filter(conflict => !conflict.resolution).length,
      sections: [legacyGroup],
    };
  }

  // A section runs from a heading (or paragraph 1) to the paragraph before the
  // next heading. Sections are derived here, never stored in the plan.
  const starts = paragraphs.filter(paragraph => isHeadingParagraph(paragraph.text)).map(paragraph => paragraph.id);
  if (paragraphs.length && starts[0] !== 1) starts.unshift(1);
  const groups: PlanSectionGroup[] = starts.map((start, position) => {
    const to = (starts[position + 1] ?? paragraphs.length + 1) - 1;
    const heading = paragraphs[start - 1];
    return {
      name: heading && isHeadingParagraph(heading.text) ? headingText(heading.text) : `Paragraphs ${start}–${to}`,
      from: start, to, items: [], changes: 0, limited: 0,
    };
  });
  const namedGroupStarts = new Set<number>();
  sections.forEach(section => {
    const group = groups.find(candidate => section.from >= candidate.from && section.from <= candidate.to);
    if (!group) return;
    // The same object reaches the flat lists and the group, so the name is
    // written once, in place. A suggestion that opens its section names that
    // section; one that starts inside it is named by its own quotation.
    if (section.from === group.from) {
      if (!namedGroupStarts.has(group.from)) {
        section.name = group.name;
        namedGroupStarts.add(group.from);
      } else {
        section.name = `${group.name} — “${planPreview(section.item.sourcePhrase, 70)}”`;
      }
    } else {
      section.name = `“${planPreview(section.item.sourcePhrase, 70)}”`;
    }
    group.items.push(section);
  });
  groups.forEach(group => {
    group.changes = group.items.filter(section => section.item.decision !== 'keep').length;
    group.limited = group.items.filter(section => Boolean(section.item.limit.trim())).length;
  });

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
    sections: groups,
  };
}

/**
 * Paragraph numbers no decision covers. Version-2 plans anchor by paragraph
 * number, version-3 and version-4 plans by range; legacy plans anchor by
 * phrase alone, so they cannot be checked this way and report nothing.
 */
export function uncoveredParagraphRefs(plan: EditorialPlan, draft: string): number[] {
  if (plan.version !== 2 && plan.version !== 3 && plan.version !== 4) return [];
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
    const anchored = plan.version === 3 || plan.version === 4
      ? Boolean(item.paragraphRange) && sourceContainsPhrase(paragraphs.slice(item.paragraphRange!.from - 1, item.paragraphRange!.to).map(p => p.text).join('\n'), item.sourcePhrase)
      : plan.version === 2
        ? paragraphs.some(p => p.id === item.paragraphId && sourceContainsPhrase(p.text, item.sourcePhrase))
        : sourceContainsPhrase(draft, item.sourcePhrase) || sourceContainsPhrase(projectBrief, item.sourcePhrase);
    const conflictValid = !item.sourceConflict || (
      sourceContainsPhrase(draft, item.sourceConflict.draftQuote) && sourceContainsPhrase(projectBrief, item.sourceConflict.briefQuote)
    );
    const complete = plan.version === 3 || plan.version === 4 ? item.decision === 'keep' || Boolean(item.response) || item.idea.trim() : item.idea.trim() && item.limit.trim();
    return !complete || !anchored || !conflictValid ? [index] : [];
  });
  let error: string | null = null;
  try { validateEditorialPlan(plan, { draft, projectBrief, readerPurpose: '' }); }
  catch (failure) { error = failure instanceof Error ? failure.message : 'Check the plan before rewriting.'; }
  return { incomplete, error };
}
