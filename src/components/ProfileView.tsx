import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { StyleProfile } from '../types';
import {
  Sliders,
  Sparkles,
  Edit3,
  Save,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const {
    activeProfile,
    updateActiveProfile,
    setActiveTab,
  } = useWritingAssistant();

  const [isEditing, setIsEditing] = useState(false);
  const [profileForm, setProfileForm] = useState<StyleProfile>(activeProfile);

  const handleSave = () => {
    updateActiveProfile(profileForm);
    setIsEditing(false);
  };

  const metricItems = [
    {
      key: 'formality',
      label: 'Formality',
      value: activeProfile.metrics.formality,
      minLabel: 'Conversational',
      maxLabel: 'Academic',
    },
    {
      key: 'warmth',
      label: 'Warmth',
      value: activeProfile.metrics.warmth,
      minLabel: 'Clinical',
      maxLabel: 'Empathetic',
    },
    {
      key: 'directness',
      label: 'Directness',
      value: activeProfile.metrics.directness,
      minLabel: 'Nuanced',
      maxLabel: 'Direct',
    },
    {
      key: 'sentenceLengthVariance',
      label: 'Sentence variety',
      value: activeProfile.metrics.sentenceLengthVariance,
      minLabel: 'Uniform',
      maxLabel: 'Rhythmic',
    },
    {
      key: 'activeVoiceRatio',
      label: 'Active voice',
      value: activeProfile.metrics.activeVoiceRatio,
      minLabel: 'Passive',
      maxLabel: 'Active',
    },
    {
      key: 'lexicalSophistication',
      label: 'Vocabulary depth',
      value: activeProfile.metrics.lexicalSophistication,
      minLabel: 'Accessible',
      maxLabel: 'Technical',
    },
    {
      key: 'metaphorDensity',
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
            id="btn-toggle-edit-profile"
            type="button"
            onClick={() => {
              if (isEditing) {
                handleSave();
              } else {
                setProfileForm(activeProfile);
                setIsEditing(true);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              isEditing
                ? 'bg-neutral-900 text-white'
                : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {isEditing ? (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                <span>Adjust</span>
              </>
            )}
          </button>

          <button
            id="btn-profile-to-draft-brief"
            type="button"
            onClick={() => setActiveTab('draft-brief')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
          >
            <span>Continue to Draft &amp; Brief</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
                  {isEditing ? (profileForm.metrics as any)[metric.key] : metric.value}/100
                </span>
              </div>

              {isEditing ? (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={(profileForm.metrics as any)[metric.key]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setProfileForm({
                      ...profileForm,
                      metrics: {
                        ...profileForm.metrics,
                        [metric.key]: val,
                      },
                    });
                  }}
                  className="w-full accent-neutral-900 cursor-pointer"
                />
              ) : (
                <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 rounded-full"
                    style={{ width: `${metric.value}%` }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>{metric.minLabel}</span>
                <span>{metric.maxLabel}</span>
              </div>
            </div>
          ))}
        </div>
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
          <label className="text-xs font-medium text-neutral-900 block">
            Additional style rules
          </label>
        </div>
        <textarea
          id="textarea-custom-directives"
          rows={2}
          value={activeProfile.customDirectives}
          onChange={(e) =>
            updateActiveProfile({
              ...activeProfile,
              customDirectives: e.target.value,
            })
          }
          placeholder="e.g. Keep sentences concise. Avoid marketing buzzwords."
          className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-neutral-900 text-neutral-900 placeholder:text-neutral-400"
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-neutral-400">
            Saved automatically
          </span>
          <div className="flex gap-2">
            <button
              id="btn-profile-next-draft-brief"
              type="button"
              onClick={() => setActiveTab('draft-brief')}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
            >
              Continue to Draft &amp; Brief
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
