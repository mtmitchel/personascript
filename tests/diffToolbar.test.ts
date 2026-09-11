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
  const html = renderToStaticMarkup(createElement(DiffViewer, { blocks }));

  // Pinned toolbar exists with id="changes-toolbar"
  assert.match(html, /id="changes-toolbar"/);

  // Correct count text
  assert.match(html, /2 of 2 changes to look at\./);

  // Accept all button is present
  assert.match(html, /<button[^>]*>Accept all<\/button>/);

  // Previous and Next buttons are present when changes.length > 1
  assert.match(html, /aria-label="Previous change"/);
  assert.match(html, /aria-label="Next change"/);

  // Previous button is disabled on first render (nothing before first unaccepted change)
  assert.match(html, /<button[^>]*aria-label="Previous change"[^>]*disabled=""[^>]*>Previous<\/button>/);

  // Per-change attributes: id and tabIndex={-1}
  assert.match(html, /id="change-1"[^>]*tabindex="-1"/);
  assert.match(html, /id="change-2"[^>]*tabindex="-1"/);
});

test('DiffViewer toolbar with single change (=1 change)', () => {
  const blocks: ParagraphBlock[] = [equalBlock, changedBlock1];
  const html = renderToStaticMarkup(createElement(DiffViewer, { blocks }));

  // Singular count string
  assert.match(html, /1 of 1 change to look at\./);

  // Accept all is present
  assert.match(html, /<button[^>]*>Accept all<\/button>/);

  // Previous and Next are NOT rendered when changes.length <= 1
  assert.equal(html.includes('aria-label="Previous change"'), false);
  assert.equal(html.includes('aria-label="Next change"'), false);
});

test('DiffViewer toolbar with no changes (0 changes remaining)', () => {
  const blocks: ParagraphBlock[] = [equalBlock];
  const html = renderToStaticMarkup(createElement(DiffViewer, { blocks }));

  // Count text
  assert.match(html, /No changes\./);

  // Accept all button is absent when remaining === 0
  assert.equal(html.includes('Accept all'), false);

  // Previous and Next are absent
  assert.equal(html.includes('aria-label="Previous change"'), false);
  assert.equal(html.includes('aria-label="Next change"'), false);
});

test('DiffViewer toolbar undo button reflects canUndo and onUndo', () => {
  const blocks: ParagraphBlock[] = [changedBlock1];

  const htmlWithoutUndo = renderToStaticMarkup(createElement(DiffViewer, { blocks }));
  assert.equal(htmlWithoutUndo.includes('title="Undo the last Keep original, Restore, or Remove"'), false);

  const htmlWithUndo = renderToStaticMarkup(
    createElement(DiffViewer, {
      blocks,
      canUndo: true,
      onUndo: () => {},
    }),
  );
  assert.match(htmlWithUndo, /title="Undo the last Keep original, Restore, or Remove"[^>]*>Undo<\/button>/);
});
