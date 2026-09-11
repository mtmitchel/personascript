import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorialPlan, EditorialPlanState, RewriteResult } from '../src/types';
import { isEditorialPlan, isEditorialPlanState, validateApprovedPlan } from '../src/editorialPlan';
import {
  EMPTY_STUDIO_WORKSPACE,
  parseStudioWorkspace,
  readStudioWorkspace,
  saveStudioWorkspace,
  STUDIO_WORKSPACE_KEY,
  type StudioWorkspace,
} from '../src/utils/studioWorkspace';
import { normalizeRewriteHistory } from '../src/utils/rewriteHistory';

const sourceA = {
  draft: 'Version A explains the original decision clearly.',
  projectBrief: 'Brief A supplies the context for version A.',
  readerPurpose: 'Readers need the reasoning behind version A.',
};

const sourceB = {
  draft: 'Version B is the current draft under active review.',
  projectBrief: 'Brief B supplies the context for version B.',
  readerPurpose: 'Readers need the current decision in version B.',
};

const planFor = (sources: typeof sourceA, approved: boolean): EditorialPlanState => ({
  plan: {
    openingJob: 'Establish the decision before the supporting detail.',
    items: [{
      idea: 'Keep the stated decision.',
      sourcePhrase: sources.draft,
      decision: 'keep',
      limit: 'Preserve the recorded scope.',
    }],
  },
  sources,
  approved,
  modelUsed: 'planning-test-model',
});

const incompletePendingPlan: EditorialPlanState = {
  plan: { openingJob: '', items: [{ idea: '', sourcePhrase: '', decision: 'keep', limit: '' }] },
  sources: sourceB,
  approved: false,
};

function version(
  id: string,
  sources: typeof sourceA,
  editorialPlan?: EditorialPlanState,
): RewriteResult {
  return {
    id,
    ...(editorialPlan ? { editorialPlan } : {}),
    profileId: 'profile-test',
    profileName: 'Test voice',
    intensity: 'faithful',
    originalText: sources.draft,
    rewrittenText: `${sources.draft} Rewritten for the saved version.`,
    wordCountOriginal: 8,
    wordCountRewritten: 13,
    changesExplanation: 'Saved version for persistence tests.',
    createdAt: '2026-09-09T10:00:00Z',
    projectBrief: sources.projectBrief,
    readerPurpose: sources.readerPurpose,
    review: { status: 'unavailable', summary: 'Review was not available.', findings: [], voiceObservations: [], localChecks: [] },
  };
}

test('legacy working copies and saved versions without editorial plans remain readable', () => {
  const legacyVersion = version('legacy-version', sourceA);
  const legacyWorkspace = {
    ...EMPTY_STUDIO_WORKSPACE,
    draftText: sourceA.draft,
    projectBrief: sourceA.projectBrief,
    readerPurpose: undefined,
    rewriteResult: null,
  };

  const restoredWorkspace = parseStudioWorkspace(JSON.stringify(legacyWorkspace));
  assert.equal(restoredWorkspace.editorialPlan, undefined);
  assert.equal(restoredWorkspace.readerPurpose, '');

  const restoredHistory = normalizeRewriteHistory([legacyVersion]);
  assert.equal(restoredHistory[0].editorialPlan, undefined);
  assert.equal(restoredHistory[0].originalText, legacyVersion.originalText);
  assert.equal(restoredHistory[0].projectBrief, legacyVersion.projectBrief);
});

test('pending incomplete plan edits survive reload but cannot be approved', () => {
  const workspace: StudioWorkspace = {
    ...EMPTY_STUDIO_WORKSPACE,
    draftText: sourceB.draft,
    projectBrief: sourceB.projectBrief,
    readerPurpose: sourceB.readerPurpose,
    editorialPlan: incompletePendingPlan,
  };
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (key: string, value: string) => {
      assert.equal(key, STUDIO_WORKSPACE_KEY);
      saved = value;
    },
  };

  assert.equal(saveStudioWorkspace(storage, workspace), null);
  const restored = readStudioWorkspace(storage);
  assert.equal(restored.error, null);
  assert.deepEqual(restored.workspace.editorialPlan, incompletePendingPlan);
  assert.throws(() => validateApprovedPlan(restored.workspace.editorialPlan, sourceB), /approve/i);
  assert.throws(
    () => validateApprovedPlan({ ...incompletePendingPlan, approved: true }, sourceB),
    /opening|decision|source|complete/i,
  );
});

test('approved plan snapshots stay with saved versions and remain separate from current inputs', () => {
  const savedPlan = planFor(sourceA, true);
  const currentPlan = planFor(sourceB, false);
  const workspace: StudioWorkspace = {
    ...EMPTY_STUDIO_WORKSPACE,
    draftText: sourceB.draft,
    projectBrief: sourceB.projectBrief,
    readerPurpose: sourceB.readerPurpose,
    editorialPlan: currentPlan,
    rewriteResult: version('version-a', sourceA, savedPlan),
  };
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value; },
  };

  assert.equal(saveStudioWorkspace(storage, workspace), null);
  const restored = readStudioWorkspace(storage).workspace;
  assert.equal(restored.draftText, sourceB.draft);
  assert.equal(restored.projectBrief, sourceB.projectBrief);
  assert.deepEqual(restored.editorialPlan, currentPlan);
  assert.equal(restored.rewriteResult?.originalText, sourceA.draft);
  assert.equal(restored.rewriteResult?.projectBrief, sourceA.projectBrief);
  assert.equal(restored.rewriteResult?.readerPurpose, sourceA.readerPurpose);
  assert.deepEqual(restored.rewriteResult?.editorialPlan, savedPlan);
  assert.equal(restored.rewriteResult?.editorialPlan?.sources.draft, sourceA.draft);
});

test('malformed plan data returns a read error while preserving the raw working copy', () => {
  const raw = JSON.stringify({
    ...EMPTY_STUDIO_WORKSPACE,
    editorialPlan: { ...planFor(sourceA, true), approved: 'yes' },
  });
  let writes = 0;
  const storage = {
    getItem: () => raw,
    setItem: () => { writes += 1; },
  };

  assert.throws(() => parseStudioWorkspace(raw), /could not be read/);
  const result = readStudioWorkspace(storage);
  assert.equal(result.found, true);
  assert.match(result.error || '', /not been overwritten|could not be read/);
  assert.deepEqual(result.workspace, EMPTY_STUDIO_WORKSPACE);
  assert.equal(writes, 0);
  assert.equal(raw, JSON.stringify({
    ...EMPTY_STUDIO_WORKSPACE,
    editorialPlan: { ...planFor(sourceA, true), approved: 'yes' },
  }));
});

test('completed history rejects unapproved and stale editorial plan snapshots', () => {
  const unapproved = version('pending-version', sourceA, planFor(sourceA, false));
  assert.throws(() => normalizeRewriteHistory([unapproved]), /could not be read/);

  const stalePlan = planFor(sourceA, true);
  stalePlan.sources = { ...sourceA, projectBrief: 'A changed brief makes this stale.' };
  const stale = version('stale-version', sourceA, stalePlan);
  assert.throws(() => normalizeRewriteHistory([stale]), /could not be read/);
});

test('quota save failure retains the previous working copy, including its plan', () => {
  const previousPlan = planFor(sourceA, false);
  const previous: StudioWorkspace = {
    ...EMPTY_STUDIO_WORKSPACE,
    draftText: sourceA.draft,
    projectBrief: sourceA.projectBrief,
    readerPurpose: sourceA.readerPurpose,
    editorialPlan: previousPlan,
  };
  const next: StudioWorkspace = {
    ...previous,
    draftText: sourceB.draft,
    projectBrief: sourceB.projectBrief,
    readerPurpose: sourceB.readerPurpose,
    editorialPlan: planFor(sourceB, false),
  };
  let saved = JSON.stringify(previous);
  let fail = true;
  const storage = {
    setItem: (_key: string, value: string) => {
      if (fail) throw new Error('Quota exceeded');
      saved = value;
    },
  };

  assert.match(saveStudioWorkspace(storage, next), /could not be saved/);
  assert.deepEqual(parseStudioWorkspace(saved), previous);
  assert.deepEqual(parseStudioWorkspace(saved).editorialPlan, previousPlan);

  fail = false;
  assert.equal(saveStudioWorkspace(storage, next), null);
  assert.deepEqual(parseStudioWorkspace(saved), next);
});

test('isEditorialPlan and isEditorialPlanState accept saved v2 and v3 plans, and reject a v3 item without paragraphRange', () => {
  const v2Plan: EditorialPlan = {
    version: 2,
    openingJob: 'Establish the project.',
    items: [
      {
        paragraphId: 1,
        idea: 'Keep idea.',
        sourcePhrase: sourceA.draft,
        decision: 'keep',
        limit: 'Retain.',
      },
    ],
  };
  const v2State: EditorialPlanState = {
    plan: v2Plan,
    sources: sourceA,
    approved: true,
  };

  assert.equal(isEditorialPlan(v2Plan), true);
  assert.equal(isEditorialPlanState(v2State), true);

  const v3Plan: EditorialPlan = {
    version: 3,
    openingJob: 'Establish the project.',
    items: [
      {
        paragraphRange: { from: 1, to: 1 },
        idea: 'Keep idea.',
        sourcePhrase: sourceA.draft,
        decision: 'keep',
        limit: '',
      },
    ],
    conflicts: [
      {
        draftQuote: sourceA.draft,
        briefQuote: sourceA.projectBrief,
        question: 'Which source is correct?',
      },
    ],
  };
  const v3State: EditorialPlanState = {
    plan: v3Plan,
    sources: sourceA,
    approved: true,
  };

  assert.equal(isEditorialPlan(v3Plan), true);
  assert.equal(isEditorialPlanState(v3State), true);

  // Reject a v3 item without paragraphRange
  const v3MissingRange: EditorialPlan = {
    version: 3,
    openingJob: 'Establish the project.',
    items: [
      {
        paragraphId: 1,
        idea: 'Keep idea.',
        sourcePhrase: sourceA.draft,
        decision: 'keep',
        limit: '',
      },
    ],
  };
  assert.equal(isEditorialPlan(v3MissingRange), false);
  assert.equal(isEditorialPlanState({ ...v3State, plan: v3MissingRange }), false);
});
