import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/data/defaultSamples';
import { persistFeedbackProfile, persistFeedbackRetirement, feedbackForHistory, unappliedFeedback, validateFeedbackUpdate } from '../src/utils/voiceFeedback';
import { isRewriteFeedback } from '../src/utils/rewriteHistory';
const response = () => ({ updatedProfile: structuredClone(DEFAULT_PROFILE), learningSummary: ['Saved'], rulesAdded: [], metricAdjustments: [] });
const item = { id: 'note-1', selectedText: 'A phrase', label: 'Too formal', tag: 'too_formal' as const, createdAt: '2026-09-09' };

test('profile and receipt persist together; stale historical notes cannot replay', () => {
  let stored = '';
  const profile = persistFeedbackProfile(response(), DEFAULT_PROFILE, item.id, value => { stored = JSON.stringify(value); });
  assert.deepEqual(JSON.parse(stored).appliedFeedbackIds, [item.id]);
  assert.deepEqual(unappliedFeedback([item, { ...item, id: 'older-note' }], JSON.parse(stored)).map(x => x.id), ['older-note']);
  assert.equal(profile.domainExpertise, DEFAULT_PROFILE.domainExpertise);
  const again = persistFeedbackProfile(response(), profile, item.id, () => {});
  assert.deepEqual(again.appliedFeedbackIds, [item.id]);
});
test('storage failure does not mutate the current profile or acknowledge the note', () => {
  const before = JSON.stringify(DEFAULT_PROFILE);
  assert.throws(() => persistFeedbackProfile(response(), DEFAULT_PROFILE, item.id, () => { throw new Error('quota'); }), /quota/);
  assert.equal(JSON.stringify(DEFAULT_PROFILE), before);
  assert.deepEqual(unappliedFeedback([item], DEFAULT_PROFILE), [item]);
});
test('malformed provider output cannot become a successful no-op profile update', () => {
  for (const bad of [{}, { ...response(), updatedProfile: {} }, { ...response(), updatedProfile: { ...DEFAULT_PROFILE, metrics: {} } }]) {
    assert.throws(() => validateFeedbackUpdate(bad as any), /incomplete/);
  }
});
test('pending and failed notes survive validation; legacy status remains unknown', () => {
  assert.equal(isRewriteFeedback([item, { ...item, saveStatus: 'pending' }, { ...item, saveStatus: 'failed' }]), true);
  assert.equal(isRewriteFeedback([{ ...item, saveStatus: 'saved' }]), false);
});

test('learning never changes the profile name or the author’s written directive', () => {
  const profile = { ...structuredClone(DEFAULT_PROFILE), name: 'My voice', customDirectives: 'Never use the passive voice.' };
  const learned = { ...response(), updatedProfile: { ...structuredClone(DEFAULT_PROFILE), name: 'Rewritten name', customDirectives: 'Use a formal register.', synthesizedGuidelines: { ...DEFAULT_PROFILE.synthesizedGuidelines, doList: ['Lead with the outcome.'] } } };
  let stored = '';
  const next = persistFeedbackProfile(learned, profile, 'note-2', value => { stored = JSON.stringify(value); });

  assert.equal(next.name, 'My voice');
  assert.equal(next.customDirectives, 'Never use the passive voice.');
  assert.deepEqual(next.synthesizedGuidelines.doList, ['Lead with the outcome.']);
  assert.equal(JSON.parse(stored).name, 'My voice');
  assert.equal(JSON.parse(stored).customDirectives, 'Never use the passive voice.');
});

test('dismissing earlier notes preserves every profile preference and hides stale history cards', () => {
  const original = { ...structuredClone(DEFAULT_PROFILE), appliedFeedbackIds: ['saved-note'] };
  let stored = '';
  const next = persistFeedbackRetirement(original, ['legacy-1', 'legacy-2'], value => { stored = JSON.stringify(value); });
  const { retiredFeedbackIds, ...preferences } = next;
  assert.deepEqual(preferences, original);
  assert.deepEqual(retiredFeedbackIds, ['legacy-1', 'legacy-2']);
  assert.deepEqual(unappliedFeedback([{ ...item, id: 'legacy-1' }, { ...item, id: 'saved-note' }, { ...item, id: 'new-note', saveStatus: 'failed' }], JSON.parse(stored)).map(x => x.id), ['new-note']);
  assert.deepEqual(persistFeedbackRetirement(next, ['legacy-1'], () => {}).retiredFeedbackIds, retiredFeedbackIds);
  assert.deepEqual(persistFeedbackProfile(response(), next, 'another-note', () => {}).retiredFeedbackIds, retiredFeedbackIds);
});
test('failed dismissal preserves cards and does not report a receipt', () => {
  const before = JSON.stringify(DEFAULT_PROFILE);
  assert.throws(() => persistFeedbackRetirement(DEFAULT_PROFILE, [item.id], () => { throw new Error('quota'); }), /quota/);
  assert.equal(JSON.stringify(DEFAULT_PROFILE), before);
  assert.deepEqual(unappliedFeedback([item], DEFAULT_PROFILE), [item]);
});

test('retired records stay in their version when a new edit has no active notes', () => {
  const old = { ...item, id: 'retired' };
  const profile = { ...DEFAULT_PROFILE, retiredFeedbackIds: [old.id] };
  assert.deepEqual(feedbackForHistory([old], [], profile), [old]);
  assert.deepEqual(feedbackForHistory([old], [item], profile), [old, item]);
  assert.deepEqual(unappliedFeedback(feedbackForHistory([old], [item], profile), profile), [item]);
});
