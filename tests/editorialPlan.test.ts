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
import type { DomainExpertise, EditorialPlan, EditorialPlanState } from '../src/types';
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
  assert.deepEqual(EDITORIAL_PLAN_SCHEMA.required, ['version', 'openingJob', 'items', 'conflicts']);
  assert.deepEqual(EDITORIAL_PLAN_SCHEMA.properties.items.items.required, ['paragraphRange', 'decision', 'idea', 'reason', 'sourcePhrase', 'limit']);
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

const v3Sources: EditorialPlanState['sources'] = {
  ...sources,
  draft: 'The opening frames the tension.\n\nThe “quiet” handoff kept people oriented.',
};

test('generated plans reject truncated, blocked, and invalid JSON responses', () => {
  const completeResponse = { candidates: [{ finishReason: 'STOP' }] };
  const v4Generated = {
    version: 4,
    openingJob: completePlan.openingJob,
    items: [
      {
        paragraphRange: { from: 1, to: 1 },
        sourcePhrase: 'The opening frames the tension.',
        decision: 'keep',
        limit: '',
      },
      {
        paragraphRange: { from: 2, to: 2 },
        idea: 'Keep the concrete handoff example while tightening it.',
        reason: 'The reader needs the example, not the build-up around it.',
        sourcePhrase: 'The “quiet” handoff kept people oriented.',
        decision: 'shorten',
        limit: '',
      },
    ],
  };
  const validated = validateGeneratedPlan(JSON.stringify(v4Generated), completeResponse, v3Sources);
  assert.equal(validated.version, 4);
  assert.equal(validated.items.length, 2);
  assert.deepEqual(validated.conflicts, []);
  assert.equal(validated.items[0].idea, '');
  assert.equal(validated.items[0].reason, '');
  assert.equal(validated.items[0].limit, '');
  assert.equal(validated.items[1].reason, 'The reader needs the example, not the build-up around it.');

  // Every suggested change carries its reason; the model may not propose a change without one.
  const unreasoned = { ...v4Generated, items: [v4Generated.items[0], { ...v4Generated.items[1], reason: '' }] };
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(unreasoned), completeResponse, v3Sources),
    /Suggestion 2 needs a reason\./,
  );

  // Generation requires a limit on every figure-bearing passage, so the model
  // must say how far the writer may take that claim.
  const figureSources = { ...v3Sources, draft: 'The opening frames the tension.\n\nThe 12% lift held.' };
  const unlimited = { ...v4Generated, items: [
    v4Generated.items[0],
    { ...v4Generated.items[1], sourcePhrase: 'The 12% lift held.' },
  ] };
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(unlimited), completeResponse, figureSources),
    /covers a figure/,
  );
  assert.doesNotThrow(() => validateGeneratedPlan(JSON.stringify({ ...unlimited, items: [unlimited.items[0], { ...unlimited.items[1], limit: 'The 12% belongs to the program, not the author.' }] }), completeResponse, figureSources));

  const v3Generated = { ...v4Generated, version: 3 };
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(v3Generated), completeResponse, v3Sources),
    /The planning model returned unusable decisions\. The proposal is missing its required format\./,
  );

  const v2Plan = { ...completePlan, version: 2, items: completePlan.items.slice(0, 2).map(item => ({ ...item, paragraphId: 1 })) };
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(v2Plan), completeResponse, v3Sources),
    /The planning model returned unusable decisions\. The proposal is missing its required format\./,
  );

  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(v4Generated), { candidates: [{ finishReason: 'MAX_TOKENS' }] }, v3Sources),
    /did not finish|complete/i,
  );
  assert.throws(
    () => validateGeneratedPlan(JSON.stringify(v4Generated), { promptFeedback: { blockReason: 'SAFETY' }, candidates: [{ finishReason: 'STOP' }] }, v3Sources),
    /did not finish|blocked/i,
  );
  assert.throws(
    () => validateGeneratedPlan('{"openingJob":', completeResponse, v3Sources),
    /unusable|malformed|JSON/i,
  );
});

test('validates version 3 section plans with paragraph ranges and field constraints', () => {
  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Establish the core tension.',
    items: [
      {
        paragraphRange: { from: 1, to: 2 },
        decision: 'keep',
        idea: '',
        sourcePhrase: 'The opening frames the tension.',
        limit: '',
      },
    ],
    conflicts: [],
  };

  const normalized = validateEditorialPlan(v3Plan, v3Sources);
  assert.deepEqual(normalized, {
    version: 3,
    openingJob: 'Establish the core tension.',
    items: [
      {
        paragraphRange: { from: 1, to: 2 },
        idea: '',
        reason: '',
        sourcePhrase: 'The opening frames the tension.',
        decision: 'keep',
        limit: '',
      },
    ],
    conflicts: [],
  });

  assert.throws(
    () => validateEditorialPlan({
      ...v3Plan,
      items: [{ ...v3Plan.items[0], paragraphRange: { from: 1, to: 1 } }],
    }, v3Sources),
    /Add suggestions covering draft paragraphs 2\. Every paragraph needs a decision, including paragraphs to cut\./,
  );

  assert.throws(
    () => validateEditorialPlan({
      ...v3Plan,
      items: [{ ...v3Plan.items[0], decision: 'shorten', idea: '' }],
    }, v3Sources),
    /Suggestion 1 needs to say what changes\./,
  );

  // Approval does not demand a reason; only generation does, so suggestions
  // saved before reasons existed can still be approved.
  assert.doesNotThrow(() => validateEditorialPlan({
    ...v3Plan,
    items: [{ ...v3Plan.items[0], decision: 'shorten', idea: 'Cut the build-up.' }],
  }, v3Sources));
  assert.throws(
    () => validateEditorialPlan({
      ...v3Plan,
      items: [{ ...v3Plan.items[0], decision: 'shorten', idea: 'Cut the build-up.' }],
    }, v3Sources, { requireReasons: true }),
    /Suggestion 1 needs a reason\./,
  );

  assert.doesNotThrow(() => validateEditorialPlan(v3Plan, v3Sources));

  assert.throws(
    () => validateEditorialPlan({
      ...v3Plan,
      items: [
        { paragraphRange: { from: 1, to: 1 }, decision: 'keep', idea: '', sourcePhrase: 'The opening frames the tension.', limit: '' },
        { paragraphRange: { from: 2, to: 2 }, decision: 'keep', idea: '', sourcePhrase: 'The opening frames the tension.', limit: '' },
      ],
    }, v3Sources),
    /Suggestion 2 needs an exact phrase from draft paragraphs 2–2\./,
  );
});

test('section plans keep their own version and generation can require claim limits', () => {
  const v4Plan: EditorialPlan = {
    version: 4,
    openingJob: 'Establish the core tension.',
    items: [
      {
        paragraphRange: { from: 1, to: 2 },
        decision: 'keep',
        idea: '',
        sourcePhrase: 'The opening frames the tension.',
        limit: 'Keep the framing as the author’s own reading, not a measured result.',
      },
    ],
    conflicts: [],
  };

  assert.equal(validateEditorialPlan(v4Plan, v3Sources).version, 4);
  assert.equal(validateEditorialPlan({ ...v4Plan, version: 3 }, v3Sources).version, 3);
  assert.deepEqual(validateEditorialPlan({ ...v4Plan, version: 3 }, v3Sources).items, validateEditorialPlan(v4Plan, v3Sources).items);

  // Generation requires a limit wherever the passage carries a figure; approval
  // trusts the author, so a saved v4 suggestion without one still validates.
  const figureSources = { ...v3Sources, draft: 'The 12% lift held after the handoff.' };
  const figurePlan: EditorialPlan = { ...v4Plan, items: [{ ...v4Plan.items[0], paragraphRange: { from: 1, to: 1 }, sourcePhrase: figureSources.draft, limit: '' }] };
  assert.doesNotThrow(() => validateEditorialPlan(figurePlan, figureSources));
  assert.throws(
    () => validateEditorialPlan(figurePlan, figureSources, { requireClaimLimits: true }),
    /Suggestion 1 covers a figure; say in limit how far the writer may take that claim\./,
  );
  assert.doesNotThrow(() => validateEditorialPlan({ ...figurePlan, items: [{ ...figurePlan.items[0], limit: 'The 12% belongs to the program, not the author.' }] }, figureSources, { requireClaimLimits: true }));
});

test('the author’s answer to a suggestion decides how it is executed', () => {
  const suggestion: EditorialPlan['items'][number] = {
    paragraphRange: { from: 1, to: 2 },
    decision: 'cut',
    idea: 'Drop the framing paragraph.',
    reason: 'The reader already knows the tension from the title.',
    sourcePhrase: 'The opening frames the tension.',
    limit: '',
  };
  const plan = (response?: 'accepted' | 'rejected' | 'ignored'): EditorialPlan => ({
    version: 3,
    openingJob: 'Establish the core tension.',
    items: [response ? { ...suggestion, response } : suggestion],
    conflicts: [],
  });

  // Pending and accepted suggestions are executed as written.
  assert.equal(validateEditorialPlan(plan(), v3Sources).items[0].decision, 'cut');
  const accepted = validateEditorialPlan(plan('accepted'), v3Sources).items[0];
  assert.equal(accepted.decision, 'cut');
  assert.equal(accepted.response, 'accepted');

  // Rejected and ignored suggestions become keep, with the suggestion text removed.
  for (const response of ['rejected', 'ignored'] as const) {
    const kept = validateEditorialPlan(plan(response), v3Sources).items[0];
    assert.deepEqual(kept, { paragraphRange: { from: 1, to: 2 }, idea: '', reason: '', sourcePhrase: 'The opening frames the tension.', decision: 'keep', limit: '' });
  }

  // A rejected suggestion never needs a reason, even where reasons are required.
  assert.doesNotThrow(() => validateEditorialPlan({ ...plan('rejected'), items: [{ ...suggestion, reason: '', response: 'rejected' }] }, v3Sources, { requireReasons: true }));
  assert.throws(() => validateEditorialPlan({ ...plan(), items: [{ ...suggestion, response: 'maybe' as never }] }, v3Sources), /invalid format/);
});

test('author requests attach to an exact passage inside their paragraph range', () => {
  const base: EditorialPlan = {
    version: 3,
    openingJob: 'Establish the core tension.',
    items: [{ paragraphRange: { from: 1, to: 2 }, decision: 'keep', idea: '', sourcePhrase: 'The opening frames the tension.', limit: '' }],
    conflicts: [],
  };
  const request = { paragraphRange: { from: 2, to: 2 }, sourcePhrase: 'kept people oriented', instruction: 'Say who was kept oriented; the reader is a hiring manager.' };

  const validated = validateEditorialPlan({ ...base, requests: [request] }, v3Sources);
  assert.deepEqual(validated.requests, [request]);
  assert.equal('requests' in validateEditorialPlan(base, v3Sources), false);
  assert.equal('requests' in validateEditorialPlan({ ...base, requests: [] }, v3Sources), false);

  assert.throws(
    () => validateEditorialPlan({ ...base, requests: [{ ...request, paragraphRange: { from: 1, to: 1 } }] }, v3Sources),
    /Your request 1 no longer matches the draft\. Remove it or select the passage again\./,
  );
  assert.throws(
    () => validateEditorialPlan({ ...base, requests: [{ ...request, sourcePhrase: 'kept people confused' }] }, v3Sources),
    /Your request 1 no longer matches the draft/,
  );
  assert.throws(
    () => validateEditorialPlan({ ...base, requests: [{ ...request, instruction: '   ' }] }, v3Sources),
    /Say what should change in your request 1\./,
  );
  assert.throws(
    () => validateEditorialPlan({ ...base, requests: [{ ...request, paragraphRange: { from: 2, to: 9 } }] }, v3Sources),
    /Your request 1 no longer matches the draft/,
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
  // Every suggested change must come with its reason; the author reads it before answering.
  assert.match(prompt, /- reason: for shorten or cut/);
  assert.match(prompt, /accept, reject, or ignore/);
  // Version 4 plans by claim inside each section, and the opening may not invent a diagnosis.
  assert.ok(prompt.includes('one suggestion for each distinct claim'));
  assert.ok(prompt.includes('Do not introduce a diagnosis'));
  assert.ok(prompt.includes('version: 4'));
  assert.equal(prompt.includes('five to ten'), false);
  // The prompt states the same figure rule the generation validator enforces, so a
  // plan that follows the prompt is never rejected for a bare number.
  assert.ok(prompt.includes('contain a number, percentage, currency amount, date, or duration must carry a limit'));
  assert.match(prompt, /For each suggestion choose one decision:/);
  assert.doesNotMatch(prompt, /For each section choose/);
});

test('the planning prompt carries enabled domain context as interpretation only', () => {
  const domain: DomainExpertise = {
    enabled: true,
    field: 'Product design',
    disciplines: ['Information architecture'],
    topics: [{ id: 'hierarchy', name: 'Information hierarchy', keyTerminology: ['Progressive disclosure'], conventions: [], enabled: true }],
    keyTerminology: [],
    conventions: [],
    audienceContext: '',
  };

  const withDomain = buildEditorialPlanPrompt(sources, domain);
  assert.ok(withDomain.includes('DOMAIN CONTEXT'));
  assert.ok(withDomain.includes('Information hierarchy'));
  assert.ok(withDomain.includes('adds no facts'));

  // No settings supplied still names the block, so the planner is never told a
  // partial story.
  assert.ok(buildEditorialPlanPrompt(sources).includes('No domain settings are enabled.'));
  assert.ok(buildEditorialPlanPrompt(sources, { ...domain, enabled: false }).includes('No domain settings are enabled.'));
});
