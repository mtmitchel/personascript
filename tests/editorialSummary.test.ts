import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorialPlan, EditorialPlanState } from '../src/types';
import { planPreview, planReadiness, planStaleReasons, summarizeEditorialPlan } from '../src/utils/editorialSummary';

const draft = 'The team tested a clearer label.\n\nThe team kept the recorded result.';
const plan: EditorialPlan = { version: 2, openingJob: 'Explain the label change.', items: [
  { paragraphId: 1, idea: 'Keep the team attribution.', sourcePhrase: 'The team tested a clearer label.', decision: 'keep', limit: 'Do not claim sole ownership.' },
  { paragraphId: 2, idea: 'Keep the team attribution.', sourcePhrase: 'The team kept the recorded result.', decision: 'keep', limit: 'Do not claim sole ownership.' },
] };

test('summary consolidates repeated guidance without dropping any source decision', () => {
  const before = JSON.stringify(plan);
  const summary = summarizeEditorialPlan(plan);
  assert.equal(summary.changes.length, 1);
  assert.deepEqual(summary.changes[0].indices, [0, 1]);
  assert.deepEqual(summary.counts, { keep: 2, shorten: 0, cut: 0 });
  assert.equal(summary.keptCount, 0);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(planReadiness(plan, draft).error, null);
});

test('different claim limits and treatments stay distinct, and conflicts are never grouped', () => {
  for (const change of [
    { limit: 'Do not attribute the result to the label.' },
    { decision: 'shorten' as const },
  ]) {
    const summary = summarizeEditorialPlan({ ...plan, items: [plan.items[0], { ...plan.items[1], ...change }] });
    assert.equal(summary.changes.length, 2);
    assert.equal(summary.conflicts.length, 0);
  }
  const conflicted = summarizeEditorialPlan({ ...plan, items: [plan.items[0], { ...plan.items[1], sourceConflict: { draftQuote: 'team', briefQuote: 'author' } }] });
  assert.equal(conflicted.conflicts.length, 1);
  assert.deepEqual(conflicted.conflicts[0].indices, [1]);
  assert.equal(conflicted.changes.length, 1);
  const identicalConflicts = summarizeEditorialPlan({ ...plan, items: [
    { ...plan.items[0], sourceConflict: { draftQuote: 'team', briefQuote: 'author' } },
    { ...plan.items[1], sourceConflict: { draftQuote: 'team', briefQuote: 'author' } },
  ] });
  assert.equal(identicalConflicts.conflicts.length, 2);
});

test('plain keeps collapse while claim-bearing keeps stay visible', () => {
  const summary = summarizeEditorialPlan({ ...plan, items: [
    { ...plan.items[0], limit: 'No additional limits.' },
    plan.items[1],
  ] });
  assert.equal(summary.plainKeeps.length, 1);
  assert.equal(summary.keptCount, 1);
  assert.equal(summary.changes.length, 1);
  assert.equal(summary.changes[0].item.limit, 'Do not claim sole ownership.');
});

test('changes stay in draft order and identical repeats keep every reference', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ ...plan.items[0], idea: `Keep idea ${i}.` }));
  items.push({ ...plan.items[0], decision: 'cut' as const, idea: 'Remove repeated background.' });
  const summary = summarizeEditorialPlan({ ...plan, items });
  assert.equal(summary.changes.length, 101);
  assert.equal(summary.changes[100].item.decision, 'cut');
  assert.equal(summary.counts.keep, 100);
  assert.equal(summary.changes.flatMap(entry => entry.indices).length, 101);
  const repeated = summarizeEditorialPlan({ ...plan, items: [...items, { ...items[5] }] });
  const grouped = repeated.changes.find(entry => entry.indices.length > 1);
  assert.deepEqual(grouped?.indices, [5, 101]);
});

test('previews retain qualifiers in full data and remove whitespace noise', () => {
  const source = 'Keep the team result, but do not attribute the result to a single person.';
  assert.match(planPreview(source, 30), /…$/);
  assert.equal(planPreview('  Keep\n the   team.  '), 'Keep the team.');
  assert.equal(planPreview(source, 200), source);
});

test('approval readiness catches lost coverage, false quotations, and empty plans', () => {
  assert.match(planReadiness({ ...plan, items: plan.items.slice(0, 1) }, draft).error!, /paragraphs 2/);
  assert.ok(planReadiness({ ...plan, items: [] }, draft).error);
  const conflict = { ...plan, items: [{ ...plan.items[0], sourceConflict: { draftQuote: 'invented', briefQuote: 'also invented' } }, plan.items[1]] };
  assert.deepEqual(planReadiness(conflict, draft, 'The actual brief.').incomplete, [0]);
  assert.match(planReadiness(conflict, draft, 'The actual brief.').error!, /verbatim quotation/);
});

test('legacy brief-only source anchors remain valid', () => {
  const legacy: EditorialPlan = { openingJob: 'Explain the choice.', items: [{ ...plan.items[0], paragraphId: undefined, sourcePhrase: 'The brief records a team decision.' }] };
  assert.equal(planReadiness(legacy, draft, 'The brief records a team decision.').error, null);
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
