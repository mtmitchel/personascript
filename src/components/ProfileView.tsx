import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { ToneSlidersControl } from './ToneSlidersControl';
import { StepFooter } from './StepFooter';
import { hasFreshProfileGuidance } from '../writingPipeline';
import {
  Sliders,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const {
    activeProfile,
    updateActiveProfile,
    setActiveTab,
    toneAdjustments,
    setToneAdjustments,
    resetToneAdjustments,
    samples,
    synthesizeProfileFromActiveSamples,
    isSynthesizingProfile,
  } = useWritingAssistant();

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const enabledSamples = (samples || []).filter(s => s.enabled);
  const activeSamplesCount = enabledSamples.length;
  const isFresh = hasFreshProfileGuidance(activeProfile, enabledSamples);

  const metricItems = [
    {
      key: 'formality' as const,
      label: 'Formality',
      value: activeProfile.metrics.formality,
      minLabel: 'Conversational',
      maxLabel: 'Academic',
    },
    {
      key: 'warmth' as const,
      label: 'Warmth',
      value: activeProfile.metrics.warmth,
      minLabel: 'Clinical',
      maxLabel: 'Empathetic',
    },
    {
      key: 'directness' as const,
      label: 'Directness',
      value: activeProfile.metrics.directness,
      minLabel: 'Nuanced',
      maxLabel: 'Direct',
    },
    {
      key: 'sentenceLengthVariance' as const,
      label: 'Sentence variety',
      value: activeProfile.metrics.sentenceLengthVariance,
      minLabel: 'Uniform',
      maxLabel: 'Rhythmic',
    },
    {
      key: 'activeVoiceRatio' as const,
      label: 'Active voice',
      value: activeProfile.metrics.activeVoiceRatio,
      minLabel: 'Passive',
      maxLabel: 'Active',
    },
    {
      key: 'lexicalSophistication' as const,
      label: 'Vocabulary depth',
      value: activeProfile.metrics.lexicalSophistication,
      minLabel: 'Accessible',
      maxLabel: 'Technical',
    },
    {
      key: 'metaphorDensity' as const,
      label: 'Metaphors & analogies',
      value: activeProfile.metrics.metaphorDensity,
      minLabel: 'Literal',
      maxLabel: 'Vivid',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500">Step 2 of 5 · Voice Blueprint</p>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
            {activeProfile.name}
          </h1>
          <p className="text-xs text-neutral-500 mt-1 max-w-xl">
            {activeProfile.description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-rebuild-profile"
            type="button"
            onClick={async () => {
              setErrorBanner(null);
              setSuccessNotice(null);
              try {
                await synthesizeProfileFromActiveSamples();
                setSuccessNotice(`Blueprint rebuilt from ${activeSamplesCount} ${activeSamplesCount === 1 ? 'sample' : 'samples'}.`);
              } catch (e: any) {
                setErrorBanner(e.message || 'Failed to rebuild blueprint');
              }
            }}
            disabled={isSynthesizingProfile || activeSamplesCount === 0}
            title={activeSamplesCount === 0 ? 'Enable at least one sample first' : undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSynthesizingProfile ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Rebuilding blueprint…</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-neutral-600" />
                <span>Rebuild from samples</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorBanner && (
        <div
          id="banner-profile-error"
          className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-600 hover:text-rose-800 text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successNotice && (
        <div
          id="banner-profile-success"
          className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs flex items-center justify-between"
        >
          <span>{successNotice}</span>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stale samples notice */}
      {!isFresh && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs leading-relaxed studio-inline-notice">
          Your writing samples changed after this blueprint was built. Rebuild it so the writer follows your current samples.
        </div>
      )}

      {/* Voice Axiom */}
      {activeProfile.voiceManifesto && (
        <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1.5">
          <div className="text-xs font-medium text-neutral-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-neutral-700" />
            <span>Voice principle</span>
          </div>
          <p className="text-sm italic text-neutral-800 leading-relaxed">
            "{activeProfile.voiceManifesto}"
          </p>
        </div>
      )}

      {/* Linguistic Metrics Grid */}
      <div className="space-y-4">
        <h2 className="text-xs font-medium text-neutral-500">
          Style metrics
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metricItems.map((metric) => (
            <div
              key={metric.key}
              className="p-4 rounded-xl border border-neutral-200 bg-white space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-900">{metric.label}</span>
                <span className="font-mono text-neutral-500">
                  {metric.value}/100
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                aria-label={metric.label}
                value={metric.value}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  updateActiveProfile({
                    ...activeProfile,
                    metrics: {
                      ...activeProfile.metrics,
                      [metric.key]: val,
                    },
                  });
                }}
                className="w-full accent-neutral-900 cursor-pointer"
              />

              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>{metric.minLabel}</span>
                <span>{metric.maxLabel}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500">Saved automatically.</p>
      </div>

      {/* Tone adjustments applied at write time */}
      <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-900">
          <Sliders className="w-4 h-4 text-neutral-700" />
          <span>Tone for new writing</span>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Optional adjustments layered on your blueprint voice. They apply to every new rewrite and edit until you change them.
        </p>
        <ToneSlidersControl adjustments={toneAdjustments} onChange={setToneAdjustments} onReset={resetToneAdjustments}/>
      </div>

      {/* Rules: Dos and Don'ts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mandates */}
        <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Stylistic rules</span>
          </div>
          <div className="space-y-2">
            {(activeProfile.synthesizedGuidelines.doList || []).map((rule, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-xs text-neutral-800 leading-relaxed"
              >
                {rule}
              </div>
            ))}
          </div>
        </div>

        {/* Taboos */}
        <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-900">
            <XCircle className="w-4 h-4 text-rose-600" />
            <span>Patterns to avoid</span>
          </div>
          <div className="space-y-2">
            {(activeProfile.synthesizedGuidelines.dontList || []).map((taboo, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-xs text-neutral-800 leading-relaxed"
              >
                {taboo}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vocabulary, Habits, and Pacing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2.5">
          <span className="text-xs font-medium text-neutral-900 block">
            Writing habits
          </span>
          <div className="space-y-1.5 text-xs text-neutral-700">
            {(activeProfile.synthesizedGuidelines.signatureHabits || []).map((habit, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-neutral-400">•</span>
                <span>{habit}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2.5">
          <span className="text-xs font-medium text-neutral-900 block">
            Preferred phrasing
          </span>
          <div className="space-y-1.5 text-xs text-neutral-700">
            {(activeProfile.synthesizedGuidelines.vocabularyPreferences || []).map((pref, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-neutral-400">→</span>
                <span>{pref}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-2.5">
          <span className="text-xs font-medium text-neutral-900 block">
            Pacing guide
          </span>
          <p className="text-xs text-neutral-700 leading-relaxed">
            {activeProfile.synthesizedGuidelines.pacingGuide}
          </p>
        </div>
      </div>

      {/* Custom Directives */}
      <div className="p-5 rounded-xl border border-neutral-200 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="textarea-custom-directives" className="text-xs font-medium text-neutral-900 block">
            Additional style rules
          </label>
        </div>
        <p id="custom-directive-description" className="text-xs text-neutral-500 leading-relaxed">
          Add any specific instructions, style rules, or tone adjustments you want the rewrite engine to follow.
        </p>
        <textarea
          id="textarea-custom-directives"
          aria-describedby="custom-directive-description"
          rows={2}
          value={activeProfile.customDirectives}
          onChange={(e) =>
            updateActiveProfile({
              ...activeProfile,
              customDirectives: e.target.value,
            })
          }
          placeholder="For example, keep sentences concise or avoid marketing buzzwords."
          className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-500"
        />
        <div className="pt-1">
          <span className="text-xs text-neutral-500">
            Saved automatically
          </span>
        </div>
      </div>

      {/* Step Footer */}
      <StepFooter
        label="Next: Draft & Brief →"
        id="btn-profile-to-draft"
        onClick={() => setActiveTab('draft-brief')}
      />
    </div>
  );
};
