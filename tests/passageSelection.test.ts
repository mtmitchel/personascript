import assert from 'node:assert/strict';
import test from 'node:test';
import { locateSelection, paragraphSpans, resolvePassageSelection } from '../src/utils/passageSelection';

const source = '# Title\n\nIn late 2024, the **Monetization** team set out.\n\nSecond paragraph stays.';

test('paragraphSpans locates each numbered paragraph in the text it came from', () => {
  const spans = paragraphSpans(source);
  assert.equal(source.slice(spans.get(1)!.start, spans.get(1)!.end), '# Title');
  assert.equal(source.slice(spans.get(2)!.start, spans.get(2)!.end), 'In late 2024, the **Monetization** team set out.');
  assert.equal(source.slice(spans.get(3)!.start, spans.get(3)!.end), 'Second paragraph stays.');
});

test('locateSelection returns the exact passage when the reader selected verbatim source text', () => {
  const whole = { start: 0, end: source.length };
  const located = locateSelection(source, whole, 'team set out');
  assert.equal(located.text, 'team set out');
  assert.equal(source.slice(located.range.start, located.range.end), 'team set out');
  // The passage is only accepted inside the span it was selected in.
  const later = locateSelection(source, { start: source.indexOf('Second'), end: source.length }, 'Second paragraph');
  assert.equal(source.slice(later.range.start, later.range.end), 'Second paragraph');
});

test('a selection across hidden formatting widens to the paragraphs it touches, not the whole span', () => {
  const whole = { start: 0, end: source.length };
  // The reader saw "the Monetization team" with no asterisks; that is not a substring of the source.
  const located = locateSelection(source, whole, 'the Monetization team');
  assert.equal(located.text, 'In late 2024, the **Monetization** team set out.');
  assert.equal(source.slice(located.range.start, located.range.end), located.text);
  // Crossing into the next paragraph takes both, and nothing before them.
  const two = locateSelection(source, whole, 'Monetization team set out.Second paragraph');
  assert.equal(two.text, 'In late 2024, the **Monetization** team set out.\n\nSecond paragraph stays.');
});

test('resolvePassageSelection returns null for collapsed or empty selection', () => {
  const root = {} as any;
  const sel = { isCollapsed: true, rangeCount: 1, toString: () => '' } as any;
  assert.equal(resolvePassageSelection(root, sel, { type: 'original-highlight' }), null);
});

test('resolvePassageSelection returns highlight for original-highlight', () => {
  const container = { parentElement: null } as any;
  const root = { contains: () => true } as any;
  container.parentElement = root;
  const sel = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => 'selected passage',
    getRangeAt: () => ({ startContainer: container, endContainer: container }),
  } as any;
  const result = resolvePassageSelection(root, sel, { type: 'original-highlight' });
  assert.deepEqual(result, { kind: 'highlight', text: 'selected passage', range: undefined });
});

test('resolvePassageSelection resolves source-request paragraph and span', () => {
  const p1 = { id: 'draft-paragraph-1' };
  const container = {
    closest: (selector: string) => (selector === '.studio-source-paragraph' ? p1 : null),
  } as any;
  const root = { contains: () => true } as any;
  const sel = {
    isCollapsed: false,
    rangeCount: 1,
    toString: () => 'Title',
    getRangeAt: () => ({ startContainer: container, endContainer: container }),
  } as any;
  const result = resolvePassageSelection(root, sel, { type: 'source-request', draftText: source });
  assert.deepEqual(result, { kind: 'source', text: 'Title', from: 1, to: 1 });
});

