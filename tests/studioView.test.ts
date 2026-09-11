import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WritingAssistantProvider } from '../src/context/WritingAssistantContext';
import { StudioView } from '../src/components/StudioView';
import {
  emptyWorkspaceFixture,
  draftWithV4PlanFixture,
  approvedPlanWithRewriteFixture,
} from './fixtures/studioWorkspace';
import { STUDIO_WORKSPACE_KEY, StudioWorkspace } from '../src/utils/studioWorkspace';

function setupMockStorage(workspace: StudioWorkspace) {
  const store = new Map<string, string>();
  store.set(STUDIO_WORKSPACE_KEY, JSON.stringify(workspace));

  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}

const FORBIDDEN_STRINGS = [
  'Start a new rewrite from the original draft',
  'Ask for different suggestions',
  'Back to the rewrite',
  'Rewrite from source',
  'Accept all and rewrite',
  'Suggest changes',
];

function assertNoForbiddenStrings(html: string) {
  for (const forbidden of FORBIDDEN_STRINGS) {
    assert.equal(
      html.includes(forbidden),
      false,
      `HTML unexpectedly contained forbidden string: "${forbidden}"`,
    );
  }
}

test('StudioView with empty workspace (fixture 1)', () => {
  setupMockStorage(emptyWorkspaceFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  // Assert tab strip has three tabs with right aria-disabled
  assert.match(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);
  assert.match(html, /id="rail-tab-change"[^>]*aria-disabled="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-disabled="true"/);

  // Assert stable action bar buttons
  assert.match(html, /id="btn-rewrite"[^>]*disabled=""[^>]*>Rewrite<\/button>/);
  assert.match(html, /id="btn-get-suggestions"[^>]*disabled=""[^>]*>Get suggestions<\/button>/);

  // Status line priority 1
  assert.match(html, /Add your draft in Draft &amp; Brief to begin\./);

  // Document shows empty state with Open Draft & Brief button
  assert.match(html, /Start with your draft\./);
  assert.match(html, /Open Draft &amp; Brief/);

  // Prose container is present and no selection toolbar without selection
  assert.match(html, /id="rendered-prose-container"/);
  assert.equal(html.includes('studio-selection-toolbar'), false);

  // No forbidden strings
  assertNoForbiddenStrings(html);
});

test('StudioView with draft + v4 unapproved plan with pending suggestions (fixture 2)', () => {
  setupMockStorage(draftWithV4PlanFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  // Tab strip: Suggestions enabled, others disabled because no rewrite yet
  assert.match(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);
  assert.match(html, /id="rail-tab-change"[^>]*aria-disabled="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-disabled="true"/);

  // Primary button label is always Rewrite (enabled here)
  assert.match(html, /id="btn-rewrite"[^>]*>Rewrite<\/button>/);
  assert.equal(html.includes('id="btn-rewrite" disabled'), false);

  // Secondary button is Get new suggestions (since plan exists)
  assert.match(html, /id="btn-get-suggestions"[^>]*>Get new suggestions<\/button>/);

  // Status line: 2 pending suggestions
  assert.match(html, /2 unanswered suggestions will be accepted when you rewrite\./);

  // Summary line above section groups
  assert.match(html, /0 of 2 suggestions answered/);
  assert.match(html, /Accept all/);

  // Instruction field is always rendered when draft is present
  assert.match(html, /id="input-rewrite-instructions"/);

  // Settings rendered as details
  assert.match(html, /<details class="studio-settings"/);

  // Prose container is present and no selection toolbar without selection
  assert.match(html, /id="rendered-prose-container"/);
  assert.equal(html.includes('studio-selection-toolbar'), false);

  // No forbidden strings
  assertNoForbiddenStrings(html);
});

test('StudioView with approved plan + rewrite with review findings (fixture 3)', () => {
  setupMockStorage(approvedPlanWithRewriteFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  // Tab strip: all tabs enabled because rewrite is present
  assert.match(html, /id="rail-tab-suggestions"/);
  assert.match(html, /id="rail-tab-change"/);
  assert.match(html, /id="rail-tab-review"/);
  assert.equal(html.includes('id="rail-tab-change" aria-disabled="true"'), false);
  assert.equal(html.includes('id="rail-tab-review" aria-disabled="true"'), false);

  // Three view-switcher buttons: Original, Rewrite, Changes
  assert.match(html, /id="view-mode-original"/);
  assert.match(html, /id="view-mode-rewrite"/);
  assert.match(html, /id="view-mode-changes"/);

  // Document actions toolbar order: History · Copy · Export · Details
  const actionsStart = html.indexOf('class="studio-document-actions"');
  assert.ok(actionsStart !== -1);
  const actionsHtml = html.slice(actionsStart, actionsStart + 2500);
  const historyPos = actionsHtml.indexOf('History');
  const copyPos = actionsHtml.indexOf('Copy');
  const exportPos = actionsHtml.indexOf('Export');
  const detailsPos = actionsHtml.indexOf('Details');
  assert.ok(historyPos !== -1 && copyPos !== -1 && exportPos !== -1 && detailsPos !== -1);
  assert.ok(historyPos < copyPos && copyPos < exportPos && exportPos < detailsPos);

  // Open Draft & Brief button is absent when draft/rewrite is present
  assert.equal(html.includes('Open Draft &amp; Brief'), false);

  // Prose container is present and no selection toolbar without selection
  assert.match(html, /id="rendered-prose-container"/);
  assert.equal(html.includes('studio-selection-toolbar'), false);

  // A saved rewrite with review findings opens on the Changes view and the Review tab (spec §5.3)
  assert.match(html, /id="view-mode-changes"[^>]*aria-pressed="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-selected="true"/);
  assert.doesNotMatch(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);

  // Primary button is still Rewrite
  assert.match(html, /id="btn-rewrite"[^>]*>Rewrite<\/button>/);
  // Secondary button is Get new suggestions
  assert.match(html, /id="btn-get-suggestions"[^>]*>Get new suggestions<\/button>/);

  // Status line priority 9
  assert.match(html, /The last rewrite followed these suggestions\. Rewrite writes a new version from the original draft\./);

  // No forbidden strings
  assertNoForbiddenStrings(html);
});
