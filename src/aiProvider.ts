// Server-only transport; browser settings contain model IDs, never credentials.
import { Agent } from 'undici';
import { isModelChoice, isReasoningLevelChoice, knownModelReasoning, OPENROUTER_EFFORTS, parseModelChoice, PROVIDER_NAMES, validateModelReasoning, type AIProvider, type ModelOption, type ModelReasoning } from './modelChoice';
import type { ReasoningLevelChoice } from './types';

// Node fetch otherwise stops waiting for headers after five minutes, even when
// the caller's AbortSignal allows longer. Only generation uses this dispatcher;
// its signal still bounds the entire request, including response-body reading.
const generationDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

function transportError(label: string, error: unknown): Error {
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  const detail = code === 'UND_ERR_HEADERS_TIMEOUT' ? 'timed out waiting for response headers'
    : code === 'UND_ERR_BODY_TIMEOUT' ? 'timed out receiving the response'
    : code === 'UND_ERR_CONNECT_TIMEOUT' ? 'timed out connecting'
    : code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' ? 'closed before the response completed'
    : undefined;
  // Retain only recognized transport codes; upstream errors can contain secrets.
  return detail ? new Error(`${label} connection ${detail}. Please retry.`, { cause: { code } })
    : new Error(`${label} request failed or timed out. Please retry.`);
}

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; [key: string]: unknown };

function jsonSchema(schema: Schema): Schema {
  return {
    ...schema,
    ...(schema.type ? { type: schema.type.toLowerCase() } : {}),
    ...(schema.properties ? { properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, jsonSchema(value)])) } : {}),
    ...(schema.items ? { items: jsonSchema(schema.items) } : {}),
  };
}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

function openRouterReasoning(value: unknown): ModelReasoning | undefined {
  // The provider documents an absent reasoning object/efforts field as no
  // effort selector; null supported_efforts means all gateway efforts.
  // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
  if (value === undefined || value === null) return { efforts: [], source: 'provider' };
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const efforts = raw.supported_efforts === null ? OPENROUTER_EFFORTS
    : raw.supported_efforts === undefined ? []
    : Array.isArray(raw.supported_efforts) ? raw.supported_efforts
    : undefined;
  if (!efforts || !efforts.every(isReasoningLevelChoice)) return undefined;
  return { efforts: [...new Set(efforts)].filter(effort => effort !== 'auto' && !(raw.mandatory === true && effort === 'none')), source: 'provider' };
}

export async function listProviderModels(
  provider: Exclude<AIProvider, 'gemini'>,
  dependencies: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<ModelOption[]> {
  const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  const apiKey = (dependencies.env || process.env)[keyName]?.trim();
  const label = PROVIDER_NAMES[provider];
  if (!apiKey) throw new Error(`Connect ${label} to browse its models.`);
  const url = provider === 'openai' ? 'https://api.openai.com/v1/models' : 'https://openrouter.ai/api/v1/models';
  let response: Response;
  try {
    response = await (dependencies.fetch || fetch)(url, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error(`Could not load ${label} models. Try again.`); }
  if (!response.ok) throw new Error(`Could not load ${label} models (${response.status}). Check the connection and try again.`);
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result?.data)) throw new Error(`${label} returned an invalid model list. Try again.`);
  const models = new Map<string, ModelOption>();
  for (const item of result.data) {
    if (!item || typeof item.id !== 'string') continue;
    const id = `${provider}:${item.id}`;
    if (!isModelChoice(id)) continue;
    // OpenRouter supplies modalities; OpenAI's list only supplies IDs.
    // Exclude dedicated non-chat endpoints, without claiming full compatibility.
    if (provider === 'openrouter' && (!Array.isArray(item.architecture?.output_modalities) || !item.architecture.output_modalities.includes('text'))) continue;
    if (provider === 'openai' && (!/^(gpt-|chatgpt-|o\d|ft:)/.test(item.id)
      || /(?:embedding|image|audio|realtime|transcribe|tts|search|deep-research|codex|computer-use)/.test(item.id))) continue;
    const reasoning = provider === 'openrouter' ? openRouterReasoning(item.reasoning) : knownModelReasoning(id);
    models.set(id, { id, name: typeof item.name === 'string' && item.name.trim() ? item.name : item.id, ...(reasoning ? { reasoning } : {}) });
  }
  return [...models.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateExternalContent(params: {
  model: string;
  contents: string | Part[];
  reasoningLevel?: ReasoningLevelChoice;
  signal?: AbortSignal;
  config?: { systemInstruction?: string; responseMimeType?: string; responseSchema?: Schema };
}, dependencies: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}) {
  const { provider, model } = parseModelChoice(params.model);
  if (provider === 'gemini') throw new Error('Gemini uses its native transport.');
  validateModelReasoning(params.model, params.reasoningLevel ?? 'auto');
  const label = provider === 'openai' ? 'OpenAI' : 'OpenRouter';
  const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  const apiKey = (dependencies.env || process.env)[keyName]?.trim();
  if (!apiKey) throw new Error(`Connect ${label} in Models → API connections before using this model.`);

  const config = params.config || {};
  const content = typeof params.contents === 'string' ? params.contents : params.contents.map((part) => {
    if (typeof part.text === 'string') return { type: 'text', text: part.text };
    if (part.inlineData?.mimeType === 'application/pdf' && typeof part.inlineData.data === 'string') {
      return { type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${part.inlineData.data}` } };
    }
    throw new Error(`${label} received an unsupported input part.`);
  });
  const messages: Array<{ role: string; content: unknown }> = [];
  if (config.systemInstruction) messages.push({ role: 'system', content: config.systemInstruction });
  if (config.responseMimeType === 'application/json') {
    messages.push({ role: 'system', content: 'Return only valid JSON matching the supplied response schema.' });
  }
  messages.push({ role: 'user', content });
  const body: Record<string, unknown> = { model, messages, stream: false };
  if (provider === 'openai') body.store = false;
  // Require routing support rather than silently dropping schema/reasoning settings.
  if (provider === 'openrouter') body.provider = { require_parameters: true };
  if (params.reasoningLevel && params.reasoningLevel !== 'auto') {
    if (provider === 'openrouter') body.reasoning = { effort: params.reasoningLevel };
    else body.reasoning_effort = params.reasoningLevel;
  }
  if (config.responseMimeType === 'application/json') {
    body.response_format = config.responseSchema
      ? { type: 'json_schema', json_schema: { name: 'personascript_result', strict: false, schema: jsonSchema(config.responseSchema) } }
      : { type: 'json_object' };
  }
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions';
  const signal = params.signal ?? AbortSignal.timeout(180_000);
  const requestOptions: RequestInit & { dispatcher: Agent } = {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    dispatcher: generationDispatcher,
  };
  let response: Response;
  try {
    response = await (dependencies.fetch || fetch)(url, requestOptions);
  } catch (error) {
    signal.throwIfAborted();
    throw transportError(label, error);
  }
  // Do not relay upstream bodies: authentication errors can echo credentials.
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const advice = response.status === 401 || response.status === 403 ? `Check ${keyName} and model access.`
      : response.status === 402 ? 'Check your provider credit balance.'
      : response.status === 429 ? 'Rate limit or quota reached. Check your provider limits and retry later.'
      : response.status === 400 || response.status === 404 ? 'Check the model ID and its support for the selected reasoning depth, structured output, or PDF input.'
      : 'Please retry later.';
    throw new Error(`${label} API error (${response.status}). ${advice}`);
  }
  const result = await response.json().catch((error) => {
    signal.throwIfAborted();
    if (error instanceof SyntaxError) throw new Error(`${label} returned an invalid response.`);
    throw transportError(label, error);
  });
  if (result.error) throw new Error(`${label} could not complete the request. Check model access, supported settings, and provider limits.`);
  const choice = result.choices?.[0];
  if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw new Error(`${label} declined this request.`);
  if (choice?.finish_reason !== 'stop') throw new Error(`${label} stopped before returning a complete result. Please retry.`);
  if (typeof choice.message?.content !== 'string' || !choice.message.content.trim()) throw new Error(`${label} returned no text.`);
  return {
    text: choice.message.content as string,
    candidates: [{ finishReason: 'STOP' }],
    modelExecuted: `${provider}:${typeof result.model === 'string' && result.model ? result.model : model}`,
    usageMetadata: { promptTokenCount: result.usage?.prompt_tokens, candidatesTokenCount: result.usage?.completion_tokens },
  };
}
