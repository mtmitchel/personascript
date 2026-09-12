import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { isModelChoice, type AIProvider, type ModelOption } from '../modelChoice';
import type { ModelChoice } from '../types';

export const ModelPicker: React.FC<{
  provider: AIProvider;
  value?: ModelChoice;
  models: ModelOption[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (model: ModelChoice) => void;
}> = ({ provider, value, models, loading, error, onRetry, onSelect }) => {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = models.find((model) => model.id === value);
  const currentName = selected?.name || (value ? value.replace(/^(openai|openrouter):/, '') : '');
  const matches = models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query.toLowerCase().trim()));
  const customId = `${provider}:${query.trim()}`;
  const canUseCustom = provider !== 'gemini' && !matches.length && isModelChoice(customId);
  const options = canUseCustom ? [{ id: customId as ModelChoice, name: `Use model ID “${query.trim()}”` }] : matches;
  const activeIndex = Math.min(active, options.length - 1);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, id]);

  const choose = (model: ModelChoice) => { onSelect(model); setOpen(false); setQuery(''); };
  const show = () => { setOpen(true); setQuery(''); setActive(0); };

  return (
    <div ref={root} className="min-w-0" onBlur={(event) => {
      if (!root.current?.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-neutral-600">Model</label>
      <div className="relative">
        <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
          aria-controls={`${id}-list`} aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off" spellCheck={false} maxLength={180}
          value={open ? query : currentName} placeholder={open ? 'Search models…' : loading ? 'Loading models…' : 'Choose a model'}
          title={currentName} onFocus={show} onClick={() => { if (!open) show(); }}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) show();
              else setActive(Math.max(0, Math.min(options.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1))));
            }
            if (event.key === 'Enter' && open) { event.preventDefault(); if (options[activeIndex]) choose(options[activeIndex].id); }
          }}
          className="h-10 w-full truncate rounded-lg border border-neutral-200 bg-white py-2 pl-3 pr-9 text-sm text-neutral-900 transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900" />
        <span className="pointer-events-none absolute right-3 top-3 text-neutral-400">
          {loading ? <Loader2 className="size-4 animate-spin" /> : open ? <Search className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </div>
      {open && (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          {error && <div className="border-b border-neutral-100 px-3 py-2 text-xs text-neutral-600" role="status">
            {error} <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRetry} className="font-medium text-neutral-900 underline underline-offset-2">Retry</button>
          </div>}
          <ul id={`${id}-list`} role="listbox" aria-label="Models" className="max-h-48 overflow-y-auto py-1">
            {options.map((model, index) => <li key={model.id} id={`${id}-option-${index}`} role="option" aria-selected={model.id === value}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(model.id)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${index === activeIndex ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-700 hover:bg-neutral-50'}`}>
              <span className="min-w-0 break-words">{model.name}</span>
              {model.id === value && <Check className="size-3.5 shrink-0" />}
            </li>)}
          </ul>
          {!options.length && <p className="px-3 py-3 text-xs text-neutral-500" role="status">{loading ? 'Loading models…' : query ? 'No matching models.' : error ? 'You can also enter an exact model ID above.' : 'No models available.'}</p>}
        </div>
      )}
    </div>
  );
};
