import React from 'react';
import { WritingReview } from '../types';

interface WritingReviewPanelProps {
  review: WritingReview;
  id?: string;
  onConfigureReviewer?: () => void;
}

export const WritingReviewPanel: React.FC<WritingReviewPanelProps> = ({ review, id, onConfigureReviewer }) => {
  const findings = review.findings || [];
  const checks = review.localChecks || [];
  const attentionCount = findings.filter((finding) => finding.severity !== 'info').length
    + checks.filter((check) => !check.passed).length;
  const unavailable = review.status !== 'complete';
  return (
    <details id={id} className={`group rounded-xl border ${unavailable || attentionCount ? 'border-amber-200 bg-amber-50/50' : 'border-indigo-200 bg-indigo-50/40'}`}>
      <summary className="cursor-pointer p-4 text-xs text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900">
        <span className="font-semibold">Review of this draft</span>
        <span className="ml-2 text-neutral-700">
          {unavailable ? 'Unavailable · draft retained' : `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'}`}
          {attentionCount > 0 ? ` · ${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} attention` : ''}
        </span>
        <span className="block mt-1 text-[11px] text-neutral-600">
          {unavailable ? 'Requested reviewer' : 'Reviewed by'}: {review.modelUsed || 'Not recorded'} · <span className="group-open:hidden">Expand</span><span className="hidden group-open:inline">Collapse</span> observations and local checks
        </span>
      </summary>
      <div className="px-4 pb-4 space-y-3 text-xs text-neutral-700">
        <p className="leading-relaxed">{review.summary}</p>
        {onConfigureReviewer && (
          <button type="button" onClick={onConfigureReviewer} className="underline text-neutral-800">
            Choose reviewer for the next rewrite or edit
          </button>
        )}
        {checks.map((check) => (
          <div key={check.kind} className={`rounded border px-2 py-1.5 ${check.passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <div className="text-[11px] font-medium">{check.kind}: {check.passed ? 'passed' : 'possible mismatch'}</div>
            <p className="mt-0.5 text-[11px] leading-relaxed">{check.detail}</p>
          </div>
        ))}
        {findings.map((finding, index) => (
          <div key={index} className="rounded border border-neutral-200 bg-white/70 px-2.5 py-2">
            <div className="text-[11px] font-medium text-neutral-600">{finding.category} · {finding.severity}</div>
            <p className="mt-0.5">{finding.detail}</p>
            {finding.evidence && <p className="mt-1 text-[11px] text-neutral-600">Evidence: {finding.evidence}</p>}
          </div>
        ))}
        {(review.voiceObservations || []).map((observation, index) => (
          <div key={index} className="rounded border border-neutral-200 bg-white/70 px-2.5 py-2">
            <div className="text-[11px] font-medium text-neutral-600">Voice observation</div>
            <p className="mt-0.5">{observation}</p>
          </div>
        ))}
        {review.error && <p className="text-amber-800">{review.error}</p>}
        <p className="text-[11px] text-neutral-600">AI observations are advisory. Local checks compare protected text; they do not verify the account.</p>
      </div>
    </details>
  );
};
