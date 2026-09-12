import { ReviewFinding, WritingReview } from '../types';

export interface ReviewEvidencePair {
  source: string[];
  rewritten: string[];
}

const LABEL = /(?:source|original(?:\s+draft)?|before|rewrite|rewritten(?:\s+text)?|final|after|current(?:\s+rewrite)?)\s*[:\-]\s*/gi;
const SOURCE_LABEL = /^(?:source|original(?:\s+draft)?|before)\s*[:\-]\s*$/i;
const DIRECTIONAL_QUOTED = /^\s*((?:“[^”\n]{1,500}”|"[^"\n]{1,500}"|'[^'\n]{1,500}'))\s+(?:→|->|=>|becomes|became|changed\s+to)\s+((?:“[^”\n]{1,500}”|"[^"\n]{1,500}"|'[^'\n]{1,500}'))\s*$/i;

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function cleanFragment(value: string): string {
  return value
    .trim()
    .replace(/^[|;/,\s]+/, '')
    .replace(/[|;/\s]+$/, '')
    .replace(/^(?:“([^”]*)”|"([^"]*)"|'([^']*)')$/, '$1$2$3')
    .trim();
}

function labelledFragments(evidence: string): { source: string[]; rewritten: string[] } {
  const markers = [...evidence.matchAll(LABEL)].map((match) => ({
    label: match[0],
    index: match.index ?? 0,
    kind: SOURCE_LABEL.test(match[0].trim()) ? 'source' as const : 'rewritten' as const,
  }));
  if (markers.length < 2) return { source: [], rewritten: [] };

  const source: string[] = [];
  const rewritten: string[] = [];
  markers.forEach((marker, index) => {
    const start = marker.index + marker.label.length;
    const end = index + 1 < markers.length ? markers[index + 1].index : evidence.length;
    const fragment = cleanFragment(evidence.slice(start, end));
    if (fragment) (marker.kind === 'source' ? source : rewritten).push(fragment);
  });
  return { source, rewritten };
}

function directionalQuotedFragments(evidence: string): { source: string[]; rewritten: string[] } {
  const match = evidence.match(DIRECTIONAL_QUOTED);
  if (!match) return { source: [], rewritten: [] };
  return { source: [cleanFragment(match[1])], rewritten: [cleanFragment(match[2])] };
}

function passageMatches(text: string, fragment: string): string[] {
  const candidate = cleanFragment(fragment);
  return candidate ? reviewEvidence(text, candidate) : [];
}

function matchingPassages(text: string, fragments: string[]): string[] {
  return unique(fragments.flatMap((fragment) => passageMatches(text, fragment)));
}

/**
 * Pair literal passages only when the evidence labels both sides or uses a
 * directional quoted comparison. Bare number lists and unlabeled numeric
 * changes remain unpaired so occurrence counts cannot become a factual claim.
 */
export function pairReviewEvidence(sourceText: string, rewrittenText: string, evidence = ''): ReviewEvidencePair {
  if (!sourceText.trim() || !rewrittenText.trim() || !evidence.trim()) return { source: [], rewritten: [] };

  const labelled = labelledFragments(evidence);
  const directional = directionalQuotedFragments(evidence);
  const source = matchingPassages(sourceText, [...labelled.source, ...directional.source]);
  const rewritten = matchingPassages(rewrittenText, [...labelled.rewritten, ...directional.rewritten]);
  return source.length && rewritten.length ? { source, rewritten } : { source: [], rewritten: [] };
}

export function findingKey(finding: ReviewFinding): string {
  return `finding:${normalize(finding.category)}|${normalize(finding.detail)}|${normalize(finding.evidence || '')}`;
}

function severityRank(severity: ReviewFinding['severity']): number {
  return severity === 'error' ? 3 : severity === 'warning' ? 2 : 1;
}

/** Remove repeated findings while keeping distinct concerns on shared passages. */
export function dedupeReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const selected = new Map<string, { finding: ReviewFinding; index: number }>();
  findings.forEach((finding, index) => {
    const key = findingKey(finding);
    const existing = selected.get(key);
    if (!existing || severityRank(finding.severity) > severityRank(existing.finding.severity)) {
      selected.set(key, { finding, index });
    }
  });
  return [...selected.values()]
    .sort((left, right) => left.index - right.index)
    .map(({ finding }) => finding);
}

export function isFindingIgnored(review: Pick<WritingReview, 'ignoredFindings'>, finding: ReviewFinding): boolean {
  return (review.ignoredFindings || []).includes(findingKey(finding));
}

/** Count the primary issue rows rendered by WritingReviewPanel. */
export function actionableReviewIssueCount(
  review: Pick<WritingReview, 'findings' | 'ignoredFindings'> | null | undefined,
  _sourceText = '',
  _rewrittenText = '',
): number {
  if (!review) return 0;
  return dedupeReviewFindings(
    (review.findings || []).filter((finding) => finding.severity !== 'info' && !(review.ignoredFindings || []).includes(findingKey(finding)))
  ).length;
}

/** Show literal source context without inventing which occurrence caused a count mismatch. */
export function reviewEvidence(text: string, token: string): string[] {
  if (!token.trim()) return [];
  const contexts: string[] = [];
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(token, from);
    if (index < 0) break;
    from = index + token.length;
    if (/^\d/.test(token) && (/\w/.test(text[index - 1] || '') || /\d[.,]$/.test(text.slice(0, index)))) continue;
    if (/\d%?$/.test(token) && (/^[\w%]/.test(text.slice(from)) || /^[.,]\d/.test(text.slice(from)))) continue;
    const start = Math.max(text.lastIndexOf('\n', index) + 1, index - 90);
    const newline = text.indexOf('\n', from);
    const end = Math.min(newline < 0 ? text.length : newline, from + 100);
    const context = `${start > 0 && text[start - 1] !== '\n' ? '…' : ''}${text.slice(start, end).trim()}${end < text.length && text[end] !== '\n' ? '…' : ''}`;
    if (!contexts.includes(context)) contexts.push(context);
  }
  return contexts;
}
