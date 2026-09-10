// Server-only credential validation and persistence. Never return stored keys.
import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parse as parseEnv } from 'dotenv';
import type { Request } from 'express';
import { PROVIDER_NAMES, type AIProvider } from './modelChoice';

export class ConnectionError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); }
}

export function requireLocalConnectionRequest(req: Pick<Request, 'socket' | 'headers' | 'protocol' | 'is'>): void {
  const address = req.socket.remoteAddress;
  const localAddress = address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
  const host = req.headers.host || '';
  let localHost = false;
  try {
    const hostname = new URL(`http://${host}`).hostname;
    localHost = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(hostname);
  } catch { /* Reject malformed hosts. */ }
  if (!localAddress || !localHost || req.headers.origin !== `${req.protocol}://${host}`
    || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
    throw new ConnectionError('Open this app on localhost to manage API connections.', 403);
  }
  if (!req.is('application/json')) throw new ConnectionError('Send the connection as JSON.', 415);
}

function connectionProvider(body: unknown): AIProvider {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ConnectionError('Choose a provider.');
  const { provider } = body as Record<string, unknown>;
  if (provider !== 'gemini' && provider !== 'openai' && provider !== 'openrouter') throw new ConnectionError('Choose Gemini, OpenAI, or OpenRouter.');
  return provider;
}

export function validateConnectionInput(body: unknown): { provider: AIProvider; apiKey: string } {
  const provider = connectionProvider(body);
  const { apiKey } = body as Record<string, unknown>;
  // Prevent newlines, dotenv syntax, and control characters from entering headers or .env.
  if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{10,512}$/.test(apiKey.trim())) {
    throw new ConnectionError('Enter a valid API key without spaces or line breaks.');
  }
  return { provider, apiKey: apiKey.trim() };
}

let pendingSave: Promise<void> = Promise.resolve();

async function persistKey(keyName: string, apiKey: string | null, envFile: string): Promise<void> {
  // Serialize read/replace so simultaneous provider connections cannot overwrite one another.
  const save = pendingSave.catch(() => {}).then(async () => {
    let original = '';
    try {
      const info = await lstat(envFile);
      if (!info.isFile()) throw new Error('Not a regular file');
      original = await readFile(envFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ConnectionError('Could not update the connection. Check that the server’s .env file is writable.', 500);
    }
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    // Match whole assignments, including other variables' multiline values, so
    // an embedded line resembling a key assignment stays untouched.
    const assignment = /^[\t ]*(?:export[\t ]+)?([\w.-]+)[\t ]*(?:=[\t ]*|:[\t ]+)(?:'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`|[^\r\n]*)[^\r\n]*/gm;
    let found = false;
    const replaced = original.replace(assignment, (line, name: string) => {
      if (name !== keyName) return line;
      found = true;
      return apiKey === null ? '' : `${keyName}=${apiKey}`;
    });
    const updated = found || apiKey === null ? replaced : `${original}${original && !original.endsWith('\n') ? newline : ''}${keyName}=${apiKey}${newline}`;
    const previousValues = parseEnv(original);
    const nextValues = parseEnv(updated);
    const expectedValues = { ...previousValues };
    if (apiKey === null) delete expectedValues[keyName];
    else expectedValues[keyName] = apiKey;
    if (nextValues[keyName] !== expectedValues[keyName] || Object.keys(nextValues).length !== Object.keys(expectedValues).length
      || Object.entries(previousValues).some(([name, value]) => name !== keyName && nextValues[name] !== value)) {
      throw new ConnectionError('Could not safely update the server’s .env file. Check its formatting and try again.', 500);
    }
    if (apiKey === null && !found) return;
    const temporary = path.join(path.dirname(envFile), `.env.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, updated, { mode: 0o600, flag: 'wx' });
      await rename(temporary, envFile);
    } catch {
      throw new ConnectionError('Could not update the connection. Check that the server’s .env file is writable.', 500);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  });
  pendingSave = save;
  await save;
}

export async function connectProvider(body: unknown, dependencies: {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  envFile?: string;
} = {}): Promise<{ provider: AIProvider; connected: true }> {
  const { provider, apiKey } = validateConnectionInput(body);
  const label = PROVIDER_NAMES[provider];
  const url = provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/models'
    : provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://openrouter.ai/api/v1/key';
  const headers: Record<string, string> = provider === 'gemini' ? { 'x-goog-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` };
  let response: Response;
  try {
    response = await (dependencies.fetch || fetch)(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new ConnectionError(`Could not reach ${label}. Try again.`, 502); }
  if (!response.ok) {
    const rejected = response.status === 401 || response.status === 403 || (provider === 'gemini' && response.status === 400);
    const message = rejected
      ? `${label} rejected this key. Check the key and its permissions.`
      : `${label} could not verify this key (${response.status}). Try again.`;
    throw new ConnectionError(message, rejected ? 400 : 502);
  }
  const result = await response.json().catch(() => null);
  const validResponse = provider === 'gemini' ? Array.isArray(result?.models)
    : provider === 'openai' ? Array.isArray(result?.data)
    : result?.data && typeof result.data === 'object' && !Array.isArray(result.data);
  if (!validResponse) {
    throw new ConnectionError(`${label} returned an invalid connection response. Try again.`, 502);
  }
  const keyName = `${provider.toUpperCase()}_API_KEY`;
  await persistKey(keyName, apiKey, dependencies.envFile || path.resolve('.env'));
  (dependencies.env || process.env)[keyName] = apiKey;
  return { provider, connected: true };
}

export async function disconnectProvider(body: unknown, dependencies: {
  env?: NodeJS.ProcessEnv;
  envFile?: string;
} = {}): Promise<{ provider: AIProvider; connected: false }> {
  const provider = connectionProvider(body);
  const keyName = `${provider.toUpperCase()}_API_KEY`;
  await persistKey(keyName, null, dependencies.envFile || path.resolve('.env'));
  delete (dependencies.env || process.env)[keyName];
  return { provider, connected: false };
}
