import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiffViewer } from '../src/components/DiffViewer';
import type { ParagraphBlock } from '../src/utils/diffHelper';

const equalBlock: ParagraphBlock = {
  kind: 'equal',
  original: ['Unchanged paragraph text.'],
  rewritten: ['Unchanged paragraph text.'],
  rewrittenStart: 0,
  rewrittenEnd: 25,
};

const changedBlock1: ParagraphBlock = {
  kind: 'changed',
  original: ['Original paragraph one.'],
  rewritten: ['Rewritten paragraph one.'],
  rewrittenStart: 0,
  rewrittenEnd: 24,
};

const changedBlock2: ParagraphBlock = {
  kind: 'changed',
  original: ['Original paragraph two.'],
  rewritten: ['Rewritten paragraph two.'],
  rewrittenStart: 26,
  rewrittenEnd: 50,
};

test('DiffViewer toolbar with multiple changes (>1 change)', () => {
  const blocks: ParagraphBlock[] = [equalBlock, changedBlock1, changedBlock2];
  const html = renderToStaticMarkup(
    createElement(DiffViewer, {
      blocks,
      onKeepOriginal: () => {},
      onRevise: () => {},
    }),
  );

  // Pinned toolbar exists with id="changes-toolbar"
  assert.match(html, /id="changes-toolbar"/);

  // Correct count text with role="status"
  assert.match(html, /<span role="status">2 changes\.<\/span>/);

  // Accept all and Accept are absent
  assert.equal(html.includes('Accept all'), false);
  assert.equal(html.includes('>Accept<'), false);

  // Previous and Next buttons are present when changes.length > 1
  assert.match(html, /aria-label="Previous change"/);
  assert.match(html, /aria-label="Next change"/);

  // Previous button is disabled on first render (nothing before first change)
  assert.match(html, /<button[^>]*aria-label="Previous change"[^>]*disabled=""[^>]*>Previous<\/button>/);

  // Per-change attributes: id, tabIndex={-1}, and aria-current="true" on first change
  assert.match(html, /id="change-1"[^>]*tabindex="-1"/);
  assert.match(html, /id="change-1"[^>]*aria-current="true"/);
  assert.match(html, /id="change-2"[^>]*tabindex="-1"/);

  // Aria labels on changed and unchanged sections
  assert.match(html, /aria-label="Unchanged text"/);
  assert.match(html, /aria-label="Changed text"/);

  // Per-block actions on changed blocks
  assert.match(html, /Use original text/);
  assert.match(html, /Ask for a change/);
});

test('DiffViewer toolbar with single change (=1 change)', () => {
  const blocks: ParagraphBlock[] = [equalBlock, changedBlock1];
  const html = renderToStaticMarkup(createElement(DiffViewer, { blocks }));

  // Singular count string
  assert.match(html, /1 change\./);

  // Accept all and Accept are absent
  assert.equal(html.includes('Accept all'), false);
  assert.equal(html.includes('>Accept<'), false);

  // Previous and Next are NOT rendered when changes.length <= 1
  assert.equal(html.includes('aria-label="Previous change"'), false);
  assert.equal(html.includes('aria-label="Next change"'), false);
});

test('DiffViewer toolbar with no changes (0 changes remaining)', () => {
  const blocks: ParagraphBlock[] = [equalBlock];
  const html = renderToStaticMarkup(createElement(DiffViewer, { blocks }));

  // Count text
  assert.match(html, /No changes\./);

  // Accept all button is absent
  assert.equal(html.includes('Accept all'), false);

  // Previous and Next are absent
  assert.equal(html.includes('aria-label="Previous change"'), false);
  assert.equal(html.includes('aria-label="Next change"'), false);
});

test('DiffViewer toolbar undo button reflects canUndo and onUndo', () => {
  const blocks: ParagraphBlock[] = [changedBlock1];

  const htmlWithoutUndo = renderToStaticMarkup(createElement(DiffViewer, { blocks }));
  assert.equal(
    htmlWithoutUndo.includes('title="Undo the last Use original text, Restore deleted text, or Remove added text"'),
    false,
  );

  const htmlWithUndo = renderToStaticMarkup(
    createElement(DiffViewer, {
      blocks,
      canUndo: true,
      onUndo: () => {},
    }),
  );
  assert.match(
    htmlWithUndo,
    /title="Undo the last Use original text, Restore deleted text, or Remove added text"[^>]*>Undo text change<\/button>/,
  );
});

test('DiffViewer per-block action labels for added and removed blocks', () => {
  const addedBlock: ParagraphBlock = {
    kind: 'added',
    original: [],
    rewritten: ['Added text.'],
    rewrittenStart: 0,
    rewrittenEnd: 11,
  };
  const removedBlock: ParagraphBlock = {
    kind: 'removed',
    original: ['Removed text.'],
    rewritten: [],
    rewrittenStart: 0,
    rewrittenEnd: 0,
  };
  const html = renderToStaticMarkup(
    createElement(DiffViewer, {
      blocks: [addedBlock, removedBlock],
      onKeepOriginal: () => {},
      onRevise: () => {},
    }),
  );
  assert.match(html, /Remove added text/);
  assert.match(html, /Restore deleted text/);
});
