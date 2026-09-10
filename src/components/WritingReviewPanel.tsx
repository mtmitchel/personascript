import React, { useState } from 'react';
import { ReviewFinding, WritingReview } from '../types';
import { modelDisplayName } from '../modelChoice';
import {
  actionableReviewIssueCount,
  dedupeReviewFindings,
  pairReviewEvidence,
  reviewEvidence,
} from '../utils/reviewEvidence';

interface WritingReviewPanelProps {
  review: WritingReview;
  id?: string;
  sourceText?: string;
  /** Kept for historical callers; version details own the saved brief. */
  projectBrief?: string;
  rewrittenText?: string;
  onConfigureReviewer?: () => void;
  onCompareSources?: () => void;
  onRequestEdit?: (instruction: string) => void;
}

const findingLabels: Record<ReviewFinding['category'], string> = {
  omission: 'Possible missing detail',
  claim: 'Possible factual change',
  addition: 'Possible unsupported addition',
  voice: 'Style concern',
  preservation: 'Preservation concern',
  editorial: 'Editorial requirement',
  'local-check': 'Text difference',
};

const checkLabels: Record<WritingReview['localChecks'][number]['kind'], string> = {
  numbers: 'Numbers',
  quotes: 'Quoted wording',
  headings: 'Headings',
};

function evidenceText(finding: ReviewFinding): string {
  return [finding.detail, finding.evidence].filter(Boolean).join('\n');
}

function correctionInstruction(
  finding: ReviewFinding,
  sourceText: string,
  rewrittenText: string,
): string {
  const pair = pairReviewEvidence(sourceText, rewrittenText, evidenceText(finding));
  const pairedPassages = pair.source.length && pair.rewritten.length
    ? `\nOriginal passage: ${pair.source.join(' | ')}\nCurrent rewrite: ${pair.rewritten.join(' | ')}`
    : finding.evidence ? `\nReviewer evidence: ${finding.evidence}` : '';
  return `Review this ${findingLabels[finding.category].toLocaleLowerCase()} against the original draft and correct it only if the source supports a change. Preserve approved editorial decisions and do not add unsupported facts.${pairedPassages}\nReviewer note: ${finding.detail}`;
}

function checkExplanation(kind: WritingReview['localChecks'][number]['kind']): string {
  if (kind === 'numbers') {
    return 'This occurrence count can reveal a difference, but counts alone cannot show that one number replaced another or prove a factual error.';
  }
  return 'This occurrence count can reveal a difference, but it does not identify which occurrence changed or whether the difference is intentional.';
}

function checkNoun(kind: WritingReview['localChecks'][number]['kind']): string {
  return kind === 'numbers' ? 'protected number'
    : kind === 'quotes' ? 'protected quotation'
      : 'protected heading';
}

function occurrenceExplanation(kind: WritingReview['localChecks'][number]['kind'], direction: 'fewer' | 'more'): string {
  const noun = checkNoun(kind);
  return direction === 'fewer'
    ? `A ${noun} appears fewer times in the current rewrite than in the original draft.`
    : `A ${noun} appears more times in the current rewrite than the original draft and brief support.`;
}

export const WritingReviewPanel: React.FC<WritingReviewPanelProps> = ({
  review,
  id,
  sourceText = '',
  rewrittenText = '',
  onConfigureReviewer,
  onCompareSources,
  onRequestEdit,
}) => {
  const [checked, setChecked] = useState<string[]>([]);
  const findings = review.findings || [];
  const checks: WritingReview['localChecks'] = review.localChecks || [];
  const primaryFindings = dedupeReviewFindings(
    findings.filter((finding) => finding.severity !== 'info'),
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const unavailable = review.status !== 'complete';
  const actionableCount = actionableReviewIssueCount(review, sourceText, rewrittenText);

  const toggleChecked = (key: string) => setChecked((current) => current.includes(key)
    ? current.filter((value) => value !== key)
    : [...current, key]);

  const actions = (key: string, instruction: string) => <div className="review-actions">
    {onCompareSources && <button type="button" onClick={onCompareSources}>Compare sources</button>}
    {onRequestEdit && <button type="button" onClick={() => onRequestEdit(instruction)}>Edit this issue</button>}
    <button
      type="button"
      aria-pressed={checked.includes(key)}
      onClick={() => toggleChecked(key)}
    >{checked.includes(key) ? 'Reviewed · undo' : 'Mark reviewed'}</button>
  </div>;

  const renderFindingEvidence = (finding: ReviewFinding) => {
    const pair = pairReviewEvidence(sourceText, rewrittenText, evidenceText(finding));
    if (pair.source.length && pair.rewritten.length) {
      return <div className="review-evidence-pair">
        <p className="review-source-label">Original draft</p>
        {pair.source.map((passage, index) => <blockquote key={`source-${index}`}>{passage}</blockquote>)}
        <p className="review-source-label">Current rewrite</p>
        {pair.rewritten.map((passage, index) => <blockquote key={`rewrite-${index}`}>{passage}</blockquote>)}
      </div>;
    }
    return finding.evidence ? <>
      <p className="review-source-label">Reviewer evidence</p>
      <blockquote>{finding.evidence}</blockquote>
    </> : null;
  };

  const renderCheckContexts = (kind: WritingReview['localChecks'][number]['kind'], direction: 'missing' | 'unexpected', tokens: string[]) => {
    const text = direction === 'missing' ? sourceText : rewrittenText;
    const contexts = [...new Set(tokens.flatMap((token) => reviewEvidence(text, token)))];
    if (!contexts.length) return null;
    return <div>
      <p className="review-source-label">{direction === 'missing' ? 'Original draft context' : 'Current rewrite context'}</p>
      {contexts.map((context, index) => <blockquote key={`${kind}-${direction}-${index}`}>{context}</blockquote>)}
    </div>;
  };

  const status = unavailable
    ? 'Review unavailable. Your draft is still available.'
    : actionableCount > 0
      ? `Review flagged ${actionableCount} possible ${actionableCount === 1 ? 'issue' : 'issues'}. Compare the passages before editing.`
      : failedChecks.length > 0
        ? 'No reviewer issues were flagged. Supporting checks found possible text differences.'
        : 'No reviewer issues were flagged. Give the draft a final read.';

  return <section id={id} className="review-panel">
    <p className="review-status">{status}</p>
    {review.error && <p className="studio-inline-notice">{review.error}</p>}

    {primaryFindings.map((finding, index) => {
      const key = `finding-${index}`;
      return <article key={key} className={`review-issue ${checked.includes(key) ? 'is-checked' : ''}`}>
        <h3>{findingLabels[finding.category]}</h3>
        <p>{finding.detail}</p>
        {renderFindingEvidence(finding)}
        {actions(key, correctionInstruction(finding, sourceText, rewrittenText))}
      </article>;
    })}

    {failedChecks.length > 0 && <details className="studio-notes">
      <summary>Supporting checks ({failedChecks.length})</summary>
      <p className="review-explanation">These checks compare protected text by occurrence count. They help locate passages for review; they do not establish a factual change.</p>
      {onCompareSources && <button type="button" onClick={onCompareSources} className="underline">Compare sources</button>}
      {failedChecks.map((check) => {
        const missing = [...new Set(check.missing || [])];
        const unexpected = [...new Set(check.unexpected || [])];
        return <section key={check.kind} className="review-check-group">
          <h3>{checkLabels[check.kind]} · possible count difference</h3>
          <p className="review-explanation">{checkExplanation(check.kind)}</p>
          {missing.length > 0 && <p>{occurrenceExplanation(check.kind, 'fewer')}</p>}
          {unexpected.length > 0 && <p>{occurrenceExplanation(check.kind, 'more')}</p>}
          {!missing.length && !unexpected.length && <p className="review-explanation">This check found a difference but could not identify a passage. Compare the original and rewrite.</p>}
          {renderCheckContexts(check.kind, 'missing', missing)}
          {renderCheckContexts(check.kind, 'unexpected', unexpected)}
        </section>;
      })}
    </details>}

    {checked.length > 0 && <p className="review-explanation" role="status">
      {checked.length} {checked.length === 1 ? 'issue' : 'issues'} marked reviewed for this session only. This does not change the saved review or the draft.
    </p>}

    <details className="studio-notes"><summary>Review commentary &amp; details</summary>
      <p>{review.summary}</p>
      {findings.filter((finding) => finding.severity === 'info').map((finding, index) => <p key={index}>{finding.detail}</p>)}
      {(review.voiceObservations || []).map((observation, index) => <p key={index}>{observation}</p>)}
      {checks.filter((check) => check.passed).map((check) => <p key={check.kind}>{check.detail}</p>)}
      <p>{unavailable ? 'Requested reviewer' : 'Reviewer'}: {review.modelUsed ? modelDisplayName(review.modelUsed) : 'Not recorded'}</p>
      <p>Reviewer observations are advisory. Marking an issue reviewed is session-only; it does not change the review or the draft.</p>
      {onConfigureReviewer && <button type="button" onClick={onConfigureReviewer} className="underline">Change reviewer</button>}
    </details>
  </section>;
};
