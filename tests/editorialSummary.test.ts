import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorialPlan, EditorialPlanState } from '../src/types';
import {
  compactPlanText,
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

test('sectionPlan names sections by heading, falls back to idea for keeps, and falls back to paragraph numbers otherwise', () => {
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Explain the section organization.',
    items: [
      { paragraphRange: { from: 1, to: 2 }, idea: 'Keep overview', sourcePhrase: 'Context paragraph here.', decision: 'shorten', limit: '' },
      { paragraphRange: { from: 3, to: 3 }, idea: 'Keep plain context', sourcePhrase: 'Plain paragraph without heading.', decision: 'keep', limit: '' },
      { paragraphRange: { from: 4, to: 4 }, idea: 'Cut fourth', sourcePhrase: 'A fourth paragraph to cut.', decision: 'cut', limit: '' },
      { paragraphRange: { from: 4, to: 5 }, idea: 'Cut both', sourcePhrase: 'A fourth paragraph to cut.', decision: 'cut', limit: '' },
    ],
  };

  const result = sectionPlan(v3Plan, sectionDraft);
  // Heading from paragraph 1 ("## Overview" -> "Overview")
  assert.equal(result.tightens[0].name, 'Overview');
  // Fallback to idea for keep without heading
  assert.equal(result.keeps[0].name, 'Keep plain context');
  // Fallback to "Paragraph N" when from === to
  assert.equal(result.cuts[0].name, 'Paragraph 4');
  // Fallback to "Paragraphs A–B" when from !== to
  assert.equal(result.cuts[1].name, 'Paragraphs 4–5');
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
