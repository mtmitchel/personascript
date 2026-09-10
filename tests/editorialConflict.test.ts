import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditorialPlan, validateEditorialPlan } from '../src/editorialPlan';
import type { EditorialPlan } from '../src/types';

const sources = { draft: 'The exhausted allowance appeared in an in-page indicator.', projectBrief: 'The exhausted state showed the reset and a trial action.', readerPurpose: '' };
const plan: EditorialPlan = { version: 2, openingJob: 'Establish the author’s role.', items: [{
  paragraphId: 1, idea: 'The exhausted allowance state', sourcePhrase: sources.draft, decision: 'keep',
  limit: 'The draft calls this an indicator, but the brief defines a modal. Correct the source conflict using the brief.',
}] };

test('rejects a claimed conflict that supplies no quotations from both sources', () => {
  assert.throws(() => validateEditorialPlan(plan, sources), /source conflict.*exact draft and brief quotations/i);
});

test('rejects invented or misplaced conflict quotations', () => {
  const item = plan.items[0];
  for (const sourceConflict of [
    { draftQuote: sources.draft, briefQuote: 'The exhausted state appeared in a modal.' },
    { draftQuote: sources.projectBrief, briefQuote: sources.draft },
    { draftQuote: sources.draft, briefQuote: '' },
  ]) {
    assert.throws(() => validateEditorialPlan({ ...plan, items: [{ ...item, sourceConflict }] }, sources), /verbatim quotation from each named source/i);
  }
});

test('retains both verbatim sides of an actual source disagreement for human review', () => {
  const conflicting = { ...sources, projectBrief: 'The exhausted allowance appeared in a modal.' };
  const evidenced: EditorialPlan = { ...plan, items: [{ ...plan.items[0], limit: 'The sources conflict about presentation. Resolve this before writing.',
    sourceConflict: { draftQuote: sources.draft, briefQuote: conflicting.projectBrief } }] };
  assert.deepEqual(validateEditorialPlan(evidenced, conflicting), evidenced);
});

test('incomplete conflict edits remain saveable, but cannot be approved', () => {
  const pending: EditorialPlan = { ...plan, items: [{ ...plan.items[0], sourceConflict: { draftQuote: '', briefQuote: '' } }] };
  assert.equal(isEditorialPlan(pending), true);
  assert.throws(() => validateEditorialPlan(pending, sources));
});

test('old saved plans remain readable without inventing evidence fields', () => {
  const legacy = { ...plan, version: undefined };
  assert.equal(isEditorialPlan(legacy), true);
  assert.equal(validateEditorialPlan(legacy, sources).items[0].sourceConflict, undefined);
});


test('rejects unevidenced disagreement and named-source comparison formulations', () => {
  for (const limit of ['The draft and brief disagree about presentation.', 'The sources are inconsistent about presentation.', 'The draft describes an indicator; the brief describes a modal.']) {
    assert.throws(() => validateEditorialPlan({ ...plan, items: [{ ...plan.items[0], limit }] }, sources), /source conflict/);
  }
});

test('does not treat an explicit absence of conflict as a declaration', () => {
  for (const limit of ['No source conflict is asserted.', 'The sources do not disagree. Retain the draft wording.']) {
    assert.doesNotThrow(() => validateEditorialPlan({ ...plan, items: [{ ...plan.items[0], limit }] }, sources));
  }
});

test('a generated conflict claim without quotations stays editable as pending evidence', () => {
  const accepted = validateEditorialPlan(plan, sources, { allowPendingConflictEvidence: true });
  assert.deepEqual(accepted.items[0].sourceConflict, { draftQuote: '', briefQuote: '' });
  assert.throws(() => validateEditorialPlan(accepted, sources), /verbatim quotation from each named source/i);
});

test('generation keeps a verbatim conflict quotation and clears only the unverified side', () => {
  const partiallyEvidenced: EditorialPlan = { ...plan, items: [{ ...plan.items[0],
    sourceConflict: { draftQuote: sources.draft, briefQuote: 'The exhausted state appeared in a modal.' } }] };
  const accepted = validateEditorialPlan(partiallyEvidenced, sources, { allowPendingConflictEvidence: true });
  assert.deepEqual(accepted.items[0].sourceConflict, { draftQuote: sources.draft, briefQuote: '' });
});

test('generation tolerates an opening that mentions conflict, but approval does not', () => {
  const plainItem = { ...plan.items[0], limit: 'Preserve the draft wording and its recorded scope.' };
  const conflictedOpening: EditorialPlan = { ...plan, openingJob: 'The sources disagree about how the state appeared.', items: [plainItem] };
  const accepted = validateEditorialPlan(conflictedOpening, sources, { allowPendingConflictEvidence: true });
  assert.match(accepted.openingJob, /disagree/);
  assert.throws(() => validateEditorialPlan(accepted, sources), /opening refers to a source conflict/i);
});

test('a fully evidenced generated conflict is retained unchanged', () => {
  const conflicting = { ...sources, projectBrief: 'The exhausted allowance appeared in a modal.' };
  const evidenced: EditorialPlan = { ...plan, items: [{ ...plan.items[0], limit: 'The sources conflict about presentation. Resolve this before writing.',
    sourceConflict: { draftQuote: sources.draft, briefQuote: conflicting.projectBrief } }] };
  assert.deepEqual(validateEditorialPlan(evidenced, conflicting, { allowPendingConflictEvidence: true }), evidenced);
});
