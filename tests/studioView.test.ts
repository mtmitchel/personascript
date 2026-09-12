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
  editedDraftWithOpenVersionFixture,
} from './fixtures/studioWorkspace';
import { STUDIO_WORKSPACE_KEY, StudioWorkspace } from '../src/utils/studioWorkspace';
import { findingKey } from '../src/utils/reviewEvidence';

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
  'Mark read',
  'Whole-rewrite edit',
  'Selected-text edit',
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

  // Assert tab strip has four tabs with right aria-disabled
  assert.match(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);
  assert.match(html, /id="rail-tab-settings"/);
  assert.equal(html.includes('id="rail-tab-settings" aria-disabled="true"'), false);
  assert.match(html, /id="rail-tab-change"[^>]*aria-disabled="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-disabled="true"[^>]*>Possible issues<\/button>/);

  // Assert stable action bar buttons: Rewrite is present; Get suggestions is not rendered without draft
  assert.match(html, /id="btn-rewrite"[^>]*disabled=""[^>]*>Rewrite<\/button>/);
  assert.equal(html.includes('id="btn-get-suggestions"'), false);

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

  // Tab strip: Suggestions and Settings enabled, others disabled because no rewrite yet
  assert.match(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);
  assert.match(html, /id="rail-tab-settings"/);
  assert.equal(html.includes('id="rail-tab-settings" aria-disabled="true"'), false);
  assert.match(html, /id="rail-tab-change"[^>]*aria-disabled="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-disabled="true"[^>]*>Possible issues<\/button>/);

  // Primary button label is always Rewrite (enabled here)
  assert.match(html, /id="btn-rewrite"[^>]*>Rewrite<\/button>/);
  assert.equal(html.includes('id="btn-rewrite" disabled'), false);

  // Secondary button is Get new suggestions icon button when a plan exists
  assert.match(html, /id="btn-get-suggestions"[^>]*aria-label="Get new suggestions"/);

  // Status line: 2 pending suggestions
  assert.match(html, /2 unanswered suggestions will be accepted when you rewrite\./);

  // Answered count is removed; Accept the rest appears in header
  assert.equal(html.includes('0 of 2 suggestions answered'), false);
  assert.match(html, /Accept the rest/);

  // Identity and switcher state on Suggestions tab
  assert.match(html, /Original draft/);
  assert.equal(html.includes('id="view-mode-original"'), false);

  // Instruction field lives inside Settings panel, absent from Suggestions panel
  const suggestionsPanel = html.slice(html.indexOf('id="rail-panel-suggestions"'), html.indexOf('id="rail-panel-review"'));
  assert.equal(suggestionsPanel.includes('id="input-rewrite-instructions"'), false);
  const settingsPanel = html.slice(html.indexOf('id="rail-panel-settings"'));
  assert.match(settingsPanel, /id="input-rewrite-instructions"/);

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
  assert.match(html, /id="rail-tab-review"/);
  assert.match(html, /id="rail-tab-change"/);
  assert.match(html, /id="rail-tab-settings"/);
  assert.equal(html.includes('id="rail-tab-settings" aria-disabled="true"'), false);
  assert.equal(html.includes('id="rail-tab-change" aria-disabled="true"'), false);
  assert.equal(html.includes('id="rail-tab-review" aria-disabled="true"'), false);

  // Tab order: Suggestions -> Possible issues -> Ask for a change -> Rewrite settings
  const tabSuggestionsPos = html.indexOf('id="rail-tab-suggestions"');
  const tabReviewPos = html.indexOf('id="rail-tab-review"');
  const tabChangePos = html.indexOf('id="rail-tab-change"');
  const tabSettingsPos = html.indexOf('id="rail-tab-settings"');
  assert.ok(tabSuggestionsPos < tabReviewPos, 'Suggestions tab precedes Possible issues tab');
  assert.ok(tabReviewPos < tabChangePos, 'Possible issues tab precedes Ask for a change tab');
  assert.ok(tabChangePos < tabSettingsPos, 'Ask for a change tab precedes Rewrite settings tab');

  // Panel order: Suggestions -> Possible issues -> Ask for a change -> Rewrite settings
  const panelSuggestionsPos = html.indexOf('id="rail-panel-suggestions"');
  const panelReviewPos = html.indexOf('id="rail-panel-review"');
  const panelChangePos = html.indexOf('id="rail-panel-change"');
  const panelSettingsPos = html.indexOf('id="rail-panel-settings"');
  assert.ok(panelSuggestionsPos < panelReviewPos, 'Suggestions panel precedes Possible issues panel');
  assert.ok(panelReviewPos < panelChangePos, 'Possible issues panel precedes Ask for a change panel');
  assert.ok(panelChangePos < panelSettingsPos, 'Ask for a change panel precedes Rewrite settings panel');

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

  // Copy rewrite and Export rewrite labels
  assert.match(html, /Copy rewrite/);
  assert.match(html, /Export rewrite/);

  // Open Draft & Brief button is absent when draft/rewrite is present
  assert.equal(html.includes('Open Draft &amp; Brief'), false);

  // Prose container is present and no selection toolbar without selection
  assert.match(html, /id="rendered-prose-container"/);
  assert.equal(html.includes('studio-selection-toolbar'), false);

  // A saved rewrite with review findings opens on the Changes view and the Review tab (spec §5.3)
  assert.match(html, /id="view-mode-changes"[^>]*aria-pressed="true"/);
  assert.match(html, /id="rail-tab-review"[^>]*aria-selected="true"[^>]*>Possible issues \(1\)<\/button>/);
  assert.doesNotMatch(html, /id="rail-tab-suggestions"[^>]*aria-selected="true"/);

  // Primary button is still Rewrite
  assert.match(html, /id="btn-rewrite"[^>]*>Rewrite<\/button>/);
  // Secondary button is Get new suggestions icon button
  assert.match(html, /id="btn-get-suggestions"[^>]*aria-label="Get new suggestions"/);

  // No status line once the plan is approved and a rewrite exists: the rail
  // footer holds only the right-aligned primary button
  assert.equal(html.includes('Rewrite makes another version that follows the suggestions above.'), false);
  assert.match(html, /class="studio-rail-actions studio-rail-footer"/);
  assert.equal(html.includes('studio-rail-status'), false);

  // Ask for a change: the primary action is Submit with no helper line
  assert.match(html, /id="btn-apply-changes"[^>]*>Submit<\/button>/);
  assert.equal(html.includes('Apply edit'), false);
  assert.equal(html.includes('Describe a change to enable'), false);

  // Assert no Mark read
  assert.doesNotMatch(html, /Mark read/);

  // No forbidden strings
  assertNoForbiddenStrings(html);
});

test('StudioView with edited draft and open version (fixture 4)', () => {
  setupMockStorage(editedDraftWithOpenVersionFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  assert.match(html, /id="view-mode-changes"[^>]*aria-pressed="true"/);
  assert.match(html, /Draft changed since this version/);
});

test('Part A Suggestions tab restructure: footer order, header provenance, opening guidance, no repeated heading, settings', () => {
  setupMockStorage(draftWithV4PlanFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  const panelStart = html.indexOf('id="rail-panel-suggestions"');
  assert.ok(panelStart !== -1);
  const panelHtml = html.slice(panelStart);

  // Footer order:
  // in the rendered HTML of the Suggestions panel, index of class="studio-rail-status is less than id="btn-rewrite",
  // and index of class="studio-inspector-scroll is less than class="studio-rail-actions
  const scrollPos = panelHtml.indexOf('class="studio-inspector-scroll"');
  const actionsPos = panelHtml.indexOf('class="studio-rail-actions');
  const statusPos = panelHtml.indexOf('class="studio-rail-status');
  const rewritePos = panelHtml.indexOf('id="btn-rewrite"');

  assert.ok(scrollPos !== -1 && actionsPos !== -1 && statusPos !== -1 && rewritePos !== -1);
  assert.ok(scrollPos < actionsPos, 'studio-inspector-scroll must precede studio-rail-actions');
  assert.ok(statusPos < rewritePos, 'studio-rail-status must precede btn-rewrite');

  // The Rewrite button sits at the right edge of the footer
  assert.match(panelHtml, /class="studio-rail-actions studio-rail-footer"/);

  // Header: Suggested changes appears once
  const matches = html.match(/Suggested changes/g);
  assert.equal(matches?.length, 1);

  // with a plan whose modelUsed is set, Prepared by appears
  assert.match(html, /Prepared by /);

  // Opening: What the opening must establish appears; the uppercase heading >Opening< does not
  assert.match(html, /What the opening must establish/);
  assert.equal(html.includes('>Opening<'), false);

  // Settings: Rewrite settings appears
  assert.match(html, /Rewrite settings/);

  // No repeated name: build a fixture whose first item covers paragraphs 1–N under a heading;
  // assert the heading text appears exactly once inside the .studio-note-section markup (once in <summary>, not again in the row)
  const sectionStart = html.indexOf('class="studio-note-section"');
  assert.ok(sectionStart !== -1);
  const sectionEnd = html.indexOf('</details>', sectionStart);
  assert.ok(sectionEnd !== -1);
  const sectionMarkup = html.slice(sectionStart, sectionEnd);
  // Section One is the heading of the first section group
  const headingMatches = sectionMarkup.match(/Section One/g);
  assert.equal(headingMatches?.length, 1, 'heading text appears exactly once inside .studio-note-section');

  // Test with approved plan: approved: true, The last rewrite followed them. appears and
  // These are the suggestions the last rewrite followed. does not
  setupMockStorage(approvedPlanWithRewriteFixture);
  const approvedHtml = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );
  assert.match(approvedHtml, /The last rewrite followed them\./);
  assert.equal(approvedHtml.includes('These are the suggestions the last rewrite followed.'), false);
});

test('Round 2 Settings tab renders standing preferences and note', () => {
  setupMockStorage(draftWithV4PlanFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  assert.match(html, /id="input-studio-standing-preferences"/);
  assert.match(html, /Used for every draft/);
  assert.ok(html.includes(draftWithV4PlanFixture.editorialPreferences));
});

test('Round 2 No draft: Suggested changes does not render', () => {
  setupMockStorage(emptyWorkspaceFixture);
  const html = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );

  assert.equal(html.includes('Suggested changes'), false);
});

test('Round 2 Review findings: Possible issues (1) vs Possible issues when ignored', () => {
  // Version with 1 finding
  const oneFindingWorkspace = {
    ...approvedPlanWithRewriteFixture,
    rewriteResult: {
      ...approvedPlanWithRewriteFixture.rewriteResult!,
      review: {
        ...approvedPlanWithRewriteFixture.rewriteResult!.review!,
        findings: [approvedPlanWithRewriteFixture.rewriteResult!.review!.findings[0]],
      },
    },
  };

  setupMockStorage(oneFindingWorkspace);
  const html1 = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );
  assert.match(html1, /id="rail-tab-review"[^>]*>Possible issues \(1\)<\/button>/);

  // Same version with that finding ignored
  const targetKey = findingKey(oneFindingWorkspace.rewriteResult!.review!.findings[0]);
  const ignoredFindingWorkspace = {
    ...oneFindingWorkspace,
    rewriteResult: {
      ...oneFindingWorkspace.rewriteResult,
      review: {
        ...oneFindingWorkspace.rewriteResult.review,
        ignoredFindings: [targetKey],
      },
    },
  };

  setupMockStorage(ignoredFindingWorkspace);
  const html2 = renderToStaticMarkup(
    createElement(WritingAssistantProvider, null, createElement(StudioView)),
  );
  assert.match(html2, /id="rail-tab-review"[^>]*>Possible issues<\/button>/);
  assert.match(html2, /Ignored/);
  assert.match(html2, /Undo/);
});
