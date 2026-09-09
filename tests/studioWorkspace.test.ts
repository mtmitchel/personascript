import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_STUDIO_WORKSPACE, parseStudioWorkspace, readStudioWorkspace, saveStudioWorkspace, STUDIO_WORKSPACE_KEY, StudioWorkspace } from '../src/utils/studioWorkspace';
import { createVersionId } from '../src/utils/rewriteHistory';
import { READER_PURPOSE_MAX_CHARS, validateReaderPurpose } from '../src/writingPipeline';

const workingCopy: StudioWorkspace = {
  ...EMPTY_STUDIO_WORKSPACE,
  draftText: 'Source B is being prepared.', projectBrief: 'Brief B remains separate from the reopened version.',
  readerPurpose: 'Hiring managers should understand the decisions and my role.',
  customDirectives: 'Make the opening direct.', usingSavedVersionContext: true,
  rewriteResult: {
    id: 'version-a', originalText: 'Source A.', projectBrief: 'Brief A.', rewrittenText: 'Version A.',
    profileId: 'voice', profileName: 'Voice', intensity: 'faithful', wordCountOriginal: 2, wordCountRewritten: 2,
    createdAt: '2026-09-09T10:00:00Z', changesExplanation: '',
    review: { status: 'unavailable', summary: 'Review failed; draft retained.', findings: [], voiceObservations: [], localChecks: [] },
  },
};

test('restores current inputs and the active version without mixing their source contexts', () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (key: string, value: string) => { assert.equal(key, STUDIO_WORKSPACE_KEY); saved = value; } };
  assert.equal(readStudioWorkspace(storage).found, false);
  assert.equal(saveStudioWorkspace(storage, workingCopy), null);
  const reloaded = readStudioWorkspace(storage);
  assert.equal(reloaded.found, true);
  assert.deepEqual(reloaded.workspace, workingCopy);
  assert.equal(reloaded.workspace.rewriteResult.projectBrief, 'Brief A.');
  assert.match(reloaded.workspace.projectBrief, /Brief B/);
});

test('cleared inputs and a deliberately empty current result stay empty on reload', () => {
  const reloaded = parseStudioWorkspace(JSON.stringify(EMPTY_STUDIO_WORKSPACE));
  assert.deepEqual(reloaded, EMPTY_STUDIO_WORKSPACE);
});

test('legacy working copies without reader-and-purpose guidance remain readable', () => {
  const legacy = JSON.stringify({ ...EMPTY_STUDIO_WORKSPACE, readerPurpose: undefined });
  const restored = parseStudioWorkspace(legacy);
  assert.equal(restored.readerPurpose, '');
});

test('overlength reader-and-purpose input round-trips for recovery while generation validation remains strict', () => {
  const readerPurpose = 'x'.repeat(READER_PURPOSE_MAX_CHARS + 1);
  const source = {
    ...workingCopy,
    draftText: 'Recover this draft.',
    projectBrief: 'Recover this brief.',
    readerPurpose,
  };
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value; },
  };

  assert.equal(saveStudioWorkspace(storage, source), null);
  const restored = readStudioWorkspace(storage);
  assert.equal(restored.error, null);
  assert.equal(restored.workspace.draftText, source.draftText);
  assert.equal(restored.workspace.projectBrief, source.projectBrief);
  assert.equal(restored.workspace.readerPurpose, readerPurpose);
  assert.throws(() => validateReaderPurpose(readerPurpose), /exceeding the maximum limit of 2,000 characters/);
});

test('malformed or unreadable storage fails visibly without writing over saved data', () => {
  for (const saved of ['{broken', '{}', JSON.stringify({ ...workingCopy, draftText: 12 }), JSON.stringify({ ...workingCopy, rewriteResult: { rewrittenText: 'Partial' } })]) {
    const result = readStudioWorkspace({ getItem: () => saved });
    assert.ok(result.error);
    assert.equal(result.found, true);
    assert.deepEqual(result.workspace, EMPTY_STUDIO_WORKSPACE);
  }
  assert.ok(readStudioWorkspace({ getItem: () => { throw new Error('Storage denied'); } }).error);
});

test('damaged nested result data is rejected before it can crash the recovery UI', () => {
  const corruptions = [
    { review: { ...workingCopy.rewriteResult.review, findings: 'broken' } },
    { review: { ...workingCopy.rewriteResult.review, findings: [null] } },
    { review: { ...workingCopy.rewriteResult.review, localChecks: [{}] } },
    { review: { ...workingCopy.rewriteResult.review, voiceObservations: [{}] } },
    { profileName: {} }, { wordCountRewritten: 'two' }, { projectBrief: {} },
    { feedbackItems: [{ id: 'x', selectedText: 'x', label: {}, tag: 'custom', createdAt: 'now' }] },
    { modelSettings: { writingModel: {} } }, { preservationSettings: { customLocks: {} } },
    { stylisticAudit: { vocabularySubstitutions: 'broken' } }, { styleSimilarity: { overallPercentage: 99 } },
    { revision: { kind: 'selection', selectionRange: { start: -1, end: 3 } } },
  ];
  for (const corruption of corruptions) {
    const saved = JSON.stringify({ ...workingCopy, rewriteResult: { ...workingCopy.rewriteResult, ...corruption } });
    const result = readStudioWorkspace({ getItem: () => saved });
    assert.ok(result.error, JSON.stringify(corruption));
    assert.equal(result.found, true);
    assert.equal(result.workspace.rewriteResult, null);
  }
});

test('quota failures leave the previous successful working copy intact and permit a later save', () => {
  let saved = JSON.stringify(workingCopy);
  let fail = true;
  const storage = { setItem: (_key: string, value: string) => { if (fail) throw new Error('Quota exceeded'); saved = value; } };
  assert.match(saveStudioWorkspace(storage, EMPTY_STUDIO_WORKSPACE), /could not be saved/);
  assert.deepEqual(parseStudioWorkspace(saved), workingCopy);
  fail = false;
  assert.equal(saveStudioWorkspace(storage, EMPTY_STUDIO_WORKSPACE), null);
  assert.deepEqual(parseStudioWorkspace(saved), EMPTY_STUDIO_WORKSPACE);
});

test('version identity uses random bytes without requiring secure-context randomUUID', () => {
  const ids = new Set(Array.from({ length: 100 }, createVersionId));
  assert.equal(ids.size, 100);
  assert.ok([...ids].every((id) => /^rewrite-[a-f0-9]{32}$/.test(id)));
});
