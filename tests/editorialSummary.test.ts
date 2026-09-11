import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorialPlan, EditorialPlanState } from '../src/types';
import {
  compactPlanText,
  planNeedsReplacement,
  planPreview,
  planReadiness,
  planStaleReasons,
  sectionPlan,
  uncoveredParagraphRefs,
} from '../src/utils/editorialSummary';

const draft = 'The team tested a clearer label.\n\nThe team kept the recorded result.';
const plan: EditorialPlan = { version: 2, openingJob: 'Explain the label change.', items: [
  { paragraphId: 1, idea: 'Keep the team attribution.', sourcePhrase: 'The team tested a clearer label.', decision: 'keep', limit: 'Do not claim sole ownership.' },
  { paragraphId: 2, idea: 'Keep the team attribution.', sourcePhrase: 'The team kept the recorded result.', decision: 'keep', limit: 'Do not claim sole ownership.' },
] };

const sectionDraft = '## Overview\n\nContext paragraph here.\n\nPlain paragraph without heading.\n\nA fourth paragraph to cut.\n\nA fifth paragraph to tighten.';

test('sectionPlan names a suggestion by its section, or by its own quotation when narrower', () => {
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Explain the section organization.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: 'Keep overview', sourcePhrase: 'Context paragraph here.', decision: 'shorten', limit: '' },
      { paragraphRange: { from: 3, to: 5 }, idea: 'Cut the rest', sourcePhrase: 'Plain paragraph without heading.', decision: 'cut', limit: '' },
      { paragraphRange: { from: 5, to: 5 }, idea: 'Cut the last', sourcePhrase: 'A fifth paragraph to tighten.', decision: 'cut', limit: '' },
    ],
  };

  const result = sectionPlan(v3Plan, sectionDraft);
  // A version-3 suggestion that opens its section takes the section's name, so
  // v3 plans keep reading as they did.
  assert.equal(result.tightens[0].name, 'Overview');
  // A suggestion that starts inside its section is named by its own quotation.
  assert.equal(result.cuts[0].name, '“Plain paragraph without heading.”');
  assert.equal(result.cuts[1].name, '“A fifth paragraph to tighten.”');
});

test('sectionPlan groups suggestions under the draft sections they touch', () => {
  const twoHeadingDraft = '## Overview\n\nContext paragraph here.\n\n## Detail\n\nA fourth paragraph to cut.\n\nA fifth paragraph to tighten.';
  const v4Plan: EditorialPlan = {
    version: 4,
    openingJob: 'Explain the section organization.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: 'Tighten the overview.', sourcePhrase: 'Context paragraph here.', decision: 'shorten', limit: 'Keep "here" as a placeholder, not a claim.' },
      { paragraphRange: { from: 3, to: 5 }, idea: 'Keep the detail.', sourcePhrase: 'A fourth paragraph to cut.', decision: 'keep', limit: '' },
    ],
    conflicts: [],
  };

  const result = sectionPlan(v4Plan, twoHeadingDraft);
  assert.equal(result.sections.length, 2);
  assert.deepEqual(result.sections.map(group => ({ name: group.name, from: group.from, to: group.to })), [
    { name: 'Overview', from: 1, to: 2 },
    { name: 'Detail', from: 3, to: 5 },
  ]);
  assert.deepEqual(result.sections.map(group => group.items.map(section => section.index)), [[0], [1]]);
  assert.deepEqual(result.sections.map(group => group.changes), [1, 0]);
  assert.deepEqual(result.sections.map(group => group.limited), [1, 0]);
  // Both suggestions cover their whole section, so both take the section's name.
  assert.deepEqual(result.sections.map(group => group.items[0].name), ['Overview', 'Detail']);
});

test('a heading-less draft is one section', () => {
  const v4Plan: EditorialPlan = {
    version: 4,
    openingJob: 'Explain the single section.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: 'Tighten both paragraphs.', sourcePhrase: 'The team tested a clearer label.', decision: 'shorten', limit: '' },
    ],
    conflicts: [],
  };

  const result = sectionPlan(v4Plan, draft);
  assert.deepEqual(result.sections.map(group => ({ name: group.name, from: group.from, to: group.to, changes: group.changes, limited: group.limited })), [
    { name: 'Paragraphs 1–2', from: 1, to: 2, changes: 1, limited: 0 },
  ]);
  // The suggestion covers its whole section, so it takes the section's name.
  assert.equal(result.sections[0].items[0].name, 'Paragraphs 1–2');
});

test('sectionPlan groups cuts, tightens, and keeps, and counts unresolved conflicts', () => {
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Explain decisions and conflicts.',
    items: [
      { paragraphRange: { from: 1, to: 1 }, idea: '', sourcePhrase: 'Context paragraph here.', decision: 'keep', limit: '' },
      { paragraphRange: { from: 2, to: 2 }, idea: 'Tighten details', sourcePhrase: 'Context paragraph here.', decision: 'shorten', limit: '' },
      { paragraphRange: { from: 3, to: 3 }, idea: 'Cut paragraph', sourcePhrase: 'Plain paragraph without heading.', decision: 'cut', limit: '' },
    ],
    conflicts: [
      { draftQuote: 'The team tested a clearer label.', briefQuote: 'The author tested the label.', question: 'Who tested the label?', resolution: 'draft' },
      { draftQuote: 'The team kept the recorded result.', briefQuote: 'The author kept the result.', question: 'Who kept the result?' },
    ],
  };

  const result = sectionPlan(v3Plan, draft);
  assert.equal(result.keeps.length, 1);
  assert.equal(result.tightens.length, 1);
  assert.equal(result.cuts.length, 1);
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.unresolvedConflicts, 1);
  // Both suggested changes are unanswered; keeps are never pending.
  assert.equal(result.pending, 2);
  assert.deepEqual(result.requests, []);

  const answered = sectionPlan({
    ...v3Plan,
    items: v3Plan.items.map((item, index) => index === 1 ? { ...item, response: 'accepted' as const } : index === 2 ? { ...item, response: 'rejected' as const } : item),
    requests: [{ paragraphRange: { from: 3, to: 3 }, sourcePhrase: 'Plain paragraph', instruction: 'Keep this but make it a question.' }],
  }, draft);
  assert.equal(answered.pending, 0);
  assert.equal(answered.requests.length, 1);
  // Rejected suggestions stay in their group until approval turns them into keeps.
  assert.equal(answered.cuts.length, 1);
  assert.equal(answered.cuts[0].item.response, 'rejected');
});

test('sectionPlan sorts sections by draft order while preserving original item indices', () => {
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Explain reordering.',
    items: [
      { paragraphRange: { from: 4, to: 5 }, idea: 'Later section', sourcePhrase: 'A fourth paragraph to cut.', decision: 'cut', limit: '' },
      { paragraphRange: { from: 1, to: 2 }, idea: 'Early section', sourcePhrase: 'Context paragraph here.', decision: 'keep', limit: '' },
      { paragraphRange: { from: 3, to: 3 }, idea: 'Middle section', sourcePhrase: 'Plain paragraph without heading.', decision: 'shorten', limit: '' },
    ],
  };

  const result = sectionPlan(v3Plan, sectionDraft);
  const allSections = [...result.keeps, ...result.tightens, ...result.cuts].sort((a, b) => a.from - b.from);
  assert.deepEqual(allSections.map(s => ({ from: s.from, to: s.to, index: s.index })), [
    { from: 1, to: 2, index: 1 },
    { from: 3, to: 3, index: 2 },
    { from: 4, to: 5, index: 0 },
  ]);
});

test('previews retain qualifiers in full data and remove whitespace noise', () => {
  const source = 'Keep the team result, but do not attribute the result to a single person.';
  assert.match(planPreview(source, 30), /…$/);
  assert.equal(planPreview('  Keep\n the   team.  '), 'Keep the team.');
  assert.equal(planPreview(source, 200), source);
  assert.equal(compactPlanText('  Keep\n the   team.  '), 'Keep the team.');
});

test('previews show a quoted passage as the reader saw it, without Markdown marks', () => {
  assert.equal(
    planPreview('First paragraph.\n\n## Section Two\n\nThe **team** result.'),
    'First paragraph. Section Two The team result.',
  );
});

test('approval readiness catches lost coverage, false quotations, and empty plans', () => {
  assert.match(planReadiness({ ...plan, items: plan.items.slice(0, 1) }, draft).error!, /paragraphs 2/);
  assert.ok(planReadiness({ ...plan, items: [] }, draft).error);
  const conflict = { ...plan, items: [{ ...plan.items[0], sourceConflict: { draftQuote: 'invented', briefQuote: 'also invented' } }, plan.items[1]] };
  assert.deepEqual(planReadiness(conflict, draft, 'The actual brief.').incomplete, [0]);
  assert.match(planReadiness(conflict, draft, 'The actual brief.').error!, /verbatim quotation/);

  // A saved suggestion without a reason is still approvable; readiness flags only what approval refuses.
  const section: EditorialPlan = {
    version: 3,
    openingJob: 'Open with the result.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: '', sourcePhrase: 'Context paragraph here.', decision: 'keep', limit: '' },
      { paragraphRange: { from: 3, to: 5 }, idea: 'Cut the aside', reason: '', sourcePhrase: 'Plain paragraph without heading.', decision: 'cut', limit: '' },
    ],
    conflicts: [],
  };
  assert.deepEqual(planReadiness(section, sectionDraft).incomplete, []);
  assert.equal(planReadiness(section, sectionDraft).error, null);
  assert.deepEqual(planReadiness({ ...section, items: [section.items[0], { ...section.items[1], idea: '' }] }, sectionDraft).incomplete, [1]);
  assert.deepEqual(planReadiness({ ...section, items: [section.items[0], { ...section.items[1], idea: '', response: 'rejected' }] }, sectionDraft).incomplete, []);
  assert.deepEqual(planReadiness({ ...section, items: [section.items[0], { ...section.items[1], reason: 'The aside slows the reader.' }] }, sectionDraft).incomplete, []);
});

test('legacy brief-only source anchors remain valid', () => {
  const legacy: EditorialPlan = { openingJob: 'Explain the choice.', items: [{ ...plan.items[0], paragraphId: undefined, sourcePhrase: 'The brief records a team decision.' }] };
  assert.equal(planReadiness(legacy, draft, 'The brief records a team decision.').error, null);
});

test('coverage names the paragraphs no decision anchors to', () => {
  assert.deepEqual(uncoveredParagraphRefs(plan, draft), []);
  assert.deepEqual(uncoveredParagraphRefs({ ...plan, items: plan.items.slice(0, 1) }, draft), [2]);
  const threeParagraphs = `${draft}\n\nA third paragraph follows.`;
  assert.deepEqual(uncoveredParagraphRefs(plan, threeParagraphs), [3]);
  const legacy: EditorialPlan = { openingJob: 'Explain the choice.', items: [{ ...plan.items[0], paragraphId: undefined }] };
  assert.deepEqual(uncoveredParagraphRefs(legacy, draft), []);

  // Version 3 paragraphRange coverage
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Explain ranges.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: '', sourcePhrase: 'The team tested a clearer label.', decision: 'keep', limit: '' },
    ],
  };
  assert.deepEqual(uncoveredParagraphRefs(v3Plan, threeParagraphs), [3]);
  assert.deepEqual(uncoveredParagraphRefs({
    ...v3Plan,
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: '', sourcePhrase: 'The team tested a clearer label.', decision: 'keep', limit: '' },
      { paragraphRange: { from: 3, to: 3 }, idea: 'Keep third', sourcePhrase: 'A third paragraph follows.', decision: 'keep', limit: '' },
    ],
  }, threeParagraphs), []);
});

test('stale reasons name the exact inputs that changed', () => {
  const sources = { draft, projectBrief: '', readerPurpose: 'For reviewers.', editorialPreferences: 'Prefs.', customInstructions: 'Keep it short.' };
  const state: EditorialPlanState = { plan, approved: true, sources };
  assert.deepEqual(planStaleReasons(state, sources), []);
  assert.deepEqual(planStaleReasons(state, { ...sources, draft: 'A changed draft paragraph.\n\nThe team kept the recorded result.' }), ['draft']);
  assert.deepEqual(planStaleReasons(state, { ...sources, customInstructions: '' }), ['rewrite instructions']);
  assert.deepEqual(planStaleReasons(state, { ...sources, readerPurpose: '', editorialPreferences: '', customInstructions: undefined }),
    ['reader and purpose', 'rewrite instructions', 'standing preferences']);
});

test('only version 3 and 4 plans with unchanged inputs are offered back to the author', () => {
  const sources = { draft, projectBrief: '', readerPurpose: 'For reviewers.', editorialPreferences: 'Prefs.', customInstructions: 'Keep it short.' };
  const v4Plan: EditorialPlan = { ...plan, version: 4 };
  const state = (plan: EditorialPlan): EditorialPlanState => ({ plan, sources, approved: false });

  assert.equal(planNeedsReplacement(state(v4Plan), sources), false);
  assert.equal(planNeedsReplacement(state({ ...v4Plan, version: 3 }), sources), false);
  // The approved flag is the author's, not a format question.
  assert.equal(planNeedsReplacement({ ...state(v4Plan), approved: true }, sources), false);
  // The earlier per-paragraph format is replaced whatever its approval state.
  assert.equal(planNeedsReplacement({ ...state(plan), approved: true }, sources), true);
  // Changed inputs must be replanned.
  assert.equal(planNeedsReplacement(state(v4Plan), { ...sources, draft: 'A different draft paragraph.\n\nThe team kept the recorded result.' }), true);
});

test('sectionPlan suffixes second item starting at same paragraph with opening quotation', () => {
  const v4Plan: EditorialPlan = {
    version: 4,
    openingJob: 'Explain sections.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: 'First', sourcePhrase: 'The team tested a clearer label.', decision: 'shorten', limit: '' },
      { paragraphRange: { from: 1, to: 1 }, idea: 'Second', sourcePhrase: 'The team tested', decision: 'cut', limit: '' },
    ],
    conflicts: [],
  };
  const result = sectionPlan(v4Plan, draft);
  assert.equal(result.sections[0].items[0].name, 'Paragraphs 1–2');
  assert.equal(result.sections[0].items[1].name, 'Paragraphs 1–2 — “The team tested a clearer label.”');
});

test('sectionPlan renders legacy plans with version undefined as one group titled Suggestions', () => {
  const legacyPlan: EditorialPlan = {
    version: undefined,
    openingJob: 'Legacy plan.',
    items: [
      { idea: 'Tighten wording', sourcePhrase: 'The team tested a clearer label.', decision: 'shorten', limit: '' },
    ],
  };
  const result = sectionPlan(legacyPlan, draft);
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].name, 'Suggestions');
  assert.equal(result.sections[0].items.length, 1);
  assert.equal(result.sections[0].items[0].name, '“The team tested a clearer label.”');
});

