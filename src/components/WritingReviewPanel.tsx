import React, { useState } from 'react';
import { ReviewFinding, WritingReview } from '../types';
import { modelDisplayName } from '../modelChoice';
import {
  actionableReviewIssueCount,
  dedupeReviewFindings,
  isFindingIgnored,
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
  onIgnore?: (finding: ReviewFinding, ignored: boolean) => void;
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
    ? `\nOriginal text: ${pair.source.join(' | ')}\nCurrent rewrite: ${pair.rewritten.join(' | ')}`
    : finding.evidence ? `\nReviewer evidence: ${finding.evidence}` : '';
  return `Review this ${findingLabels[finding.category].toLocaleLowerCase()} against the original draft and correct it only if the source supports a change. Keep the approved suggestions and do not add unsupported facts.${pairedPassages}\nReviewer note: ${finding.detail}`;
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
  onIgnore,
}) => {
  const findings = review.findings || [];
  const checks: WritingReview['localChecks'] = review.localChecks || [];
  const primaryFindings = dedupeReviewFindings(
    findings.filter((finding) => finding.severity !== 'info'),
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const unavailable = review.status !== 'complete';
  const actionableCount = actionableReviewIssueCount(review, sourceText, rewrittenText);

  const actions = (instruction: string, finding: ReviewFinding) => <div className="review-actions">
    {onRequestEdit && <button type="button" onClick={() => onRequestEdit(instruction)}>Ask for a change</button>}
    {onIgnore && <button type="button" onClick={() => onIgnore(finding, true)}>Ignore</button>}
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
    ? 'The review failed. The rewrite itself is complete. Read it yourself, or ask for a change to get a new review.'
    : actionableCount > 0
      ? `${actionableCount} possible ${actionableCount === 1 ? 'issue' : 'issues'}. Check each one before editing.`
      : failedChecks.length > 0
        ? 'No issues flagged. Text checks found differences.'
        : 'No open issues. Give the draft a final read.';

  return <section id={id} className="review-panel">
    <p className="review-status">{status}</p>
    {review.error && <p className="studio-inline-notice">{review.error}</p>}

    {primaryFindings.map((finding, index) => {
      const key = `finding-${index}`;
      if (isFindingIgnored(review, finding)) {
        return <article key={key} className="review-issue is-checked">
          <p><span className="font-semibold">{findingLabels[finding.category]}</span> · Ignored <button type="button" className="underline ml-2" onClick={() => onIgnore?.(finding, false)}>Undo</button></p>
        </article>;
      }
      return <article key={key} className="review-issue">
        <h3>{findingLabels[finding.category]}</h3>
        <p>{finding.detail}</p>
        {renderFindingEvidence(finding)}
        {actions(correctionInstruction(finding, sourceText, rewrittenText), finding)}
      </article>;
    })}

    {failedChecks.length > 0 && <details className="studio-notes">
      <summary>Text checks ({failedChecks.length})</summary>
      <p className="review-explanation">Counts show text differences, not necessarily errors.</p>
      {onCompareSources && <button type="button" onClick={onCompareSources} className="underline">Show changes</button>}
      {failedChecks.map((check) => {
        const missing = [...new Set(check.missing || [])];
        const unexpected = [...new Set(check.unexpected || [])];
        return <section key={check.kind} className="review-check-group">
          <h3>{checkLabels[check.kind]} · possible count difference</h3>
          <p className="review-explanation">{checkExplanation(check.kind)}</p>
          {missing.length > 0 && <p>{occurrenceExplanation(check.kind, 'fewer')}</p>}
          {unexpected.length > 0 && <p>{occurrenceExplanation(check.kind, 'more')}</p>}
          {!missing.length && !unexpected.length && <p className="review-explanation">This check found a difference but could not identify the text. Compare the original and rewrite.</p>}
          {renderCheckContexts(check.kind, 'missing', missing)}
          {renderCheckContexts(check.kind, 'unexpected', unexpected)}
        </section>;
      })}
    </details>}

    <details className="studio-notes"><summary>Review details</summary>
      <p>{review.summary}</p>
      {findings.filter((finding) => finding.severity === 'info').map((finding, index) => <p key={index}>{finding.detail}</p>)}
      {(review.voiceObservations || []).map((observation, index) => <p key={index}>{observation}</p>)}
      {checks.filter((check) => check.passed).map((check) => <p key={check.kind}>{check.detail}</p>)}
      <p>{unavailable ? 'Requested reviewer' : 'Reviewer'}: {review.modelUsed ? modelDisplayName(review.modelUsed) : 'Not recorded'}</p>
      <p>Review notes may be wrong. Nothing here changes the draft until you ask for a change.</p>
      {onConfigureReviewer && <button type="button" onClick={onConfigureReviewer} className="underline">Model settings</button>}
    </details>
  </section>;
};
