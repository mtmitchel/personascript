import React from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { ToneSlidersControl } from './ToneSlidersControl';
import { DefaultEditorialRules } from './EditorialDecisions';
import { hasFreshProfileGuidance } from '../writingPipeline';
import { PreservationSettings, RewriteIntensity } from '../types';
import { Database, ArrowRight, ShieldCheck } from 'lucide-react';

export const StudioDraftControls: React.FC<{ sourceRewrite?: boolean; disabled?: boolean }> = ({ sourceRewrite = false, disabled = false }) => {
  const { toneAdjustments, setToneAdjustments, resetToneAdjustments, activeProfile, domainExpertise, updateDomainExpertise, setActiveTab, rewriteIntensity, setRewriteIntensity, preservationSettings, updatePreservationSettings, preservationLocks, setPreservationLocks, customDirectives, setCustomDirectives, samples } = useWritingAssistant();
  const freshBlueprint = hasFreshProfileGuidance(activeProfile, samples.filter((sample) => sample.enabled));
  const standardPreserveOptions: Array<{label: string; key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes'>}> = [
    {label: 'Names & technical terms', key: 'preserveTerms'}, {label: 'Numbers & data points', key: 'preserveNumbers'}, {label: 'Direct quotes', key: 'preserveQuotes'},
  ];
  const togglePreserveOption = (key: keyof Pick<PreservationSettings, 'preserveTerms' | 'preserveNumbers' | 'preserveQuotes'>) => updatePreservationSettings({ [key]: !preservationSettings[key] });
  return <details className="studio-writing-settings">
    <summary>Writing settings</summary>
    <fieldset disabled={disabled} className="mt-5 min-w-0 space-y-5">
      <legend className="sr-only">{sourceRewrite ? 'Settings for the new source rewrite' : 'Settings for this edit'}</legend>
      {!freshBlueprint && <p className="studio-inline-notice">Your voice blueprint needs updating. <button type="button" onClick={() => setActiveTab('profile')} className="underline">Review blueprint</button></p>}
      {sourceRewrite && <DefaultEditorialRules/>}
          <ToneSlidersControl
            adjustments={toneAdjustments}
            onChange={setToneAdjustments}
            onReset={resetToneAdjustments}
            baseFormality={activeProfile.metrics?.formality || 65}
          />

          {/* Domain Context & Topics Link */}
          <div className="studio-settings-section space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Database className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-neutral-900 block truncate">
                    {domainExpertise?.enabled && domainExpertise?.field
                      ? domainExpertise.field
                      : 'Domain Knowledge'}
                  </span>
                  <span className="text-[11px] text-neutral-500 block">
                    {domainExpertise?.enabled
                      ? `${(domainExpertise?.topics || []).filter((t) => t.enabled).length} topics active`
                      : 'Disabled in rewrites'}
                  </span>
                </div>
              </div>

              <button
                id="btn-nav-domain"
                type="button"
                onClick={() => setActiveTab('domain')}
                className="text-xs text-neutral-700 hover:text-neutral-900 font-medium flex items-center gap-1 shrink-0 px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50 transition"
              >
                <span>Edit</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Quick topic toggles */}
            {domainExpertise?.enabled && domainExpertise?.topics && domainExpertise.topics.length > 0 && (
              <div className="pt-2 border-t border-neutral-100 flex flex-wrap gap-1">
                {domainExpertise.topics.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={t.enabled}
                    onClick={() => {
                      const updatedTopics = domainExpertise.topics!.map((top) =>
                        top.id === t.id ? { ...top, enabled: !top.enabled } : top
                      );
                      updateDomainExpertise({
                        ...domainExpertise,
                        topics: updatedTopics,
                      });
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition flex items-center gap-1 ${
                      t.enabled
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:text-neutral-700'
                    }`}
                    title={t.enabled ? `Disable ${t.name} for this rewrite` : `Enable ${t.name} for this rewrite`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${t.enabled ? 'bg-emerald-400' : 'bg-neutral-300'}`} />
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transformation Controls */}
          <div className="studio-settings-section space-y-4">
            {sourceRewrite && <div>
              <span className="text-xs font-medium text-neutral-900 block mb-2">
                Rewrite intensity
              </span>

              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    id: 'polish',
                    title: 'Light',
                    desc: 'Tightens phrasing and sentence flow',
                  },
                  {
                    id: 'faithful',
                    title: 'Balanced',
                    desc: 'Adapts pacing and syntax to match your voice',
                  },
                  {
                    id: 'transform',
                    title: 'Thorough',
                    desc: 'Deeper recasting while preserving substance',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    id={`btn-intensity-${opt.id}`}
                    type="button"
                    onClick={() => setRewriteIntensity(opt.id as RewriteIntensity)}
                    aria-pressed={rewriteIntensity === opt.id}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      rewriteIntensity === opt.id
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="font-medium text-xs block">{opt.title}</span>
                    <span
                      className={`text-[10px] block mt-0.5  ${
                        rewriteIntensity === opt.id ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
              <p aria-live="polite" className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span>
                  {rewriteIntensity === 'polish'
                    ? 'Makes restrained edits to phrasing and sentence flow while preserving core meaning.'
                    : rewriteIntensity === 'transform'
                      ? 'Recasts sentences and paragraphs extensively and cuts dispensable exposition while preserving core substance.'
                      : 'Reshapes sentences and paragraphs to match your voice, condensing where useful while preserving core substance.'}{' '}
                  {preservationSettings.keepStructure
                    ? 'Keeps section order.'
                    : 'May reorder sections.'}
                </span>
              </p>
            </div>}

            {/* What to keep unchanged */}
            <div className="space-y-2 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Keep unchanged</span>
                </div>
                <span className="text-[11px] text-neutral-500">Control exact preservation</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {standardPreserveOptions.map((opt, idx) => {
                  const isChecked = Boolean(preservationSettings[opt.key]);
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-pressed={isChecked}
                      onClick={() => togglePreserveOption(opt.key)}
                      className={`text-[11px] px-2.5 py-1 rounded border transition ${
                        isChecked
                          ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  id="btn-preserve-headings"
                  aria-pressed={preservationSettings.headingTreatment === 'preserve_verbatim'}
                  type="button"
                  onClick={() => updatePreservationSettings({
                    headingTreatment: preservationSettings.headingTreatment === 'preserve_verbatim' ? 'revise_in_voice' : 'preserve_verbatim',
                  })}
                  className={`text-[11px] px-2.5 py-1 rounded border transition ${
                    preservationSettings.headingTreatment === 'preserve_verbatim'
                      ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {preservationSettings.headingTreatment === 'preserve_verbatim' ? '✓ ' : '+ '}Headings verbatim
                </button>
                <button
                  id="btn-preserve-structure"
                  aria-pressed={preservationSettings.keepStructure}
                  type="button"
                  onClick={() => updatePreservationSettings({ keepStructure: !preservationSettings.keepStructure })}
                  className={`text-[11px] px-2.5 py-1 rounded border transition ${
                    preservationSettings.keepStructure
                      ? 'bg-neutral-900 border-neutral-900 text-white font-medium'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {preservationSettings.keepStructure ? '✓ ' : '+ '}Section order
                </button>
              </div>

              <textarea
                id="input-preservation-locks"
                aria-label="Additional preservation constraints"
                rows={2}
                value={preservationLocks}
                onChange={(e) => setPreservationLocks(e.target.value)}
                placeholder="Additional facts, names, or constraints to protect..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-900"
              />
            </div>

            {/* Additional instructions */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <label htmlFor="input-custom-directives" className="text-xs font-medium text-neutral-800 block">
                Additional instructions (optional)
              </label>
              <textarea
                id="input-custom-directives"
                rows={3}
                value={customDirectives}
                onChange={(e) => setCustomDirectives(e.target.value)}
                placeholder="e.g. Keep under 250 words, make the conclusion stronger, focus on action items..."
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-900"
              />
            </div>

          </div>
    </fieldset>
  </details>;
};
