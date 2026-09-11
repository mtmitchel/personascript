import React, { useId, useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { hasFreshProfileGuidance } from '../writingPipeline';
import { PreservationSettings, RewriteIntensity } from '../types';

/**
 * Settings that bind a source rewrite: strength and fact locks. They are set
 * before rewriting and are not shown again afterwards. Tone lives in Voice
 * Blueprint, standing preferences in Draft & Brief, and model choices in the
 * header; Studio does not repeat them. The settings render as a <details>
 * disclosure with the summary as its toggle.
 */
export const StudioDraftControls: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { activeProfile, setActiveTab, rewriteIntensity, setRewriteIntensity, preservationSettings, updatePreservationSettings,
    preservationLocks, setPreservationLocks, editorialPreferences, samples } = useWritingAssistant();
  const [addingLock, setAddingLock] = useState(false);
  const id = useId();
  const freshBlueprint = hasFreshProfileGuidance(activeProfile, samples.filter(sample => sample.enabled));
  const preserveOptions: Array<{ label: string; key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes' | 'keepStructure'> }> = [
    { label: 'Names and terms', key: 'preserveTerms' }, { label: 'Numbers', key: 'preserveNumbers' },
    { label: 'Direct quotes', key: 'preserveQuotes' }, { label: 'Section order', key: 'keepStructure' },
  ];
  const strengthLabel = { polish: 'Light', faithful: 'Balanced', transform: 'Thorough' }[rewriteIntensity];
  const protectedLabels = [
    ...preserveOptions.filter(option => preservationSettings[option.key]).map(option => option.label.toLowerCase()),
    ...(preservationSettings.headingTreatment === 'preserve_verbatim' ? ['heading wording'] : []),
    ...(preservationLocks.trim() ? ['specific text'] : []),
  ];
  const summary = `${strengthLabel} rewrite · ${protectedLabels.length ? `protecting ${protectedLabels.join(', ')}` : 'nothing protected'}`;
  return <>
    {!freshBlueprint && (
      <p className="studio-inline-notice">
        Your voice blueprint needs updating.{' '}
        <button type="button" id="btn-review-blueprint" onClick={() => setActiveTab('profile')} className="underline">
          Review blueprint
        </button>
      </p>
    )}
    <details className="studio-settings">
      <summary>{summary}</summary>
      <fieldset id={`${id}-settings`} disabled={disabled} className="studio-settings-fields">
        <legend className="sr-only">Settings for the rewrite</legend>
        <label className="studio-field">
          <span className="studio-field-label">How much should change?</span>
          <select value={rewriteIntensity} onChange={event => setRewriteIntensity(event.target.value as RewriteIntensity)}>
            <option value="polish">Light — tighten wording</option>
            <option value="faithful">Balanced — reshape sentences</option>
            <option value="transform">Thorough — rework paragraphs</option>
          </select>
        </label>
        <div className="studio-field">
          <span className="studio-field-label" id={`${id}-protect`}>Keep unchanged</span>
          <div className="studio-protect-row" role="group" aria-labelledby={`${id}-protect`}>
            {preserveOptions.map(option => (
              <label key={option.key} className="studio-checkbox">
                <input
                  type="checkbox"
                  checked={Boolean(preservationSettings[option.key])}
                  onChange={event => updatePreservationSettings({ [option.key]: event.target.checked })}
                />
                {option.label}
              </label>
            ))}
            <label className="studio-checkbox">
              <input
                type="checkbox"
                checked={preservationSettings.headingTreatment === 'preserve_verbatim'}
                onChange={event => updatePreservationSettings({ headingTreatment: event.target.checked ? 'preserve_verbatim' : 'revise_in_voice' })}
              />
              Heading wording
            </label>
          </div>
          {preservationLocks.trim() || addingLock ? (
            <div className="studio-field">
              <label htmlFor={`${id}-locks`} className="studio-field-label">Anything else to protect?</label>
              <textarea
                id={`${id}-locks`}
                rows={2}
                className="studio-locks"
                value={preservationLocks}
                onChange={event => setPreservationLocks(event.target.value)}
              />
            </div>
          ) : (
            <button type="button" className="studio-text-button studio-protect-add" onClick={() => setAddingLock(true)}>
              Protect specific text
            </button>
          )}
        </div>
        {editorialPreferences.trim() && (
          <p className="studio-field-note">
            Your standing preferences are included.{' '}
            <button type="button" id="btn-edit-preferences" className="underline" onClick={() => setActiveTab('draft-brief')}>
              Edit in Draft &amp; Brief
            </button>
          </p>
        )}
      </fieldset>
    </details>
  </>;
};
