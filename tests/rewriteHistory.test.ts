import assert from 'node:assert/strict';
import test from 'node:test';
import { RewriteResult } from '../src/types';
import { normalizeRewriteHistory, retainRewriteVersions, REWRITE_HISTORY_LIMIT } from '../src/utils/rewriteHistory';

function version(id: string, rewrittenText = id): RewriteResult {
  return {
    id, originalText: 'Original source.', rewrittenText, profileId: 'p', profileName: 'Voice',
    intensity: 'faithful', wordCountOriginal: 2, wordCountRewritten: 1,
    changesExplanation: '', createdAt: '2026-09-09T10:00:00Z',
  };
}

test('legacy duplicate IDs remain separate versions across reloads without altering texts or sources', () => {
  const saved = [version('r', 'Latest edit'), version('r', 'Previous edit'), version('r-version-1', 'Other draft')];
  const normalized = normalizeRewriteHistory(saved);
  assert.equal(new Set(normalized.map((entry) => entry.id)).size, 3);
  assert.deepEqual(normalized.map((entry) => entry.rewrittenText), saved.map((entry) => entry.rewrittenText));
  assert.ok(normalized.every((entry) => entry.originalText === 'Original source.' && entry.historicalAssessment));
  assert.deepEqual(normalizeRewriteHistory(normalized), normalized);
  assert.equal(saved[1].id, 'r');
});

test('malformed history is rejected instead of being silently emptied or partially restored', () => {
  for (const value of [null, {}, [null], [version('ok'), { id: 'bad', rewrittenText: 12 }]]) {
    assert.throws(() => normalizeRewriteHistory(value), /could not be read/);
  }
});

test('valid legacy assessments remain intact while malformed nested history is rejected', () => {
  const legacy = {
    ...version('legacy'),
    stylisticAudit: { cadenceChanges: 'Shorter clauses', structuralTweaks: 'Same sections', vocabularySubstitutions: [{ from: 'utilize', to: 'use', reason: 'Plain language' }], voiceAlignmentScore: 90 },
    styleSimilarity: { overallPercentage: 90, explanation: 'Historical estimate', breakdown: { cadenceMatch: 90, vocabularyFidelity: 90, toneConsistency: 90, domainConformance: 90 }, strengths: ['Direct'] },
  };
  assert.deepEqual(normalizeRewriteHistory([legacy])[0], { ...legacy, historicalAssessment: true });
  assert.throws(() => normalizeRewriteHistory([{ ...legacy, styleSimilarity: { ...legacy.styleSimilarity, strengths: [{}] } }]), /could not be read/);
});

test('new results keep the outgoing version and queued feedback without duplicate versions', () => {
  const old = version('old');
  const current = { ...old, feedbackItems: [{ id: 'note', selectedText: 'old', tag: 'custom' as const, label: 'Custom', note: 'Keep this note.', createdAt: old.createdAt }] };
  const next = { ...version('next'), parentId: 'old', revision: { kind: 'refine' as const, instruction: 'Clarify the opening.' } };
  const result = retainRewriteVersions([old], next, current);
  assert.deepEqual(result.map((entry) => entry.id), ['next', 'old']);
  assert.equal(result[1].feedbackItems?.[0].note, 'Keep this note.');
  assert.equal(result[0].revision.instruction, 'Clarify the opening.');
  assert.equal(old.feedbackItems, undefined);
});

test('a replaced active result missing from history is retained within the existing cap', () => {
  const history = Array.from({ length: REWRITE_HISTORY_LIMIT }, (_, i) => version(`old-${i}`));
  const next = version('next');
  const current = version('unsaved');
  const result = retainRewriteVersions(history, next, current);
  assert.equal(result.length, REWRITE_HISTORY_LIMIT);
  assert.deepEqual(result.slice(0, 3).map((entry) => entry.id), ['next', 'unsaved', 'old-0']);
  assert.equal(history.length, REWRITE_HISTORY_LIMIT);
});

test('a planned version validates against its own saved rewrite instructions', () => {
  const draft = 'Original source.';
  const base = {
    approved: true,
    plan: { version: 2, openingJob: 'Explain the source.', items: [{ paragraphId: 1, idea: 'Keep the account.', sourcePhrase: draft, decision: 'keep' as const, limit: 'Retain the recorded scope.' }] },
  };
  const withInstructions = { ...version('planned'), editorialPlan: { ...base, sources: { draft, projectBrief: '', readerPurpose: '', customInstructions: 'Keep it under 500 words.' } } };
  assert.equal(normalizeRewriteHistory([withInstructions])[0].editorialPlan?.sources.customInstructions, 'Keep it under 500 words.');
  const withoutInstructions = { ...version('legacy-planned'), editorialPlan: { ...base, sources: { draft, projectBrief: '', readerPurpose: '' } } };
  assert.equal(normalizeRewriteHistory([withoutInstructions])[0].editorialPlan?.sources.customInstructions, undefined);
  const mismatched = { ...version('bad'), editorialPlan: { ...base, sources: { draft: 'A different draft entirely.', projectBrief: '', readerPurpose: '', customInstructions: 'x' } } };
  assert.throws(() => normalizeRewriteHistory([mismatched]), /could not be read/);
});
