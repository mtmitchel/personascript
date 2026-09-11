import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import * as editorial from '../src/editorialPlan';
import { generateExternalContent } from '../src/aiProvider';
import { parseModelChoice } from '../src/modelChoice';
import { normalizeDomainExpertise, validateDomainExpertiseInput } from '../src/writingPipeline';

// Exercise the actual planning route and provider transport with a controlled
// clock and local response. No app server or external model request is needed.
const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
const start = server.indexOf("app.post('/api/plan-draft'");
const end = server.indexOf("app.post('/api/rewrite-draft'", start);
assert.ok(start >= 0 && end > start);
const route = (await transform(server.slice(start, end), { loader: 'ts' })).code;
const draft = 'The team clarified the next step in the account setup flow.';
const plan = {
  version: 4, openingJob: 'Explain the decision and its purpose.',
  items: [{ paragraphRange: { from: 1, to: 1 }, idea: 'Keep the documented decision.', sourcePhrase: draft,
    decision: 'keep', limit: 'Preserve the team attribution.' }],
  conflicts: [],
};

function harness(t: TestContext) {
  let handler: any;
  let now = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const schedule = (callback: () => void, delay: number) => {
    timers.set(++timerId, { at: now + delay, callback }); return timerId;
  };
  t.mock.method(AbortSignal, 'timeout', (delay: number) => {
    const controller = new AbortController();
    schedule(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), delay);
    return controller.signal;
  });
  const calls: any[] = [];
  let signal: AbortSignal;
  let finish: (value: Response) => void;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false, statusCode: 200, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  });
  runInNewContext(route, {
    ...editorial, AbortController, DOMException, parseModelChoice, normalizeDomainExpertise, validateDomainExpertiseInput,
    app: { post: (_path: string, fn: any) => { handler = fn; } },
    requireObject: (value: unknown) => value, optionalText: (value: unknown) => value,
    validateControlInputs() {}, statusForError: () => 500,
    setTimeout: schedule, clearTimeout: (id: number) => timers.delete(id),
    generateContentWithRetry: (params: any) => {
      calls.push(params);
      return generateExternalContent({ model: params.preferredModel, contents: params.contents,
        config: params.config, reasoningLevel: params.reasoningLevel, signal: params.signal }, {
        env: { OPENAI_API_KEY: 'local-test-key' },
        fetch: async (_url, options) => new Promise<Response>((resolve, reject) => {
          signal = options.signal as AbortSignal;
          finish = resolve;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      });
    },
  });
  return {
    res, calls, timers,
    get signal() { return signal; },
    run: () => handler({ body: { draft, model: 'openai:gpt-6-astra', reasoningLevel: 'xhigh' } }, res),
    finish: (payload: unknown = plan) => finish(new Response(JSON.stringify({
      model: 'gpt-6-astra', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    }))),
    advance: (ms: number) => {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

test('planning can complete after three minutes without changing the selected model or effort', async (t) => {
  const app = harness(t);
  const pending = app.run();
  app.advance(240_000);
  app.finish();
  await pending;
  assert.equal(app.res.statusCode, 200);
  assert.equal(app.signal.aborted, false);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].preferredModel, 'openai:gpt-6-astra');
  assert.equal(app.calls[0].reasoningLevel, 'xhigh');
  assert.equal(app.calls[0].allowFallback, false);
  assert.equal(app.res.body.plan.items[0].sourcePhrase, draft);
  assert.equal(app.res.body.rewrittenText, undefined);
  assert.equal(app.timers.size, 0);
  assert.equal(app.res.listenerCount('close'), 0);
});

test('a generated conflict claim without structured quotations still returns an editable plan', async (t) => {
  const app = harness(t);
  const pending = app.run();
  app.finish({ ...plan, conflicts: [{ draftQuote: 'not in draft', briefQuote: 'not in brief', question: 'Which is it?' }] });
  await pending;
  assert.equal(app.res.statusCode, 200);
  assert.deepEqual(app.res.body.plan.conflicts, []);
});

test('planning stops at ten minutes with a clear error and no replacement plan', async (t) => {
  const app = harness(t);
  const pending = app.run();
  app.advance(599_999);
  assert.equal(app.signal.aborted, false);
  app.advance(1);
  await pending;
  assert.equal(app.signal.aborted, true);
  assert.equal(app.res.statusCode, 504);
  assert.match(app.res.body.error, /10-minute limit/);
  assert.equal(app.res.body.plan, undefined);
  assert.equal(app.calls.length, 1);
  assert.equal(app.timers.size, 0);
  assert.equal(app.res.listenerCount('close'), 0);
});

test('closing the planning request cancels upstream work without sending a late result', async (t) => {
  const app = harness(t);
  const pending = app.run();
  app.res.destroyed = true;
  app.res.emit('close');
  await pending;
  assert.equal(app.signal.aborted, true);
  assert.equal(app.res.body, undefined);
  assert.equal(app.timers.size, 0);
  assert.equal(app.res.listenerCount('close'), 0);
});
