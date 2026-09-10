import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import * as domain from '../src/domainGeneration';

// Run the actual endpoint with a controlled clock and provider, without starting
// the app or sending private content to an external service.
const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const start = server.indexOf("app.post('/api/generate-domain-knowledge'");
const end = server.indexOf("app.post('/api/plan-draft'", start);
assert.ok(start >= 0 && end > start);
const route = (await transform(server.slice(start, end), { loader: 'ts' })).code;
const output = JSON.stringify({ topics: [{ name: 'Content design', category: 'discipline', keyTerminology: ['hierarchy'] }] });

function harness() {
  let handler: any;
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const calls: any[] = [];
  let finish: (value: { text: string }) => void;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  });
  runInNewContext(route, {
    ...domain, AbortController, DOMException,
    app: { post: (_path: string, fn: any) => { handler = fn; } },
    console: { error() {} }, statusForError: () => 400,
    setTimeout: (callback: () => void, delay: number) => {
      timers.set(++timerId, { at: now + delay, callback }); return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    generateContentWithRetry: (params: any) => {
      calls.push(params);
      return new Promise((resolve, reject) => {
        finish = resolve;
        params.signal?.addEventListener('abort', () => reject(params.signal.reason), { once: true });
      });
    },
  });
  return {
    res, calls, timers,
    run: (targetTopic?: { name: string; category: string }) => handler({ body: {
      field: 'Content design', model: 'openai:gpt-6-astra', reasoningLevel: 'xhigh', targetTopic,
    } }, res),
    finish: () => finish({ text: output }),
    advance: (ms: number) => {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

test('domain generation and card regeneration can finish after three minutes with the selected model and effort', async () => {
  for (const target of [undefined, { name: 'Content design', category: 'discipline' }]) {
    const app = harness();
    const pending = app.run(target);
    assert.equal(app.calls[0].preferredModel, 'openai:gpt-6-astra');
    assert.equal(app.calls[0].reasoningLevel, 'xhigh');
    assert.equal(app.calls[0].allowFallback, false);
    assert.ok(app.calls[0].signal instanceof AbortSignal);
    app.advance(240_000);
    assert.equal(app.calls[0].signal.aborted, false);
    app.finish();
    await pending;
    assert.equal(app.res.statusCode, 200);
    assert.equal(app.res.body.topics[0].name, 'Content design');
    assert.equal(app.timers.size, 0);
    assert.equal(app.res.listenerCount('close'), 0);
  }
});

test('domain generation stops at ten minutes with a specific timeout and no replacement topics', async () => {
  const app = harness();
  const pending = app.run();
  app.advance(599_999);
  assert.equal(app.calls[0].signal.aborted, false);
  app.advance(1);
  await pending;
  assert.equal(app.calls[0].signal.aborted, true);
  assert.equal(app.res.statusCode, 504);
  assert.match(app.res.body.error, /10-minute limit/);
  assert.equal(app.res.body.topics, undefined);
  assert.equal(app.timers.size, 0);
  assert.equal(app.res.listenerCount('close'), 0);
});

test('leaving a domain request aborts upstream work and does not send a late result', async () => {
  const app = harness();
  const pending = app.run();
  app.res.destroyed = true;
  app.res.emit('close');
  await pending;
  assert.equal(app.calls[0].signal.aborted, true);
  assert.equal(app.res.body, undefined);
  assert.equal(app.timers.size, 0);
  assert.equal(app.res.listenerCount('close'), 0);
});
