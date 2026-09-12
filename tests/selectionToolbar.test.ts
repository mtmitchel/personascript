import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SelectionToolbar } from '../src/components/SelectionToolbar';

test('SelectionToolbar renders nothing when enabled=false', () => {
  const container = { current: null };
  const html = renderToStaticMarkup(
    createElement(SelectionToolbar, {
      container,
      label: 'Ask for a change',
      onAct: () => {},
      enabled: false,
    }),
  );

  assert.equal(html, '');
});

test('SelectionToolbar renders nothing when enabled=true in server environment without DOM selection', () => {
  const container = { current: null };
  const html = renderToStaticMarkup(
    createElement(SelectionToolbar, {
      container,
      label: 'Ask for a change',
      onAct: () => {},
      enabled: true,
    }),
  );

  assert.equal(html, '');
});
