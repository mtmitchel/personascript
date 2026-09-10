import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as React from 'react';

// Exercise the actual provider actions with deterministic hooks, storage, and transport.
// Rendered modal behavior is checked separately in the browser.
const bundle = await build({ entryPoints: ['src/context/WritingAssistantContext.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
const require = createRequire(import.meta.url);
const input = { title: 'Pasted example', content: 'A complete writing sample for the local lifecycle check.', fileType: 'pasted', wordCount: 10, charCount: 55 };
function harness(saved = new Map<string, string>()) {
  let cursor = 0;
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  const cleanups: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let now = 0;
  const deadlines = new Map<number, number>();
  const requests: Array<{ signal: AbortSignal; resolve: (value: Response) => void; reject: (error: Error) => void }> = [];
  const react = { ...React,
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect: () => any, deps: unknown[]) {
      const index = cursor++;
      if (!(index in slots) || deps.some((value, i) => value !== slots[index][i])) {
        slots[index] = deps;
        effects.push(() => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
      }
    },
  };
  const module = { exports: {} as any };
  runInNewContext(bundle.outputFiles[0].text, {
    module, exports: module.exports,
    require: (id: string) => id === 'react' ? react : require(id),
    console, crypto: { getRandomValues: crypto.getRandomValues.bind(crypto) }, AbortController, DOMException,
    localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) },
    window: { addEventListener() {}, removeEventListener() {} },
    setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, callback); deadlines.set(timerId, now + delay); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    fetch: (_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      requests.push({ signal: init.signal!, resolve, reject });
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }),
  });
  const render = () => {
    cursor = 0;
    const value = module.exports.WritingAssistantProvider({ children: null }).props.value;
    while (effects.length) effects.shift()!();
    return value;
  };
  return { render, requests, saved, timers, advance: (ms: number) => {
    now += ms;
    for (const [id, callback] of timers) if (deadlines.get(id)! <= now) { timers.delete(id); callback(); }
  }, unmount: () => cleanups.forEach(fn => fn()) };
}

test('adding multiple samples resolves without network and persists distinct complete samples', async () => {
  const app = harness();
  const first = await app.render().addSample(input);
  const second = await app.render().addSample(input);
  const samples = app.render().samples;
  assert.notEqual(first.id, second.id);
  assert.equal(samples.find((sample: any) => sample.id === first.id).content, input.content);
  assert.equal(app.requests.length, 0);
  assert.equal(JSON.parse(app.saved.get('personascript_samples_v2')!).find((sample: any) => sample.id === second.id).analyzing, false);
});

test('cancel preserves text, releases the lock, and an older completion cannot overwrite a retry', async () => {
  const app = harness();
  const sample = await app.render().addSample(input);
  const pending = app.render().analyzeSample(sample.id);
  assert.equal(app.render().samples[0].analyzing, true);
  app.render().cancelSampleAnalysis(sample.id);
  assert.equal(app.requests[0].signal.aborted, true);
  const retry = app.render().analyzeSample(sample.id);
  await pending;
  assert.equal(app.render().samples[0].analyzing, true);
  app.requests[1].resolve(new Response(JSON.stringify({ summary: 'Current result' })));
  await retry;
  const result = app.render().samples[0];
  assert.equal(result.analysis.summary, 'Current result');
  assert.equal(result.content, input.content);
  assert.equal(result.analyzing, false);
  assert.equal(app.timers.size, 0);
});

test('failure and timeout retain the sample with a visible retry reason', async () => {
  for (const timeout of [false, true]) {
    const app = harness();
    const sample = await app.render().addSample(input);
    const pending = app.render().analyzeSample(sample.id);
    if (timeout) app.advance(600_000);
    else app.requests[0].resolve(new Response(JSON.stringify({ error: 'Provider unavailable' }), { status: 503 }));
    await pending;
    const result = app.render().samples[0];
    assert.equal(result.analyzing, false);
    assert.equal(result.content, input.content);
    assert.match(result.analysisError, timeout ? /10-minute limit/ : /Provider unavailable/);
  }
});

test('reload clears stale activity without restarting analysis; deletion aborts an active request', async () => {
  const app = harness();
  const sample = await app.render().addSample(input);
  const pending = app.render().analyzeSample(sample.id);
  app.render();
  const reloaded = harness(new Map(app.saved));
  assert.equal(reloaded.render().samples[0].analyzing, false);
  assert.match(reloaded.render().samples[0].analysisError, /interrupted/);
  assert.equal(reloaded.requests.length, 0);
  app.render().deleteSample(sample.id);
  await pending;
  assert.equal(app.requests[0].signal.aborted, true);
  assert.equal(app.render().samples.some((value: any) => value.id === sample.id), false);
});


test('Extra high sample analysis remains active past the old two- and three-minute limits', async () => {
  const saved = new Map([['personascript_model_settings_v1', JSON.stringify({ analysisModel: 'openai:gpt-6-astra', analysisReasoningLevel: 'xhigh' })]]);
  const app = harness(saved);
  const sample = await app.render().addSample(input);
  const pending = app.render().analyzeSample(sample.id);
  app.advance(240_000);
  assert.equal(app.requests[0].signal.aborted, false);
  assert.equal(app.render().samples[0].analyzing, true);
  assert.equal(app.render().modelSettings.analysisReasoningLevel, 'xhigh');
  app.requests[0].resolve(new Response(JSON.stringify({ summary: 'Completed after four minutes' })));
  await pending;
  assert.equal(app.render().samples[0].analysis.summary, 'Completed after four minutes');
});
