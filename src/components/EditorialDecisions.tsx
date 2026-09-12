import React, { useCallback, useEffect, useRef } from 'react';
import type { EditorialConflict, EditorialPlan, EditorialPlanState } from '../types';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { compactPlanText, planPreview, planStaleReasons, sectionPlan, uncoveredParagraphRefs, type PlanSection, type PlanSectionGroup } from '../utils/editorialSummary';
import { joinList } from '../utils/studioStatus';

type Response = NonNullable<EditorialPlan['items'][number]['response']>;

const RESPONSE_LABEL: Record<Response, string> = { accepted: 'Accepted', rejected: 'Declined', ignored: 'Declined' };

/**
 * The model's suggestions, section by section, each with what changes and
 * why, and the author's answer to each: accept or decline. The
 * author's own requests for selected passages come first. Hovering a
 * suggestion highlights its paragraphs in the draft.
 */
export const EditorialDecisions: React.FC = () => {
  const { editorialPlan, editEditorialPlan, draftText, projectBrief,
    readerPurpose, editorialPreferences, customDirectives } = useWritingAssistant();
  const highlighted = useRef<HTMLElement[]>([]);

  const clearHighlight = useCallback(() => {
    highlighted.current.forEach(el => el.classList.remove('is-plan-target'));
    highlighted.current = [];
  }, []);
  // Hovering a suggestion highlights its paragraphs and brings the first one
  // into view in the document column, so the author never scrolls to find it.
  const highlightRange = useCallback((from: number, to: number) => {
    clearHighlight();
    for (let id = from; id <= to; id++) {
      const el = document.getElementById(`draft-paragraph-${id}`);
      if (el) { el.classList.add('is-plan-target'); highlighted.current.push(el); }
    }
    const first = highlighted.current[0];
    const scroller = first?.closest<HTMLElement>('.studio-prose-scroll');
    if (!first || !scroller) return;
    const target = first.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    if (target.top < frame.top || target.bottom > frame.bottom) {
      scroller.scrollTo({ top: scroller.scrollTop + (target.top - frame.top) - 24, behavior: 'smooth' });
    }
  }, [clearHighlight]);
  useEffect(() => clearHighlight, [clearHighlight]);

  if (!editorialPlan) return null;
  const { plan } = editorialPlan;

  // A plan in the earlier per-paragraph format is replaced, not reviewed.
  if (plan.version !== 3 && plan.version !== 4 && !editorialPlan.approved) {
    return (
      <p className="studio-notice is-warning" role="status">
        These suggestions were prepared paragraph by paragraph. Get new suggestions to review them by section.
      </p>
    );
  }

  const sources = { draft: draftText, projectBrief, readerPurpose, editorialPreferences, customInstructions: customDirectives };
  const stale = planStaleReasons(editorialPlan, sources);
  const missing = uncoveredParagraphRefs(plan, draftText);
  const note = sectionPlan(plan, draftText);
  const readOnly = editorialPlan.approved;

  const respond = (section: PlanSection, response: Response | undefined) => {
    editEditorialPlan({
      ...plan,
      items: plan.items.map((item, index) => {
        if (index !== section.index) return item;
        const { response: _previous, ...rest } = item;
        return response ? { ...rest, response } : rest;
      }),
    });
  };

  const resolveConflict = (position: number, resolution: EditorialConflict['resolution']) => {
    editEditorialPlan({
      ...plan,
      conflicts: (plan.conflicts || []).map((conflict, index) => index === position ? { ...conflict, resolution } : conflict),
    });
  };

  const removeRequest = (position: number) => {
    const requests = (plan.requests || []).filter((_, index) => index !== position);
    editEditorialPlan({ ...plan, ...(requests.length ? { requests } : { requests: undefined }) });
  };

  const renderSuggestion = (section: PlanSection, group: PlanSectionGroup) => {
    const response = section.item.response;
    const limit = section.item.limit.trim();
    // A keep with a limit is a statement the writer must respect, not a
    // question for the author; it carries no accept/reject controls.
    const answerable = section.item.decision !== 'keep';
    const prefix = `${group.name} — `;
    const rowName = section.name === group.name ? '' : section.name.startsWith(prefix) ? section.name.slice(prefix.length) : section.name;
    return (
      <li
        key={section.index}
        className={`studio-note-row${response ? ` is-${response}` : ''}`}
        onMouseEnter={() => highlightRange(section.from, section.to)}
        onMouseLeave={clearHighlight}
        onFocus={() => highlightRange(section.from, section.to)}
        onBlur={clearHighlight}
      >
        <div className="studio-note-row-text">
          <p className="studio-note-lead">
            {rowName && <span className="studio-note-name">{rowName}</span>}
            {rowName && section.item.idea.trim() && ' — '}
            {section.item.idea.trim() && compactPlanText(section.item.idea)}
          </p>
          {section.item.reason?.trim() && <p className="studio-note-reason">{compactPlanText(section.item.reason)}</p>}
          {limit && <p className="studio-note-reason">Do not go beyond: {compactPlanText(limit)}</p>}
        </div>
        {!readOnly && answerable && (
          <div className="studio-note-actions">
            {response ? (
              <>
                <span className="studio-note-state">{RESPONSE_LABEL[response]}</span>
                <button type="button" className="studio-text-button" onClick={() => respond(section, undefined)}>Undo</button>
              </>
            ) : (
              <>
                <button type="button" className="studio-text-button" onClick={() => respond(section, 'accepted')}>Accept</button>
                <button type="button" className="studio-text-button" onClick={() => respond(section, 'rejected')}>Decline</button>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  /** One disclosure group per section: name and count, then a row per suggestion. */
  const renderSectionGroup = (group: PlanSectionGroup, heading: 'h3' | 'h4') => {
    const rows = group.items.filter(section => section.item.decision !== 'keep' || section.item.limit.trim());
    const unchanged = group.items.filter(section => section.item.decision === 'keep' && !section.item.limit.trim());
    const Heading = heading;
    return (
      <details
        key={`${group.from}-${group.to}`}
        className="studio-note-section"
        open={group.changes > 0 || group.limited > 0}
      >
        <summary>
          <Heading className="studio-note-name">{group.name}</Heading>
          <span className="studio-note-state">
            {group.changes > 0 ? `${group.changes} change${group.changes === 1 ? '' : 's'}` : 'Unchanged'}
          </span>
        </summary>
        {rows.length > 0 && <ul>{rows.map(section => renderSuggestion(section, group))}</ul>}
        {unchanged.length > 0 && (
          <p className="studio-note-kept">
            Unchanged:{' '}
            {unchanged.map((section, position) => (
              <React.Fragment key={section.index}>
                {position > 0 && <span aria-hidden="true"> · </span>}
                <span onMouseEnter={() => highlightRange(section.from, section.to)} onMouseLeave={clearHighlight}>{section.name}</span>
              </React.Fragment>
            ))}
          </p>
        )}
      </details>
    );
  };

  return (
    <div className="studio-note">
      {stale.length > 0 && (
        <p className="studio-notice is-warning" role="status">
          Your {joinList(stale)} changed after these suggestions were prepared. Get suggestions again before rewriting.
        </p>
      )}

      {missing.length > 0 && stale.length === 0 && (
        <p className="studio-notice is-error" role="alert">
          These suggestions skip {missing.length === 1 ? 'a paragraph' : `${missing.length} paragraphs`} of your draft. Get suggestions again before rewriting.
        </p>
      )}

      {note.conflicts.length > 0 && (
        <div className="studio-note-questions">
          <h3 className="studio-note-heading">Your draft and brief disagree</h3>
          {note.conflicts.map((conflict, position) => (
            <fieldset key={position} className="studio-conflict-question" disabled={readOnly}>
              <legend>{conflict.question}</legend>
              {(['draft', 'brief'] as const).map(source => (
                <label key={source} className={`studio-conflict-choice${conflict.resolution === source ? ' is-selected' : ''}`}>
                  <input
                    type="radio"
                    name={`conflict-${position}`}
                    checked={conflict.resolution === source}
                    onChange={() => resolveConflict(position, source)}
                  />
                  <span>
                    <strong>Use the {source}:</strong>{' '}
                    “{planPreview(source === 'draft' ? conflict.draftQuote : conflict.briefQuote, 140)}”
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}

      {note.requests.length > 0 && (
        <div className="studio-note-group">
          <h3 className="studio-note-heading">Your requests</h3>
          <ul>
            {note.requests.map((request, position) => (
              <li
                key={position}
                className="studio-note-row"
                onMouseEnter={() => highlightRange(request.paragraphRange.from, request.paragraphRange.to)}
                onMouseLeave={clearHighlight}
              >
                <div className="studio-note-row-text">
                  <p><span className="studio-note-name">“{planPreview(request.sourcePhrase, 90)}”</span> — {compactPlanText(request.instruction)}</p>
                </div>
                {!readOnly && (
                  <div className="studio-note-actions">
                    <button type="button" className="studio-text-button" onClick={() => removeRequest(position)}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="studio-note-opening-job">
        <p className="studio-field-label">What the opening must establish</p>
        <p>{compactPlanText(plan.openingJob)}</p>
      </div>

      {note.cuts.length + note.tightens.length === 0 && (
        <p>No section changes suggested; the rewrite adjusts wording only.</p>
      )}

      {note.sections.map(group => renderSectionGroup(group, 'h3'))}
    </div>
  );
};

/** Read-only view of the suggestions a saved version followed. */
export const SavedEditorialDecisions: React.FC<{ state: EditorialPlanState }> = ({ state }) => {
  const note = sectionPlan(state.plan, state.sources.draft);
  return (
    <div className="studio-note is-saved">
      <div className="studio-note-opening-job">
        <p className="studio-field-label">What the opening must establish</p>
        <p>{compactPlanText(state.plan.openingJob)}</p>
      </div>
      {note.conflicts.filter(conflict => conflict.resolution).map((conflict, position) => (
        <p key={position}>{conflict.question} Used the {conflict.resolution}.</p>
      ))}
      {note.requests.length > 0 && (
        <div className="studio-note-group">
          <h4 className="studio-note-heading">Your requests</h4>
          <ul>
            {note.requests.map((request, position) => (
              <li key={position} className="studio-note-row">
                <div className="studio-note-row-text">
                  <p><span className="studio-note-name">“{planPreview(request.sourcePhrase, 90)}”</span> — {compactPlanText(request.instruction)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note.sections.map(group => {
        const rows = group.items.filter(section => section.item.decision !== 'keep' || section.item.limit.trim());
        const unchanged = group.items.filter(section => section.item.decision === 'keep' && !section.item.limit.trim());
        return (
          <details key={`${group.from}-${group.to}`} className="studio-note-section" open={group.changes > 0}>
            <summary>
              <h4 className="studio-note-name">{group.name}</h4>
              <span className="studio-note-state">
                {group.changes > 0 ? `${group.changes} change${group.changes === 1 ? '' : 's'}` : 'Unchanged'}
              </span>
            </summary>
            {rows.length > 0 && (
              <ul>
                {rows.map(section => {
                  const prefix = `${group.name} — `;
                  const rowName = section.name === group.name ? '' : section.name.startsWith(prefix) ? section.name.slice(prefix.length) : section.name;
                  return (
                    <li key={section.index} className="studio-note-row">
                      <div className="studio-note-row-text">
                        <p className="studio-note-lead">
                          {rowName && <span className="studio-note-name">{rowName}</span>}
                          {rowName && section.item.idea.trim() && ' — '}
                          {section.item.idea.trim() && compactPlanText(section.item.idea)}
                        </p>
                        {section.item.reason?.trim() && <p className="studio-note-reason">{compactPlanText(section.item.reason)}</p>}
                        {section.item.limit.trim() && <p className="studio-note-reason">Do not go beyond: {compactPlanText(section.item.limit)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {unchanged.length > 0 && (
              <p className="studio-note-kept">Unchanged: {unchanged.map(section => section.name).join(' · ')}</p>
            )}
          </details>
        );
      })}
    </div>
  );
};
