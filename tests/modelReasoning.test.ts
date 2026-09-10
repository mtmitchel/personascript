import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExternalContent, listProviderModels } from '../src/aiProvider';
import { isReasoningLevelChoice, knownModelReasoning, validateModelReasoning } from '../src/modelChoice';
import { validateDomainGenerationRequest } from '../src/domainGeneration';
import { normalizeRewriteHistory } from '../src/utils/rewriteHistory';

const env = { OPENAI_API_KEY: 'test-openai', OPENROUTER_API_KEY: 'test-openrouter' };
const json = (value: unknown) => new Response(JSON.stringify(value));
const model = (id: string, reasoning?: unknown) => ({ id, name: id, architecture: { output_modalities: ['text'] }, ...(reasoning !== undefined ? { reasoning } : {}) });

test('OpenRouter effort selectors reflect model metadata, including new effort names and mandatory reasoning', async () => {
  const models = await listProviderModels('openrouter', { env, fetch: async () => json({ data: [
    model('vendor/deep', { supported_efforts: ['max', 'xhigh', 'high', 'medium', 'low'] }),
    model('vendor/new', { supported_efforts: ['extended-depth', 'high', 'none'], mandatory: true }),
    model('vendor/all', { supported_efforts: null, mandatory: true }),
    model('vendor/no-effort'),
    model('vendor/budget-only', { supports_max_tokens: true }),
    model('vendor/malformed', { supported_efforts: ['high', 42] }),
  ] }) });
  const options = new Map(models.map(item => [item.id, item.reasoning?.efforts]));
  assert.deepEqual(options.get('openrouter:vendor/deep'), ['max', 'xhigh', 'high', 'medium', 'low']);
  assert.deepEqual(options.get('openrouter:vendor/new'), ['extended-depth', 'high']);
  assert.deepEqual(options.get('openrouter:vendor/all'), ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(options.get('openrouter:vendor/no-effort'), []);
  assert.deepEqual(options.get('openrouter:vendor/budget-only'), []);
  assert.equal(options.get('openrouter:vendor/malformed'), undefined);
});

test('Gemini documented choices include Medium and only expose Minimal on the supported preset', () => {
  for (const id of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview']) {
    assert.deepEqual(knownModelReasoning(id)?.efforts, ['low', 'medium', 'high']);
    assert.doesNotThrow(() => validateModelReasoning(id, 'medium'));
    assert.throws(() => validateModelReasoning(id, 'minimal'), /does not support Minimal/);
  }
  assert.deepEqual(knownModelReasoning('gemini-3.6-flash')?.efforts, ['minimal', 'low', 'medium', 'high']);
  assert.throws(() => validateModelReasoning('gemini-3.8-flash', 'max'), /does not support Max/);
});

test('effort validation permits bounded provider-advertised names without a universal High ceiling', () => {
  for (const effort of ['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'extended-depth']) {
    assert.equal(isReasoningLevelChoice(effort), true);
    assert.doesNotThrow(() => validateModelReasoning('openrouter:vendor/future-model', effort));
  }
  for (const effort of ['', ' high', 'high\n', 'x'.repeat(33), 1, null, { effort: 'high' }]) {
    assert.equal(isReasoningLevelChoice(effort), false);
    assert.throws(() => validateModelReasoning('openai:gpt-unlisted', effort));
  }
});

test('direct and routed generation transmit the exact selected effort, while Auto omits it', async () => {
  for (const provider of ['openai', 'openrouter']) {
    for (const effort of ['auto', 'none', 'medium', 'xhigh', 'max', 'extended-depth']) {
      let count = 0;
      await generateExternalContent({ model: `${provider}:${provider === 'openai' ? 'gpt-unlisted' : 'vendor/new'}`, contents: 'Keep this request.', reasoningLevel: effort }, {
        env, fetch: async (_url, options) => {
          count++;
          const body = JSON.parse(options!.body as string);
          if (effort === 'auto') {
            assert.equal(body.reasoning, undefined);
            assert.equal(body.reasoning_effort, undefined);
          } else if (provider === 'openai') {
            assert.equal(body.reasoning_effort, effort);
            assert.equal(body.reasoning, undefined);
          } else {
            assert.deepEqual(body.reasoning, { effort });
            assert.equal(body.reasoning_effort, undefined);
          }
          return json({ choices: [{ finish_reason: 'stop', message: { content: 'A complete result.' } }] });
        },
      });
      assert.equal(count, 1);
    }
  }
});

test('domain generation accepts per-model efforts and rejects incompatible native settings', () => {
  assert.equal(validateDomainGenerationRequest({ field: 'UX', model: 'gemini-3.8-flash', reasoningLevel: 'medium' }).reasoningLevel, 'medium');
  assert.equal(validateDomainGenerationRequest({ field: 'UX', model: 'openrouter:vendor/new', reasoningLevel: 'max' }).reasoningLevel, 'max');
  assert.throws(() => validateDomainGenerationRequest({ field: 'UX', model: 'gemini-3.1-pro-preview', reasoningLevel: 'minimal' }), /does not support Minimal/);
});

test('saved version history retains newer provider effort names exactly', () => {
  const settings = { writingModel: 'openai:gpt-unlisted', writingReasoningLevel: 'max', analysisModel: 'openrouter:vendor/new', analysisReasoningLevel: 'extended-depth' };
  const [saved] = normalizeRewriteHistory([{ id: 'reasoning-version', profileId: 'p', profileName: 'Voice', createdAt: '2026-09-09T00:00:00Z', intensity: 'faithful', originalText: 'Original draft.', rewrittenText: 'Rewritten draft.', changesExplanation: '', wordCountOriginal: 2, wordCountRewritten: 2, modelSettings: settings }]);
  assert.deepEqual(saved.modelSettings, settings);
});

test('OpenAI effort choices follow the exact documented model and dated snapshots', async () => {
  assert.deepEqual(knownModelReasoning('openai:gpt-5.5')?.efforts, ['none', 'low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(knownModelReasoning('openai:gpt-5.5-2026-04-23'), knownModelReasoning('openai:gpt-5.5'));
  assert.doesNotThrow(() => validateModelReasoning('openai:gpt-5.5', 'xhigh'));
  assert.throws(() => validateModelReasoning('openai:gpt-5.5', 'max'), /does not support Max/);
  assert.doesNotThrow(() => validateModelReasoning('openai:gpt-5.6-sol', 'max'));
  assert.throws(() => validateModelReasoning('openai:gpt-6-astra', 'none'), /does not support None/);
  assert.deepEqual(knownModelReasoning('openai:gpt-5')?.efforts, ['minimal', 'low', 'medium', 'high']);
  assert.deepEqual(knownModelReasoning('openai:o3')?.efforts, ['low', 'medium', 'high']);
  assert.deepEqual(knownModelReasoning('openai:gpt-4.1')?.efforts, []);
  assert.equal(knownModelReasoning('openai:gpt-5-future'), undefined);
  const models = await listProviderModels('openai', { env, fetch: async () => json({ data: [{ id: 'gpt-5.6-sol' }, { id: 'gpt-4.1' }, { id: 'gpt-future' }] }) });
  assert.deepEqual(models.find(item => item.id === 'openai:gpt-5.6-sol')?.reasoning, knownModelReasoning('openai:gpt-5.6-sol'));
  assert.deepEqual(models.find(item => item.id === 'openai:gpt-4.1')?.reasoning?.efforts, []);
  assert.equal(models.find(item => item.id === 'openai:gpt-future')?.reasoning, undefined);
});
