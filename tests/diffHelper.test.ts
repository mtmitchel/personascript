import assert from 'node:assert/strict';
import test from 'node:test';
import { keepOriginalText, paragraphBlocks } from '../src/utils/diffHelper';

const original = 'Title\n\nFirst paragraph stays.\n\nSecond paragraph gets rewritten.\n\nThird paragraph is cut.\n\nLast paragraph stays.';
const modified = 'Title\n\nFirst paragraph stays.\n\nSecond paragraph, now rewritten.\n\nLast paragraph stays.\n\nA new closing paragraph.';

test('paragraphBlocks pairs each rewritten paragraph with the original it revises and locates it exactly', () => {
  const blocks = paragraphBlocks(original, modified);
  // A revised paragraph, a cut, and an addition are three separate decisions.
  assert.deepEqual(blocks.map(block => block.kind), ['equal', 'changed', 'removed', 'equal', 'added']);
  assert.deepEqual(blocks[1].original, ['Second paragraph gets rewritten.']);
  assert.deepEqual(blocks[1].rewritten, ['Second paragraph, now rewritten.']);
  assert.deepEqual(blocks[2].original, ['Third paragraph is cut.']);
  assert.deepEqual(blocks[4].rewritten, ['A new closing paragraph.']);
  // Offsets quote the rewritten text exactly, so a revision request can be validated against it.
  for (const block of blocks.filter(block => block.rewritten.length)) {
    assert.equal(modified.slice(block.rewrittenStart, block.rewrittenEnd), block.rewritten.join('\n\n'));
  }
  // A pure cut sits where the next rewritten paragraph begins.
  const cut = paragraphBlocks('Keep.\n\nCut me.\n\nAlso keep.', 'Keep.\n\nAlso keep.');
  assert.deepEqual(cut.map(block => block.kind), ['equal', 'removed', 'equal']);
  assert.equal(cut[1].rewrittenStart, 'Keep.\n\n'.length);
});

test('a real rewrite yields one decision per passage, not one block for the whole document', () => {
  const before = [
    'Upgrade prompts and the commercial effort',
    'The team wanted to increase paid conversion from the free product. I owned the copy for every upgrade prompt in the editor.',
    'Explaining specialized controls',
    'Some prompts appeared when a user reached for a control that only exists in the paid tiers. A generic definition of each control helped new users.',
    'Document allowances',
    'Free users can translate three documents a month. The prompt after the third document needed to state the allowance, the reset date, and the upgrade path.',
    'Commercial outcomes',
    'Paid conversion from these prompts rose 12% over the quarter, measured against the previous quarter.',
  ].join('\n\n');
  const after = [
    'Upgrade prompts and the commercial effort',
    'I owned the copy for every upgrade prompt in the editor, part of a team effort to lift paid conversion from the free product.',
    'Document allowances',
    'Free users translate three documents a month. After the third, the prompt states the allowance, the reset date, and the upgrade path.',
    'Commercial outcomes',
    'Paid conversion from these prompts rose 12% over the quarter against the previous quarter.',
    'What I would do differently',
    'I would test the allowance wording against a plainer variant before shipping.',
  ].join('\n\n');
  const blocks = paragraphBlocks(before, after);
  assert.deepEqual(blocks.map(block => block.kind), ['equal', 'changed', 'removed', 'equal', 'changed', 'equal', 'changed', 'added']);
  // The cut section (heading + body) is one decision; the new section is one decision.
  assert.equal(blocks[2].original.length, 2);
  assert.equal(blocks[7].rewritten.length, 2);
  // Restoring the cut puts both paragraphs back in place and leaves every other change alone.
  const restored = keepOriginalText(blocks, 2).split('\n\n');
  assert.equal(restored[2], 'Explaining specialized controls');
  assert.equal(restored.length, 10);
  // Unrelated paragraphs with a few shared words do not pair.
  assert.deepEqual(paragraphBlocks('The team shipped the prompt catalog in March.', 'The reviewer asked for the launch date of the catalog.').map(block => block.kind), ['removed', 'added']);
});

test('paragraphBlocks tolerates whitespace-only differences and ragged separators', () => {
  const blocks = paragraphBlocks('One.\n\n\nTwo   words.\n\nThree.', 'One.\n \nTwo words.\n\n\n\nThree.');
  assert.deepEqual(blocks.map(block => block.kind), ['equal']);
  assert.deepEqual(blocks[0].rewritten, ['One.', 'Two words.', 'Three.']);
  assert.deepEqual(paragraphBlocks('', ''), []);
  assert.deepEqual(paragraphBlocks('Gone.', '').map(block => block.kind), ['removed']);
  assert.deepEqual(paragraphBlocks('', 'New.').map(block => block.kind), ['added']);
});

test('keepOriginalText restores one block and leaves every other change in place', () => {
  const blocks = paragraphBlocks(original, modified);
  const restoredChange = keepOriginalText(blocks, 1);
  assert.equal(restoredChange, 'Title\n\nFirst paragraph stays.\n\nSecond paragraph gets rewritten.\n\nLast paragraph stays.\n\nA new closing paragraph.');
  // Restoring a cut puts it back where it was; rejecting an addition removes it.
  assert.equal(keepOriginalText(blocks, 2), 'Title\n\nFirst paragraph stays.\n\nSecond paragraph, now rewritten.\n\nThird paragraph is cut.\n\nLast paragraph stays.\n\nA new closing paragraph.');
  assert.equal(keepOriginalText(blocks, 4), 'Title\n\nFirst paragraph stays.\n\nSecond paragraph, now rewritten.\n\nLast paragraph stays.');
  // After restoring, that block reads as unchanged and the others are untouched.
  assert.deepEqual(paragraphBlocks(original, restoredChange).map(block => block.kind), ['equal', 'removed', 'equal', 'added']);
  const cut = paragraphBlocks('Keep.\n\nCut me.\n\nAlso keep.', 'Keep.\n\nAlso keep.');
  assert.equal(keepOriginalText(cut, 1), 'Keep.\n\nCut me.\n\nAlso keep.');
});
