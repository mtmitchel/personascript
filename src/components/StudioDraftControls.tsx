import React, { useId, useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { hasFreshProfileGuidance } from '../writingPipeline';
import { planPreview } from '../utils/editorialSummary';
import { PreservationSettings, RewriteIntensity } from '../types';

/**
 * Flat settings that bind the writing: strength and fact locks for a source
 * rewrite, locks for a follow-up edit. Tone lives in Voice Blueprint, standing
 * preferences in Draft & Brief, and model choices in the header; Studio does
 * not repeat them.
 */
export const StudioDraftControls: React.FC<{ sourceRewrite?: boolean; disabled?: boolean }> = ({ sourceRewrite = false, disabled = false }) => {
  const { activeProfile, setActiveTab, rewriteIntensity, setRewriteIntensity, preservationSettings, updatePreservationSettings,
    preservationLocks, setPreservationLocks, customDirectives, editorialPreferences, samples } = useWritingAssistant();
  const [addingLock, setAddingLock] = useState(false);
  const id = useId();
  const freshBlueprint = hasFreshProfileGuidance(activeProfile, samples.filter(sample => sample.enabled));
  const preserveOptions: Array<{ label: string; key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes' | 'keepStructure'> }> = [
    { label: 'Names and terms', key: 'preserveTerms' }, { label: 'Numbers', key: 'preserveNumbers' },
    { label: 'Direct quotes', key: 'preserveQuotes' }, { label: 'Section order', key: 'keepStructure' },
  ];
  return <div className="studio-writing-settings">
    <fieldset disabled={disabled} className="studio-settings-fields">
      <legend className="sr-only">{sourceRewrite ? 'Settings for the new rewrite' : 'Settings for this edit'}</legend>
      {!sourceRewrite && customDirectives.trim() && <p className="studio-field-note">Your source-rewrite instructions also apply to this edit: “{planPreview(customDirectives, 140)}” Change them under “New rewrite from source”.</p>}
      {sourceRewrite && <label className="studio-field">
        <span className="studio-field-label">How much should change?</span>
        <select value={rewriteIntensity} onChange={event => setRewriteIntensity(event.target.value as RewriteIntensity)}>
          <option value="polish">Light — tighten wording</option>
          <option value="faithful">Balanced — reshape sentences</option>
          <option value="transform">Thorough — rework paragraphs</option>
        </select>
      </label>}
      <div className="studio-field">
        <span className="studio-field-label" id={`${id}-protect`}>Keep unchanged</span>
        <div className="studio-protect-row" role="group" aria-labelledby={`${id}-protect`}>
          {preserveOptions.map(option => <label key={option.key} className="studio-checkbox">
            <input type="checkbox" checked={Boolean(preservationSettings[option.key])} onChange={event => updatePreservationSettings({ [option.key]: event.target.checked })}/>{option.label}
          </label>)}
          <label className="studio-checkbox"><input type="checkbox" checked={preservationSettings.headingTreatment === 'preserve_verbatim'} onChange={event => updatePreservationSettings({ headingTreatment: event.target.checked ? 'preserve_verbatim' : 'revise_in_voice' })}/>Heading wording</label>
        </div>
        {preservationLocks.trim() || addingLock ? <div className="studio-field">
          <label htmlFor={`${id}-locks`} className="studio-field-label">Anything else to protect?</label>
          <textarea id={`${id}-locks`} rows={2} className="studio-locks" value={preservationLocks} onChange={event => setPreservationLocks(event.target.value)}/>
        </div> : <button type="button" className="studio-text-button studio-protect-add" onClick={() => setAddingLock(true)}>Protect specific text</button>}
      </div>
      {sourceRewrite && editorialPreferences.trim() && <p className="studio-field-note">Your standing preferences are included. <button type="button" id="btn-edit-preferences" className="underline" onClick={() => setActiveTab('draft-brief')}>Edit in Draft &amp; Brief</button></p>}
      {sourceRewrite && !freshBlueprint && <p className="studio-inline-notice">Your voice blueprint needs updating. <button type="button" id="btn-review-blueprint" onClick={() => setActiveTab('profile')} className="underline">Review blueprint</button></p>}
    </fieldset>
  </div>;
};
