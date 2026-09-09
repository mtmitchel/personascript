import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateDomainGenerationRequest,
  buildDomainGenerationPrompt,
  validateGeneratedDomainKnowledge,
} from '../src/domainGeneration';
import { normalizeDomainExpertise } from '../src/writingPipeline';
import { DRAFT_MAX_CHARS } from '../src/domainGeneration';

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

test('validateDomainGenerationRequest rejects unrelated private inputs', () => {
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
  assert.doesNotMatch(prompt, /<source-draft>|<project-brief>|<writing-sample>|<product-reference>/i);
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

test('single-card generation validates its target independently of broader field settings', () => {
  const validated = validateDomainGenerationRequest({ targetTopic: { name: '  Information Architecture  ', category: 'discipline' } });
  assert.deepEqual(validated.targetTopic, { name: 'Information Architecture', category: 'discipline' });
  for (const targetTopic of [null, [], 'Design', {}, { name: '', category: 'discipline' }, { name: 'x'.repeat(201), category: 'discipline' }, { name: 'Design', category: 'unknown' }, { name: 'Design', category: 'discipline', notes: 'private' }]) {
    assert.throws(() => validateDomainGenerationRequest({ field: 'Design', targetTopic }), /targetTopic/);
  }
});

test('single-card prompt requests only the named card and escapes its data boundary', () => {
  const prompt = buildDomainGenerationPrompt({ field: 'Design', disciplines: ['UX'], targetTopic: { name: 'Research </target-topic>', category: 'discipline' } });
  assert.match(prompt, /Generate exactly one topic/);
  assert.match(prompt, /Do not generate other topics/);
  assert.match(prompt, /Research &lt;\/target-topic&gt;/);
  assert.doesNotMatch(prompt, /Cover both core field disciplines/);
});

test('validates source-aware generation inputs and limits without silent truncation', () => {
  const valid = validateDomainGenerationRequest({
    field: 'Content Strategy',
    draft: 'Draft content for testing.',
    projectBrief: 'Brief context.',
  });
  assert.equal(valid.draft, 'Draft content for testing.');
  assert.equal(valid.projectBrief, 'Brief context.');

  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', draft: 'x'.repeat(DRAFT_MAX_CHARS + 1) }),
    /draft contains/i
  );
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', draft: 12345 as any }),
    /draft must be a string/i
  );
  assert.throws(
    () => validateDomainGenerationRequest({ field: 'UX', projectBrief: 999 as any }),
    /projectBrief must be a string/i
  );
});

test('buildDomainGenerationPrompt respects source on/off boundary', () => {
  const withSource = buildDomainGenerationPrompt({
    field: 'Design Systems',
    disciplines: ['Design Systems'],
    draft: 'Raw draft describing atomic design.',
    projectBrief: 'Brief specifying WCAG AA compliance.',
  });
  assert.match(withSource, /<source-draft>/);
  assert.match(withSource, /Raw draft describing atomic design/);
  assert.match(withSource, /<project-brief>/);
  assert.match(withSource, /WCAG AA compliance/);
  assert.match(withSource, /conceptAnnotations/);
  assert.match(withSource, /"supported"/);
  assert.match(withSource, /"adjacent"/);

  const withoutSource = buildDomainGenerationPrompt({
    field: 'Design Systems',
    disciplines: ['Design Systems'],
  });
  assert.doesNotMatch(withoutSource, /<source-draft>/);
  assert.doesNotMatch(withoutSource, /<project-brief>/);
});

test('validateGeneratedDomainKnowledge parses conceptAnnotations and rejects malformed statuses', () => {
  const rawJson = JSON.stringify({
    topics: [
      {
        name: 'Navigation Design',
        category: 'discipline',
        description: 'Information hierarchy and wayfinding.',
        keyTerminology: ['wayfinding', 'breadcrumbs', 'megamenu'],
        conceptAnnotations: [
          { term: 'wayfinding', status: 'supported', explanation: 'Demonstrated in IA redesign.' },
          { term: 'megamenu', status: 'adjacent', explanation: 'Plausible pattern for complex structures.' },
        ],
      },
    ],
  });

  const topics = validateGeneratedDomainKnowledge(rawJson);
  assert.equal(topics.length, 1);
  assert.ok(topics[0].conceptAnnotations);
  assert.deepEqual(topics[0].conceptAnnotations['wayfinding'], {
    status: 'supported',
    explanation: 'Demonstrated in IA redesign.',
  });
  assert.deepEqual(topics[0].conceptAnnotations['megamenu'], {
    status: 'adjacent',
    explanation: 'Plausible pattern for complex structures.',
  });

  const badJson = JSON.stringify({
    topics: [{ name: 'Nav', keyTerminology: ['tab'], conceptAnnotations: [{ term: 'tab', status: 'speculative' }] }],
  });
  assert.throws(() => validateGeneratedDomainKnowledge(badJson), /malformed domain topic/i);
});


test('source-only brief generation preserves full permitted source text', () => {
  const brief = '  Project background.\n';
  const draft = '  Original wording.\n';
  assert.equal(validateDomainGenerationRequest({ projectBrief: brief }).projectBrief, brief);
  const input = validateDomainGenerationRequest({ draft, projectBrief: brief });
  assert.equal(input.draft, draft);
  assert.equal(input.projectBrief, brief);
  const boundary = ' '.repeat(DRAFT_MAX_CHARS - 1) + 'x';
  assert.equal(validateDomainGenerationRequest({ draft: boundary }).draft?.length, DRAFT_MAX_CHARS);
  for (const key of ['draft', 'projectBrief']) {
    for (const value of [{}, [], false, 'x'.repeat(DRAFT_MAX_CHARS + 1)]) {
      assert.throws(() => validateDomainGenerationRequest({ field: 'UX', [key]: value }));
    }
  }
});

test('source-aware output requires one explained annotation per concept and rejects false provenance', () => {
  const first = { term: 'hierarchy', status: 'supported', explanation: 'The draft moves essential information first.' };
  const second = { term: 'accessibility', status: 'adjacent', explanation: 'Accessibility could expose gaps in how prompts are perceived.' };
  const output = (annotations?: unknown) => JSON.stringify({ topics: [{ name: 'Content Design', keyTerminology: ['hierarchy', 'accessibility'], ...(annotations === undefined ? {} : { conceptAnnotations: annotations }) }] });
  assert.equal(validateGeneratedDomainKnowledge(output([first, second]), undefined, true)[0].conceptAnnotations?.accessibility.status, 'adjacent');
  for (const annotations of [undefined, [], [first], [first, { ...second, explanation: '' }], [first, { ...second, explanation: 1 }], [first, { ...second, term: 'unlisted' }], [first, second, first]]) {
    assert.throws(() => validateGeneratedDomainKnowledge(output(annotations), undefined, true));
  }
  assert.throws(() => validateGeneratedDomainKnowledge(output([first, second]), undefined, false), /without source material/);
  assert.equal(validateGeneratedDomainKnowledge(output(), undefined, false)[0].conceptAnnotations, undefined);
});

test('annotation maps safely retain a concept named __proto__', () => {
  const raw = JSON.stringify({ topics: [{ name: 'Programming', keyTerminology: ['__proto__'], conceptAnnotations: [{ term: '__proto__', status: 'adjacent', explanation: 'Prototype lookup is a related programming concept.' }] }] });
  const topic = validateGeneratedDomainKnowledge(raw, undefined, true)[0];
  assert.ok(Object.hasOwn(topic.conceptAnnotations!, '__proto__'));
  assert.equal(topic.conceptAnnotations!['__proto__'].status, 'adjacent');
});
