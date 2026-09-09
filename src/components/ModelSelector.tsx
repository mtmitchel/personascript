import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check, Sparkles, Zap, Brain, Wand2, Sliders } from 'lucide-react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { GeminiModelChoice, ReasoningLevelChoice } from '../types';

interface ModelOption {
  id: GeminiModelChoice;
  name: string;
  tag: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Recommended',
    description: 'Fast drafting and responsive line copy edits',
    icon: Sparkles,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: 'Fast',
    description: 'High-speed drafting, tone adjustment, and responsive revision',
    icon: Sparkles,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Fast',
    description: 'Lightweight, rapid response for iterative editing passes',
    icon: Zap,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    tag: 'Deep reasoning',
    description: 'Deep reasoning for draft review and voice analysis',
    icon: Brain,
  },
];

interface ReasoningOption {
  id: ReasoningLevelChoice;
  label: string;
  description: string;
}

const REASONING_OPTIONS: ReasoningOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Automatic thinking depth determined by prompt complexity',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Lowest latency with minimal internal thinking (Flash models)',
  },
  {
    id: 'low',
    label: 'Low',
    description: 'Balanced thinking for quick tone calibration and style rules',
  },
  {
    id: 'high',
    label: 'High',
    description: 'Deepest reasoning for complex syntax and rigorous voice alignment',
  },
];

interface ModelSelectorProps {
  variant?: 'compact' | 'inline' | 'card';
  className?: string;
  initialRole?: 'writing' | 'analysis';
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  variant = 'compact',
  className = '',
  initialRole = 'writing',
}) => {
  const {
    modelSettings,
    updateWritingModel,
    updateWritingReasoningLevel,
    updateAnalysisModel,
    updateAnalysisReasoningLevel,
  } = useWritingAssistant();

  const [isOpen, setIsOpen] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState<'writing' | 'analysis'>(initialRole);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeWritingModel =
    MODEL_OPTIONS.find((m) => m.id === (modelSettings.writingModel || modelSettings.model)) || MODEL_OPTIONS[0];
  const activeWritingReasoning =
    REASONING_OPTIONS.find((r) => r.id === (modelSettings.writingReasoningLevel || modelSettings.reasoningLevel)) ||
    REASONING_OPTIONS[0];

  const activeAnalysisModel =
    MODEL_OPTIONS.find((m) => m.id === (modelSettings.analysisModel || 'gemini-3.1-pro-preview')) ||
    MODEL_OPTIONS.find((m) => m.id === 'gemini-3.1-pro-preview') ||
    MODEL_OPTIONS[0];
  const activeAnalysisReasoning =
    REASONING_OPTIONS.find((r) => r.id === (modelSettings.analysisReasoningLevel || 'auto')) || REASONING_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const setRecommendedSplit = () => {
    updateWritingModel('gemini-3.8-flash');
    updateWritingReasoningLevel('auto');
    updateAnalysisModel('gemini-3.1-pro-preview');
    updateAnalysisReasoningLevel('auto');
  };

  const isRoleWriting = activeRoleTab === 'writing';
  const selectedModelId = isRoleWriting ? activeWritingModel.id : activeAnalysisModel.id;
  const selectedReasoningId = isRoleWriting ? activeWritingReasoning.id : activeAnalysisReasoning.id;

  const handleSelectModel = (id: GeminiModelChoice) => {
    if (isRoleWriting) {
      updateWritingModel(id);
    } else {
      updateAnalysisModel(id);
    }
  };

  const handleSelectReasoning = (level: ReasoningLevelChoice) => {
    if (isRoleWriting) {
      updateWritingReasoningLevel(level);
    } else {
      updateAnalysisReasoningLevel(level);
    }
  };

  // Card / Inline View
  if (variant === 'card' || variant === 'inline') {
    return (
      <div className={`space-y-4 ${className}`} id="model-controls-panel">
        <div className="space-y-3 pb-2 border-b border-neutral-100">
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveRoleTab('writing')}
              aria-pressed={activeRoleTab === 'writing'}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeRoleTab === 'writing'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Drafting & Line Edits</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveRoleTab('analysis')}
              aria-pressed={activeRoleTab === 'analysis'}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                activeRoleTab === 'analysis'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-indigo-600" />
              <span>Review &amp; analysis</span>
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-neutral-500">
            <strong className="font-medium text-neutral-700">Drafting &amp; line edits</strong> writes drafts and applies
            line edits. <strong className="font-medium text-neutral-700">Review &amp; analysis</strong> reviews drafts and
            analyzes samples, voice blueprints, and domain knowledge. Changes apply to the next writing action.
          </p>

          <button
            type="button"
            onClick={setRecommendedSplit}
            className="text-[11px] text-neutral-500 hover:text-neutral-900 underline cursor-pointer"
          >
            Reset to recommended split
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-neutral-500" />
              <span>
                {isRoleWriting ? 'Drafting & line edits model' : 'Review & analysis model'}
              </span>
            </label>
            <span className="text-[11px] text-neutral-400">
              Selected: {isRoleWriting ? activeWritingModel.name : activeAnalysisModel.name}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODEL_OPTIONS.map((opt) => {
              const isSelected = selectedModelId === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  id={`btn-model-${opt.id}`}
                  type="button"
                  onClick={() => handleSelectModel(opt.id)}
                  aria-pressed={isSelected}
                  className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-neutral-200' : 'text-neutral-500'}`} />
                      {opt.name}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed line-clamp-2 ${
                      isSelected ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-neutral-500" />
              <span>Thinking depth</span>
            </label>
            <span className="text-[11px] text-neutral-400">
              Level: {isRoleWriting ? activeWritingReasoning.label : activeAnalysisReasoning.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {REASONING_OPTIONS.map((r) => {
              const isSelected = selectedReasoningId === r.id;
              const isDisabled = r.id === 'minimal' && selectedModelId.includes('pro');

              return (
                <button
                  key={r.id}
                  id={`btn-reasoning-${r.id}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectReasoning(r.id)}
                  aria-pressed={isSelected}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400'
                      : isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800'
                  }`}
                  title={isDisabled ? 'Minimal reasoning is not supported on Pro models' : r.description}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{r.label}</span>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <p className={`text-[10px] leading-tight ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    {r.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Compact Variant (Header / Navigation Bar)
  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        id="btn-open-model-selector"
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="model-selector-popover"
        aria-haspopup="dialog"
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-md transition-colors cursor-pointer"
        title="Choose the model for drafting and the model for review and analysis"
      >
        <Cpu className="w-3.5 h-3.5 text-neutral-500" />
        <span className="text-neutral-900">
          Draft: <span className="font-semibold">{activeWritingModel.name.replace('Gemini ', '')}</span>
        </span>
        <span className="text-neutral-300">|</span>
        <span className="text-neutral-600 hidden md:inline">
          Review: <span className="font-semibold text-neutral-800">{activeAnalysisModel.name.replace('Gemini ', '')}</span>
        </span>
        <ChevronDown
          className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id="model-selector-popover"
          role="dialog"
          aria-labelledby="model-selector-title"
          aria-describedby="model-selector-description"
          className="absolute right-0 mt-2 w-84 sm:w-96 rounded-xl bg-white border border-neutral-200 shadow-xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3.5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
            <div>
              <h4 id="model-selector-title" className="text-xs font-semibold text-neutral-900">Choose your models</h4>
              <p id="model-selector-description" className="text-[11px] leading-relaxed text-neutral-500">
                Drafting writes and edits your text. Review &amp; analysis reviews drafts and analyzes samples, voice
                blueprints, and domain knowledge. Changes apply to the next writing action.
              </p>
            </div>
            <button
              type="button"
              onClick={setRecommendedSplit}
              className="text-[10px] text-neutral-600 hover:text-neutral-900 font-medium px-1.5 py-0.5 rounded bg-neutral-100 cursor-pointer"
              title="Use Gemini 3.8 Flash for drafting and Gemini 3.1 Pro for review and analysis"
            >
              Use recommended models
            </button>
          </div>

          {/* Role Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveRoleTab('writing')}
              aria-pressed={activeRoleTab === 'writing'}
              className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeRoleTab === 'writing'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Drafting & Edits</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveRoleTab('analysis')}
              aria-pressed={activeRoleTab === 'analysis'}
              className={`py-1.5 px-2 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeRoleTab === 'analysis'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-indigo-600" />
              <span>Review &amp; analysis</span>
            </button>
          </div>

          {/* Current Active Role Status */}
          <div className="text-[11px] text-neutral-500 flex items-center justify-between px-0.5">
            <span>
              Configuring:{' '}
              <strong className="text-neutral-800">
                {isRoleWriting ? 'Drafting & edits' : 'Review & analysis'}
              </strong>
            </span>
            <span className="font-mono text-[10px] text-neutral-400">
              {isRoleWriting ? activeWritingModel.name : activeAnalysisModel.name}
            </span>
          </div>

          {/* Model selection */}
          <div className="space-y-1">
            {MODEL_OPTIONS.map((opt) => {
              const isSelected = selectedModelId === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  id={`popover-model-${opt.id}`}
                  type="button"
                  onClick={() => handleSelectModel(opt.id)}
                  aria-pressed={isSelected}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected ? 'bg-neutral-900 text-white shadow-xs' : 'hover:bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className={`w-3.5 h-3.5 mt-0.5 ${
                        isSelected ? 'text-white' : 'text-neutral-400'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{opt.name}</span>
                        {isRoleWriting && opt.id === 'gemini-3.8-flash' && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                              isSelected ? 'bg-neutral-800 text-neutral-200' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            Recommended
                          </span>
                        )}
                        {!isRoleWriting && opt.id === 'gemini-3.1-pro-preview' && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full ${
                              isSelected ? 'bg-neutral-800 text-neutral-200' : 'bg-indigo-50 text-indigo-700'
                            }`}
                          >
                            Deep Reasoning
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] line-clamp-1 ${
                          isSelected ? 'text-neutral-300' : 'text-neutral-500'
                        }`}
                      >
                        {opt.description}
                      </p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>

          {/* Reasoning level */}
          <div className="space-y-1.5 border-t border-neutral-100 pt-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-neutral-500">Reasoning depth</span>
              <span className="text-neutral-400">
                {isRoleWriting ? activeWritingReasoning.label : activeAnalysisReasoning.label}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {REASONING_OPTIONS.map((r) => {
                const isSelected = selectedReasoningId === r.id;
                const isDisabled = r.id === 'minimal' && selectedModelId.includes('pro');

                return (
                  <button
                    key={r.id}
                    id={`popover-reasoning-${r.id}`}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleSelectReasoning(r.id)}
                    aria-pressed={isSelected}
                    className={`py-1 text-center rounded text-[11px] font-medium transition cursor-pointer ${
                      isDisabled
                        ? 'opacity-30 cursor-not-allowed bg-neutral-100 text-neutral-400'
                        : isSelected
                        ? 'bg-neutral-900 text-white shadow-2xs'
                        : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200'
                    }`}
                    title={isDisabled ? 'Minimal reasoning not supported on Pro' : r.description}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-2 border-t border-neutral-100 text-[10px] text-neutral-400 flex items-center justify-between">
            <span>Saved for the next writing action</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-neutral-900 font-medium hover:underline cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
