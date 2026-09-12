import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Cpu, Plug, X } from 'lucide-react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { GEMINI_MODELS, OPENROUTER_EFFORTS, PROVIDER_NAMES, isModelChoice, knownModelReasoning, parseModelChoice, reasoningLabel, type AIProvider, type ModelOption } from '../modelChoice';
import type { ModelChoice, ReasoningLevelChoice } from '../types';
import { ModelPicker } from './ModelPicker';
import { ProviderConnections } from './ProviderConnections';

type Role = 'writing' | 'analysis';
const selectClass = 'h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:text-neutral-500';

const RoleModelControls: React.FC<{
  model: ModelChoice;
  reasoning: ReasoningLevelChoice;
  onModel: (model: ModelChoice) => void;
  onReasoning: (level: ReasoningLevelChoice) => void;
}> = ({ model, reasoning, onModel, onReasoning }) => {
  const id = useId();
  const selected = parseModelChoice(model);
  const [provider, setProvider] = useState<AIProvider>(selected.provider);
  const [catalog, setCatalog] = useState<{ provider: AIProvider; models: ModelOption[]; error: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setProvider(parseModelChoice(model).provider); }, [model]);
  useEffect(() => {
    if (provider === 'gemini') return;
    const controller = new AbortController();
    setLoading(true);
    setCatalog(null);
    fetch(`/api/models?provider=${provider}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.models)) throw new Error(data?.error || 'Could not load models. Check API connections.');
        const models = data.models.filter((item: ModelOption) => item && typeof item.name === 'string' && isModelChoice(item.id) && parseModelChoice(item.id).provider === provider);
        if (!controller.signal.aborted) setCatalog({ provider, models, error: '' });
      })
      .catch((error) => { if (!controller.signal.aborted) setCatalog({ provider, models: [], error: error.message || 'Could not load models.' }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [provider, refresh]);
  const sameProvider = provider === selected.provider;
  const models = provider === 'gemini' ? GEMINI_MODELS : catalog?.provider === provider ? catalog.models : [];
  const error = catalog?.provider === provider ? catalog.error : '';
  const reasoningInfo = sameProvider ? models.find(option => option.id === model)?.reasoning ?? knownModelReasoning(model) : undefined;
  const efforts = reasoningInfo?.efforts ?? OPENROUTER_EFFORTS;
  const savedEffortNotListed = reasoning !== 'auto' && !efforts.includes(reasoning);
  return <div className="space-y-4">
    <div>
      <label htmlFor={`${id}-provider`} className="mb-1.5 block text-xs font-medium text-neutral-600">Provider</label>
      <select id={`${id}-provider`} value={provider} onChange={(event) => setProvider(event.target.value as AIProvider)} className={selectClass}>
        {Object.entries(PROVIDER_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </div>
    <ModelPicker key={provider} provider={provider} value={sameProvider ? model : undefined} models={models}
      loading={provider !== 'gemini' && loading} error={error} onRetry={() => setRefresh((value) => value + 1)}
      onSelect={(next) => { if (next !== model) { onModel(next); onReasoning('auto'); } }} />
    {!sameProvider && <p role="status" className="text-xs text-neutral-500">Choose a model to switch to {PROVIDER_NAMES[provider]}.</p>}
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={`${id}-reasoning`} className="text-xs font-medium text-neutral-600">Reasoning</label>
      <select id={`${id}-reasoning`} value={reasoning} disabled={!sameProvider || (efforts.length === 0 && reasoning === 'auto')}
        aria-describedby={`${id}-reasoning-note`}
        onChange={(event) => onReasoning(event.target.value as ReasoningLevelChoice)} className={`${selectClass} max-w-52 !h-9`}>
        <option value="auto">Auto (model default)</option>
        {efforts.map(effort => <option key={effort} value={effort}>{reasoningLabel(effort)}</option>)}
        {savedEffortNotListed && <option value={reasoning}>{reasoningLabel(reasoning)} (saved; not listed)</option>}
      </select>
    </div>
    {sameProvider && <p id={`${id}-reasoning-note`} role={savedEffortNotListed ? 'alert' : undefined} className={`text-xs leading-relaxed ${savedEffortNotListed ? 'text-amber-800' : 'text-neutral-500'}`}>
      {savedEffortNotListed
        ? 'Your saved effort is not listed for this model. Choose an available option; it has not been changed automatically.'
        : reasoningInfo
          ? efforts.length === 0
            ? 'This model does not expose an adjustable reasoning effort.'
            : reasoningInfo.source === 'provider'
              ? 'Options come from this model’s current provider listing. Auto uses its default.'
              : 'Options follow this model’s documentation. Auto uses its default.'
          : 'Model-specific effort choices are unavailable. These are provider effort values; the provider will validate your selection.'}
    </p>}
  </div>;
};

export const ModelSelector: React.FC<{
  variant?: 'compact' | 'inline' | 'card';
  className?: string;
  initialRole?: Role;
}> = ({ variant = 'compact', className = '', initialRole = 'writing' }) => {
  const { modelSettings, modelSettingsRequest, updateWritingModel, updateAnalysisModel, updateWritingReasoningLevel, updateAnalysisReasoningLevel } = useWritingAssistant();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(initialRole);
  const [connections, setConnections] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasConnections = useRef(false);
  const id = useId();
  const compact = variant === 'compact';
  useEffect(() => {
    if (!compact || !modelSettingsRequest.sequence) return;
    setRole(modelSettingsRequest.role);
    setConnections(false);
    setOpen(true);
  }, [modelSettingsRequest.sequence, compact]);
  useEffect(() => {
    if (connections) panel.current?.querySelector<HTMLButtonElement>('[aria-label="Back to models"]')?.focus();
    else if (wasConnections.current) panel.current?.querySelector<HTMLButtonElement>('[data-connections]')?.focus();
    wasConnections.current = connections;
  }, [connections]);
  useEffect(() => {
    if (!open || !compact) return;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open, compact]);
  const isWriting = role === 'writing';
  const content = <>
    {(compact || connections) && <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {connections && <button type="button" aria-label="Back to models" onClick={() => setConnections(false)} className="-ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-100"><ArrowLeft className="size-4" /></button>}
        <h3 id={`${id}-title`} className="text-sm font-semibold text-neutral-900">{connections ? 'API connections' : 'Models'}</h3>
      </div>
      {compact && <button type="button" aria-label="Close model settings" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"><X className="size-4" /></button>}
    </div>}
    {connections ? <><ProviderConnections /><button type="button" onClick={() => {
      updateWritingModel('gemini-3.8-flash'); updateAnalysisModel('gemini-3.1-pro-preview');
      updateWritingReasoningLevel('auto'); updateAnalysisReasoningLevel('auto'); setConnections(false);
    }} className="mt-4 text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900">Restore default model choices</button></> : <>
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1" role="group" aria-label="Model role">
        {(['writing', 'analysis'] as const).map((value) => <button type="button" key={value} aria-pressed={role === value}
          onClick={() => setRole(value)} className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${role === value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}>
          {value === 'writing' ? 'Drafting' : 'Review & analysis'}
        </button>)}
      </div>
      <p className="mb-5 text-xs text-neutral-500">{isWriting ? 'Writes and revises your drafts.' : 'Reviews drafts, samples, and voice guidance.'}</p>
      <RoleModelControls key={role} model={isWriting ? modelSettings.writingModel : modelSettings.analysisModel}
        reasoning={isWriting ? modelSettings.writingReasoningLevel : modelSettings.analysisReasoningLevel}
        onModel={isWriting ? updateWritingModel : updateAnalysisModel}
        onReasoning={isWriting ? updateWritingReasoningLevel : updateAnalysisReasoningLevel} />
      <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3">
        <button type="button" data-connections onClick={() => setConnections(true)} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-950"><Plug className="size-3.5" /> API connections</button>
        <span className="text-[11px] text-neutral-500">Applies to your next action</span>
      </div>
    </>}
  </>;
  return <div className={`${compact ? 'relative' : ''} ${className}`} ref={root}>
    {compact && <button id="btn-open-model-selector" ref={trigger} type="button" aria-expanded={open} aria-controls={`${id}-panel`} aria-haspopup="dialog"
      onClick={() => { setOpen((value) => !value); setConnections(false); }}
      className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-100">
      <Cpu className="size-3.5 text-neutral-500" /><span>Models</span><ChevronDown className="size-3 text-neutral-400" />
    </button>}
    {(!compact || open) && <div id={`${id}-panel`} ref={panel} role={compact ? 'dialog' : undefined} aria-labelledby={compact || connections ? `${id}-title` : undefined}
      className={compact ? 'absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-xl' : 'rounded-xl border border-neutral-200 bg-white p-4'}>
      {content}
    </div>}
  </div>;
};
