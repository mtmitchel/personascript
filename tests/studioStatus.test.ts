import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestionsStatus } from '../src/utils/studioStatus';

test('Priority 1: !hasDraft asks for draft and provides action', () => {
  const result = suggestionsStatus({ hasDraft: false, hasPlan: false });
  assert.equal(result.text, 'Add your draft in Draft & Brief to begin.');
  assert.equal(result.tone, 'status');
  assert.deepEqual(result.action, { label: 'Open Draft & Brief', targetTab: 'draft-brief' });
});

test('Priority 2: isPlanning shows reading indicator', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: false, isPlanning: true });
  assert.equal(result.text, 'Reading your draft and brief…');
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

test('Priority 5: rewriteError shows error alert', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: true, rewriteError: 'Model timeout.' });
  assert.equal(result.text, 'Model timeout.');
  assert.equal(result.tone, 'alert');
});

test('Priority 6: !hasPlan prompts to get suggestions first', () => {
  const result = suggestionsStatus({ hasDraft: true, hasPlan: false });
  assert.equal(result.text, 'Get suggestions first. The rewrite follows the suggestions you accept.');
  assert.equal(result.tone, 'status');
});

test('Priority 7: planStale with reasons names changed inputs', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: ['rewrite instructions', 'draft'],
  });
  assert.equal(result.text, 'Your rewrite instructions, draft changed after these suggestions were prepared. Get new suggestions before rewriting.');
  assert.equal(result.tone, 'status');
});

test('Priority 7b: planStale without reasons indicates older format', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planStale: true,
    staleReasons: [],
  });
  assert.equal(result.text, 'These suggestions are in an older format. Get new suggestions before rewriting.');
  assert.equal(result.tone, 'status');
});

test('Priority 8: planIssue surfaces the readiness issue verbatim', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planIssue: 'Review 1 conflict before approving.',
  });
  assert.equal(result.text, 'Review 1 conflict before approving.');
  assert.equal(result.tone, 'status');
});

test('Priority 9: planApproved && hasRewrite indicates last rewrite followed suggestions', () => {
  const result = suggestionsStatus({
    hasDraft: true,
    hasPlan: true,
    planApproved: true,
    hasRewrite: true,
  });
  assert.equal(result.text, 'The last rewrite followed these suggestions. Rewrite writes a new version from the original draft.');
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
  assert.equal(suggestionsStatus({ hasDraft: true, hasPlan: false, rewriteError: 'Failed' }).text, 'Failed');
  // planStale beats pendingSuggestions
  assert.equal(suggestionsStatus({ hasDraft: true, hasPlan: true, planStale: true, staleReasons: ['draft'], pendingSuggestions: 2 }).text, 'Your draft changed after these suggestions were prepared. Get new suggestions before rewriting.');
});
