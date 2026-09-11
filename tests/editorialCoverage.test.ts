import assert from 'node:assert/strict';
import test from 'node:test';
import { getDraftParagraphs } from '../src/sourceText';
import { buildEditorialPlanPrompt, validateEditorialPlan, validatePlanSources } from '../src/editorialPlan';
import type { EditorialPlan } from '../src/types';

const draft = 'Project title\n\nA first claim. An example makes it concrete.\n\nA second claim retains its qualification.';
const sources = { draft, projectBrief: '', readerPurpose: '' };
const items = getDraftParagraphs(draft).map(paragraph => ({ paragraphId: paragraph.id, idea: 'Keep this idea', sourcePhrase: paragraph.text, decision: 'keep' as const, limit: 'Retain the qualification.' }));
const plan: EditorialPlan = { version: 2, openingJob: 'Establish the project.', items };

test('coverage requires every draft paragraph, including headings and cuts', () => {
  assert.deepEqual(validateEditorialPlan(plan, sources), plan);
  assert.throws(() => validateEditorialPlan({ ...plan, items: items.slice(1) }, sources), /paragraphs 1/);
  assert.deepEqual(validateEditorialPlan({ ...plan, items: items.map(item => ({ ...item, decision: 'cut' })) }, sources).items.length, 3);
});

test('a paragraph number cannot falsely cover another source passage', () => {
  assert.throws(() => validateEditorialPlan({ ...plan, items: [{ ...items[0], paragraphId: 2 }, ...items.slice(1)] }, sources), /exact phrase from that draft paragraph/);
  assert.throws(() => validateEditorialPlan({ ...plan, items: [{ ...items[0], paragraphId: undefined }, ...items.slice(1)] }, sources), /paragraph number/);
});

test('PDF hard wraps recover smaller passages while preserving all substantive text', () => {
  const wrapped = 'A project title for a 12%\nconversion lift\nThe first claim wraps across\nseveral lines and ends here.\nThe next claim begins here.\nA section heading\nAnother claim follows.';
  const paragraphs = getDraftParagraphs(wrapped);
  assert.equal(paragraphs.length, 5);
  assert.equal(paragraphs[0].text, 'A project title for a 12%\nconversion lift');
  assert.equal(paragraphs.map(p => p.text).join(' ').replace(/\s+/g, ' '), wrapped.replace(/\s+/g, ' '));
  assert.deepEqual(getDraftParagraphs(wrapped), paragraphs);
});

test('planner plans by section, tags headings, and includes the rewrite request', () => {
  const prompt = buildEditorialPlanPrompt(sources);
  assert.doesNotMatch(prompt, /one item per paragraph/);
  assert.doesNotMatch(prompt, /EVERY paragraph/);
  assert.doesNotMatch(prompt, /No additional limits\./);
  assert.doesNotMatch(prompt, /paragraphId/);
  assert.doesNotMatch(prompt, /Split a paragraph/);
  assert.ok(prompt.includes('Plan by passage inside each section.'));
  assert.ok(prompt.includes('Never write one suggestion per sentence.'));
  assert.ok(prompt.includes('paragraphRange: { from, to }'));
  assert.ok(prompt.includes('version: 4'));
  assert.ok(prompt.includes('conflicts:'));
  assert.ok(prompt.includes('Return an empty array when there is none.'));
  assert.ok(prompt.includes('Rewrite request (editorial guidance'));
  assert.ok(prompt.includes('No additional request.'));
  assert.match(prompt, /<reader-and-purpose>/);
  assert.match(prompt, /<project-brief>/);
  assert.ok(prompt.includes('<paragraph id="1" kind="heading">\nProject title'));
  assert.ok(prompt.includes('<paragraph id="2">\nA first claim. An example makes it concrete.'));
  assert.ok(prompt.includes('<paragraph id="3">\nA second claim retains its qualification.'));
  const withPrefs = buildEditorialPlanPrompt({ ...sources, editorialPreferences: 'Cut all adverbs.' });
  assert.ok(withPrefs.includes('Cut all adverbs.'));
  const requested = buildEditorialPlanPrompt({ ...sources, customInstructions: 'Keep it under 500 words.' });
  assert.ok(requested.includes('Keep it under 500 words.'));
});


test('rejects drafts whose paragraph coverage cannot fit before a model request', () => {
  const draft = Array.from({ length: 201 }, (_, i) => `Paragraph ${i + 1} includes a claim.`).join('\n\n');
  assert.throws(() => validatePlanSources(draft), /201 review paragraphs.*200-decision.*no model request was sent/);
  assert.doesNotThrow(() => validatePlanSources(draft.split('\n\n').slice(0, 200).join('\n\n')));
});


test('separates a short colon heading from following prose for coverage', () => {
  const draft = 'Problem:\nUsers could not tell what happened.';
  const paragraphs = getDraftParagraphs(draft);
  assert.equal(paragraphs.length, 2);
  assert.throws(() => validateEditorialPlan({ ...plan, items: [{ ...items[0], paragraphId: 2, sourcePhrase: paragraphs[1].text }] }, { ...sources, draft }), /paragraphs 1/);
});
