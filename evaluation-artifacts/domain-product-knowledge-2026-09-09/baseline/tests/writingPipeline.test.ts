import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SAMPLE_CORPUS_CHARS,
  buildQuickRefinePrompt,
  buildReviewPrompt,
  buildRewritePrompt,
  buildSelectionPrompt,
  extractNumbers,
  hasFreshProfileGuidance,
  normalizePreservationSettings,
  runLocalPreservationChecks,
  validateGeneratedReview,
  validateGeneratedProse,
  validateWritingCorpus,
} from '../src/writingPipeline';

const profile = {
  id: 'profile-1',
  name: 'Author',
  description: '',
  sampleIds: ['one', 'two'],
  updatedAt: '2026-01-01T00:00:00.000Z',
  metrics: {
    formality: 50,
    avgSentenceLength: 12,
    sentenceLengthVariance: 50,
    lexicalSophistication: 50,
    warmth: 50,
    directness: 50,
    activeVoiceRatio: 50,
    metaphorDensity: 50,
  },
  voiceManifesto: 'Use the author cadence.',
  synthesizedGuidelines: {
    doList: ['Use plain verbs.'],
    dontList: ['Avoid filler.'],
    signatureHabits: ['Vary sentence length.'],
    vocabularyPreferences: ['Concrete words.'],
    pacingGuide: 'Let paragraphs breathe.',
  },
  customDirectives: 'Keep the user directive.',
};

const samples = [
  { id: 'one', title: 'One', content: 'The first sample has a distinctive cadence and a long closing sentence.' },
  { id: 'two', title: 'Two', content: 'The second sample is short. It breaks.' },
];

test('forwards every enabled raw sample without excerpts or truncation', () => {
  const prompt = buildRewritePrompt({
    draft: 'The draft has a qualification: it may happen.',
    profile,
    samples,
    intensity: 'faithful',
    preservationSettings: normalizePreservationSettings({}),
  });
  assert.match(prompt, /The first sample has a distinctive cadence/);
  assert.match(prompt, /The second sample is short/);
  assert.match(prompt, /never import sample-specific facts/i);
  assert.match(prompt, /draft is the semantic source of truth/i);
  assert.match(prompt, /fresh sentences and paragraphs/i);
  assert.doesNotMatch(prompt, /paywall|high-converting decision points|20% to 40%/i);
});

test('migrates canned preservation labels into flags and retains arbitrary locks', () => {
  const settings = normalizePreservationSettings({
    customLocks: 'Structure, headings, and formatting; Technical terms and proper names; Keep Q3 roadmap unchanged.',
  });
  assert.equal(settings.keepStructure, true);
  assert.equal(settings.headingTreatment, 'preserve_verbatim');
  assert.equal(settings.preserveTerms, true);
  assert.equal(settings.customLocks, 'Keep Q3 roadmap unchanged.');

  const legacyV2 = normalizePreservationSettings({
    keepStructure: true,
    headingTreatment: 'revise_in_voice',
    preserveNumbers: true,
    preserveQuotes: true,
    preserveTerms: false,
    customLocks: 'Structure, headings, and formatting; Technical terms and proper names',
  });
  assert.equal(legacyV2.keepStructure, true);
  assert.equal(legacyV2.headingTreatment, 'preserve_verbatim');
  assert.equal(legacyV2.preserveTerms, true);
  assert.equal(legacyV2.customLocks, '');

  const migrated = normalizePreservationSettings({}, 'Numbers, metrics, and data points; Direct quotations; Preserve the launch date.');
  assert.equal(migrated.preserveNumbers, true);
  assert.equal(migrated.preserveQuotes, true);
  assert.equal(migrated.customLocks, 'Preserve the launch date.');

  const prompt = buildRewritePrompt({
    draft: 'Protect the launch date.',
    samples,
    preservationLocks: 'Structure, headings, and formatting; Technical terms and proper names; Keep Q3 roadmap unchanged.',
  });
  assert.match(prompt, /Keep headings and section titles exactly as supplied/);
  assert.match(prompt, /Preserve technical terms, product names, and proper names exactly/);
  assert.match(prompt, /Keep Q3 roadmap unchanged/);
  assert.doesNotMatch(prompt, /Additional user locks: Structure, headings, and formatting/);
});

test('rejects empty and oversized corpora without silently truncating', () => {
  assert.throws(() => validateWritingCorpus([]), /Enable at least one/);
  assert.throws(() => validateWritingCorpus([{ id: 'empty', content: '  ' }]), /empty/i);
  assert.throws(
    () => validateWritingCorpus([{ id: 'large', content: 'x'.repeat(MAX_SAMPLE_CORPUS_CHARS + 1) }]),
    /above the 100,000 character limit/i,
  );
});

test('excludes stale generated guidance while retaining explicit directives', () => {
  const staleProfile = { ...profile, sampleIds: ['one'], voiceManifesto: 'Do not use this stale guidance.' };
  assert.equal(hasFreshProfileGuidance(staleProfile, samples), false);
  const prompt = buildRewritePrompt({ draft: 'Draft.', profile: staleProfile, samples });
  assert.doesNotMatch(prompt, /Do not use this stale guidance/);
  assert.match(prompt, /Keep the user directive/);
});

test('applies tone sliders only when explicitly enabled', () => {
  const off = buildRewritePrompt({ draft: 'Draft.', profile, samples, toneAdjustments: { formality: 2, enthusiasm: 3, conciseness: 4 } });
  const on = buildRewritePrompt({ draft: 'Draft.', profile, samples, toneAdjustments: { formality: 2, enthusiasm: 3, conciseness: 4 }, toneEnabled: true });
  assert.match(off, /Use the corpus’s natural tone/);
  assert.doesNotMatch(off, /formality 2\/100/);
  assert.match(on, /formality 2\/100/);
});

test('local exact checks flag missing and unexpected protected tokens', () => {
  assert.deepEqual(extractNumbers('Q3 had 12% and 4.'), ['Q3', '12%', '4']);
  const checks = runLocalPreservationChecks(
    '# Heading\nThe result was 12% and included “quoted text”.',
    '# Heading\nThe result was 13% and included “different text”.',
    { preserveNumbers: true, preserveQuotes: true, headingTreatment: 'preserve_verbatim' },
  );
  assert.equal(checks.every((check) => check.passed), false);
  assert.ok(checks.find((check) => check.kind === 'numbers')?.missing.includes('12%'));
  assert.ok(checks.find((check) => check.kind === 'quotes')?.missing.includes('“quoted text”'));
});

test('refinement and selection prompts compare complete text and preserve exact range', () => {
  const refine = buildQuickRefinePrompt({
    draft: 'Original source.',
    currentText: 'Current result.',
    instruction: 'Make the opening clearer.',
    profile,
    samples,
  });
  assert.match(refine, /<source-draft>/);
  assert.match(refine, /<current-text>/);
  assert.match(refine, /original source draft as the authority for meaning/i);

  const selection = buildSelectionPrompt({
    draft: 'Original source.',
    currentText: 'Current result.',
    selectedText: 'result',
    selectionRange: { start: 8, end: 14 },
    surroundingContext: 'Current result.',
    profile,
    samples,
  });
  assert.match(selection, /validated selection range is \[8, 14\)/);
  assert.match(selection, /Rewrite only the selected passage/);
  assert.match(selection, /semantic status/i);
});

test('structure-off prompts do not restore section-order preservation through intensity', () => {
  const prompt = buildRewritePrompt({
    draft: 'Source meaning.',
    samples,
    intensity: 'faithful',
    preservationSettings: { keepStructure: false },
  });
  assert.match(prompt, /section order is not a preservation requirement/i);
  assert.doesNotMatch(prompt, /Balanced: preserve substance and section order/i);
});

test('review prompt requests structured observations without a self-score', () => {
  const prompt = buildReviewPrompt({ sourceText: 'Source.', finalText: 'Final.', profile, samples });
  assert.match(prompt, /Return JSON/);
  assert.match(prompt, /possible omissions/i);
  assert.match(prompt, /factual fidelity and semantic status come first/i);
  assert.match(prompt, /do not rewrite the prose/i);
  assert.doesNotMatch(prompt, /overallPercentage|styleSimilarity|voiceAlignmentScore|percentage score/i);
});

test('rejects blocked or truncated writing responses', () => {
  assert.throws(() => validateGeneratedProse('Partial draft', { candidates: [{ finishReason: 'MAX_TOKENS' }] }), /complete draft/i);
  assert.throws(() => validateGeneratedProse('Partial draft', { promptFeedback: { blockReason: 'SAFETY' } }), /blocked this request/i);
  assert.equal(validateGeneratedProse('As an AI editor, I can help with this draft.'), 'As an AI editor, I can help with this draft.');
  assert.equal(validateGeneratedProse('A complete draft.'), 'A complete draft.');
});

test('rejects malformed or truncated review responses', () => {
  assert.throws(
    () => validateGeneratedReview('{"summary":"partial"', { candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    /stopped before returning complete review data/i,
  );
  assert.throws(
    () => validateGeneratedReview('{"summary":"partial"'),
    /malformed review data/i,
  );
  assert.deepEqual(
    validateGeneratedReview(JSON.stringify({ summary: 'Reviewed.', findings: [], voiceObservations: [] })),
    { summary: 'Reviewed.', findings: [], voiceObservations: [] },
  );
});
