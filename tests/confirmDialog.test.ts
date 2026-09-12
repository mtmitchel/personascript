import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

test('ConfirmDialog renders empty string when closed', () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, {
      open: false,
      title: 'Replace these suggestions?',
      confirmLabel: 'Replace suggestions',
      cancelLabel: 'Keep current suggestions',
      onConfirm: () => {},
      onCancel: () => {},
    }),
  );

  assert.equal(html, '');
});

test('ConfirmDialog renders dialog when open with aria attributes and consequence labels', () => {
  const html = renderToStaticMarkup(
    createElement(
      ConfirmDialog,
      {
        open: true,
        title: 'Replace these suggestions?',
        confirmLabel: 'Replace suggestions',
        cancelLabel: 'Keep current suggestions',
        onConfirm: () => {},
        onCancel: () => {},
      },
      createElement('p', null, 'Your answers will be removed.'),
    ),
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /Replace suggestions/);
  assert.match(html, /Keep current suggestions/);
  assert.match(html, /Your answers will be removed\./);

  const labelledByMatch = html.match(/aria-labelledby="([^"]+)"/);
  assert.ok(labelledByMatch, 'aria-labelledby attribute must be present');
  const titleId = labelledByMatch[1];
  assert.ok(
    html.includes(`aria-labelledby="${titleId}"`) && html.includes(`id="${titleId}"`),
    'aria-labelledby must resolve to the h3 element id',
  );
  assert.match(html, new RegExp(`<h3[^>]*id="${titleId}"`));
});
