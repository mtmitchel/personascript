import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanPdfPages, cleanSourceText, sourceContainsPhrase } from '../src/sourceText';
import { validatePlanSources, planMatchesSources } from '../src/editorialPlan';
import { buildRewritePrompt, runLocalPreservationChecks } from '../src/writingPipeline';

const pages = [
  'Author portfolio Page 1\nProject title\nI kept the 5 MB limit visible.\nCaption: the trial allows 20 MB.',
  'Project case study\nAuthor portfolio Page 2\nDocument allowances\nThe reset is in 16 days.\nA useful explanation.',
  'Project case study\nAuthor portfolio Page 3\nResults\nThe wider program increased conversion by 12%.\nA distinct closing thought.',
];
const extracted = pages.map((page, i) => `${page}\n\n-- ${i + 1} of 3 --`).join('\n\n');

test('removes recurring page-edge headers and parser joiners without deleting headings, captions or figures', () => {
  const clean = cleanSourceText(extracted);
  assert.equal(clean, cleanPdfPages(pages));
  assert.doesNotMatch(clean, /Author portfolio|Project case study|-- \d of/);
  for (const expected of ['Project title', 'Caption: the trial allows 20 MB.', 'Document allowances', 'Results', '5 MB', '16 days', '12%']) assert.ok(clean.includes(expected));
  assert.equal(cleanSourceText(clean), clean);
});

test('leaves ordinary text and partial or out-of-order marker examples unchanged', () => {
  for (const text of ['Page 1\nThis is an ordinary heading.', 'A marker example:\n-- 1 of 3 --\nBody follows.', '-- 2 of 2 --\nExample\n-- 1 of 2 --']) {
    assert.equal(cleanSourceText(text), text);
  }
  assert.equal(cleanPdfPages(['A unique first line\nUseful body text\nA useful caption']), 'A unique first line\nUseful body text\nA useful caption');
});

test('does not remove repeated body content away from page edges', () => {
  const body = 'A repeated claim belongs in the body.';
  const values = [1, 2, 3].map(i => `Running title Page ${i}\nUnique title ${i}\n${body}\nUnique ending ${i}\nFooter ${i}`);
  assert.equal(cleanPdfPages(values).split(body).length - 1, 3);
});

test('matches quotations spanning removed furniture but rejects skipped captions or changed claims', () => {
  assert.equal(sourceContainsPhrase(extracted, 'A useful explanation. Results The wider program increased conversion by 12%.'), true);
  assert.equal(sourceContainsPhrase(extracted, 'I kept the 5 MB limit visible. Document allowances'), false);
  assert.equal(sourceContainsPhrase(extracted, 'My work increased conversion by 12%.'), false);
});

test('uses the same cleaned draft in planning, writing, source matching and number checks', () => {
  const sources = validatePlanSources(extracted);
  const clean = cleanSourceText(extracted);
  assert.equal(sources.draft, clean);
  assert.equal(planMatchesSources({ sources, plan: { openingJob: '', items: [] }, approved: false }, { ...sources, draft: extracted }), true);
  const prompt = buildRewritePrompt({ draft: extracted, samples: [{ id: 'one', content: 'A short sample of writing with a clear cadence.' }] });
  assert.ok(prompt.includes(clean));
  assert.doesNotMatch(prompt, /Author portfolio|-- 1 of 3 --/);
  const checks = runLocalPreservationChecks(extracted, clean, { preserveNumbers: true, preserveQuotes: false });
  assert.equal(checks[0].passed, true);
  assert.deepEqual(checks[0].missing, []);
});


test('preserves standalone body numbers without page-label evidence', () => {
  const text = 'Section heading\nThe measured count was\n1';
  assert.equal(cleanPdfPages([text]), text);
  assert.equal(cleanPdfPages(['Page 1\nThe measured count was 1.']), 'The measured count was 1.');
});
