import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionableReviewIssueCount,
  dedupeReviewFindings,
  findingKey,
  isFindingIgnored,
  pairReviewEvidence,
  reviewEvidence,
} from '../src/utils/reviewEvidence';
test('number evidence does not match digits inside other numbers, decimals, or percentages', () => {
  assert.deepEqual(reviewEvidence('12% improved. 1.5 increased. 21 stayed.\n1. First point\nWe saw 1 person.', '1'), ['1. First point', 'We saw 1 person.']);
});
test('repeated matches retain distinct contexts without claiming a missing occurrence', () => {
  assert.deepEqual(reviewEvidence('A 12% lift.\nA second 12% lift.', '12%'), ['A 12% lift.', 'A second 12% lift.']);
});
test('quotes remain literal and unavailable evidence is empty', () => {
  assert.deepEqual(reviewEvidence('She wrote “Clear next step” in the brief.', '“Clear next step”'), ['She wrote “Clear next step” in the brief.']);
  assert.deepEqual(reviewEvidence('No match.', '12%'), []);
  assert.deepEqual(reviewEvidence('No match.', ''), []);
});
test('number context accepts sentence punctuation while excluding decimal fragments', () => {
  assert.deepEqual(reviewEvidence('The count was 1.\nWe had 1, then 2.\nThe value was 3.1.', '1'), ['The count was 1.', 'We had 1, then 2.']);
});

test('pairs literal source and rewrite passages for a supported numeric discrepancy', () => {
  const source = 'The source retained a 12% adoption rate.';
  const rewritten = 'The rewrite reports a 14% adoption rate.';
  assert.deepEqual(pairReviewEvidence(source, rewritten, 'Source: 12%\nRewrite: 14%'), {
    source: [source],
    rewritten: [rewritten],
  });
  assert.deepEqual(pairReviewEvidence(source, rewritten, '“12%” became “14%”'), {
    source: [source],
    rewritten: [rewritten],
  });
});

test('does not pair an evidence token that appears on both sides', () => {
  assert.deepEqual(
    pairReviewEvidence('The 12% rate was retained.', 'The 12% rate was retained with a new heading.', '12%'),
    { source: [], rewritten: [] },
  );
});

test('does not infer a numeric substitution from an unlabeled list of counts', () => {
  assert.deepEqual(
    pairReviewEvidence('The source retained a 12% adoption rate.', 'The rewrite reports a 14% adoption rate.', '12%, 14%'),
    { source: [], rewritten: [] },
  );
  assert.deepEqual(
    pairReviewEvidence('The source retained a 12% adoption rate.', 'The rewrite reports a 14% adoption rate.', '12% became 14%'),
    { source: [], rewritten: [] },
  );
});

test('deduplicates repeated findings but keeps different concerns on shared passages', () => {
  const source = 'The source retained a 12% adoption rate. Another measure was 20%.';
  const rewritten = 'The rewrite reports a 14% adoption rate. Another measure was 22%.';
  const findings = [
    { category: 'claim' as const, severity: 'warning' as const, detail: 'The rate changed.', evidence: 'Source: 12%\nRewrite: 14%' },
    { category: 'claim' as const, severity: 'error' as const, detail: '  the RATE changed. ', evidence: 'Source: 12%\nRewrite: 14%' },
    { category: 'claim' as const, severity: 'warning' as const, detail: 'The rate changed.', evidence: 'Source: 20%\nRewrite: 22%' },
    { category: 'preservation' as const, severity: 'error' as const, detail: 'The rate changed.', evidence: 'Source: 12%\nRewrite: 14%' },
    { category: 'omission' as const, severity: 'warning' as const, detail: 'A separate sentence may be missing.' },
  ];
  const deduped = dedupeReviewFindings(findings);
  assert.equal(deduped.length, 4);
  assert.equal(deduped[0].severity, 'error');
  assert.equal(deduped[1].category, 'claim');
  assert.equal(deduped[2].category, 'preservation');
  assert.equal(actionableReviewIssueCount({ findings }, source, rewritten), 4);
});

test('ignored findings are excluded from actionableReviewIssueCount and checked by isFindingIgnored', () => {
  const source = 'The source text.';
  const rewritten = 'The rewritten text.';
  const firstFinding = { category: 'claim' as const, severity: 'warning' as const, detail: 'Claim is unverified.', evidence: 'The rewritten text.' };
  const secondFinding = { category: 'editorial' as const, severity: 'warning' as const, detail: 'Tone differs.', evidence: 'The rewritten text.' };
  const findings = [firstFinding, secondFinding];
  const firstKey = findingKey(firstFinding);

  const review = {
    findings,
    ignoredFindings: [firstKey],
  };

  assert.equal(actionableReviewIssueCount(review, source, rewritten), 1);
  assert.equal(isFindingIgnored(review, firstFinding), true);
  assert.equal(isFindingIgnored(review, secondFinding), false);
  assert.equal(isFindingIgnored({ ignoredFindings: undefined }, firstFinding), false);
});
