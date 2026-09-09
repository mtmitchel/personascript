import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateDomainGenerationRequest,
  buildDomainGenerationPrompt,
  validateGeneratedDomainKnowledge,
} from '../src/domainGeneration';
import { normalizeDomainExpertise } from '../src/writingPipeline';

test('validateDomainGenerationRequest accepts valid field and disciplines', () => {
  const input = {
    field: 'UX Copywriting & Content Design',
    disciplines: ['UX Copywriting', 'Content Design'],
    existingTopics: ['Monetization UX'],
    model: 'gemini-3.1-pro-preview',
    reasoningLevel: 'auto',
  };

  const validated = validateDomainGenerationRequest(input);
  assert.equal(validated.field, 'UX Copywriting & Content Design');
  assert.deepEqual(validated.disciplines, ['UX Copywriting', 'Content Design']);
  assert.deepEqual(validated.existingTopics, ['Monetization UX']);
  assert.equal(validated.model, 'gemini-3.1-pro-preview');
  assert.equal(validated.reasoningLevel, 'auto');
});

test('validateDomainGenerationRequest rejects empty field and disciplines', () => {
  assert.throws(
    () => validateDomainGenerationRequest({ field: '', disciplines: [] }),
    /provide at least one field or discipline/i
  );
});

test('validateDomainGenerationRequest rejects requests containing private user data or drafts', () => {
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', draft: 'Sensitive text' }),
    /private user content/i
  );
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', samples: [{ id: '1', content: 'x' }] }),
    /private user content/i
  );
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', productKnowledge: [{ id: 'p', name: 'Atlas' }] }),
    /private user content/i
  );
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', customNotes: 'Do not share' }),
    /private user content/i
  );
});

test('validateDomainGenerationRequest rejects invalid model choices', () => {
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', model: 'unsupported-model-v1' }),
    /model choice is invalid/i
  );
});

test('buildDomainGenerationPrompt delimits context with boundaries and excludes private data', () => {
  const prompt = buildDomainGenerationPrompt({
    field: 'Distributed Systems',
    disciplines: ['Distributed Systems', 'Observability'],
    existingTopics: ['Consensus Protocols'],
  });

  assert.match(prompt, /<domain-context>/);
  assert.match(prompt, /<primary-field>Distributed Systems<\/primary-field>/);
  assert.match(prompt, /<discipline>Observability<\/discipline>/);
  assert.match(prompt, /<topic-name>Consensus Protocols<\/topic-name>/);
  assert.match(prompt, /General conceptual principles only/i);
  assert.match(prompt, /Do NOT include case-specific numbers/i);
  assert.doesNotMatch(prompt, /draft|writing-sample|product-reference/i);
});

test('validateGeneratedDomainKnowledge parses valid output and generates local stable IDs', () => {
  const rawJson = JSON.stringify({
    topics: [
      {
        name: 'Information Architecture',
        category: 'discipline',
        description: 'Structural design of shared information spaces.',
        keyTerminology: ['hierarchy', 'taxonomy', 'wayfinding'],
        conventions: ['Map structures before writing content'],
      },
      {
        name: 'Conversion UX',
        category: 'intersecting',
        description: 'Designing clear decision moments.',
        keyTerminology: ['value proposition', 'friction reduction'],
      },
    ],
  });

  const topics = validateGeneratedDomainKnowledge(rawJson);
  assert.equal(topics.length, 2);
  assert.equal(topics[0].name, 'Information Architecture');
  assert.equal(topics[0].category, 'discipline');
  assert.ok(topics[0].id.startsWith('topic-'));
  assert.equal(topics[0].enabled, true);
  assert.deepEqual(topics[0].keyTerminology, ['hierarchy', 'taxonomy', 'wayfinding']);
  assert.deepEqual(topics[0].conventions, ['Map structures before writing content']);
  assert.equal(topics[1].name, 'Conversion UX');
  assert.equal(topics[1].category, 'intersecting');
});

test('validateGeneratedDomainKnowledge rejects blocked or truncated responses', () => {
  assert.throws(
    () => validateGeneratedDomainKnowledge('{"topics":[]}', { promptFeedback: { blockReason: 'SAFETY' } }),
    /blocked this request/i
  );

  assert.throws(
    () => validateGeneratedDomainKnowledge('{"topics":[{"name": "Incomplete"', { candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    /stopped before returning complete domain knowledge/i
  );

  assert.throws(
    () => validateGeneratedDomainKnowledge('{"topics":[]}'),
    /generated no domain topics/i
  );

  assert.throws(
    () => validateGeneratedDomainKnowledge('not json'),
    /malformed domain knowledge data/i
  );
});

test('merging generated topics preserves existing product knowledge and audience context', () => {
  const initial = normalizeDomainExpertise({
    enabled: true,
    field: 'UX Copywriting',
    disciplines: ['UX Copywriting'],
    topics: [{ id: 'old-1', name: 'Old Topic', keyTerminology: ['old-term'], conventions: [], enabled: true }],
    keyTerminology: ['old-term'],
    conventions: [],
    audienceContext: 'Staff Designers',
    customNotes: 'Keep voice warm.',
    productKnowledge: [{ id: 'prod-1', name: 'Existing Product', notes: 'v1 features', enabled: true }],
  });

  const newTopics = validateGeneratedDomainKnowledge(JSON.stringify({
    topics: [{ name: 'New Topic', keyTerminology: ['new-term'], conventions: [] }],
  }));

  const updated = normalizeDomainExpertise({
    ...initial,
    topics: newTopics,
    keyTerminology: [],
    conventions: [],
  });

  assert.equal(updated.topics.length, 1);
  assert.equal(updated.topics[0].name, 'New Topic');
  assert.deepEqual(updated.productKnowledge, initial.productKnowledge);
  assert.equal(updated.audienceContext, 'Staff Designers');
  assert.equal(updated.customNotes, 'Keep voice warm.');
  assert.deepEqual(updated.keyTerminology, []);
});


test('malformed topic anywhere rejects the whole result instead of partially replacing saved topics', () => {
  const valid = { name: 'Content Design', keyTerminology: ['hierarchy'] };
  for (const bad of [null, {}, { ...valid, category: 'unknown' }, { ...valid, keyTerminology: [] }, { ...valid, keyTerminology: ['valid', 3] }, { ...valid, conventions: [null] }]) {
    assert.throws(() => validateGeneratedDomainKnowledge(JSON.stringify({ topics: [valid, bad] })), /malformed domain topic/);
  }
  assert.throws(() => validateGeneratedDomainKnowledge(JSON.stringify({ topics: [valid] }), { candidates: [{ finishReason: 'SAFETY' }] }), /stopped before/);
});

test('request rejects oversized context and unsupported properties without silently truncating', () => {
  for (const input of [{ field: 'x'.repeat(501) }, { field: 'UX', disciplines: ['x'.repeat(201)] }, { field: 'UX', existingTopics: Array(51).fill('Topic') }, { field: 'UX', audienceContext: 'Private audience' }]) {
    assert.throws(() => validateDomainGenerationRequest(input));
  }
});
