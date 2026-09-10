import type { ModelChoice, ReasoningLevelChoice } from './types';

export type AIProvider = 'gemini' | 'openai' | 'openrouter';

export interface ModelReasoning {
  efforts: ReasoningLevelChoice[];
  source: 'provider' | 'documentation';
}

export interface ModelOption { id: ModelChoice; name: string; reasoning?: ModelReasoning }

export const PROVIDER_NAMES: Record<AIProvider, string> = {
  gemini: 'Gemini', openai: 'OpenAI', openrouter: 'OpenRouter',
};

export const GEMINI_MODELS: ModelOption[] = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', reasoning: { efforts: ['low', 'medium', 'high'], source: 'documentation' } },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', reasoning: { efforts: ['low', 'medium', 'high'], source: 'documentation' } },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', reasoning: { efforts: ['minimal', 'low', 'medium', 'high'], source: 'documentation' } },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', reasoning: { efforts: ['low', 'medium', 'high'], source: 'documentation' } },
];

// Gemini's Generate Content model resource does not expose effort choices.
// Checked 2026-09-09: https://ai.google.dev/gemini-api/docs/generate-content/thinking
// OpenRouter supplies these choices directly in its model catalog instead.
export const OPENROUTER_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function isReasoningLevelChoice(value: unknown): value is ReasoningLevelChoice {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value);
}

export function reasoningLabel(value: string): string {
  if (value === 'auto') return 'Auto (model default)';
  if (value === 'xhigh') return 'Extra high';
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

/** undefined means capability metadata is unavailable, not that effort is off. */
export function knownModelReasoning(value: string): ModelReasoning | undefined {
  const { provider, model } = parseModelChoice(value);
  if (provider === 'gemini') return GEMINI_MODELS.find((model) => model.id === value)?.reasoning;
  if (provider === 'openai') {
    // OpenAI /models supplies identifiers, not effort metadata. Match only
    // documented model IDs and their dated snapshots, never a future family.
    // Checked 2026-09-09: https://developers.openai.com/api/docs/models
    const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    const efforts = Object.hasOwn(OPENAI_MODEL_EFFORTS, base) ? OPENAI_MODEL_EFFORTS[base] : undefined;
    return efforts ? { efforts, source: 'documentation' } : undefined;
  }
  return undefined;
}

export function validateModelReasoning(value: string, effort: unknown): asserts effort is ReasoningLevelChoice {
  if (!isReasoningLevelChoice(effort)) throw new Error('Reasoning must be a supported effort name of at most 32 characters.');
  if (effort === 'auto') return;
  const known = knownModelReasoning(value);
  if (known && !known.efforts.includes(effort)) {
    throw new Error(`${modelDisplayName(value)} does not support ${reasoningLabel(effort)} reasoning. Choose ${['auto', ...known.efforts].map(reasoningLabel).join(', ')}.`);
  }
}

const OPENAI_MODEL_EFFORTS: Record<string, string[]> = {
  'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-sol': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-terra': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.6-luna': ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  'gpt-5.5': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.5-pro': ['medium', 'high', 'xhigh'],
  'gpt-5.4': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-mini': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-nano': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.4-pro': ['medium', 'high', 'xhigh'],
  'gpt-5.2': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.2-pro': ['medium', 'high', 'xhigh'],
  'gpt-5.1': ['none', 'low', 'medium', 'high'],
  'gpt-5': ['minimal', 'low', 'medium', 'high'],
  'gpt-5-mini': ['minimal', 'low', 'medium', 'high'],
  'gpt-5-nano': ['minimal', 'low', 'medium', 'high'],
  'o1': ['low', 'medium', 'high'],
  'o3': ['low', 'medium', 'high'],
  'o4-mini': ['low', 'medium', 'high'],
  'gpt-4.1': [],
};

export function parseModelChoice(value: unknown): { provider: AIProvider; model: string } {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Model choice is invalid.');
  if (/^gemini-[a-zA-Z0-9._-]+$/.test(value)) return { provider: 'gemini', model: value };
  const match = /^(openai|openrouter):([a-zA-Z0-9~][a-zA-Z0-9._:/~-]*)$/.exec(value);
  if (!match || (match[1] === 'openai' && /[/:]/.test(match[2]))) {
    throw new Error('Model choice is invalid. Choose Gemini, or enter an OpenAI or OpenRouter model ID.');
  }
  return { provider: match[1] as AIProvider, model: match[2] };
}

export function isModelChoice(value: unknown): value is ModelChoice {
  try {
    const parsed = parseModelChoice(value);
    return parsed.provider !== 'gemini' || GEMINI_MODELS.some((option) => option.id === parsed.model);
  } catch { return false; }
}

export function modelDisplayName(value: string): string {
  if (value.startsWith('openai:')) return `OpenAI · ${value.slice(7)}`;
  if (value.startsWith('openrouter:')) return `OpenRouter · ${value.slice(11)}`;
  return GEMINI_MODELS.find((option) => option.id === value)?.name || value;
}
