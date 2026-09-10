import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { connectProvider, disconnectProvider, requireLocalConnectionRequest, validateConnectionInput } from '../src/providerConnections';
import { generateExternalContent, listProviderModels } from '../src/aiProvider';

const key = 'sk-test-connection-key';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'personascript-connections-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { envFile: path.join(directory, '.env'), directory, env: {} as NodeJS.ProcessEnv };
}

test('only same-origin JSON requests through a loopback host and socket may save keys', () => {
  const valid = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }, protocol: 'http', is: () => 'application/json' };
  requireLocalConnectionRequest(valid as any);
  requireLocalConnectionRequest({ ...valid, socket: { remoteAddress: '::ffff:127.0.0.1' } } as any);
  for (const changed of [
    { socket: { remoteAddress: '192.168.1.2' } },
    { headers: { ...valid.headers, origin: 'https://evil.example' } },
    { headers: { ...valid.headers, origin: undefined } },
    { headers: { ...valid.headers, host: 'evil.example', origin: 'http://evil.example' } },
    { headers: { ...valid.headers, 'sec-fetch-site': 'cross-site' } },
    { headers: { ...valid.headers, origin: 'http://localhost:3001' } },
    { is: () => false },
  ]) assert.throws(() => requireLocalConnectionRequest({ ...valid, ...changed } as any));
});

test('connection input rejects unknown providers, injection, control characters, and oversized keys', () => {
  assert.deepEqual(validateConnectionInput({ provider: 'openai', apiKey: ` ${key} ` }), { provider: 'openai', apiKey: key });
  for (const apiKey of ['', 'abc', 12, 'x'.repeat(513), 'sk-key\nOTHER=bad', 'sk-key with spaces', 'sk-quoted"key', 'sk-key\u0000control']) {
    assert.throws(() => validateConnectionInput({ provider: 'openai', apiKey }));
  }
  assert.throws(() => validateConnectionInput({ provider: 'unknown', apiKey: key }));
});

test('Gemini validates through its own header, saves only its key, and activates replacements immediately', async (t) => {
  const f = await fixture(t);
  await writeFile(f.envFile, 'GEMINI_API_KEY=old-gemini-key\nOPENAI_API_KEY=keep-openai-key\n');
  f.env.GEMINI_API_KEY = 'old-gemini-key';
  const result = await connectProvider({ provider: 'gemini', apiKey: key }, { ...f, fetch: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models');
    assert.deepEqual(options.headers, { 'x-goog-api-key': key });
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    return json({ models: [{ name: 'models/gemini-test' }] });
  } });
  assert.deepEqual(result, { provider: 'gemini', connected: true });
  assert.equal(f.env.GEMINI_API_KEY, key);
  assert.equal(await readFile(f.envFile, 'utf8'), `GEMINI_API_KEY=${key}\nOPENAI_API_KEY=keep-openai-key\n`);
  assert.equal((await stat(f.envFile)).mode & 0o777, 0o600);
});

test('rejected or malformed Gemini validation leaves the existing key intact without echoing it', async (t) => {
  const f = await fixture(t);
  const original = 'GEMINI_API_KEY=old-gemini-key\n';
  f.env.GEMINI_API_KEY = 'old-gemini-key';
  await writeFile(f.envFile, original);
  for (const response of [json({ error: { message: key } }, 400), json({ error: { message: key } }, 403), json({ data: [] })]) {
    await assert.rejects(connectProvider({ provider: 'gemini', apiKey: key }, { ...f, fetch: async () => response }), (error: Error) => {
      assert.match(error.message, /Gemini/);
      assert.ok(!error.message.includes(key));
      return true;
    });
    assert.equal(f.env.GEMINI_API_KEY, 'old-gemini-key');
    assert.equal(await readFile(f.envFile, 'utf8'), original);
  }
});

for (const provider of ['openai', 'openrouter'] as const) {
  test(`${provider} validates only at its authenticated endpoint, persists privately, and works immediately`, async (t) => {
    const f = await fixture(t);
    let validations = 0;
    const result = await connectProvider({ provider, apiKey: key }, { ...f, fetch: async (url, options) => {
      validations++;
      assert.equal(url, provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://openrouter.ai/api/v1/key');
      assert.deepEqual(options.headers, { Authorization: `Bearer ${key}` });
      assert.equal(options.redirect, 'error');
      assert.equal(options.body, undefined);
      return json({ data: provider === 'openai' ? [] : { label: 'private-label', limit_remaining: 10 } });
    } });
    assert.equal(validations, 1);
    assert.deepEqual(result, { provider, connected: true });
    const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
    assert.equal(dotenv.parse(await readFile(f.envFile))[keyName], key);
    assert.equal((await stat(f.envFile)).mode & 0o777, 0o600);
    const model = provider === 'openai' ? 'gpt-test' : 'vendor/test';
    const models = await listProviderModels(provider, { env: f.env, fetch: async (_url, options) => {
      assert.equal((options.headers as any).Authorization, `Bearer ${key}`);
      return json({ data: [{ id: model, architecture: { output_modalities: ['text'] } }] });
    } });
    assert.equal(models[0].id, `${provider}:${model}`);
    const generated = await generateExternalContent({ model: models[0].id, contents: 'Test draft' }, { env: f.env, fetch: async (_url, options) => {
      assert.equal((options.headers as any).Authorization, `Bearer ${key}`);
      return json({ choices: [{ finish_reason: 'stop', message: { content: 'Complete test draft.' } }] });
    } });
    assert.equal(generated.text, 'Complete test draft.');
  });
}

test('replacement preserves unrelated .env bytes, handles quoted multiline values and duplicate assignments', async (t) => {
  const f = await fixture(t);
  const before = '# Keep this comment\r\nGEMINI_API_KEY=unchanged\r\nOTHER="keep # this"\r\nexport OPENAI_API_KEY="old\r\nvalue" # comment\r\nTAIL=keep\r\nOPENAI_API_KEY=duplicate\r\n';
  await writeFile(f.envFile, before);
  await connectProvider({ provider: 'openai', apiKey: key }, { ...f, fetch: async () => json({ data: [] }) });
  assert.equal(await readFile(f.envFile, 'utf8'), '# Keep this comment\r\nGEMINI_API_KEY=unchanged\r\nOTHER="keep # this"\r\nOPENAI_API_KEY=' + key + '\r\nTAIL=keep\r\nOPENAI_API_KEY=' + key + '\r\n');
});

test('simultaneous connections retain both keys and unrelated settings', async (t) => {
  const f = await fixture(t);
  await writeFile(f.envFile, 'GEMINI_API_KEY=keep');
  await Promise.all((['openai', 'openrouter'] as const).map((provider) => connectProvider({ provider, apiKey: key + provider }, { ...f, fetch: async () => json({ data: provider === 'openai' ? [] : {} }) })));
  assert.deepEqual(dotenv.parse(await readFile(f.envFile)), { GEMINI_API_KEY: 'keep', OPENAI_API_KEY: key + 'openai', OPENROUTER_API_KEY: key + 'openrouter' });
});

test('assignment-like text inside another multiline value is preserved exactly', async (t) => {
  const f = await fixture(t);
  const original = 'OTHER="first line\nOPENAI_API_KEY=embedded-example\nlast line"\n';
  await writeFile(f.envFile, original);
  await connectProvider({ provider: 'openai', apiKey: key }, { ...f, fetch: async () => json({ data: [] }) });
  assert.equal(await readFile(f.envFile, 'utf8'), original + `OPENAI_API_KEY=${key}\n`);
});

test('provider failures leave existing credentials untouched and never echo upstream bodies', async (t) => {
  const f = await fixture(t);
  f.env.OPENAI_API_KEY = 'old-key';
  const original = 'OPENAI_API_KEY=old-key\n';
  await writeFile(f.envFile, original);
  for (const fetcher of [
    async () => json({ error: key }, 401),
    async () => json({ error: key }, 503),
    async () => { throw new Error(key); },
    async () => json({ unexpected: key }),
    async () => new Response(key),
  ]) {
    await assert.rejects(connectProvider({ provider: 'openai', apiKey: key }, { ...f, fetch: fetcher }), (error: Error) => !error.message.includes(key));
    assert.equal(await readFile(f.envFile, 'utf8'), original);
    assert.equal(f.env.OPENAI_API_KEY, 'old-key');
  }
});

test('persistence failures and symlink targets do not activate a key or overwrite another file', async (t) => {
  const f = await fixture(t);
  const target = path.join(f.directory, 'target');
  await writeFile(target, 'untouched');
  await symlink(target, f.envFile);
  await assert.rejects(connectProvider({ provider: 'openai', apiKey: key }, { ...f, fetch: async () => json({ data: [] }) }), /Could not update/);
  assert.equal(await readFile(target, 'utf8'), 'untouched');
  assert.equal(f.env.OPENAI_API_KEY, undefined);
  await assert.rejects(connectProvider({ provider: 'openai', apiKey: key }, { ...f, envFile: path.join(f.directory, 'missing', '.env'), fetch: async () => json({ data: [] }) }), /Could not update/);
  assert.equal(f.env.OPENAI_API_KEY, undefined);
  assert.deepEqual((await readdir(f.directory)).sort(), ['.env', 'target']);
});

for (const provider of ['gemini', 'openai', 'openrouter'] as const) {
  test(`removing ${provider} deletes only its saved key and disconnects it immediately`, async (t) => {
    const f = await fixture(t);
    const keys = { GEMINI_API_KEY: 'gemini-test-key', OPENAI_API_KEY: 'openai-test-key', OPENROUTER_API_KEY: 'router-test-key' };
    Object.assign(f.env, keys);
    const keyName = `${provider.toUpperCase()}_API_KEY`;
    await writeFile(f.envFile, Object.entries(keys).map(([name, value]) => `${name}=${value}\n`).join('')
      + `OTHER="first\n${keyName}=embedded-example\nlast"\n${keyName}=duplicate-key\n`);
    assert.deepEqual(await disconnectProvider({ provider }, f), { provider, connected: false });
    assert.equal(f.env[keyName], undefined);
    const persisted = dotenv.parse(await readFile(f.envFile));
    assert.equal(persisted[keyName], undefined);
    assert.equal(persisted.OTHER, `first\n${keyName}=embedded-example\nlast`);
    for (const [name, value] of Object.entries(keys)) if (name !== keyName) {
      assert.equal(persisted[name], value);
      assert.equal(f.env[name], value);
    }
    if (provider !== 'gemini') {
      await assert.rejects(listProviderModels(provider, { env: f.env, fetch: async () => { assert.fail('Removed key must not make a provider request'); } }), /Connect/);
    }
  });
}

test('failed removal preserves the active key and does not touch a symlink target', async (t) => {
  const f = await fixture(t);
  f.env.GEMINI_API_KEY = 'keep-gemini-key';
  const target = path.join(f.directory, 'target');
  await writeFile(target, 'GEMINI_API_KEY=keep-gemini-key\n');
  await symlink(target, f.envFile);
  await assert.rejects(disconnectProvider({ provider: 'gemini' }, f), /Could not update/);
  assert.equal(f.env.GEMINI_API_KEY, 'keep-gemini-key');
  assert.equal(await readFile(target, 'utf8'), 'GEMINI_API_KEY=keep-gemini-key\n');
});

test('removal supports environment-only keys without creating files, and rejects unknown providers', async (t) => {
  const f = await fixture(t);
  f.env.GEMINI_API_KEY = 'environment-only-key';
  await disconnectProvider({ provider: 'gemini' }, f);
  assert.equal(f.env.GEMINI_API_KEY, undefined);
  assert.deepEqual(await readdir(f.directory), []);
  await assert.rejects(disconnectProvider({ provider: '../other' }, f), /Choose Gemini, OpenAI, or OpenRouter/);
});
