import assert from 'node:assert/strict';
import test from 'node:test';
import { joinList, suggestionsStatus } from '../src/utils/studioStatus';

test('joinList is importable and formats lists with Oxford comma', () => {
  assert.equal(joinList([]), '');
  assert.equal(joinList(['draft']), 'draft');
  assert.equal(joinList(['draft', 'brief']), 'draft and brief');
  assert.equal(joinList(['draft', 'brief', 'instructions']), 'draft, brief, and instructions');
});

test('Priority 1: !hasDraft asks for draft and provides action', () => {
  const result = suggestionsStatus({ hasDraft: false, hasPlan: false });
  assert.equal(result.text, 'Add your draft in Draft & Brief to begin.');
  assert.equal(result.tone, 'status');
  assert.deepEqual(result.action, { label: 'Open Draft & Brief', targetTab: 'draft-brief' });
});

test('Priority 2: isPlanning shows reading indicator', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: false, isPlanning: true });
  assert.equal(result.text, 'Getting suggestions…');
  assert.equal(result.tone, 'status');
});

test('Priority 3: isRewriting shows writing indicator', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, isRewriting: true });
  assert.equal(result.text, 'Writing and reviewing…');
  assert.equal(result.tone, 'status');
});

test('Priority 4: isUploading shows upload indicator', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, isUploading: true });
  assert.equal(result.text, 'Waiting for your upload…');
  assert.equal(result.tone, 'status');
});

test('Priority 4.5: isSavingVoice shows saving indicator and takes precedence over error', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, isSavingVoice: true, rewriteError: 'Some error' });
  assert.equal(result.text, 'Saving your voice preference…');
  assert.equal(result.tone, 'status');

  // isUploading beats isSavingVoice
  const uploadResult = suggestionsStatus({ hasDraft: true, hasPlan: true, isUploading: true, isSavingVoice: true });
  assert.equal(uploadResult.text, 'Waiting for your upload…');
});

test('Priority 5: rewriteError shows error alert', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, rewriteError: 'Model timeout.' });
  assert.equal(result.text, 'Could not finish. Your current work is unchanged.');
  assert.equal(result.tone, 'alert');
  assert.equal(result.detail, 'Model timeout.');
});

test('Priority 6: !hasPlan prompts to get suggestions first', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: false });
  assert.equal(result.text, 'Get suggestions above first. The rewrite follows the ones you accept.');
  assert.equal(result.tone, 'status');
});

test('Priority 7: planStale with reasons names changed inputs with Oxford comma join', () => {
  // One reason
  const one = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: ['draft'],
  });
  assert.equal(one.text, 'Your draft changed after these suggestions were prepared. Get suggestions again before rewriting.');
  assert.equal(one.tone, 'status');

  // Two reasons
  const two = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: ['rewrite instructions', 'draft'],
  });
  assert.equal(two.text, 'Your rewrite instructions and draft changed after these suggestions were prepared. Get suggestions again before rewriting.');
  assert.equal(two.tone, 'status');

  // Three reasons
  const three = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: ['rewrite instructions', 'draft', 'brief'],
  });
  assert.equal(three.text, 'Your rewrite instructions, draft, and brief changed after these suggestions were prepared. Get suggestions again before rewriting.');
  assert.equal(three.tone, 'status');
});

test('Priority 7b: planStale without reasons indicates older format', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: [],
  });
  assert.equal(result.text, 'These suggestions were made with an older version of the app. Get suggestions again before rewriting.');
  assert.equal(result.tone, 'status');
});

test('Priority 8: planIssue surfaces the readiness issue verbatim', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planIssue: 'Review 1 conflict before approving.',
  });
  assert.equal(result.text, 'These suggestions no longer match your draft. Get suggestions again before rewriting.');
  assert.equal(result.tone, 'status');
  assert.equal(result.detail, 'Review 1 conflict before approving.');
});

test('Priority 9: planApproved && hasRewrite asks for no status line', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planApproved: true,
    hasRewrite: true,
  });
  assert.equal(result.text, '');
  assert.equal(result.tone, 'status');
});

test('Priority 10: pendingSuggestions > 0 handles singular and plural', () => {
  const single = suggestionsStatus({ hasDraft: true, hasPlan: true, pendingSuggestions: 1 });
  assert.equal(single.text, '1 unanswered suggestion will be accepted when you rewrite.');

  const plural = suggestionsStatus({ hasDraft: true, hasPlan: true, pendingSuggestions: 3 });
  assert.equal(plural.text, '3 unanswered suggestions will be accepted when you rewrite.');
});

test('Priority 11: otherwise ready to rewrite', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, pendingSuggestions: 0 });
  assert.equal(result.text, 'Ready to rewrite.');
  assert.equal(result.tone, 'status');
});

test('Priority ordering: earlier priorities take precedence', () => {
  // !hasDraft beats isPlanning
  assert.equal(suggestionsStatus({ hasDraft: false, isPlanning: true, hasPlan: false }).text, 'Add your draft in Draft & Brief to begin.');
  // rewriteError beats !hasPlan
  assert.equal(suggestionsStatus({ hasDraft: true, hasPlan: false, rewriteError: 'Failed' }).text, 'Could not finish. Your current work is unchanged.');
  // planStale beats pendingSuggestions
  assert.equal(suggestionsStatus({ hasDraft: true, hasPlan: true, planStale: true, staleReasons: ['draft'], pendingSuggestions: 2 }).text, 'Your draft changed after these suggestions were prepared. Get suggestions again before rewriting.');
});
