import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Type } from '@google/genai';
import { generateExternalContent, listProviderModels } from '../src/aiProvider';
import { isModelChoice, parseModelChoice } from '../src/modelChoice';
import { validateDomainGenerationRequest } from '../src/domainGeneration';
import { validateGeneratedProse, validateGeneratedReview } from '../src/writingPipeline';

const env = { OPENAI_API_KEY: 'test-openai-key', OPENROUTER_API_KEY: 'test-router-key' };
const completion = (content = 'A complete draft.', model = 'executed-model') => ({
  model, choices: [{ finish_reason: 'stop', message: { content } }],
  usage: { prompt_tokens: 50, completion_tokens: 12 },
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('OpenAI catalog uses only the OpenAI key and excludes dedicated non-chat models', async () => {
  const models = await listProviderModels('openai', { env, fetch: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.deepEqual(options.headers, { Authorization: `Bearer ${env.OPENAI_API_KEY}` });
    assert.equal(options.body, undefined);
    return response({ data: [{ id: 'gpt-test-b' }, { id: 'gpt-test-a' }, { id: 'gpt-test-a' }, { id: 'text-embedding-test' }, { id: 'gpt-image-test' }, { id: 'gpt-realtime-test' }, null, { id: 9 }] });
  } });
  assert.deepEqual(models, [{ id: 'openai:gpt-test-a', name: 'gpt-test-a' }, { id: 'openai:gpt-test-b', name: 'gpt-test-b' }]);
});

test('OpenRouter catalog retains display names, scopes IDs, and filters non-text output', async () => {
  const models = await listProviderModels('openrouter', { env, fetch: async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/models');
    assert.deepEqual(options.headers, { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` });
    return response({ data: [
      { id: 'vendor/test', name: 'Readable model name', architecture: { output_modalities: ['text'] } },
      { id: 'vendor/image', name: 'Image model', architecture: { output_modalities: ['image'] } },
      { id: 'invalid model', architecture: { output_modalities: ['text'] } },
    ] });
  } });
  assert.deepEqual(models, [{ id: 'openrouter:vendor/test', name: 'Readable model name', reasoning: { efforts: [], source: 'provider' } }]);
});

test('catalog failures never expose raw upstream details or make unauthenticated requests', async () => {
  await assert.rejects(listProviderModels('openai', { env: {}, fetch: async () => { assert.fail('No request without key'); } }), /Connect OpenAI/);
  await assert.rejects(listProviderModels('openrouter', { env, fetch: async () => response({ error: env.OPENROUTER_API_KEY }, 401) }), (error: Error) => {
    assert.match(error.message, /401/); assert.ok(!error.message.includes(env.OPENROUTER_API_KEY)); return true;
  });
  await assert.rejects(listProviderModels('openai', { env, fetch: async () => response(null) }), /invalid model list/);
  await assert.rejects(listProviderModels('openai', { env, fetch: async () => { throw new Error(env.OPENAI_API_KEY); } }), /Could not load OpenAI models/);
});

test('provider routing preserves legacy selections and distinguishes direct OpenAI from OpenRouter', () => {
  assert.deepEqual(parseModelChoice('gemini-3.8-flash'), { provider: 'gemini', model: 'gemini-3.8-flash' });
  assert.deepEqual(parseModelChoice('openai:gpt-test'), { provider: 'openai', model: 'gpt-test' });
  assert.deepEqual(parseModelChoice('openrouter:openai/gpt-test:free'), { provider: 'openrouter', model: 'openai/gpt-test:free' });
  assert.ok(isModelChoice('openrouter:~openai/gpt-latest'));
  for (const invalid of ['', 'openai:', 'openrouter:', 'openai:openai/gpt-test', 'other:gpt-test', 'openai:model name', null, 7]) {
    assert.equal(isModelChoice(invalid), false, String(invalid));
  }
});

for (const [provider, model, endpoint, key] of [
  ['openai', 'gpt-test', 'https://api.openai.com/v1/chat/completions', env.OPENAI_API_KEY],
  ['openrouter', 'vendor/model-test', 'https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY],
]) {
  test(`${provider} uses only its own key and model; preserves prompts, attribution, tokens and prose`, async () => {
    let calls = 0;
    const result = await generateExternalContent({ model: `${provider}:${model}`, contents: 'Draft facts.', config: { systemInstruction: 'Preserve facts.' }, reasoningLevel: 'auto' }, {
      env, fetch: async (url, options) => {
        calls++;
        assert.equal(url, endpoint);
        assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${key}`);
        const body = JSON.parse(options.body as string);
        assert.equal(body.model, model);
        assert.deepEqual(body.messages, [{ role: 'system', content: 'Preserve facts.' }, { role: 'user', content: 'Draft facts.' }]);
        assert.equal(body.reasoning_effort, undefined);
        assert.equal(body.temperature, undefined);
        assert.equal(body.models, undefined);
        if (provider === 'openrouter') assert.deepEqual(body.provider, { require_parameters: true });
        else assert.equal(body.store, false);
        return response(completion());
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.modelExecuted, `${provider}:executed-model`);
    assert.equal(result.usageMetadata.promptTokenCount, 50);
    assert.equal(validateGeneratedProse(result.text, result), 'A complete draft.');
  });

  test(`${provider} converts nested schemas without altering required fields and passes explicit reasoning`, async () => {
    const schema = { type: Type.OBJECT, properties: { findings: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { detail: { type: Type.STRING } }, required: ['detail'] } } }, required: ['findings'] };
    const original = JSON.stringify(schema);
    const review = { summary: 'Reviewed.', findings: [], voiceObservations: [] };
    const result = await generateExternalContent({ model: `${provider}:${model}`, contents: [{ text: 'Review this draft.' }], reasoningLevel: 'high', config: { responseMimeType: 'application/json', responseSchema: schema } }, {
      env, fetch: async (_url, options) => {
        const body = JSON.parse(options.body as string);
        if (provider === 'openrouter') {
          assert.deepEqual(body.reasoning, { effort: 'high' });
          assert.equal(body.reasoning_effort, undefined);
        } else assert.equal(body.reasoning_effort, 'high');
        assert.equal(body.response_format.type, 'json_schema');
        assert.equal(body.response_format.json_schema.schema.properties.findings.items.properties.detail.type, 'string');
        assert.deepEqual(body.response_format.json_schema.schema.properties.findings.items.required, ['detail']);
        assert.deepEqual(body.messages.at(-1).content, [{ type: 'text', text: 'Review this draft.' }]);
        return response(completion(JSON.stringify(review)));
      },
    });
    assert.equal(JSON.stringify(schema), original);
    assert.deepEqual(validateGeneratedReview(result.text, result), review);
    assert.equal(validateDomainGenerationRequest({ field: 'UX', model: `${provider}:${model}` }).model, `${provider}:${model}`);
  });

  test(`${provider} carries PDF content to the chosen provider`, async () => {
    await generateExternalContent({ model: `${provider}:${model}`, contents: [{ inlineData: { mimeType: 'application/pdf', data: 'dGVzdA==' } }, { text: 'Extract.' }] }, {
      env, fetch: async (_url, options) => {
        const body = JSON.parse(options.body as string);
        assert.deepEqual(body.messages[0].content[0], { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,dGVzdA==' } });
        return response(completion());
      },
    });
  });

  test(`${provider} requires its own key before any network call`, async () => {
    await assert.rejects(generateExternalContent({ model: `${provider}:${model}`, contents: 'Draft.' }, {
      env: { GEMINI_API_KEY: 'irrelevant' }, fetch: async () => { assert.fail('Must not call a provider'); },
    }), provider === 'openai' ? /Connect OpenAI in Models/ : /Connect OpenRouter in Models/);
  });
}

for (const status of [400, 401, 402, 403, 404, 429, 503]) {
  test(`HTTP ${status} errors do not expose upstream secrets or fall back`, async () => {
    let calls = 0;
    await assert.rejects(generateExternalContent({ model: 'openrouter:vendor/model', contents: 'Draft.' }, {
      env, fetch: async () => { calls++; return response({ error: { message: env.OPENROUTER_API_KEY } }, status); },
    }), (error: Error) => {
      assert.match(error.message, new RegExp(`OpenRouter API error \\(${status}\\)`));
      assert.ok(!error.message.includes(env.OPENROUTER_API_KEY));
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('rejects partial, refused, empty, malformed, and embedded-error results', async () => {
  const badResults = [
    {}, { error: { message: 'private provider details' } },
    { choices: [{ finish_reason: 'length', message: { content: 'Partial draft' } }] },
    { choices: [{ finish_reason: 'content_filter', message: { content: 'Filtered' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'Text', refusal: 'Refused' } }] },
    completion(''), completion('   '),
  ];
  for (const body of badResults) {
    await assert.rejects(generateExternalContent({ model: 'openai:gpt-test', contents: 'Draft.' }, { env, fetch: async () => response(body) }));
  }
  await assert.rejects(generateExternalContent({ model: 'openai:gpt-test', contents: 'Draft.' }, { env, fetch: async () => new Response('<html>bad gateway</html>') }), /invalid response/);
  await assert.rejects(generateExternalContent({ model: 'openai:gpt-test', contents: 'Draft.' }, { env, fetch: async () => { throw new Error(env.OPENAI_API_KEY); } }), /request failed or timed out/);
});

for (const provider of ['openai', 'openrouter'] as const) {
  test(`${provider} propagates cancellation without replacing it with a retryable transport error`, async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const pending = generateExternalContent({ model: `${provider}:test-model`, contents: 'Sample analysis.', signal: controller.signal }, {
      env,
      fetch: async (_url, options) => new Promise<Response>((_resolve, reject) => {
        received = options.signal as AbortSignal;
        received.addEventListener('abort', () => reject(received!.reason), { once: true });
      }),
    });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(received?.aborted, true);
  });
}


test('caller-owned deadlines are preserved and ordinary requests retain their default timeout', async (t) => {
  const timeouts: number[] = [];
  const fallbackSignal = new AbortController().signal;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeouts.push(ms); return fallbackSignal; });
  const callerSignal = new AbortController().signal;
  await generateExternalContent({ model: 'openai:gpt-6-astra', contents: 'Sample analysis.', reasoningLevel: 'xhigh', signal: callerSignal }, {
    env, fetch: async (_url, options) => {
      assert.equal(options.signal, callerSignal);
      assert.equal(JSON.parse(options.body as string).reasoning_effort, 'xhigh');
      return response(completion());
    },
  });
  assert.deepEqual(timeouts, []);
  await generateExternalContent({ model: 'openai:gpt-6-astra', contents: 'Ordinary request.' }, {
    env, fetch: async (_url, options) => { assert.equal(options.signal, fallbackSignal); return response(completion()); },
  });
  assert.deepEqual(timeouts, [180_000]);
});

test('known transport failures retain safe diagnostics without exposing upstream details', async () => {
  for (const [code, message] of [
    ['UND_ERR_HEADERS_TIMEOUT', 'waiting for response headers'],
    ['UND_ERR_BODY_TIMEOUT', 'receiving the response'],
    ['UND_ERR_CONNECT_TIMEOUT', 'connecting'],
    ['UND_ERR_SOCKET', 'closed before the response completed'],
  ]) {
    await assert.rejects(generateExternalContent({ model: 'openai:gpt-test', contents: 'Draft.' }, {
      env, fetch: async () => { throw new Error(env.OPENAI_API_KEY, { cause: { code, secret: env.OPENAI_API_KEY } }); },
    }), (error: any) => {
      assert.ok(error.message.includes(message));
      assert.deepEqual(error.cause, { code });
      assert.ok(!JSON.stringify(error).includes(env.OPENAI_API_KEY));
      assert.ok(!error.message.includes(env.OPENAI_API_KEY));
      return true;
    });
  }
});

test('HTTP errors close unread response bodies before returning safe errors', async () => {
  let cancelled = false;
  await assert.rejects(generateExternalContent({ model: 'openai:gpt-test', contents: 'Draft.' }, {
    env,
    fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429 }),
  }), /Rate limit or quota reached/);
  assert.equal(cancelled, true);
});

for (const phase of ['headers', 'body'] as const) {
  test(`actual generation HTTP transport cancels while waiting for ${phase}`, async (t) => {
    const controller = new AbortController();
    let ready: () => void;
    const waiting = new Promise<void>(resolve => { ready = resolve; });
    let disconnected: () => void;
    const closed = new Promise<void>(resolve => { disconnected = resolve; });
    const server = createServer((req, res) => {
      req.resume();
      res.on('close', disconnected);
      if (phase === 'body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"choices":');
      } else ready();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const address = server.address() as { port: number };
    const pending = generateExternalContent({ model: 'openai:gpt-test', contents: 'Synthetic local test.', signal: controller.signal }, {
      env,
      fetch: async (_url, options) => {
        const result = await fetch(`http://127.0.0.1:${address.port}`, options);
        if (phase === 'body') ready();
        return result;
      },
    });
    await waiting;
    controller.abort(new DOMException('Request deadline reached.', 'TimeoutError'));
    await assert.rejects(pending, { name: 'TimeoutError', message: 'Request deadline reached.' });
    await closed;
  });
}
