import { generateExternalContent, listProviderModels } from './src/aiProvider';
import { connectProvider, disconnectProvider, ConnectionError, requireLocalConnectionRequest } from './src/providerConnections';
import { isReasoningLevelChoice, knownModelReasoning, parseModelChoice, validateModelReasoning } from './src/modelChoice';
import { validateFeedbackUpdate } from './src/utils/voiceFeedback';
import { buildEditorialPlanPrompt, EDITORIAL_PLAN_SCHEMA, PLAN_SYSTEM_INSTRUCTION, validatePlanSources, validateApprovedPlan, validateGeneratedPlan } from './src/editorialPlan';
import type { EditorialPlan, ReasoningLevelChoice } from './src/types';
import {
  buildPlanSourceAuditPrompt,
  PLAN_SOURCE_AUDIT_SCHEMA,
  PLAN_SOURCE_AUDIT_SYSTEM_INSTRUCTION,
  planSourceAuditContext,
  planSourceAuditFindings,
  validatePlanSourceAudit,
  type PlanAssertionAudit,
} from './src/planAssertionReview';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { cleanPdfPages, cleanSourceText } from './src/sourceText';
import { createServer as createViteServer } from 'vite';
import {
  buildQuickRefinePrompt,
  buildReviewPrompt,
  buildRewritePrompt,
  buildSelectionPrompt,
  normalizeDomainExpertise,
  normalizePreservationSettings,
  validateProjectBrief,
  validateReaderPurpose,
  validateEditorialPreferences,
  REVIEW_SYSTEM_INSTRUCTION,
  runLocalPreservationChecks,
  unavailableReview,
  validateDomainExpertiseInput,
  validateGeneratedReview,
  validateGeneratedProse,
  ValidationError,
  validateWritingCorpus,
  WRITING_SYSTEM_INSTRUCTION,
  type RawWritingSample,
  type SelectionRange,
} from './src/writingPipeline';
import {
  buildDomainGenerationPrompt,
  DOMAIN_GENERATION_SCHEMA,
  validateDomainGenerationRequest,
  validateGeneratedDomainKnowledge,
} from './src/domainGeneration';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Parse credential requests separately, so malformed JSON cannot reach Express's
// default error logger (whose parse errors can include submitted values).
app.use('/api/connections', express.json({ limit: '4kb' }), (error: unknown, req: Request, res: Response, next: NextFunction) => {
  res.set('Cache-Control', 'no-store').status(400).json({ error: 'Could not read the connection. Enter the key and try again.' });
});

// Increase payload limits for documents & PDFs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy Gemini client helper
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Connect Gemini in Models → API connections before using this model.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

class RequestValidationError extends Error {
  readonly statusCode = 400;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value: unknown, label: string, minimumLength = 1): string {
  if (typeof value !== 'string' || value.trim().length < minimumLength) {
    throw new RequestValidationError(`${label} is required${minimumLength > 1 ? ` (minimum ${minimumLength} characters)` : ''}.`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new RequestValidationError(`${label} must be a string.`);
  return value;
}

function requireObject(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new RequestValidationError(`${label} must be an object.`);
  return value;
}

function validateSamplesInput(value: unknown): RawWritingSample[] {
  if (!Array.isArray(value)) throw new RequestValidationError('samples must be an array of writing samples.');
  for (const [index, sample] of value.entries()) {
    if (!isRecord(sample)) throw new RequestValidationError(`samples[${index}] must be an object.`);
    if (typeof sample.id !== 'string' || !sample.id.trim()) throw new RequestValidationError(`samples[${index}].id must be a non-empty string.`);
    if (typeof sample.content !== 'string') throw new RequestValidationError(`samples[${index}].content must be a string.`);
    if (sample.title !== undefined && typeof sample.title !== 'string') throw new RequestValidationError(`samples[${index}].title must be a string.`);
    if (sample.enabled !== undefined && typeof sample.enabled !== 'boolean') throw new RequestValidationError(`samples[${index}].enabled must be a boolean.`);
  }
  try {
    return validateWritingCorpus(value as RawWritingSample[]);
  } catch (error) {
    throw new RequestValidationError(error instanceof Error ? error.message : String(error));
  }
}

function validatePreservationInput(value: unknown): void {
  if (value === undefined || value === null) return;
  const settings = requireObject(value, 'preservationSettings');
  for (const key of ['keepStructure', 'preserveNumbers', 'preserveQuotes', 'preserveTerms'] as const) {
    if (settings[key] !== undefined && typeof settings[key] !== 'boolean') {
      throw new RequestValidationError(`preservationSettings.${key} must be a boolean.`);
    }
  }
  if (settings.headingTreatment !== undefined
    && settings.headingTreatment !== 'revise_in_voice'
    && settings.headingTreatment !== 'preserve_verbatim') {
    throw new RequestValidationError('preservationSettings.headingTreatment is invalid.');
  }
  if (settings.customLocks !== undefined && typeof settings.customLocks !== 'string') {
    throw new RequestValidationError('preservationSettings.customLocks must be a string.');
  }
}

function validateControlInputs(input: {
  model?: unknown;
  reasoningLevel?: unknown;
  analysisModel?: unknown;
  analysisReasoningLevel?: unknown;
  toneAdjustments?: unknown;
  toneEnabled?: unknown;
  domainExpertise?: unknown;
}): void {
  optionalText(input.model, 'model');
  optionalText(input.analysisModel, 'analysisModel');
  optionalText(input.reasoningLevel, 'reasoningLevel');
  optionalText(input.analysisReasoningLevel, 'analysisReasoningLevel');
  for (const [label, value] of [
    ['reasoningLevel', input.reasoningLevel],
    ['analysisReasoningLevel', input.analysisReasoningLevel],
  ] as const) {
    if (value !== undefined && !isReasoningLevelChoice(value)) {
      throw new RequestValidationError(`${label} is invalid.`);
    }
  }
  if (input.toneAdjustments !== undefined && input.toneAdjustments !== null) requireObject(input.toneAdjustments, 'toneAdjustments');
  if (input.toneEnabled !== undefined && typeof input.toneEnabled !== 'boolean') {
    throw new RequestValidationError('toneEnabled must be a boolean.');
  }
  if (input.domainExpertise !== undefined && input.domainExpertise !== null) {
    validateDomainExpertiseInput(input.domainExpertise);
  }
}

function validateSelectionRangeInput(
  value: unknown,
  currentText: string,
  selectedText: string,
): SelectionRange | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)
    || !Number.isInteger(value.start)
    || !Number.isInteger(value.end)) {
    throw new RequestValidationError('selectionRange.start and selectionRange.end must be integers.');
  }
  const range = { start: value.start as number, end: value.end as number };
  if (range.start < 0 || range.end <= range.start || range.end > currentText.length) {
    throw new RequestValidationError('selectionRange is outside the current text.');
  }
  if (currentText.slice(range.start, range.end) !== selectedText) {
    throw new RequestValidationError('selectionRange does not match selectedText. Select the passage again.');
  }
  return range;
}

function statusForError(error: unknown): number {
  if (error instanceof RequestValidationError || error instanceof ValidationError) {
    return error.statusCode;
  }
  return 500;
}

// Lightweight in-memory observability buffer
export interface ApiLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;
  modelRequested: string;
  modelExecuted: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  promptPreview: string;
  responsePreview: string;
  error?: string;
}

const recentLogs: ApiLogEntry[] = [];

function recordApiLog(entry: ApiLogEntry) {
  recentLogs.unshift(entry);
  if (recentLogs.length > 50) {
    recentLogs.pop();
  }
  const tokenStr = (entry.inputTokens !== undefined && entry.outputTokens !== undefined)
    ? ` tokens=${entry.inputTokens}+${entry.outputTokens}`
    : '';
  console.log(`[API ${entry.endpoint}] model=${entry.modelExecuted} (${entry.durationMs}ms)${tokenStr}`);
}

// Resilient helper with retry, reasoning level, and model fallback
async function generateContentWithRetry(params: {
  contents: any;
  config?: any;
  preferredModel?: string;
  reasoningLevel?: ReasoningLevelChoice;
  endpoint?: string;
  /** Writing and review stages must stay on the user-selected model. */
  allowFallback?: boolean;
  signal?: AbortSignal;
}) {
  const startTime = Date.now();
  const selectedModel = params.preferredModel || 'gemini-3.8-flash';
  const { provider } = parseModelChoice(selectedModel);
  const reasoningLevel = params.reasoningLevel ?? 'auto';
  try { validateModelReasoning(selectedModel, reasoningLevel); }
  catch (error) { throw new RequestValidationError(error instanceof Error ? error.message : 'Reasoning is invalid.'); }
  const allowFallback = provider === 'gemini' && params.allowFallback !== false;
  
  // Keep the historical cascade for unrelated analysis/import routes. Writing and
  // review calls opt out so a selected model is never silently replaced.
  const candidateModels: string[] = [selectedModel];
  if (allowFallback) {
    const fallbacks = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'];
    for (const m of fallbacks) {
      if (!candidateModels.includes(m)) candidateModels.push(m);
    }
  }

  const baseConfig = { ...(params.config || {}), ...(params.signal ? { abortSignal: params.signal } : {}) };

  let lastError: any = null;
  for (const model of candidateModels) {
    // A fallback must accept the exact selected effort. Never lower it to make
    // a different Gemini model accept the request.
    const supportedEfforts = knownModelReasoning(model)?.efforts;
    if (reasoningLevel !== 'auto' && supportedEfforts && !supportedEfforts.includes(reasoningLevel)) continue;
    const modelConfig = { ...baseConfig };
    
    if (provider === 'gemini' && reasoningLevel !== 'auto') {
      const level = reasoningLevel.toUpperCase() as ThinkingLevel;
      if (![ThinkingLevel.MINIMAL, ThinkingLevel.LOW, ThinkingLevel.MEDIUM, ThinkingLevel.HIGH].includes(level)) {
        throw new RequestValidationError(`Gemini does not support the reasoning effort ${reasoningLevel}.`);
      }
      modelConfig.thinkingConfig = { thinkingLevel: level };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      params.signal?.throwIfAborted();
      try {
        const response = provider === 'gemini' ? await getGeminiClient().models.generateContent({
          model,
          contents: params.contents,
          config: modelConfig,
        }) : await generateExternalContent({ model, contents: params.contents, config: baseConfig, reasoningLevel: params.reasoningLevel, signal: params.signal });

        const durationMs = Date.now() - startTime;
        (response as any).modelExecuted ||= model;
        (response as any).durationMs = durationMs;

        const promptText = typeof params.contents === 'string'
          ? params.contents
          : JSON.stringify(params.contents);
        const inputTokens = response.usageMetadata?.promptTokenCount;
        const outputTokens = response.usageMetadata?.candidatesTokenCount;

        recordApiLog({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          endpoint: params.endpoint || 'generateContent',
          modelRequested: selectedModel,
          modelExecuted: (response as any).modelExecuted,
          durationMs,
          inputTokens,
          outputTokens,
          promptPreview: promptText.slice(0, 300),
          responsePreview: (response.text || '').slice(0, 300),
        });

        return response;
      } catch (err: any) {
        params.signal?.throwIfAborted();
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();

        // If quota is exhausted, a fallback is only allowed for legacy routes.
        if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
          if (allowFallback) {
            console.warn(`Model ${model} quota reached, falling back to next available model.`);
          }
          break;
        }

        // For temporary 503 / high demand, retry once with delay
        if ((msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('overloaded')) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        break; // try next candidate model
      }
    }
  }

  // Format clean error message if all candidates fail
  const rawMsg = lastError?.message || String(lastError);
  const promptText = typeof params.contents === 'string'
    ? params.contents
    : JSON.stringify(params.contents);

  recordApiLog({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    endpoint: params.endpoint || 'generateContent',
    modelRequested: selectedModel,
    modelExecuted: 'FAILED',
    durationMs: Date.now() - startTime,
    promptPreview: promptText.slice(0, 300),
    responsePreview: '',
    error: rawMsg,
  });

  if (provider === 'gemini' && (rawMsg.toLowerCase().includes('429') || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('resource_exhausted'))) {
    throw new Error('Gemini API quota exceeded for free tier. Please retry in a few moments, switch to Gemini 3.1 Flash Lite, or configure a paid API key in AI Studio Settings.');
  }
  throw lastError || new Error('Model generation failed across all available models.');
}

// 1. Health check & Observability endpoints
app.get('/api/health', (req: Request, res: Response) => {
  const providers = { gemini: !!process.env.GEMINI_API_KEY?.trim(), openai: !!process.env.OPENAI_API_KEY?.trim(), openrouter: !!process.env.OPENROUTER_API_KEY?.trim() };
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', hasKey: Object.values(providers).some(Boolean), providers });
});

app.post('/api/connections', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try {
    requireLocalConnectionRequest(req);
    res.json(await connectProvider(req.body));
  } catch (error) {
    // Never log the request body, credentials, or raw provider failures.
    res.status(error instanceof ConnectionError ? error.statusCode : 500).json({
      error: error instanceof ConnectionError ? error.message : 'Could not save the connection. Try again.',
    });
  }
});

app.delete('/api/connections', async (req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  try {
    requireLocalConnectionRequest(req);
    res.json(await disconnectProvider(req.body));
  } catch (error) {
    res.status(error instanceof ConnectionError ? error.statusCode : 500).json({
      error: error instanceof ConnectionError ? error.message : 'Could not remove the key. Try again.',
    });
  }
});

app.get('/api/models', async (req: Request, res: Response) => {
  const provider = req.query.provider;
  if (provider !== 'openai' && provider !== 'openrouter') {
    return res.status(400).json({ error: 'Choose OpenAI or OpenRouter.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json({ models: await listProviderModels(provider) });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Could not load models.' });
  }
});

app.get('/api/logs', (req: Request, res: Response) => {
  res.json({ logs: recentLogs });
});

// 2. Extract text from uploaded document (docx, pdf, txt)
app.post('/api/extract-text', async (req: Request, res: Response) => {
  try {
    const { fileData, fileType, fileName, localOnly, model, reasoningLevel } = req.body;
    if (localOnly !== undefined && typeof localOnly !== 'boolean') {
      return res.status(400).json({ error: 'localOnly must be a boolean.' });
    }
    if (!fileData) {
      return res.status(400).json({ error: 'fileData (base64) is required' });
    }

    let extractedText = '';

    if (fileType === 'docx' || (fileName && fileName.endsWith('.docx'))) {
      const buffer = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileType === 'pdf' || (fileName && fileName.endsWith('.pdf'))) {
      const buffer = Buffer.from(fileData, 'base64');
      
      // 1. Local extraction via pdf-parse: Fast, offline, 0 API quota
      try {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const textResult = await parser.getText({ pageJoiner: '' });
        if (textResult && textResult.text && textResult.text.trim().length > 10) {
          extractedText = cleanPdfPages(textResult.pages.map(page => page.text));
        }
        await parser.destroy();
      } catch (pdfErr) {
        console.warn('Local PDFParse could not parse document, attempting fallback:', pdfErr);
      }

      // 2. If text is empty (e.g. scanned document), use the selected analysis model
      if (!extractedText || extractedText.trim().length === 0) {
        if (localOnly) {
          return res.status(400).json({
            error: 'Could not extract usable text from this PDF locally. Please paste the text instead.',
          });
        }
        const response = await generateContentWithRetry({
          preferredModel: model || 'gemini-3.1-flash-lite',
          reasoningLevel,
          allowFallback: false,
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: fileData,
              },
            },
            {
              text: 'Extract and return the entire, complete clean text from this document accurately. Preserve paragraph divisions and headings. Return ONLY the raw extracted text with no introductions, markdown code fences, or additional conversational commentary.',
            },
          ],
        });
        extractedText = response.text || '';
      }
    } else {
      // plain text / markdown
      const buffer = Buffer.from(fileData, 'base64');
      extractedText = buffer.toString('utf-8');
    }

    const wordCount = extractedText.trim().split(/\s+/).filter(Boolean).length;
    res.json({
      text: extractedText.trim(),
      wordCount,
      charCount: extractedText.length,
      fileName,
    });
  } catch (error: any) {
    console.error('Error in /api/extract-text:', error);
    res.status(500).json({ error: error.message || 'Failed to extract text from document' });
  }
});

// Helper to strip HTML tags and decode common entities
function cleanHtmlText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper to extract clean article title and structured text with paragraph preservation
function extractArticleFromHtml(html: string, fallbackHost: string): { title: string; text: string; siteName: string } {
  // Extract og:site_name or host
  const siteMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i) ||
                    html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:site_name["']/i);
  const siteName = siteMatch ? cleanHtmlText(siteMatch[1]) : fallbackHost;

  // Extract title
  let title = '';
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
  if (ogTitleMatch && ogTitleMatch[1].trim()) {
    title = cleanHtmlText(ogTitleMatch[1]);
  } else {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1].trim()) {
      title = cleanHtmlText(h1Match[1]);
    } else {
      const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1].trim()) {
        title = cleanHtmlText(titleTagMatch[1]);
      }
    }
  }

  // Clean out clutter elements
  const uncluttered = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Look for semantic article body container first
  const articleMatch = uncluttered.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       uncluttered.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                       uncluttered.match(/<div[^>]*class=["'][^"']*(?:post-content|article-content|entry-content|story-body|prose|post_body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  const targetHtml = articleMatch ? articleMatch[1] : uncluttered;

  // Convert block elements into clean paragraph spacing
  let formatted = targetHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

  // If formatted text is too short, fallback to uncluttered body
  if (formatted.length < 150 && articleMatch) {
    formatted = cleanHtmlText(uncluttered);
  }

  return {
    title: title || 'Imported Article',
    text: formatted,
    siteName,
  };
}

// 2a. Direct Fetch of an Individual Link (no alignment required)
app.post('/api/fetch-link', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string' || url.trim().length < 3) {
      return res.status(400).json({ error: 'Please provide a valid web link or article URL.' });
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format. Please enter a full URL (e.g., https://example.com/article).' });
    }

    const resp = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: `Unable to access page (HTTP ${resp.status} ${resp.statusText}). If this article is behind a login or paywall, please paste the text directly in the Paste Text tab.`,
      });
    }

    const html = await resp.text();
    const { title, text, siteName } = extractArticleFromHtml(html, parsedUrl.hostname);

    if (!text || text.trim().length < 40) {
      return res.status(400).json({
        error: 'Could not extract article text from this link. The page might rely heavily on client-side scripts or login. Please use the Paste Text tab instead.',
      });
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    res.json({
      title,
      content: text,
      wordCount,
      charCount: text.length,
      url: cleanUrl,
      siteName,
    });
  } catch (err: any) {
    console.error('Error in /api/fetch-link:', err);
    res.status(500).json({
      error: `Could not fetch link (${err.message || 'connection failed'}). Please check the URL or use the Paste Text tab.`,
    });
  }
});

// 2b. Discover Writing Portfolio Pieces from a Website Link
app.post('/api/discover-portfolio', async (req: Request, res: Response) => {
  try {
    const { url, targetAudience, writingType, model, reasoningLevel } = req.body;

    if (!url || typeof url !== 'string' || url.trim().length < 3) {
      return res.status(400).json({ error: 'A valid portfolio or website URL is required.' });
    }

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(cleanUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format. Please provide a full URL like https://yourportfolio.com' });
    }

    // 1. Fetch the main portfolio / website page
    let html = '';
    try {
      const resp = await fetch(cleanUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!resp.ok) {
        return res.status(resp.status).json({
          error: `Unable to access website (HTTP ${resp.status} ${resp.statusText}). Please check the URL or paste your writing samples directly.`,
        });
      }
      html = await resp.text();
    } catch (fetchErr: any) {
      console.error('Fetch error for portfolio URL:', fetchErr);
      return res.status(400).json({
        error: `Could not connect to ${cleanUrl} (${fetchErr.message || 'network timeout'}). Please verify the address or use the Paste Text tab.`,
      });
    }

    // Extract site title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const siteTitle = titleMatch ? cleanHtmlText(titleMatch[1]) : parsedUrl.hostname;

    // Extract page body text
    const cleanBody = cleanHtmlText(html);

    // Extract candidate article links
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const discoveredLinks: Array<{ title: string; url: string }> = [];
    const seenUrls = new Set<string>();

    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const rawHref = linkMatch[1].trim();
      const rawAnchor = cleanHtmlText(linkMatch[2]);

      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, cleanUrl);
        if (resolved.hostname === parsedUrl.hostname || resolved.hostname.endsWith(`.${parsedUrl.hostname}`)) {
          const fullLink = resolved.toString();
          const path = resolved.pathname.toLowerCase();

          // Match article-like path structures
          const isArticlePath =
            path.includes('/p/') || // Substack
            path.includes('/post') ||
            path.includes('/article') ||
            path.includes('/blog/') ||
            path.includes('/essay') ||
            path.includes('/writing/') ||
            path.includes('/work/') ||
            path.includes('/case-study') ||
            (path.split('/').filter(Boolean).length >= 2 && !path.endsWith('.png') && !path.endsWith('.jpg') && !path.endsWith('.css') && !path.endsWith('.js'));

          if (isArticlePath && rawAnchor.length >= 6 && rawAnchor.length <= 110 && !seenUrls.has(fullLink)) {
            seenUrls.add(fullLink);
            discoveredLinks.push({ title: rawAnchor, url: fullLink });
          }
        }
      } catch {}

      if (discoveredLinks.length >= 10) break;
    }

    // Fetch substantial body content for top 2 linked articles to provide authentic long-form text
    const linkedArticlesContext: Array<{ title: string; url: string; sampleContent: string }> = [];
    for (const link of discoveredLinks.slice(0, 3)) {
      try {
        const aResp = await fetch(link.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (aResp.ok) {
          const aHtml = await aResp.text();
          const aText = cleanHtmlText(aHtml);
          if (aText.length > 250) {
            linkedArticlesContext.push({
              title: link.title,
              url: link.url,
              sampleContent: aText.slice(0, 3000),
            });
          }
        }
      } catch {}
    }

    const promptContext = `You are an elite editorial scout, authorial curator, and computational linguist.
A user has provided their online writing portfolio/site: ${cleanUrl}
Site Title: "${siteTitle}"
User's Target Audience Goal: "${targetAudience || 'General audience / broad readership'}"
User's Desired Writing Type: "${writingType || 'Thought leadership, essays, and core domain writing'}"

AVAILABLE CONTENT FROM PORTFOLIO SITE:
Main Page Text Snippet (first 4000 characters):
"""
${cleanBody.slice(0, 4000)}
"""

DISCOVERED ARTICLE / WRITING LINKS:
${discoveredLinks.map((l, i) => `${i + 1}. Title: "${l.title}" | URL: ${l.url}`).join('\n') || 'None found separately (use main page articles)'}

FETCHED SAMPLE ARTICLE EXCERPTS:
${linkedArticlesContext.map((a, i) => `--- Piece ${i + 1}: "${a.title}" (${a.url}) ---
${a.sampleContent.slice(0, 1500)}
`).join('\n\n') || 'No external article links fetched; extract distinct pieces from main page text.'}

YOUR MISSION:
1. Identify 2 to 5 distinct writing pieces, essays, articles, or substantive posts from the author's portfolio.
2. For each piece:
   - Extract or formulate a substantial, high-fidelity sample excerpt ('content', 250-600 words of real representative writing from this piece).
   - Evaluate its stylistic alignment with the target audience ("${targetAudience || 'General'}") and writing type ("${writingType || 'General'}").
   - Assign an 'alignmentScore' (1 to 100) reflecting how well this piece's voice, depth, and tone fit the target audience.
   - Provide a concise 1-2 sentence 'alignmentRationale' explaining why this piece is (or is not) well-suited.
   - Set 'recommended: true' for the top 2-3 pieces that represent the best stylistic model.
3. Provide an encouraging 'agentSummary' (2-3 sentences) evaluating the author's portfolio and highlighting why the recommended pieces were selected.`;

    const response = await generateContentWithRetry({
      contents: promptContext,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            agentSummary: {
              type: Type.STRING,
              description: 'A 2-3 sentence overview explaining what was discovered on the site and why specific pieces are recommended for the audience.',
            },
            pieces: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  url: { type: Type.STRING },
                  excerpt: { type: Type.STRING, description: 'A 1-2 sentence summary of this piece' },
                  content: { type: Type.STRING, description: 'Substantial representative sample text (at least 200-500 words)' },
                  wordCount: { type: Type.NUMBER },
                  detectedType: { type: Type.STRING, description: 'e.g. Technical Guide, Essay, Thought Leadership, Narrative' },
                  alignmentScore: { type: Type.NUMBER, description: 'Score 1-100 indicating match with target audience' },
                  alignmentRationale: { type: Type.STRING, description: 'Why this piece aligns with the target audience' },
                  recommended: { type: Type.BOOLEAN, description: 'True for top pieces best aligned with the audience' },
                  targetAudienceMatch: { type: Type.STRING, description: 'Brief label e.g. High Fit for Tech Leaders' },
                },
                required: ['title', 'excerpt', 'content', 'detectedType', 'alignmentScore', 'alignmentRationale', 'recommended'],
              },
            },
          },
          required: ['agentSummary', 'pieces'],
        },
      },
    });

    const parsedData = JSON.parse(response.text || '{}');
    const piecesWithDefaults = (parsedData.pieces || []).map((p: any, idx: number) => ({
      id: p.id || `portfolio-${Date.now()}-${idx}`,
      title: p.title || `Portfolio Piece ${idx + 1}`,
      url: p.url || cleanUrl,
      excerpt: p.excerpt || '',
      content: p.content || '',
      wordCount: p.wordCount || (p.content || '').trim().split(/\s+/).filter(Boolean).length,
      detectedType: p.detectedType || 'Essay',
      alignmentScore: typeof p.alignmentScore === 'number' ? p.alignmentScore : 85,
      alignmentRationale: p.alignmentRationale || 'Representative sample from author portfolio.',
      recommended: typeof p.recommended === 'boolean' ? p.recommended : idx < 2,
      targetAudienceMatch: p.targetAudienceMatch || 'Good Match',
    }));

    res.json({
      siteTitle,
      siteUrl: cleanUrl,
      targetAudience: targetAudience || 'General Audience',
      writingType: writingType || 'Thought Leadership',
      agentSummary: parsedData.agentSummary || `Discovered ${piecesWithDefaults.length} writing pieces from ${siteTitle}.`,
      pieces: piecesWithDefaults,
    });
  } catch (error: any) {
    console.error('Error in /api/discover-portfolio:', error);
    res.status(500).json({ error: error.message || 'Failed to discover portfolio pieces from website' });
  }
});

// 3. Deep Linguistic Analysis of a writing sample
app.post('/api/analyze-sample', async (req: Request, res: Response) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.on('close', cancel);
  const timeout = setTimeout(() => controller.abort(new DOMException('Analysis timed out.', 'TimeoutError')), 600_000);
  try {
    const { text, title, fileType, pdfBase64, model, reasoningLevel } = req.body;

    let contentsPayload: any[];

    if (pdfBase64) {
      contentsPayload = [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        {
          text: `You are a world-class computational linguist, literary analyst, and prose stylist. Analyze this writing sample titled "${title || 'Untitled'}" across deep linguistic criteria: word choice, sentence structure, rhythm, voice, and tone.
          Return a structured JSON evaluation adhering strictly to the schema. Be precise, observant, and insightful.`,
        },
      ];
    } else {
      if (!text || text.trim().length < 20) {
        return res.status(400).json({ error: 'Writing sample text must be at least 20 characters.' });
      }
      contentsPayload = [
        {
          text: `You are a world-class computational linguist, literary analyst, and prose stylist. Analyze this writing sample titled "${title || 'Untitled'}" across deep linguistic criteria:
1. Word Choice & Lexicon: vocabulary level, sensory richness (1-100), favored word types and registers, avoided patterns (buzzwords, cliches, hedges), and recurring key phrases.
2. Sentence Structure & Syntax: average sentence length, length distribution (% short <10 words, % medium 10-25 words, % long >25 words), syntax type, active voice percentage, punctuation habits (em dashes, semicolons, parentheticals, fragments), and common sentence openers.
3. Rhythm, Cadence & Pacing: cadence description, burstiness score (1-100 measure of variation in adjacent sentence lengths), paragraph pacing, and transition style.
4. Voice: authorial persona, perspective (first_person, third_person, second_person_inclusive, or mixed), intimacy score (1-100), irony level (1-100), and authority posture.
5. Tone: formality score (1-100), warmth score (1-100), confidence score (1-100), emotional resonance, and primary attributes.
6. Rules: 5-7 concrete, actionable writing rules that emulate this author's exact style.
7. Notable Excerpts: 2-3 specific quotes from the sample with brief commentary on what stylistic principle they demonstrate.

WRITING SAMPLE:
"""
${text}
"""`,
        },
      ];
    }

    const response = await generateContentWithRetry({
      contents: contentsPayload,
      signal: controller.signal,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'A 2-3 sentence distillation of what makes this piece unique and distinctive.',
            },
            wordChoice: {
              type: Type.OBJECT,
              properties: {
                vocabularyLevel: { type: Type.STRING },
                sensoryRichness: { type: Type.NUMBER, description: '1 to 100' },
                favoredRegisters: { type: Type.ARRAY, items: { type: Type.STRING } },
                lexicalDensity: { type: Type.STRING },
                avoidedPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
                keyPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['vocabularyLevel', 'sensoryRichness', 'favoredRegisters', 'lexicalDensity', 'avoidedPatterns', 'keyPhrases'],
            },
            sentenceStructure: {
              type: Type.OBJECT,
              properties: {
                avgSentenceLength: { type: Type.NUMBER },
                lengthDistribution: {
                  type: Type.OBJECT,
                  properties: {
                    shortUnder10: { type: Type.NUMBER },
                    medium10to25: { type: Type.NUMBER },
                    longOver25: { type: Type.NUMBER },
                  },
                  required: ['shortUnder10', 'medium10to25', 'longOver25'],
                },
                syntaxType: { type: Type.STRING },
                activeVoicePercentage: { type: Type.NUMBER },
                punctuationSignatures: {
                  type: Type.OBJECT,
                  properties: {
                    emDashes: { type: Type.STRING, description: 'frequent, moderate, or rare' },
                    semicolons: { type: Type.STRING, description: 'frequent, moderate, or rare' },
                    parentheticals: { type: Type.STRING, description: 'frequent, moderate, or rare' },
                    fragments: { type: Type.STRING, description: 'frequent, moderate, or rare' },
                  },
                  required: ['emDashes', 'semicolons', 'parentheticals', 'fragments'],
                },
                sentenceOpeners: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['avgSentenceLength', 'lengthDistribution', 'syntaxType', 'activeVoicePercentage', 'punctuationSignatures', 'sentenceOpeners'],
            },
            rhythmAndPacing: {
              type: Type.OBJECT,
              properties: {
                cadence: { type: Type.STRING },
                burstinessScore: { type: Type.NUMBER, description: '1 to 100' },
                paragraphLength: { type: Type.STRING },
                transitionStyle: { type: Type.STRING },
              },
              required: ['cadence', 'burstinessScore', 'paragraphLength', 'transitionStyle'],
            },
            voice: {
              type: Type.OBJECT,
              properties: {
                persona: { type: Type.STRING },
                perspective: { type: Type.STRING, description: 'first_person, third_person, second_person_inclusive, or mixed' },
                intimacy: { type: Type.NUMBER, description: '1 to 100' },
                ironyLevel: { type: Type.NUMBER, description: '1 to 100' },
                authorityPosture: { type: Type.STRING },
              },
              required: ['persona', 'perspective', 'intimacy', 'ironyLevel', 'authorityPosture'],
            },
            tone: {
              type: Type.OBJECT,
              properties: {
                formalityScore: { type: Type.NUMBER, description: '1 to 100' },
                warmthScore: { type: Type.NUMBER, description: '1 to 100' },
                confidenceScore: { type: Type.NUMBER, description: '1 to 100' },
                emotionalResonance: { type: Type.STRING },
                primaryAttributes: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['formalityScore', 'warmthScore', 'confidenceScore', 'emotionalResonance', 'primaryAttributes'],
            },
            rules: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '5-7 actionable rewrite rules representing this style.',
            },
            notableExcerpts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  quote: { type: Type.STRING },
                  commentary: { type: Type.STRING },
                },
                required: ['quote', 'commentary'],
              },
            },
          },
          required: ['summary', 'wordChoice', 'sentenceStructure', 'rhythmAndPacing', 'voice', 'tone', 'rules', 'notableExcerpts'],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || '{}');
    res.json(parsedJson);
  } catch (error: any) {
    if (res.destroyed) return;
    if (controller.signal.aborted) {
      res.status(504).json({ error: 'Analysis reached the 10-minute limit. Your sample is still available. Please try again.' });
      return;
    }
    console.error('Error in /api/analyze-sample:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze writing sample' });
  } finally {
    clearTimeout(timeout);
    res.off('close', cancel);
  }
});

// 4. Synthesize multiple analyses into a master Style Profile
app.post('/api/synthesize-profile', async (req: Request, res: Response) => {
  try {
    const { samples, profileName, currentProfile, model, reasoningLevel } = req.body;
    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'At least one writing sample is required' });
    }


    const sampleSummaries = samples.map((s: any, idx: number) => {
      const a = s.analysis || {};
      return `Sample ${idx + 1}: "${s.title}"
Word count: ${s.wordCount}
Summary: ${a.summary || 'N/A'}
Word Choice: ${JSON.stringify(a.wordChoice || {})}
Sentence Structure: ${JSON.stringify(a.sentenceStructure || {})}
Rhythm & Cadence: ${JSON.stringify(a.rhythmAndPacing || {})}
Voice: ${JSON.stringify(a.voice || {})}
Tone: ${JSON.stringify(a.tone || {})}
Rules: ${(a.rules || []).join('; ')}
Sample Excerpt: "${(s.content || '').trim().slice(0, 1500)}..."`;
    }).join('\n\n---\n\n');

    const prompt = `You are a master literary editor. You are tasked with synthesizing multiple writing analyses from the same author into a unified, qualitative "Writing Style Profile" (Voice Blueprint).

SAMPLES DATA:
${sampleSummaries}

CURRENT USER-OWNED SETTINGS (preserve exactly; these are not generated style hints):
Custom directives: ${currentProfile?.customDirectives || 'None'}
Domain expertise: ${JSON.stringify(currentProfile?.domainExpertise || {})}

Synthesize a comprehensive profile including:
1. An evocative profile name (or use: "${profileName || 'Master Writing Voice'}") and a 2-3 sentence overview description.
2. Metrics (numbers 1-100): formality, avgSentenceLength (approx words per sentence), sentenceLengthVariance (1-100), lexicalSophistication (1-100), warmth (1-100), directness (1-100), activeVoiceRatio (1-100), metaphorDensity (1-100).
3. Voice Manifesto: A vivid, second-person manifesto (e.g. "You write with...") describing how the author thinks, sounds, and sculpts language.
4. Synthesized Guidelines:
   - doList: 5-6 concrete things to always do when emulating this author
   - dontList: 5-6 stylistic taboos / things to never do
   - signatureHabits: 3-5 unique stylistic quirks or structural signatures
   - vocabularyPreferences: 3-4 bullet points of favored words and avoided replacements
   - pacingGuide: 2-3 sentences describing paragraph and sentence flow
5. Custom Directives: Keep the current user-owned custom directives unchanged. Do not replace them with generated prose.
6. Domain expertise: Do not replace or erase the current domain field, topics, terminology, conventions, audience context, or custom notes.`;

    const response = await generateContentWithRetry({
      endpoint: '/api/synthesize-profile',
      contents: prompt,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            metrics: {
              type: Type.OBJECT,
              properties: {
                formality: { type: Type.NUMBER },
                avgSentenceLength: { type: Type.NUMBER },
                sentenceLengthVariance: { type: Type.NUMBER },
                lexicalSophistication: { type: Type.NUMBER },
                warmth: { type: Type.NUMBER },
                directness: { type: Type.NUMBER },
                activeVoiceRatio: { type: Type.NUMBER },
                metaphorDensity: { type: Type.NUMBER },
              },
              required: ['formality', 'avgSentenceLength', 'sentenceLengthVariance', 'lexicalSophistication', 'warmth', 'directness', 'activeVoiceRatio', 'metaphorDensity'],
            },
            voiceManifesto: { type: Type.STRING },
            synthesizedGuidelines: {
              type: Type.OBJECT,
              properties: {
                doList: { type: Type.ARRAY, items: { type: Type.STRING } },
                dontList: { type: Type.ARRAY, items: { type: Type.STRING } },
                signatureHabits: { type: Type.ARRAY, items: { type: Type.STRING } },
                vocabularyPreferences: { type: Type.ARRAY, items: { type: Type.STRING } },
                pacingGuide: { type: Type.STRING },
              },
              required: ['doList', 'dontList', 'signatureHabits', 'vocabularyPreferences', 'pacingGuide'],
            },
            customDirectives: { type: Type.STRING },
          },
          required: ['name', 'description', 'metrics', 'voiceManifesto', 'synthesizedGuidelines', 'customDirectives'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const synthesizedProfile = {
      id: currentProfile?.id || `profile-${Date.now()}`,
      sampleIds: samples.map((s: any) => s.id),
      updatedAt: new Date().toISOString(),
      ...parsed,
      customDirectives: currentProfile?.customDirectives ?? parsed.customDirectives ?? '',
      domainExpertise: currentProfile?.domainExpertise,
    };

    res.json(synthesizedProfile);
  } catch (error: any) {
    console.error('Error in /api/synthesize-profile:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize style profile' });
  }
});

// 5. Shared corpus-grounded writing and review pipeline. New requests use plain
// prose generation followed by a separate review call; historical records remain
// readable on the client through their optional legacy fields.
async function reviewWrittenText(input: {
  sourceText: string;
  editorialPlan?: EditorialPlan;
  projectBrief?: string;
  readerPurpose?: string;
  editorialPreferences?: string;
  finalText: string;
  profile?: any;
  samples: RawWritingSample[];
  preservationSettings?: any;
  preservationLocks?: string;
  customInstructions?: string;
  domainExpertise?: any;
  analysisModel?: string;
  analysisReasoningLevel?: string;
  endpoint: string;
  intensity?: 'polish' | 'faithful' | 'transform';
  previousText?: string;
  selectionRange?: SelectionRange;
}) {
  const localChecks = runLocalPreservationChecks(
    input.sourceText,
    input.finalText,
    input.preservationSettings,
    input.projectBrief,
  );
  const reviewStart = Date.now();
  const requestedAnalysisModel = input.analysisModel || 'gemini-3.1-pro-preview';
  const auditReasoningLevel = input.analysisReasoningLevel || 'auto';
  let sourceAudit: PlanAssertionAudit | undefined;
  let sourceAuditFindings: ReturnType<typeof planSourceAuditFindings> = [];

  // Approved plans are audited before the prose reviewer sees the generated
  // text. This applies to versioned and legacy plans so history follow-ups do
  // not bypass the source-evidence boundary.
  if (input.editorialPlan) {
    const auditInput = {
      draft: input.sourceText,
      projectBrief: input.projectBrief,
      editorialPlan: input.editorialPlan,
    };
    try {
      const auditResponse = await generateContentWithRetry({
        endpoint: `${input.endpoint}/plan-source-audit`,
        contents: buildPlanSourceAuditPrompt(auditInput),
        preferredModel: requestedAnalysisModel,
        reasoningLevel: auditReasoningLevel as any,
        allowFallback: false,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: PLAN_SOURCE_AUDIT_SYSTEM_INSTRUCTION,
          responseSchema: PLAN_SOURCE_AUDIT_SCHEMA,
        },
      });
      sourceAudit = validatePlanSourceAudit(auditResponse.text, auditResponse, auditInput);
      sourceAuditFindings = planSourceAuditFindings(sourceAudit);
    } catch (error) {
      // An audit that could not run is reported, not allowed to take the
      // prose review down with it. The reviewer then runs without audit context.
      const message = error instanceof Error ? error.message : String(error);
      console.error('[review] plan source audit failed:', message);
      sourceAuditFindings = [{
        category: 'editorial',
        severity: 'warning',
        detail: `The suggestions could not be checked against the draft and brief this time (${message}). Run the review again to retry.`,
      }];
    }
  }

  try {
    const response = await generateContentWithRetry({
      endpoint: input.endpoint,
      contents: `${buildReviewPrompt(input)}${sourceAudit ? planSourceAuditContext(sourceAudit) : ''}`,
      preferredModel: requestedAnalysisModel,
      reasoningLevel: input.analysisReasoningLevel as any,
      allowFallback: false,
      config: {
        responseMimeType: 'application/json',
        systemInstruction: REVIEW_SYSTEM_INSTRUCTION,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            findings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: {
                    type: Type.STRING,
                    enum: ['omission', 'claim', 'addition', 'preservation', 'editorial', 'local-check'],
                  },
                  severity: {
                    type: Type.STRING,
                    enum: ['info', 'warning', 'error'],
                  },
                  detail: { type: Type.STRING },
                  evidence: { type: Type.STRING },
                },
                required: ['category', 'severity', 'detail'],
              },
            },
          },
          required: ['summary', 'findings'],
        },
      },
    });
    const parsed = validateGeneratedReview(response.text, response);
    return {
      status: 'complete' as const,
      summary: sourceAuditFindings.length
        ? `Source audit found ${sourceAuditFindings.length} issue${sourceAuditFindings.length === 1 ? '' : 's'}. Draft review: ${parsed.summary}`
        : parsed.summary,
      findings: [...sourceAuditFindings, ...parsed.findings],
      voiceObservations: parsed.voiceObservations,
      localChecks,
      modelUsed: (response as any).modelExecuted || requestedAnalysisModel,
      durationMs: Date.now() - reviewStart,
    };
  } catch (error) {
    console.error('[review] draft review failed:', error instanceof Error ? error.message : error);
    const unavailable = unavailableReview(error, localChecks);
    // Preserve a successfully completed source audit even when the later
    // prose-compliance request is unavailable.
    unavailable.findings = sourceAuditFindings;
    unavailable.modelUsed = requestedAnalysisModel;
    unavailable.durationMs = Date.now() - reviewStart;
    return unavailable;
  }
}

app.post('/api/generate-domain-knowledge', async (req: Request, res: Response) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.on('close', cancel);
  const timeout = setTimeout(() => controller.abort(new DOMException('Domain generation timed out.', 'TimeoutError')), 600_000);
  try {
    const validatedInput = validateDomainGenerationRequest(req.body);
    const prompt = buildDomainGenerationPrompt({
      field: validatedInput.field,
      disciplines: validatedInput.disciplines,
      existingTopics: validatedInput.existingTopics,
      targetTopic: validatedInput.targetTopic,
      draft: validatedInput.draft,
      projectBrief: validatedInput.projectBrief,
    });

    const response = await generateContentWithRetry({
      contents: prompt,
      preferredModel: validatedInput.model,
      reasoningLevel: validatedInput.reasoningLevel,
      endpoint: 'generate-domain-knowledge',
      allowFallback: false,
      signal: controller.signal,
      config: {
        responseMimeType: 'application/json',
        responseSchema: DOMAIN_GENERATION_SCHEMA,
      },
    });

    const topics = validateGeneratedDomainKnowledge(response.text, response as any, Boolean(validatedInput.draft || validatedInput.projectBrief));
    if (validatedInput.targetTopic && (topics.length !== 1 ||
        topics[0].name !== validatedInput.targetTopic.name ||
        topics[0].category !== validatedInput.targetTopic.category)) {
      throw new Error('The model did not return the requested card. Existing knowledge has not been replaced.');
    }
    controller.signal.throwIfAborted();
    return res.json({ topics });
  } catch (error: any) {
    if (res.destroyed) return;
    if (controller.signal.aborted) {
      return res.status(504).json({ error: 'Domain generation reached the 10-minute limit. Your existing knowledge has been kept. Please try again.' });
    }
    console.error('Error generating domain knowledge:', error);
    return res.status(statusForError(error)).json({
      error: error.message || 'Failed to generate domain knowledge',
    });
  } finally {
    clearTimeout(timeout);
    res.off('close', cancel);
  }
});

app.post('/api/plan-draft', async (req: Request, res: Response) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.on('close', cancel);
  const timeout = setTimeout(() => controller.abort(new DOMException('Editorial planning timed out.', 'TimeoutError')), 600_000);
  try {
    const body = requireObject(req.body, 'Request');
    if (Object.keys(body).some(key => !['draft', 'projectBrief', 'readerPurpose', 'editorialPreferences', 'customInstructions', 'model', 'reasoningLevel'].includes(key))) {
      throw new RequestValidationError('Planning accepts only the draft, brief, reader and purpose, writing instructions, preferences, and model settings.');
    }
    const sources = validatePlanSources(body.draft, body.projectBrief, body.readerPurpose, body.editorialPreferences, body.customInstructions);
    validateControlInputs({ model: body.model, reasoningLevel: body.reasoningLevel });
    const model = optionalText(body.model, 'model') || 'gemini-3.1-pro-preview';
    try { parseModelChoice(model); } catch (error) { throw new RequestValidationError(error instanceof Error ? error.message : 'Model choice is invalid.'); }
    const response = await generateContentWithRetry({
      endpoint: '/api/plan-draft',
      contents: buildEditorialPlanPrompt(sources),
      preferredModel: model,
      reasoningLevel: body.reasoningLevel as any,
      allowFallback: false,
      signal: controller.signal,
      config: { responseMimeType: 'application/json', systemInstruction: PLAN_SYSTEM_INSTRUCTION, responseSchema: EDITORIAL_PLAN_SCHEMA },
    });
    controller.signal.throwIfAborted();
    res.json({
      plan: validateGeneratedPlan(response.text, response, sources),
      modelUsed: (response as any).modelExecuted || model,
      durationMs: (response as any).durationMs,
    });
  } catch (error: any) {
    if (res.destroyed) return;
    if (controller.signal.aborted) {
      return res.status(504).json({ error: 'Preparing suggestions reached the 10-minute limit. Your draft and any previous suggestions are unchanged. Please try again.' });
    }
    res.status(statusForError(error)).json({ error: error.message || 'Could not propose editorial decisions.' });
  } finally {
    clearTimeout(timeout);
    res.off('close', cancel);
  }
});

app.post('/api/rewrite-draft', async (req: Request, res: Response) => {
  try {
    const operationStart = Date.now();
    const {
      draft,
      projectBrief,
      readerPurpose,
      editorialPreferences,
      profile,
      intensity,
      preservationLocks,
      preservationSettings,
      customInstructions,
      toneAdjustments,
      toneEnabled,
      domainExpertise,
      samples,
      model,
      reasoningLevel,
      analysisModel,
      analysisReasoningLevel,
    } = req.body;

    const draftText = cleanSourceText(requireText(draft, 'Draft text', 10));
    const validProjectBrief = projectBrief == null ? validateProjectBrief(projectBrief) : cleanSourceText(validateProjectBrief(projectBrief) || '');
    const validReaderPurpose = validateReaderPurpose(readerPurpose);
    const validEditorialPreferences = validateEditorialPreferences(editorialPreferences);
    const editorialPlan = validateApprovedPlan(req.body.editorialPlan, { draft: draftText, projectBrief: validProjectBrief || '', readerPurpose: validReaderPurpose || '', editorialPreferences: validEditorialPreferences, customInstructions });
    requireObject(profile, 'profile');
    if (intensity !== undefined && !['polish', 'faithful', 'transform'].includes(intensity)) {
      throw new RequestValidationError('intensity is invalid.');
    }
    optionalText(preservationLocks, 'preservationLocks');
    optionalText(customInstructions, 'customInstructions');
    validatePreservationInput(preservationSettings);
    validateControlInputs({ model, reasoningLevel, analysisModel, analysisReasoningLevel, toneAdjustments, toneEnabled, domainExpertise });
    const corpus = validateSamplesInput(samples);
    const domainInput = domainExpertise || profile.domainExpertise;
    validateDomainExpertiseInput(domainInput);
    const activeDomain = normalizeDomainExpertise(domainInput);
    const normalizedPreservation = normalizePreservationSettings(preservationSettings, preservationLocks);
    const selectedModel = model || 'gemini-3.8-flash';
    const response = await generateContentWithRetry({
      endpoint: '/api/rewrite-draft',
      contents: buildRewritePrompt({
        draft: draftText,
        projectBrief: validProjectBrief,
        readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
        editorialPlan: editorialPlan?.plan,
        profile,
        samples: corpus,
        intensity,
        preservationSettings: normalizedPreservation,
        preservationLocks,
        customInstructions,
        toneAdjustments,
        toneEnabled,
        domainExpertise: activeDomain,
      }),
      preferredModel: selectedModel,
      reasoningLevel,
      allowFallback: false,
      config: { responseMimeType: 'text/plain', systemInstruction: WRITING_SYSTEM_INSTRUCTION },
    });
    const rewrittenText = validateGeneratedProse(response.text, response);
    const review = await reviewWrittenText({
      sourceText: draftText,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan: editorialPlan?.plan,
      finalText: rewrittenText,
      profile,
      samples: corpus,
      preservationSettings: normalizedPreservation,
      preservationLocks,
      customInstructions,
      domainExpertise: activeDomain,
      analysisModel,
      analysisReasoningLevel,
      endpoint: '/api/rewrite-draft/review',
      intensity,
    });
    const wordCountOriginal = draftText.trim().split(/\s+/).filter(Boolean).length;
    const wordCountRewritten = rewrittenText.split(/\s+/).filter(Boolean).length;

    res.json({
      id: `rewrite-${Date.now()}`,
      profileId: profile.id,
      profileName: profile.name,
      modelUsed: (response as any).modelExecuted || selectedModel,
      durationMs: Date.now() - operationStart,
      writingDurationMs: (response as any).durationMs,
      intensity,
      originalText: draftText,
      rewrittenText,
      wordCountOriginal,
      wordCountRewritten,
      changesExplanation: 'Plain-prose rewrite completed. Review findings are shown below.',
      review,
      toneAdjustments: toneAdjustments || undefined,
      domainExpertise: activeDomain,
      feedbackItems: [],
      createdAt: new Date().toISOString(),
      customInstructions,
      preservationLocks,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan,
      preservationSettings: normalizedPreservation,
      writingModelUsed: (response as any).modelExecuted || selectedModel,
      analysisModelUsed: review.modelUsed || analysisModel || 'gemini-3.1-pro-preview',
    });
  } catch (error: any) {
    console.error('Error in /api/rewrite-draft:', error);
    const message = error.message || 'Failed to rewrite draft';
    res.status(statusForError(error)).json({ error: message });
  }
});

// 6. Learn from User Feedback on Rewritten Text to update Style Profile
app.post('/api/learn-from-feedback', async (req: Request, res: Response) => {
  try {
    const { feedbackItems, profile, rewrittenText, model, reasoningLevel } = req.body;

    if (!feedbackItems || !Array.isArray(feedbackItems) || feedbackItems.length === 0) {
      return res.status(400).json({ error: 'At least one feedback item is required' });
    }
    if (!profile) {
      return res.status(400).json({ error: 'Valid profile is required' });
    }


    const formattedFeedback = feedbackItems
      .map(
        (f: any, idx: number) =>
          `[Item ${idx + 1}]
Selected text/phrase: "${f.selectedText}"
User tag/reaction: ${f.label || f.tag} (${f.tag})
User custom notes: ${f.note || 'None'}`
      )
      .join('\n\n');

    const prompt = `You are a master linguistic profiler and writing style modeler.
A user has evaluated a rewritten draft against their personal Writing Style Profile and provided specific feedback on highlighted phrases/sentences.

CURRENT STYLE PROFILE:
Name: ${profile.name}
Metrics: Formality: ${profile.metrics?.formality || 65}, AvgSentenceLength: ${profile.metrics?.avgSentenceLength || 15}, Directness: ${profile.metrics?.directness || 80}, Lexical: ${profile.metrics?.lexicalSophistication || 80}
Voice Manifesto: ${profile.voiceManifesto}
Do List: ${(profile.synthesizedGuidelines?.doList || []).join('; ')}
Don't List: ${(profile.synthesizedGuidelines?.dontList || []).join('; ')}
Signature Habits: ${(profile.synthesizedGuidelines?.signatureHabits || []).join('; ')}
Vocabulary Preferences: ${(profile.synthesizedGuidelines?.vocabularyPreferences || []).join('; ')}

REWRITTEN TEXT EXCERPT CONTEXT:
"""
${(rewrittenText || '').slice(0, 1500)}
"""

USER'S FEEDBACK ITEMS ON SPECIFIC PHRASES:
${formattedFeedback}

YOUR MISSION:
Synthesize the user's specific feedback and refine their Style Profile so future rewrites perfectly incorporate these learned preferences.
- If the user flagged phrases as 'too formal', adjust the tone guidelines towards warmer, more direct, conversational prose and nudge formality score down.
- If the user flagged phrases as 'not my voice', determine the exact syntactic or lexical defect and add an explicit taboo to the don'tList.
- If the user flagged phrases as 'good', reinforce those habits in signatureHabits and doList.
- If the user flagged phrases as 'too verbose' or 'awkward cadence', add actionable pacing directives.
- If the user flagged phrases as 'domain inaccurate', record domain preference corrections.

Generate an updated StyleProfile object, along with a clear summary of what was learned.`;

    const response = await generateContentWithRetry({
      contents: prompt,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            learningSummary: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-4 bullet points explaining what new nuances were learned from the feedback.',
            },
            rulesAdded: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Explicit new rules added to the doList or dontList.',
            },
            metricAdjustments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  metric: { type: Type.STRING, description: 'Name of the adjusted metric (e.g. Formality, Directness)' },
                  delta: { type: Type.STRING, description: 'Description of adjustment e.g. "-5 (more conversational)"' },
                },
                required: ['metric', 'delta'],
              },
            },
            updatedProfile: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                voiceManifesto: { type: Type.STRING },
                metrics: {
                  type: Type.OBJECT,
                  properties: {
                    formality: { type: Type.NUMBER },
                    avgSentenceLength: { type: Type.NUMBER },
                    sentenceLengthVariance: { type: Type.NUMBER },
                    lexicalSophistication: { type: Type.NUMBER },
                    warmth: { type: Type.NUMBER },
                    directness: { type: Type.NUMBER },
                    activeVoiceRatio: { type: Type.NUMBER },
                    metaphorDensity: { type: Type.NUMBER },
                  },
                  required: ['formality', 'avgSentenceLength', 'sentenceLengthVariance', 'lexicalSophistication', 'warmth', 'directness', 'activeVoiceRatio', 'metaphorDensity'],
                },
                synthesizedGuidelines: {
                  type: Type.OBJECT,
                  properties: {
                    doList: { type: Type.ARRAY, items: { type: Type.STRING } },
                    dontList: { type: Type.ARRAY, items: { type: Type.STRING } },
                    signatureHabits: { type: Type.ARRAY, items: { type: Type.STRING } },
                    vocabularyPreferences: { type: Type.ARRAY, items: { type: Type.STRING } },
                    pacingGuide: { type: Type.STRING },
                  },
                  required: ['doList', 'dontList', 'signatureHabits', 'vocabularyPreferences', 'pacingGuide'],
                },
                customDirectives: { type: Type.STRING },
              },
              required: ['name', 'voiceManifesto', 'metrics', 'synthesizedGuidelines'],
            },
          },
          required: ['learningSummary', 'rulesAdded', 'metricAdjustments', 'updatedProfile'],
        },
      },
    });

    if (response.candidates?.[0]?.finishReason !== 'STOP') throw new Error('The profile update did not finish. Retry saving your note.');
    const parsed = JSON.parse(response.text || '{}');
    validateFeedbackUpdate(parsed);

    // Preserve IDs and samples while merging updated fields
    const updatedFullProfile = {
      ...profile,
      ...parsed.updatedProfile,
      id: profile.id,
      sampleIds: profile.sampleIds,
      domainExpertise: profile.domainExpertise,
      updatedAt: new Date().toISOString(),
    };

    res.json({
      updatedProfile: updatedFullProfile,
      learningSummary: parsed.learningSummary || [],
      rulesAdded: parsed.rulesAdded || [],
      metricAdjustments: parsed.metricAdjustments || [],
    });
  } catch (error: any) {
    console.error('Error in /api/learn-from-feedback:', error);
    res.status(500).json({ error: error.message || 'Failed to learn from feedback' });
  }
});

// 6. Quick iterative refine on a rewritten draft through the same corpus path.
app.post('/api/quick-refine', async (req: Request, res: Response) => {
  try {
    const operationStart = Date.now();
    const {
      currentText,
      originalText,
      sourceDraft,
      projectBrief,
      readerPurpose,
      editorialPreferences,
      instruction,
      profile,
      samples,
      preservationLocks,
      preservationSettings,
      customInstructions,
      toneAdjustments,
      toneEnabled,
      domainExpertise,
      model,
      reasoningLevel,
      analysisModel,
      analysisReasoningLevel,
    } = req.body;
    const currentTextValue = requireText(currentText, 'currentText');
    const instructionValue = requireText(instruction, 'instruction');
    const validProjectBrief = projectBrief == null ? validateProjectBrief(projectBrief) : cleanSourceText(validateProjectBrief(projectBrief) || '');
    const validReaderPurpose = validateReaderPurpose(readerPurpose);
    const validEditorialPreferences = validateEditorialPreferences(editorialPreferences);
    if (profile !== undefined && profile !== null) requireObject(profile, 'profile');
    const sourceDraftValue = optionalText(sourceDraft, 'sourceDraft');
    const originalTextValue = optionalText(originalText, 'originalText');
    optionalText(preservationLocks, 'preservationLocks');
    optionalText(customInstructions, 'customInstructions');
    validatePreservationInput(preservationSettings);
    validateControlInputs({ model, reasoningLevel, analysisModel, analysisReasoningLevel, toneAdjustments, toneEnabled, domainExpertise });
    const corpus = validateSamplesInput(samples);
    const source = cleanSourceText(sourceDraftValue || originalTextValue || currentTextValue);
    const editorialPlan = validateApprovedPlan(req.body.editorialPlan, { draft: source, projectBrief: validProjectBrief || '', readerPurpose: validReaderPurpose || '', editorialPreferences: validEditorialPreferences, customInstructions: req.body.editorialPlan?.sources?.customInstructions });
    const domainInput = domainExpertise || profile?.domainExpertise;
    validateDomainExpertiseInput(domainInput);
    const activeDomain = normalizeDomainExpertise(domainInput);
    const normalizedPreservation = normalizePreservationSettings(preservationSettings, preservationLocks);
    const selectedModel = model || 'gemini-3.8-flash';
    const response = await generateContentWithRetry({
      endpoint: '/api/quick-refine',
      contents: buildQuickRefinePrompt({
        draft: source,
        projectBrief: validProjectBrief,
        readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
        editorialPlan: editorialPlan?.plan,
        currentText: currentTextValue,
        instruction: instructionValue,
        profile,
        samples: corpus,
        preservationSettings: normalizedPreservation,
        preservationLocks,
        customInstructions,
        toneAdjustments,
        toneEnabled,
        domainExpertise: activeDomain,
      }),
      preferredModel: selectedModel,
      reasoningLevel,
      allowFallback: false,
      config: { responseMimeType: 'text/plain', systemInstruction: WRITING_SYSTEM_INSTRUCTION },
    });
    const refinedText = validateGeneratedProse(response.text, response);
    const review = await reviewWrittenText({
      sourceText: source,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan: editorialPlan?.plan,
      finalText: refinedText,
      profile,
      samples: corpus,
      preservationSettings: normalizedPreservation,
      preservationLocks,
      customInstructions: `${customInstructions || ''}\nRefinement request: ${instructionValue}`,
      domainExpertise: activeDomain,
      analysisModel,
      analysisReasoningLevel,
      endpoint: '/api/quick-refine/review',
      previousText: currentTextValue,
    });
    res.json({
      refinedText,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan,
      tweakSummary: 'Refinement completed. Review findings are shown below.',
      review,
      modelUsed: (response as any).modelExecuted || selectedModel,
      durationMs: Date.now() - operationStart,
      writingDurationMs: (response as any).durationMs,
      writingModelUsed: (response as any).modelExecuted || selectedModel,
      analysisModelUsed: review.modelUsed || analysisModel || 'gemini-3.1-pro-preview',
      preservationSettings: normalizedPreservation,
    });
  } catch (error: any) {
    console.error('Error in /api/quick-refine:', error);
    const message = error.message || 'Failed to refine draft';
    res.status(statusForError(error)).json({ error: message });
  }
});

// 7. Real-time line copy edit on a specific selection. The complete resulting
// text is reviewed against the original source, so earlier omissions stay visible.
app.post('/api/edit-selection', async (req: Request, res: Response) => {
  try {
    const operationStart = Date.now();
    const {
      selectedText,
      selectionRange,
      currentText,
      originalText,
      sourceDraft,
      projectBrief,
      readerPurpose,
      editorialPreferences,
      surroundingContext,
      instruction,
      tag,
      profile,
      samples,
      preservationLocks,
      preservationSettings,
      customInstructions,
      toneAdjustments,
      toneEnabled,
      domainExpertise,
      model,
      reasoningLevel,
      analysisModel,
      analysisReasoningLevel,
    } = req.body;
    const selectedTextValue = requireText(selectedText, 'selectedText');
    const currentTextValue = requireText(currentText, 'currentText');
    const validProjectBrief = projectBrief == null ? validateProjectBrief(projectBrief) : cleanSourceText(validateProjectBrief(projectBrief) || '');
    const validReaderPurpose = validateReaderPurpose(readerPurpose);
    const validEditorialPreferences = validateEditorialPreferences(editorialPreferences);
    if (profile !== undefined && profile !== null) requireObject(profile, 'profile');
    const sourceDraftValue = optionalText(sourceDraft, 'sourceDraft');
    const originalTextValue = optionalText(originalText, 'originalText');
    optionalText(surroundingContext, 'surroundingContext');
    optionalText(instruction, 'instruction');
    optionalText(tag, 'tag');
    optionalText(preservationLocks, 'preservationLocks');
    optionalText(customInstructions, 'customInstructions');
    validatePreservationInput(preservationSettings);
    validateControlInputs({ model, reasoningLevel, analysisModel, analysisReasoningLevel, toneAdjustments, toneEnabled, domainExpertise });
    const corpus = validateSamplesInput(samples);
    const source = cleanSourceText(sourceDraftValue || originalTextValue || currentTextValue);
    const editorialPlan = validateApprovedPlan(req.body.editorialPlan, { draft: source, projectBrief: validProjectBrief || '', readerPurpose: validReaderPurpose || '', editorialPreferences: validEditorialPreferences, customInstructions: req.body.editorialPlan?.sources?.customInstructions });
    const domainInput = domainExpertise || profile?.domainExpertise;
    validateDomainExpertiseInput(domainInput);
    const activeDomain = normalizeDomainExpertise(domainInput);
    const normalizedPreservation = normalizePreservationSettings(preservationSettings, preservationLocks);
    let range = validateSelectionRangeInput(selectionRange, currentTextValue, selectedTextValue);
    if (!range) {
      const first = currentTextValue.indexOf(selectedTextValue);
      const second = first >= 0 ? currentTextValue.indexOf(selectedTextValue, first + selectedTextValue.length) : -1;
      if (first < 0) return res.status(400).json({ error: 'The selected passage is no longer present. Select it again.' });
      if (second >= 0) return res.status(400).json({ error: 'This passage appears more than once. Select the exact occurrence again.' });
      range = { start: first, end: first + selectedTextValue.length };
    }

    const selectedModel = model || 'gemini-3.8-flash';
    const response = await generateContentWithRetry({
      endpoint: '/api/edit-selection',
      contents: buildSelectionPrompt({
        draft: source,
        projectBrief: validProjectBrief,
        readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
        editorialPlan: editorialPlan?.plan,
        currentText: currentTextValue,
        selectedText: selectedTextValue,
        selectionRange: range,
        surroundingContext,
        instruction,
        tag,
        profile,
        samples: corpus,
        preservationSettings: normalizedPreservation,
        preservationLocks,
        customInstructions,
        toneAdjustments,
        toneEnabled,
        domainExpertise: activeDomain,
      }),
      preferredModel: selectedModel,
      reasoningLevel,
      allowFallback: false,
      config: { responseMimeType: 'text/plain', systemInstruction: WRITING_SYSTEM_INSTRUCTION },
    });
    const replacementText = validateGeneratedProse(response.text, response);
    const finalText = currentTextValue.slice(0, range.start) + replacementText + currentTextValue.slice(range.end);
    const review = await reviewWrittenText({
      sourceText: source,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan: editorialPlan?.plan,
      finalText,
      profile,
      samples: corpus,
      preservationSettings: normalizedPreservation,
      preservationLocks,
      customInstructions: `${customInstructions || ''}\nSelection edit: ${instruction || tag || 'voice edit'}`,
      domainExpertise: activeDomain,
      analysisModel,
      analysisReasoningLevel,
      endpoint: '/api/edit-selection/review',
      previousText: currentTextValue,
      selectionRange: range,
    });
    res.json({
      replacementText,
      projectBrief: validProjectBrief,
      readerPurpose: validReaderPurpose,
      editorialPreferences: validEditorialPreferences,
      editorialPlan,
      explanation: 'Selection edit completed. Review findings are shown below.',
      finalText,
      review,
      modelUsed: (response as any).modelExecuted || selectedModel,
      durationMs: Date.now() - operationStart,
      writingDurationMs: (response as any).durationMs,
      writingModelUsed: (response as any).modelExecuted || selectedModel,
      analysisModelUsed: review.modelUsed || analysisModel || 'gemini-3.1-pro-preview',
      preservationSettings: normalizedPreservation,
    });
  } catch (error: any) {
    console.error('Error in /api/edit-selection:', error);
    const message = error.message || 'Failed to edit selection';
    res.status(statusForError(error)).json({ error: message });
  }
});

// Vite middleware & Production static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
