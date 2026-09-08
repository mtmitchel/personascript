import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check, Sparkles, Zap, Brain } from 'lucide-react';
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
    description: 'Balanced speed and literary nuance, ideal for prose synthesis and rewrites',
    icon: Sparkles,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    tag: 'Fastest',
    description: 'Ultra fast response time and high throughput for quick iterations',
    icon: Zap,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    tag: 'Deep reasoning',
    description: 'Deep computational linguistics, complex syntax, and subtle cadence modeling',
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
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ variant = 'compact', className = '' }) => {
  const { modelSettings, updateModel, updateReasoningLevel } = useWritingAssistant();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = MODEL_OPTIONS.find((m) => m.id === modelSettings.model) || MODEL_OPTIONS[0];
  const currentReasoning = REASONING_OPTIONS.find((r) => r.id === modelSettings.reasoningLevel) || REASONING_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (variant === 'card' || variant === 'inline') {
    return (
      <div className={`space-y-4 ${className}`} id="model-controls-panel">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-neutral-500" />
              <span>Gemini model</span>
            </label>
            <span className="text-[11px] text-neutral-400">Current: {currentModel.name}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {MODEL_OPTIONS.map((opt) => {
              const isSelected = modelSettings.model === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  id={`btn-model-${opt.id}`}
                  type="button"
                  onClick={() => updateModel(opt.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-neutral-200' : 'text-neutral-500'}`} />
                      {opt.name}
                    </span>
                    {isSelected ? (
                      <Check className="w-3 h-3 text-white" />
                    ) : (
                      <span className="text-[10px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                        {opt.tag}
                      </span>
                    )}
                  </div>
                  <p className={`text-[11px] leading-relaxed line-clamp-2 ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
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
              <Brain className="w-3.5 h-3.5 text-neutral-500" />
              <span>Reasoning level</span>
            </label>
            <span className="text-[11px] text-neutral-400">Thinking depth: {currentReasoning.label}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {REASONING_OPTIONS.map((r) => {
              const isSelected = modelSettings.reasoningLevel === r.id;
              // Minimal reasoning is not supported on Pro
              const isDisabled = r.id === 'minimal' && modelSettings.model.includes('pro');

              return (
                <button
                  key={r.id}
                  id={`btn-reasoning-${r.id}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => updateReasoningLevel(r.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isDisabled
                      ? 'opacity-40 cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400'
                      : isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800'
                  }`}
                  title={isDisabled ? 'Minimal thinking level is not available on Gemini Pro models' : r.description}
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

  // Compact variant for header or toolbar
  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        id="btn-open-model-selector"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-md transition-colors"
        title="Configure Gemini model and reasoning level"
      >
        <Cpu className="w-3.5 h-3.5 text-neutral-500" />
        <span className="hidden sm:inline text-neutral-900">{currentModel.name}</span>
        <span className="text-[11px] text-neutral-500 hidden md:inline">({currentReasoning.label} reasoning)</span>
        <ChevronDown className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id="model-selector-popover"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-lg bg-white border border-neutral-200 shadow-lg p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
            <div>
              <h4 className="text-xs font-semibold text-neutral-900">Model and reasoning</h4>
              <p className="text-[11px] text-neutral-500">Configure language engine and thinking depth</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-mono">
              @google/genai
            </span>
          </div>

          {/* Model selection */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-neutral-500">Gemini model</div>
            <div className="space-y-1">
              {MODEL_OPTIONS.map((opt) => {
                const isSelected = modelSettings.model === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    id={`popover-model-${opt.id}`}
                    type="button"
                    onClick={() => updateModel(opt.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-md transition-colors flex items-start justify-between gap-2 ${
                      isSelected ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={`w-3.5 h-3.5 mt-0.5 ${isSelected ? 'text-neutral-900' : 'text-neutral-400'}`} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">{opt.name}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">({opt.tag})</span>
                        </div>
                        <p className="text-[11px] text-neutral-500 line-clamp-1">{opt.description}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-neutral-900 flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reasoning level selection */}
          <div className="space-y-1.5 border-t border-neutral-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500">Reasoning level</span>
              <span className="text-[10px] text-neutral-400">{currentReasoning.label}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {REASONING_OPTIONS.map((r) => {
                const isSelected = modelSettings.reasoningLevel === r.id;
                const isDisabled = r.id === 'minimal' && modelSettings.model.includes('pro');

                return (
                  <button
                    key={r.id}
                    id={`popover-reasoning-${r.id}`}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => updateReasoningLevel(r.id)}
                    className={`text-left px-2 py-1.5 rounded-md border text-xs transition-colors ${
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed border-neutral-100 bg-neutral-50 text-neutral-400'
                        : isSelected
                        ? 'border-neutral-900 bg-neutral-900 text-white font-medium'
                        : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                    }`}
                    title={isDisabled ? 'Minimal reasoning is not supported on Pro' : r.description}
                  >
                    <div className="flex items-center justify-between">
                      <span>{r.label}</span>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-2 border-t border-neutral-100 text-[10px] text-neutral-400 flex items-center justify-between">
            <span>Applied to analysis, synthesis, and rewrites</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-neutral-700 hover:text-neutral-900 font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
