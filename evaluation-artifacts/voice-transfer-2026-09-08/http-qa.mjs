import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const directory = path.resolve('evaluation-artifacts/voice-transfer-2026-09-08');
const input = JSON.parse(fs.readFileSync(path.join(directory, 'revised-input.json'), 'utf8'));
const run = `http-qa-${Date.now()}`;
const results = [];
let canonicalOutput;

async function scenario(name, route, body, check, calls) {
  const before = new Set(fs.readdirSync(directory));
  const response = await fetch(`http://localhost:3103${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  const newRequests = fs.readdirSync(directory).filter(file => !before.has(file) && file.startsWith('mock-') && file.endsWith('-request.json'));
  let error;
  try {
    check(response.status, data);
    assert.equal(newRequests.length, calls, 'unexpected number of model calls');
    for (const file of newRequests) {
      const request = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      assert.ok(request.config.systemInstruction, 'missing system instruction');
      for (const sample of input.samples) {
        assert.ok(JSON.stringify(request.contents).includes(JSON.stringify(sample.content).slice(1, -1)), 'full sample omitted from actual model call');
      }
    }
  } catch (e) { error = e.message; }
  const result = { name, route, httpStatus: response.status, passed: !error, error, requests: newRequests, response: data };
  results.push(result);
  fs.writeFileSync(path.join(directory, `${run}-${name}.json`), JSON.stringify({ request: body, ...result }, null, 2));
  console.log(`${error ? 'FAIL' : 'PASS'} ${name}${error ? `: ${error}` : ''}`);
}

await scenario('rewrite', '/api/rewrite-draft', input, (status, data) => {
  assert.equal(status, 200);
  assert.ok(data.rewrittenText);
  canonicalOutput = data.rewrittenText;
  assert.equal(data.review.status, 'complete');
  assert.equal(data.styleSimilarity, undefined);
  assert.equal(data.stylisticAudit, undefined);
}, 2);
await scenario('empty-corpus', '/api/rewrite-draft', { ...input, samples: [] }, (status, data) => {
  assert.equal(status, 400);
  assert.match(data.error, /sample/i);
}, 0);
await scenario('disabled-corpus', '/api/rewrite-draft', { ...input, samples: input.samples.map(s => ({ ...s, enabled: false })) }, status => assert.equal(status, 400), 0);
await scenario('oversized-corpus', '/api/rewrite-draft', { ...input, samples: [{ id: 'large', content: 'x'.repeat(100001) }] }, (status, data) => {
  assert.equal(status, 400);
  assert.match(data.error, /100,?000|limit/i);
}, 0);
for (const [name, marker] of [['empty-output', 'QA_EMPTY_OUTPUT'], ['truncated-output', 'QA_TRUNCATED_OUTPUT'], ['blocked-output', 'QA_BLOCKED_OUTPUT'], ['generation-error', 'QA_GENERATION_ERROR']]) {
  await scenario(name, '/api/rewrite-draft', { ...input, customInstructions: `[${marker}]` }, (status, data) => {
    assert.ok(status >= 400);
    assert.ok(data.error);
    assert.equal(data.rewrittenText, undefined);
  }, 1);
}
await scenario('review-error', '/api/rewrite-draft', { ...input, customInstructions: '[QA_REVIEW_ERROR]' }, (status, data) => {
  assert.equal(status, 200);
  assert.ok(data.rewrittenText);
  assert.equal(data.review.status, 'unavailable');
}, 2);
await scenario('malformed-review', '/api/rewrite-draft', { ...input, customInstructions: '[QA_MALFORMED_REVIEW]' }, (status, data) => {
  assert.equal(status, 200);
  assert.ok(data.rewrittenText);
  assert.equal(data.review.status, 'unavailable');
}, 2);
await scenario('truncated-review', '/api/rewrite-draft', { ...input, customInstructions: '[QA_TRUNCATED_REVIEW]' }, (status, data) => {
  assert.equal(status, 200);
  assert.ok(data.rewrittenText);
  assert.equal(data.review.status, 'unavailable');
}, 2);
await scenario('quick-refine', '/api/quick-refine', {
  ...input, currentText: canonicalOutput, originalText: input.draft, instruction: 'Use shorter sentences without changing meaning.',
}, (status, data) => {
  assert.equal(status, 200);
  assert.ok(data.refinedText);
  assert.equal(data.review.status, 'complete');
}, 2);
const selectedText = 'Our documentation could work better.';
const start = canonicalOutput.indexOf(selectedText);
await scenario('selection-edit', '/api/edit-selection', {
  ...input, currentText: canonicalOutput, originalText: input.draft, selectedText,
  selectionRange: { start, end: start + selectedText.length }, instruction: 'Make this sentence clearer.',
}, (status, data) => {
  assert.equal(status, 200);
  assert.equal(data.finalText, canonicalOutput.slice(0, start) + data.replacementText + canonicalOutput.slice(start + selectedText.length));
  assert.equal(data.review.status, 'complete');
}, 2);
await scenario('invalid-selection', '/api/edit-selection', {
  ...input, currentText: canonicalOutput, originalText: input.draft, selectedText,
  selectionRange: { start: 0, end: selectedText.length }, instruction: 'Make this sentence clearer.',
}, status => assert.equal(status, 400), 0);
await scenario('malformed-selection-range', '/api/edit-selection', {
  ...input, currentText: canonicalOutput, originalText: input.draft, selectedText,
  selectionRange: { start: 'wrong', end: null }, instruction: 'Make this sentence clearer.',
}, status => assert.equal(status, 400), 0);
await scenario('out-of-bounds-selection-range', '/api/edit-selection', {
  ...input, currentText: canonicalOutput, originalText: input.draft, selectedText: canonicalOutput,
  selectionRange: { start: 0, end: canonicalOutput.length + 100 }, instruction: 'Make this clearer.',
}, status => assert.equal(status, 400), 0);
const duplicateText = 'Repeat this. Middle text. Repeat this. Last text.';
const secondStart = duplicateText.lastIndexOf('Repeat this.');
await scenario('duplicate-selection-with-range', '/api/edit-selection', {
  ...input, currentText: duplicateText, originalText: duplicateText, selectedText: 'Repeat this.',
  selectionRange: { start: secondStart, end: secondStart + 'Repeat this.'.length }, instruction: 'Make this clearer.',
}, (status, data) => {
  assert.equal(status, 200);
  assert.equal(data.finalText, duplicateText.slice(0, secondStart) + data.replacementText + duplicateText.slice(secondStart + 'Repeat this.'.length));
}, 2);
await scenario('duplicate-selection-without-range', '/api/edit-selection', {
  ...input, currentText: duplicateText, originalText: duplicateText, selectedText: 'Repeat this.', instruction: 'Make this clearer.',
}, status => assert.equal(status, 400), 0);

for (const [name, route, body] of [
  ['wrong-draft-type', '/api/rewrite-draft', { ...input, draft: { invalid: true } }],
  ['wrong-refine-type', '/api/quick-refine', { ...input, currentText: 12, instruction: 'Refine.' }],
  ['wrong-selection-type', '/api/edit-selection', { ...input, currentText: canonicalOutput, selectedText: { invalid: true } }],
  ['wrong-preservation-type', '/api/rewrite-draft', { ...input, preservationSettings: { keepStructure: 'false' } }],
]) {
  await scenario(name, route, body, status => assert.equal(status, 400), 0);
}

const synthesisBody = { samples: input.samples, currentProfile: { ...input.profile, customDirectives: 'Preserve this exact user rule.', domainExpertise: { enabled: true, field: 'QA domain', customNotes: 'Keep domain notes.' } }, model: input.analysisModel, reasoningLevel: 'auto' };
const synthesisResponse = await fetch('http://localhost:3103/api/synthesize-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(synthesisBody) });
const synthesized = await synthesisResponse.json();
let synthesisError;
try {
  assert.equal(synthesisResponse.status, 200);
  assert.equal(synthesized.customDirectives, synthesisBody.currentProfile.customDirectives);
  assert.deepEqual(synthesized.domainExpertise, synthesisBody.currentProfile.domainExpertise);
  assert.deepEqual(synthesized.sampleIds, input.samples.map(s => s.id));
} catch (error) { synthesisError = error.message; }
results.push({ name: 'synthesis-retains-user-settings', passed: !synthesisError, error: synthesisError, httpStatus: synthesisResponse.status });
fs.writeFileSync(path.join(directory, `${run}-synthesis.json`), JSON.stringify({ request: synthesisBody, response: synthesized, error: synthesisError }, null, 2));
console.log(`${synthesisError ? 'FAIL' : 'PASS'} synthesis-retains-user-settings`);

fs.writeFileSync(path.join(directory, `${run}-summary.json`), JSON.stringify(results.map(({ response, ...result }) => result), null, 2));
process.exitCode = results.some(result => !result.passed) ? 1 : 0;
