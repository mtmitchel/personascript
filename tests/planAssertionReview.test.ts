import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlanSourceAuditPrompt,
  planSourceAuditContext,
  planSourceAuditFindings,
  validatePlanSourceAudit,
  type PlanSourceAuditInput,
} from '../src/planAssertionReview';
import type { EditorialPlan } from '../src/types';
import { PLAN_MAX_ITEMS } from '../src/editorialPlan';

const sourceInput: PlanSourceAuditInput = {
  draft: 'The allowance appeared in an in-page indicator. The team planned to explain the reset state.',
  projectBrief: 'The team planned to explain the reset state and a trial action.',
  editorialPlan: {
    version: 2,
    openingJob: 'Establish the author’s contribution.',
    items: [
      {
        paragraphId: 1,
        idea: 'Keep the in-page indicator.',
        sourcePhrase: 'The allowance appeared in an in-page indicator.',
        decision: 'keep',
        limit: 'Keep the presentation as an in-page indicator.',
      },
      {
        paragraphId: 2,
        idea: 'Keep the reset explanation.',
        sourcePhrase: 'The team planned to explain the reset state.',
        decision: 'shorten',
        limit: 'Keep the planned status.',
      },
    ],
  },
};

const openingAudit = {
  itemIndex: 0,
  status: 'editorial',
  assertion: 'Establish the author’s contribution.',
  detail: 'The opening job is an editorial organization choice.',
  evidence: [{ source: 'draft', quote: 'The allowance appeared in an in-page indicator.' }],
};

const audit = (items: unknown[], summary = 'Audited every approved decision.') => validatePlanSourceAudit(
  JSON.stringify({ summary, items: [openingAudit, ...items] }),
  { candidates: [{ finishReason: 'STOP' }] },
  sourceInput,
);

test('source audit prompt contains only original sources and the approved plan', () => {
  const prompt = buildPlanSourceAuditPrompt(sourceInput);
  assert.match(prompt, /Audit every item .* before any prose review/i);
  assert.match(prompt, /<draft>/);
  assert.match(prompt, /<project-brief>/);
  assert.match(prompt, /<approved-plan>/);
  assert.match(prompt, /one-based position/);
  assert.match(prompt, /silence.*cannot conflict/i);
  assert.doesNotMatch(prompt, /<final-text>|<writing-corpus>|<voice-profile>|<reader-and-purpose>/i);
  assert.match(prompt, /The allowance appeared in an in-page indicator\./);
  assert.match(prompt, /paragraphId/);
});

test('validates per-item coverage, exact named-source evidence, and all statuses', () => {
  const result = audit([
    {
      itemIndex: 1,
      paragraphId: 1,
      status: 'supported',
      assertion: 'The allowance is shown in an in-page indicator.',
      detail: 'The draft states this directly.',
      evidence: [{ source: 'draft', quote: 'The allowance appeared in an in-page indicator.' }],
    },
    {
      itemIndex: 2,
      paragraphId: 2,
      status: 'editorial',
      assertion: 'The planned explanation should be shortened.',
      detail: 'This is an editorial compression choice anchored to the source account.',
      evidence: [{ source: 'brief', quote: 'The team planned to explain the reset state and a trial action.' }],
    },
  ]);
  assert.deepEqual(result.items.map(item => item.status), ['editorial', 'supported', 'editorial']);
  assert.equal(result.items[2].evidence[0].source, 'brief');
  assert.deepEqual(planSourceAuditFindings(result), []);
  assert.match(planSourceAuditContext(result), /VALIDATED APPROVED-PLAN SOURCE AUDIT/);
});

test('accepts unsupported silence and explicit conflict without inventing quotations', () => {
  const unsupportedPlan: EditorialPlan = {
    openingJob: 'Explain the state.',
    items: [{
      idea: 'The state appeared in a modal.',
      sourcePhrase: 'The allowance appeared in an in-page indicator.',
      decision: 'keep',
      limit: 'Call it a modal even though the brief is silent.',
    }],
  };
  const unsupported = validatePlanSourceAudit(JSON.stringify({ summary: 'Checked.', items: [openingAudit, {
    itemIndex: 1,
    status: 'unsupported',
    assertion: 'The state appeared in a modal.',
    detail: 'Neither named source states that the state appeared in a modal.',
    evidence: [],
  }] }), { candidates: [{ finishReason: 'STOP' }] }, { ...sourceInput, editorialPlan: unsupportedPlan });
  assert.equal(unsupported.items[1].status, 'unsupported');
  assert.equal(planSourceAuditFindings(unsupported)[0].severity, 'error');
  assert.equal(planSourceAuditFindings(unsupported)[0].category, 'claim');

  const conflictPlan: EditorialPlan = {
    openingJob: 'Explain the presentation.',
    items: [{
      idea: 'Resolve the presentation conflict.',
      sourcePhrase: 'The allowance appeared in an in-page indicator.',
      decision: 'keep',
      limit: 'Leave the explicit conflict for author resolution.',
    }],
  };
  const conflict = validatePlanSourceAudit(JSON.stringify({ summary: 'Conflict found.', items: [openingAudit, {
    itemIndex: 1,
    status: 'conflict',
    assertion: 'The presentation differs between the two sources.',
    detail: 'The sources use incompatible presentation descriptions.',
    evidence: [
      { source: 'draft', quote: 'The allowance appeared in an in-page indicator.' },
      { source: 'brief', quote: 'The team planned to explain the reset state and a trial action.' },
    ],
  }] }), { candidates: [{ finishReason: 'STOP' }] }, { ...sourceInput, editorialPlan: conflictPlan });
  assert.equal(planSourceAuditFindings(conflict)[0].severity, 'warning');
  assert.match(planSourceAuditFindings(conflict)[0].evidence || '', /draft:/);
  assert.match(planSourceAuditFindings(conflict)[0].evidence || '', /project brief:/);
});

test('rejects incomplete coverage, duplicate items, missing evidence, and fabricated quotes', () => {
  const validFirst = {
    itemIndex: 1,
    paragraphId: 1,
    status: 'supported',
    assertion: 'The allowance is shown in an indicator.',
    detail: 'The draft states this.',
    evidence: [{ source: 'draft', quote: 'The allowance appeared in an in-page indicator.' }],
  };
  assert.throws(() => audit([validFirst]), /opening job and every approved decision/i);
  assert.throws(() => audit([validFirst, { ...validFirst, itemIndex: 1 }]), /duplicate coverage/i);
  assert.throws(() => audit([
    validFirst,
    { itemIndex: 2, status: 'supported', assertion: 'A claim.', detail: 'A detail.', evidence: [] },
  ]), /needs evidence/i);
  assert.throws(() => audit([
    validFirst,
    { itemIndex: 2, status: 'editorial', assertion: 'A choice.', detail: 'A detail.', evidence: [{ source: 'draft', quote: 'This sentence is absent.' }] },
  ]), /missing from the named draft/i);
  assert.throws(() => audit([
    validFirst,
    { itemIndex: 2, paragraphId: 999, status: 'editorial', assertion: 'A choice.', detail: 'A detail.', evidence: [{ source: 'draft', quote: 'The team planned to explain the reset state.' }] },
  ]), /wrong paragraph/i);
});

test('legacy approved plans are audited without requiring paragraph IDs', () => {
  const legacy: PlanSourceAuditInput = {
    draft: 'A legacy source statement.',
    projectBrief: '',
    editorialPlan: {
      openingJob: 'Lead with the source statement.',
      items: [{ idea: 'Keep the statement.', sourcePhrase: 'A legacy source statement.', decision: 'keep', limit: 'Keep the statement.' }],
    },
  };
  const result = validatePlanSourceAudit(JSON.stringify({ summary: 'Checked legacy plan.', items: [{
    itemIndex: 0,
    status: 'editorial',
    assertion: 'Lead with the source statement.',
    detail: 'The opening job is an editorial organization choice.',
    evidence: [{ source: 'draft', quote: 'A legacy source statement.' }],
  }, {
    itemIndex: 1,
    status: 'supported',
    assertion: 'The source has a legacy statement.',
    detail: 'The draft contains the exact statement.',
    evidence: [{ source: 'draft', quote: 'A legacy source statement.' }],
  }] }), { candidates: [{ finishReason: 'STOP' }] }, legacy);
  assert.equal(result.items[0].paragraphId, undefined);
});

test('truncated or malformed model output fails closed', () => {
  assert.throws(() => validatePlanSourceAudit('{"summary":"partial"', { candidates: [{ finishReason: 'MAX_TOKENS' }] }, sourceInput), /stopped before returning complete data/i);
  assert.throws(() => validatePlanSourceAudit('{"summary":"partial"', { candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL' }] }, sourceInput), /stopped before returning complete data/i);
  assert.throws(() => validatePlanSourceAudit('not json', { candidates: [{ finishReason: 'STOP' }] }, sourceInput), /malformed data/i);
});

test('the audit covers the maximum allowed decisions plus the opening', () => {
  const input = { ...sourceInput, editorialPlan: { ...sourceInput.editorialPlan,
    items: Array.from({ length: PLAN_MAX_ITEMS }, () => sourceInput.editorialPlan.items[0]),
  } };
  const items = Array.from({ length: PLAN_MAX_ITEMS }, (_, index) => ({
    itemIndex: index + 1, paragraphId: 1, status: 'supported', assertion: 'The allowance appears in an in-page indicator.',
    detail: 'The draft states this.', evidence: [{ source: 'draft', quote: 'The allowance appeared in an in-page indicator.' }],
  }));
  const result = validatePlanSourceAudit(JSON.stringify({ summary: 'Checked every item.', items: [openingAudit, ...items] }),
    { candidates: [{ finishReason: 'STOP' }] }, input);
  assert.equal(result.items.length, PLAN_MAX_ITEMS + 1);
});
