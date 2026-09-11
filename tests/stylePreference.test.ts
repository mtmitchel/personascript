import assert from 'node:assert/strict';
import test from 'node:test';
import { readsAsStandingPreference } from '../src/utils/stylePreference';

test('general wording marks a request as a standing preference even when it names a passage', () => {
  for (const request of [
    'Never use em dashes.',
    'I prefer shorter sentences in general.',
    'From now on, keep the opening paragraph under three sentences.',
    'This is not my voice — I would never say "leverage".',
    'Always keep the team attribution.',
  ]) assert.equal(readsAsStandingPreference(request), true, request);
});

test('style vocabulary without a passage reference reads as a preference', () => {
  for (const request of [
    'Less formal.',
    'Cut the filler and buzzwords.',
    'Use contractions.',
    'Too wordy; make it more direct.',
  ]) assert.equal(readsAsStandingPreference(request), true, request);
});

test('requests about one place in this draft are one-off edits', () => {
  for (const request of [
    'Make this paragraph less formal.',
    'Tighten the second section.',
    'Restore the 12% figure in paragraph 4.',
    'Rewrite the opening sentence so it names the reader.',
    'Add the launch date here.',
    'Keep the DeepL Write example.',
    '',
    '   ',
  ]) assert.equal(readsAsStandingPreference(request), false, request);
});
