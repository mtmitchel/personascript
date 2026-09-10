import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDITORIAL_PLAN_SCHEMA,
  PLAN_DRAFT_MAX_CHARS,
  PLAN_FIELD_LIMITS,
  PLAN_MAX_ITEMS,
  buildEditorialPlanPrompt,
  isEditorialPlan,
  isEditorialPlanState,
  planMatchesSources,
  validateApprovedPlan,
  validateEditorialPlan,
  validateGeneratedPlan,
  validatePlanSources,
} from '../src/editorialPlan';
import type { EditorialPlan, EditorialPlanState } from '../src/types';
import { PROJECT_BRIEF_MAX_CHARS, READER_PURPOSE_MAX_CHARS } from '../src/writingPipeline';

const sources: EditorialPlanState['sources'] = {
  draft: 'The opening frames the tension. The “quiet” handoff\nkept people oriented.',
  projectBrief: 'The pilot remained illustrative, not measured.',
  readerPurpose: 'Hiring managers need to see how the author made the decision.',
};

const completePlan: EditorialPlan = {
  openingJob: 'Establish the decision and its stakes for the intended reader.',
  items: [
    {
      idea: 'Make the central tension legible before the details.',
      sourcePhrase: 'The opening frames the tension.',
      decision: 'keep',
      limit: 'Retain the reason for the decision and its scope.',
    },
    {
      idea: 'Keep the concrete handoff example while tightening it.',
      sourcePhrase: 'The “quiet” handoff kept people oriented.',
      decision: 'shorten',
      limit: 'Preserve the described outcome without adding a measured result.',
    },
    {
      idea: 'Remove the generic pilot qualification from the narrative.',
      sourcePhrase: 'The pilot remained illustrative, not measured.',
      decision: 'cut',
      limit: 'Remove this idea when it does not help the intended reader.',
    },
  ],
};

const validItem = completePlan.items[0];

test('validates a complete plan and retains all editorial decisions', () => {
  const validated = validateEditorialPlan(completePlan, sources);

  assert.deepEqual(validated, completePlan);
  assert.deepEqual(validated.items.map((item) => item.decision), ['keep', 'shorten', 'cut']);
  assert.deepEqual(EDITORIAL_PLAN_SCHEMA.required, ['version', 'openingJob', 'items']);
  assert.deepEqual(EDITORIAL_PLAN_SCHEMA.properties.items.items.required, ['paragraphId', 'idea', 'sourcePhrase', 'decision', 'limit']);
});

test('rejects malformed shapes, unsupported decisions, empty content, and oversized plans', () => {
  for (const malformed of [
    null,
    undefined,
    { openingJob: 'A plan', items: [{ ...validItem, idea: 42 }] },
    { openingJob: 'A plan', items: [{ ...validItem, sourcePhrase: undefined }] },
    { openingJob: 'A plan', items: [{ ...validItem, decision: 'defer' }] },
  ]) {
    assert.equal(isEditorialPlan(malformed), false);
    assert.throws(() => validateEditorialPlan(malformed, sources));
  }

  assert.throws(() => validateEditorialPlan({ ...completePlan, openingJob: '   ' }, sources), /opening|decision/i);
  assert.throws(() => validateEditorialPlan({ ...completePlan, items: [] }, sources), /opening|decision/i);
  assert.throws(
    () => validateEditorialPlan({ ...completePlan, items: [{ ...validItem, limit: '\t' }] }, sources),
    /complete|limit|decision/i,
  );

  const oversizedCases = [
    { ...completePlan, openingJob: 'x'.repeat(PLAN_FIELD_LIMITS.openingJob + 1) },
    { ...completePlan, items: [{ ...validItem, idea: 'x'.repeat(PLAN_FIELD_LIMITS.idea + 1) }] },
    { ...completePlan, items: [{ ...validItem, sourcePhrase: 'x'.repeat(PLAN_FIELD_LIMITS.sourcePhrase + 1) }] },
    { ...completePlan, items: [{ ...validItem, limit: 'x'.repeat(PLAN_FIELD_LIMITS.limit + 1) }] },
    { ...completePlan, items: Array.from({ length: PLAN_MAX_ITEMS + 1 }, () => validItem) },
  ];

  for (const oversized of oversizedCases) {
    assert.equal(isEditorialPlan(oversized), false);
    assert.throws(() => validateEditorialPlan(oversized, sources));
  }
});

test('anchors source phrases after normalizing whitespace and typographic quotes', () => {
  const plan: EditorialPlan = {
    openingJob: 'Explain the choice before the supporting example.',
    items: [
      {
        idea: 'Keep the source example.',
        sourcePhrase: 'The "quiet"  handoff kept\npeople oriented.',
        decision: 'keep',
        limit: 'Retain the example as described.',
      },
      {
        idea: 'Keep the brief qualification.',
        sourcePhrase: 'The pilot remained illustrative, not measured.',
        decision: 'shorten',
        limit: 'Preserve that the pilot was not measured.',
      },
    ],
  };

  assert.deepEqual(validateEditorialPlan(plan, sources), plan);
});

test('rejects a source phrase that is absent from both source inputs', () => {
  const plan: EditorialPlan = {
    ...completePlan,
    items: [{ ...validItem, sourcePhrase: 'The pilot proved that every user preferred this approach.' }],
  };

  assert.throws(() => validateEditorialPlan(plan, sources), /exact phrase|source/i);
});

test('validates source types and boundaries without silently truncating input', () => {
  assert.deepEqual(validatePlanSources(sources.draft, sources.projectBrief, sources.readerPurpose), sources);
  assert.deepEqual(validatePlanSources(sources.draft, undefined, null), {
    draft: sources.draft,
    projectBrief: '',
    readerPurpose: '',
  });

  for (const draft of [undefined, null, 42, 'too short']) {
    assert.throws(() => validatePlanSources(draft, sources.projectBrief, sources.readerPurpose), /draft/i);
  }
  assert.throws(() => validatePlanSources('x'.repeat(PLAN_DRAFT_MAX_CHARS + 1)), /draft|100,000|limit/i);

  for (const projectBrief of [42, {}, true]) {
    assert.throws(() => validatePlanSources(sources.draft, projectBrief), /projectBrief/i);
  }
  assert.throws(
    () => validatePlanSources(sources.draft, 'x'.repeat(PROJECT_BRIEF_MAX_CHARS + 1)),
    /brief|maximum|limit/i,
  );

  for (const readerPurpose of [42, {}, true]) {
    assert.throws(() => validatePlanSources(sources.draft, undefined, readerPurpose), /reader|purpose/i);
  }
  assert.throws(
    () => validatePlanSources(sources.draft, undefined, 'x'.repeat(READER_PURPOSE_MAX_CHARS + 1)),
    /reader|purpose|maximum|limit/i,
  );
});

test('shape validation preserves incomplete user edits while approval validation requires complete content', () => {
  const incompletePlan: EditorialPlan = {
    openingJob: '',
    items: [{ idea: '', sourcePhrase: '', decision: 'keep', limit: '' }],
  };
  const incompleteState: EditorialPlanState = {
    plan: incompletePlan,
    sources,
    approved: false,
  };

  assert.equal(isEditorialPlan(incompletePlan), true);
  assert.equal(isEditorialPlanState(incompleteState), true);
  assert.throws(
    () => validateApprovedPlan({ ...incompleteState, approved: true }, sources),
    /opening|decision|source|complete/i,
  );
});

test('generated plans reject truncated, blocked, and invalid JSON responses', () => {
  const completeResponse = { candidates: [{ finishReason: 'STOP' }] };
  const newPlan = { ...completePlan, version: 2, items: completePlan.items.slice(0, 2).map(item => ({ ...item, paragraphId: 1 })) };
  assert.deepEqual(validateGeneratedPlan(JSON.stringify(newPlan), completeResponse, sources), newPlan);

  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(completePlan), { candidates: [{ finishReason: 'MAX_TOKENS' }] }, sources),
    /did not finish|complete/i,
  );
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(completePlan), { promptFeedback: { blockReason: 'SAFETY' }, candidates: [{ finishReason: 'STOP' }] }, sources),
    /did not finish|blocked/i,
  );
  assert.throws(
    () => validateGeneratedPlan('{"openingJob":', completeResponse, sources),
    /unusable|malformed|JSON/i,
  );
});

test('approval requires an exact source snapshot and explicit approval', () => {
  const state: EditorialPlanState = {
    plan: completePlan,
    sources,
    approved: true,
    modelUsed: 'test-model',
  };

  assert.deepEqual(validateApprovedPlan(state, sources), state);
  assert.equal(validateApprovedPlan(undefined, sources), undefined);
  assert.throws(() => validateApprovedPlan({ ...state, approved: false }, sources), /approve/i);

  for (const key of ['draft', 'projectBrief', 'readerPurpose'] as const) {
    const staleState: EditorialPlanState = {
      ...state,
      sources: { ...sources, [key]: `${sources[key]} ` },
    };
    assert.equal(planMatchesSources(staleState, sources), false);
    assert.throws(() => validateApprovedPlan(staleState, sources), /changed|again|source/i);
  }
});

test('planning prompt includes complete source inputs without corpus or profile context', () => {
  const prompt = buildEditorialPlanPrompt(sources);

  assert.ok(prompt.includes(sources.readerPurpose));
  assert.ok(prompt.includes(sources.projectBrief));
  assert.ok(prompt.includes(sources.draft));
  assert.match(prompt, /<reader-and-purpose>[\s\S]*<\/reader-and-purpose>/);
  assert.match(prompt, /<project-brief>[\s\S]*<\/project-brief>/);
  assert.match(prompt, /<draft>[\s\S]*<\/draft>/);
  assert.doesNotMatch(prompt, /<writing-sample>|<profile>|<style-profile>|<corpus>/i);
  assert.doesNotMatch(prompt, /The Architecture of Unhurried Thought|Authentic Craftsman and Essayist/);
});
