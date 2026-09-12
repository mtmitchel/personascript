import React, { useId } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { hasFreshProfileGuidance, EDITORIAL_PREFERENCES_MAX_CHARS } from '../writingPipeline';
import { PreservationSettings, RewriteIntensity } from '../types';

/**
 * Settings that bind a source rewrite: instructions, strength, fact locks,
 * and standing preferences. They render as a flat form in the Rewrite settings
 * rail tab.
 */
export const StudioDraftControls: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { activeProfile, setActiveTab, rewriteIntensity, setRewriteIntensity, preservationSettings, updatePreservationSettings,
    preservationLocks, setPreservationLocks, customDirectives, setCustomDirectives, editorialPreferences, setEditorialPreferences, samples } = useWritingAssistant();
  const id = useId();
  const freshBlueprint = hasFreshProfileGuidance(activeProfile, samples.filter(sample => sample.enabled));
  const preserveOptions: Array<{ label: string; key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes' | 'keepStructure'> }> = [
    { label: 'Names and terms', key: 'preserveTerms' }, { label: 'Numbers', key: 'preserveNumbers' },
    { label: 'Direct quotes', key: 'preserveQuotes' }, { label: 'Section order', key: 'keepStructure' },
  ];
  return <>
    {!freshBlueprint && (
      <p className="studio-inline-notice">
        Your voice blueprint needs updating.{' '}
        <button type="button" id="btn-review-blueprint" onClick={() => setActiveTab('profile')} className="underline">
          Review blueprint
        </button>
      </p>
    )}
    <fieldset disabled={disabled} className="studio-settings-fields">
      <legend className="sr-only">Rewrite settings</legend>

      <div className="studio-field">
        <label htmlFor="input-rewrite-instructions" className="studio-field-label">Instructions for the suggestions and the rewrite (optional)</label>
        <textarea id="input-rewrite-instructions" rows={3} value={customDirectives}
          onChange={e => setCustomDirectives(e.target.value)}
          placeholder="For example, keep it under 500 words." />
        <p className="studio-field-note">Changing this means getting suggestions again before rewriting.</p>
      </div>

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
      </div>

      <div className="studio-field">
        <label htmlFor={`${id}-locks`} className="studio-field-label">Specific text to keep unchanged (optional)</label>
        <textarea id={`${id}-locks`} rows={2} className="studio-locks" value={preservationLocks}
          onChange={e => setPreservationLocks(e.target.value)}
          placeholder="For example, the title, or a sentence that must stay word for word." />
      </div>

      <div className="studio-field">
        <label htmlFor="input-studio-standing-preferences" className="studio-field-label">Standing preferences (optional)</label>
        <textarea id="input-studio-standing-preferences" rows={4} value={editorialPreferences}
          onChange={e => setEditorialPreferences(e.target.value)}
          aria-invalid={editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS}
          aria-describedby="studio-standing-preferences-note" />
        <p id="studio-standing-preferences-note" className="studio-field-note">Used for every draft, not just this one. Changing this means getting suggestions again before rewriting.</p>
        {editorialPreferences.length > EDITORIAL_PREFERENCES_MAX_CHARS && (
          <p className="studio-inline-notice" role="alert">Standing preferences exceed the {EDITORIAL_PREFERENCES_MAX_CHARS.toLocaleString()} character limit.</p>
        )}
      </div>
    </fieldset>
  </>;
};
