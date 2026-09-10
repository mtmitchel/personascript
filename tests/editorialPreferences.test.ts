import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EDITORIAL_PREFERENCES, EDITORIAL_PREFERENCES_MAX_CHARS, validateEditorialPreferences,
  buildRewritePrompt, buildQuickRefinePrompt, buildSelectionPrompt, buildReviewPrompt } from '../src/writingPipeline';
import { buildEditorialPlanPrompt, planMatchesSources, validateApprovedPlan, validatePlanSources } from '../src/editorialPlan';
import { buildPlanSourceAuditPrompt } from '../src/planAssertionReview';
import { EMPTY_STUDIO_WORKSPACE, parseStudioWorkspace, readStudioWorkspace, saveStudioWorkspace } from '../src/utils/studioWorkspace';
import { normalizeRewriteHistory } from '../src/utils/rewriteHistory';
import type { EditorialPlanState, RewriteResult } from '../src/types';

const preferences = 'Keep named design principles. STANDING_PREFERENCE_SENTINEL';
const draft = 'I explained the decision and its evidence.';
const sources = { draft, projectBrief: '', readerPurpose: '', editorialPreferences: preferences };
const state: EditorialPlanState = { sources, approved: true, plan: { version: 2, openingJob: 'Explain the decision.', items: [{ paragraphId: 1, idea: 'The decision', sourcePhrase: draft, decision: 'keep', limit: 'Keep the explanation.' }] } };
const result: RewriteResult = { id: 'a', profileId: 'p', profileName: 'Profile', intensity: 'faithful', originalText: draft, rewrittenText: draft,
  wordCountOriginal: 7, wordCountRewritten: 7, createdAt: '2026-09-09T12:00:00Z', changesExplanation: '', editorialPlan: state, editorialPreferences: preferences };

test('standing preferences default once, persist across source changes, and remain deliberately cleared', () => {
  assert.match(DEFAULT_EDITORIAL_PREFERENCES, /named design principles/);
  assert.match(DEFAULT_EDITORIAL_PREFERENCES, /illustrative examples/);
  assert.match(DEFAULT_EDITORIAL_PREFERENCES, /confidently/);
  assert.match(DEFAULT_EDITORIAL_PREFERENCES, /program or team/);
  const legacy = { ...EMPTY_STUDIO_WORKSPACE, editorialPreferences: undefined };
  assert.equal(parseStudioWorkspace(JSON.stringify(legacy)).editorialPreferences, DEFAULT_EDITORIAL_PREFERENCES);
  for (const editorialPreferences of [preferences, '']) {
    let saved: string | null = null;
    const storage = { setItem: (_key: string, value: string) => { saved = value; }, getItem: () => saved };
    saveStudioWorkspace(storage, { ...EMPTY_STUDIO_WORKSPACE, editorialPreferences, draftText: 'Case one.' });
    const first = readStudioWorkspace(storage).workspace;
    saveStudioWorkspace(storage, { ...first, draftText: 'Case two.', projectBrief: 'A different project.' });
    assert.equal(readStudioWorkspace(storage).workspace.editorialPreferences, editorialPreferences);
  }
});

test('changed preferences require approval again, and malformed or oversized inputs reject', () => {
  assert.deepEqual(validatePlanSources(draft, '', '', preferences), sources);
  assert.equal(planMatchesSources(state, sources), true);
  for (const editorialPreferences of ['', 'A different preference.']) {
    assert.equal(planMatchesSources(state, { ...sources, editorialPreferences }), false);
    assert.throws(() => validateApprovedPlan(state, { ...sources, editorialPreferences }), /writing instructions or preferences changed/);
  }
  assert.equal(planMatchesSources(state, { ...sources, customInstructions: 'Focus on the opening.' }), false);
  assert.throws(() => validateApprovedPlan(state, { ...sources, customInstructions: 'Focus on the opening.' }), /writing instructions or preferences changed/);
  for (const value of [42, {}, [], 'x'.repeat(EDITORIAL_PREFERENCES_MAX_CHARS + 1)]) {
    assert.throws(() => validateEditorialPreferences(value));
    assert.throws(() => validatePlanSources(draft, '', '', value));
  }
});

test('saved versions keep the exact preferences they used and do not inherit current defaults', () => {
  const saved = { ...EMPTY_STUDIO_WORKSPACE, editorialPreferences: 'Current case preferences.', rewriteResult: result };
  const restored = parseStudioWorkspace(JSON.stringify(saved));
  assert.equal(restored.editorialPreferences, 'Current case preferences.');
  assert.equal(restored.rewriteResult?.editorialPreferences, preferences);
  assert.equal(restored.rewriteResult?.editorialPlan?.sources.editorialPreferences, preferences);
  assert.throws(() => normalizeRewriteHistory([{ ...result, editorialPreferences: 'Mismatched snapshot.' }]));
  const legacy = { ...result, editorialPreferences: undefined, editorialPlan: undefined };
  assert.equal(normalizeRewriteHistory([legacy])[0].editorialPreferences, undefined);
  assert.throws(() => normalizeRewriteHistory([{ ...legacy, editorialPreferences: 'x'.repeat(EDITORIAL_PREFERENCES_MAX_CHARS + 1) }]));
});

test('an oversized working preference remains recoverable for editing without losing the draft', () => {
  const editorialPreferences = 'x'.repeat(EDITORIAL_PREFERENCES_MAX_CHARS + 1);
  const restored = parseStudioWorkspace(JSON.stringify({ ...EMPTY_STUDIO_WORKSPACE, draftText: draft, editorialPreferences }));
  assert.equal(restored.draftText, draft);
  assert.equal(restored.editorialPreferences, editorialPreferences);
  assert.throws(() => validatePlanSources(restored.draftText, '', '', restored.editorialPreferences));
});

test('planning, all writing scopes and prose review receive preferences; factual source audit does not', () => {
  const input = { ...sources, editorialPlan: state.plan, samples: [{ id: 'sample', content: 'This sample supplies expression only.' }] };
  const prompts = [buildEditorialPlanPrompt(sources), buildRewritePrompt(input),
    buildQuickRefinePrompt({ ...input, currentText: draft, instruction: 'Shorten.' }),
    buildSelectionPrompt({ ...input, currentText: draft, selectedText: draft, instruction: 'Clarify.' }),
    buildReviewPrompt({ ...input, sourceText: draft, finalText: draft })];
  for (const prompt of prompts) {
    assert.ok(prompt.includes(preferences));
    assert.match(prompt, /not factual evidence/);
    assert.match(prompt, /approved case decisions or newer explicit edit request/);
  }
  assert.doesNotMatch(buildPlanSourceAuditPrompt({ draft, editorialPlan: state.plan }), /STANDING_PREFERENCE_SENTINEL/);
  assert.doesNotMatch(buildRewritePrompt({ ...input, editorialPreferences: '' }), /<standing-editorial-preferences>/);
});

test('preference save failure leaves the previous working copy recoverable', () => {
  const saved = JSON.stringify({ ...EMPTY_STUDIO_WORKSPACE, editorialPreferences: preferences });
  const storage = { getItem: () => saved, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.match(saveStudioWorkspace(storage, { ...EMPTY_STUDIO_WORKSPACE, editorialPreferences: 'An unsaved change.' }) || '', /could not be saved/);
  assert.equal(readStudioWorkspace(storage).workspace.editorialPreferences, preferences);
});
