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

test('planner sees paragraph IDs and the finer independent-claim requirement', () => {
  const prompt = buildEditorialPlanPrompt(sources);
  assert.match(prompt, /one item per claim/);
  assert.match(prompt, /EVERY paragraph/);
  for (const paragraph of getDraftParagraphs(draft)) assert.ok(prompt.includes(`<paragraph id="${paragraph.id}">\n${paragraph.text}`));
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
