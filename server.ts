import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Increase payload limits for documents & PDFs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy Gemini client helper
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing. Please configure it in AI Studio Secrets.');
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
  reasoningLevel?: 'auto' | 'minimal' | 'low' | 'high';
  endpoint?: string;
}) {
  const startTime = Date.now();
  const ai = getGeminiClient();
  const selectedModel = params.preferredModel || 'gemini-3.8-flash';
  
  // Construct resilient cascade of candidate models
  const candidateModels: string[] = [selectedModel];
  const fallbacks = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'];
  for (const m of fallbacks) {
    if (!candidateModels.includes(m)) {
      candidateModels.push(m);
    }
  }

  const baseConfig = { ...(params.config || {}) };

  let lastError: any = null;
  for (const model of candidateModels) {
    const isPro = model.includes('pro');
    const modelConfig = { ...baseConfig };
    
    if (params.reasoningLevel && params.reasoningLevel !== 'auto') {
      let level: ThinkingLevel = ThinkingLevel.LOW;
      if (params.reasoningLevel === 'high') {
        level = ThinkingLevel.HIGH;
      } else if (params.reasoningLevel === 'minimal') {
        level = isPro ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
      } else if (params.reasoningLevel === 'low') {
        level = ThinkingLevel.LOW;
      }
      modelConfig.thinkingConfig = { thinkingLevel: level };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: modelConfig,
        });

        const durationMs = Date.now() - startTime;
        (response as any).modelExecuted = model;
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
          modelExecuted: model,
          durationMs,
          inputTokens,
          outputTokens,
          promptPreview: promptText.slice(0, 300),
          responsePreview: (response.text || '').slice(0, 300),
        });

        return response;
      } catch (err: any) {
        lastError = err;
        const msg = (err?.message || String(err)).toLowerCase();

        // If 429 / quota exceeded on this specific model, break immediately to the next candidate model
        if (msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted')) {
          console.warn(`Model ${model} quota reached, falling back to next available model.`);
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

  if (rawMsg.toLowerCase().includes('429') || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('resource_exhausted')) {
    throw new Error('Gemini API quota exceeded for free tier. Please retry in a few moments, switch to Gemini 3.1 Flash Lite, or configure a paid API key in AI Studio Settings.');
  }
  throw lastError || new Error('Model generation failed across all available models.');
}

// 1. Health check & Observability endpoints
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', hasKey: !!process.env.GEMINI_API_KEY });
});

app.get('/api/logs', (req: Request, res: Response) => {
  res.json({ logs: recentLogs });
});

// 2. Extract text from uploaded document (docx, pdf, txt)
app.post('/api/extract-text', async (req: Request, res: Response) => {
  try {
    const { fileData, fileType, fileName } = req.body;
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
        const textResult = await parser.getText();
        if (textResult && textResult.text && textResult.text.trim().length > 10) {
          extractedText = textResult.text;
        }
        await parser.destroy();
      } catch (pdfErr) {
        console.warn('Local PDFParse could not parse document, attempting fallback:', pdfErr);
      }

      // 2. If text is empty (e.g. scanned document), fallback to Gemini
      if (!extractedText || extractedText.trim().length === 0) {
        const response = await generateContentWithRetry({
          preferredModel: 'gemini-3.1-flash-lite',
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
  try {
    const { text, title, fileType, pdfBase64, model, reasoningLevel } = req.body;
    const ai = getGeminiClient();

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
    console.error('Error in /api/analyze-sample:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze writing sample' });
  }
});

// 4. Synthesize multiple analyses into a master Style Profile
app.post('/api/synthesize-profile', async (req: Request, res: Response) => {
  try {
    const { samples, profileName, currentProfile, model, reasoningLevel } = req.body;
    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'At least one writing sample is required' });
    }

    const ai = getGeminiClient();

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

    const prompt = `You are a master literary editor. You are tasked with synthesizing multiple writing analyses from the same author into a unified, definitive "Writing Style Profile" (Voice Blueprint).

SAMPLES DATA:
${sampleSummaries}

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
5. Custom Directives: A short default guiding principle for rewrites.`;

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
    };

    res.json(synthesizedProfile);
  } catch (error: any) {
    console.error('Error in /api/synthesize-profile:', error);
    res.status(500).json({ error: error.message || 'Failed to synthesize style profile' });
  }
});

// 5. Rewrite Draft to match Style Profile
app.post('/api/rewrite-draft', async (req: Request, res: Response) => {
  try {
    const {
      draft,
      profile,
      intensity,
      preservationLocks,
      preservationSettings,
      customInstructions,
      toneAdjustments,
      domainExpertise,
      exemplars,
      model,
      reasoningLevel,
    } = req.body;

    if (!draft || draft.trim().length < 10) {
      return res.status(400).json({ error: 'Draft text is required (minimum 10 characters).' });
    }
    if (!profile) {
      return res.status(400).json({ error: 'A valid style profile is required for rewriting.' });
    }

    const ai = getGeminiClient();

    // Preservation Controls: Headings vs. Structure
    const headingTreatment = preservationSettings?.headingTreatment || (
      preservationLocks && /headings?\b/i.test(preservationLocks) && !/revise\s+headings/i.test(preservationLocks)
        ? 'preserve_verbatim'
        : 'revise_in_voice'
    );
    const keepStructure = preservationSettings?.keepStructure !== false;
    const preserveNumbers = preservationSettings?.preserveNumbers ?? true;
    const preserveQuotes = preservationSettings?.preserveQuotes ?? true;
    const preserveTerms = preservationSettings?.preserveTerms ?? false;
    const customLocksText = preservationSettings?.customLocks || preservationLocks || '';

    const headingDirective = headingTreatment === 'revise_in_voice'
      ? `HEADINGS & SECTION TITLES (REVISE IN AUTHOR'S VOICE):
   - You MAY and SHOULD revise headings and section titles into the author's authentic voice, punchy tone, and domain register (e.g. action-oriented UX copywriting style, compelling and crisp).
   - Maintain the structural hierarchy and placement of each heading (e.g., if it was an H1, H2, or section title, keep it as the corresponding heading level in the same location).
   - Elevate generic or flat titles into engaging, voice-aligned copy that reflects the author's vocabulary and voice manifesto.`
      : `HEADINGS & SECTION TITLES (PRESERVE VERBATIM):
   - Retain all original headings, subheadings, and section titles character-for-character without alteration.`;

    const structureDirective = keepStructure
      ? `1. STRUCTURAL & PARAGRAPH LAYOUT:
   - Preserve the logical sequence, section flow, and all substantive arguments of the original draft.
   - Maintain the overall structural progression, but you MAY split rambling paragraphs or join fragments where the author's rhythmic cadence and burstiness demand it (including signature single-sentence punch paragraphs).
   - Do NOT turn narrative prose into bullet summaries, or vice versa.
   - ${headingDirective}`
      : `1. STRUCTURAL & PARAGRAPH LAYOUT:
   - Preserve the logical sequence and all substantive arguments of the draft.
   - ${headingDirective}`;

    const locksList: string[] = [];
    if (preserveNumbers) locksList.push('Numbers, statistics, metrics, and quantitative data points');
    if (preserveQuotes) locksList.push('Direct quotations and cited statements');
    if (preserveTerms) locksList.push('Technical terms, proper names, and product names');
    if (headingTreatment === 'preserve_verbatim') locksList.push('Headings and section titles (keep verbatim)');
    if (customLocksText.trim()) locksList.push(customLocksText.trim());

    const formattedLocks = locksList.length > 0
      ? locksList.map((item) => `• ${item}`).join('\n   ')
      : 'Preserve all factual information, names, statistics, quotes, and core intent.';

    const intensityInstructions = {
      polish: `Light Polish (Conservative Phrasing & Flow):
- Keep existing sentence boundaries and paragraph structure largely intact.
- Tighten slack phrasing, eliminate passive voice, and inject the author's preferred tactile vocabulary choices.
- Preserve 100% of factual data and logical points.`,
      faithful: `Balanced (Faithful Voice Match):
- Recast sentences line-by-line to embody the author's exact syntactic rhythm, burstiness, vocabulary level, voice, and tone.
- Balance expansive clauses with punchy statements.
- Strip bureaucratic padding, corporate throat-clearing, and management jargon; preserve all substantive arguments and data.`,
      transform: `Thorough (Deep Stylistic Transformation):
- Completely and comprehensively recast the entire draft through the author's authentic stylistic lens: tactile verbs, sharp rhythmic cadence, and sensory analogies.
- Radically prune corporate filler, administrative justification, and consulting abstractions.
- Translate every technical mechanism into concrete, human reality.
- Preserve core facts, metrics, and arguments, but give the prose genuine authorial presence.`,
    }[intensity as 'polish' | 'faithful' | 'transform'] || 'Balanced (Faithful Voice Match)';

    // Tone & Voice Sliders instructions
    const tone = toneAdjustments || { formality: 65, enthusiasm: 50, conciseness: 50 };
    const formalityDesc =
      tone.formality > 70
        ? `Elevated & Precise (${tone.formality}/100): Elegant, muscular, treatise-grade articulation without bureaucratic or corporate jargon.`
        : tone.formality < 40
        ? `Low Formality (${tone.formality}/100): Conversational, intimate, grounded, highly approachable, colloquial flow.`
        : `Grounded & Direct (${tone.formality}/100): Tactile, unpretentious, authentic, and clear. Zero corporate or academic stiffness.`;

    const enthusiasmDesc =
      tone.enthusiasm > 70
        ? `High Enthusiasm (${tone.enthusiasm}/100): Inspiring, kinetic, bold conviction, active rallying energy.`
        : tone.enthusiasm < 40
        ? `Subdued Enthusiasm (${tone.enthusiasm}/100): Understated, calm, analytical, cool poise, zero cheerleading.`
        : `Balanced Enthusiasm (${tone.enthusiasm}/100): Natural conviction and steady, quiet confidence.`;

    const concisenessDesc =
      tone.conciseness > 70
        ? `High Conciseness (${tone.conciseness}/100): Crisp phrasing and vigorous verbs within each sentence. Eliminate verbal padding and throat-clearing, cutting word count by 25-40% while preserving all core facts and arguments.`
        : tone.conciseness < 40
        ? `Expansive Conciseness (${tone.conciseness}/100): Lyrical, richly descriptive, generous room for nuance, sensory detail, and flowing cadences.`
        : `Balanced Conciseness (${tone.conciseness}/100): Crisp pacing with rhythmic breathing room, cutting unnecessary fluff while keeping all substantive points intact.`;

    // Domain expertise instructions: Grounded context, NEVER a glossary dump
    const activeDomain = domainExpertise || profile.domainExpertise;
    let domainInstructions = 'General intellectual and professional non-fiction.';
    if (activeDomain && activeDomain.enabled) {
      const disciplinesList = activeDomain.disciplines && activeDomain.disciplines.length > 0
        ? activeDomain.disciplines.join(', ')
        : (activeDomain.field || 'Product & Technology');

      domainInstructions = `DOMAIN CONTEXT (${disciplinesList}):
- TARGET AUDIENCE: ${activeDomain.audienceContext || 'Domain practitioners and thoughtful leaders'}
- CORE PRINCIPLES: ${(activeDomain.conventions || []).slice(0, 3).join('; ') || 'Be technically accurate and grounded.'}
- CRITICAL ANTI-JARGON DIRECTIVE: Do NOT force marketing buzzwords or a glossary dump into the prose. Ground domain concepts in physical, human interactions and user agency, not abstract consultant speak.`;
    }

    const metricsBlock = profile.metrics ? `
CALIBRATED PROFILE METRICS:
- Formality: ${profile.metrics.formality ?? 65}/100
- Average Sentence Length: ~${profile.metrics.avgSentenceLength ?? 14} words
- Sentence Length Variance (Burstiness): ${profile.metrics.sentenceLengthVariance ?? 80}/100
- Lexical Sophistication: ${profile.metrics.lexicalSophistication ?? 80}/100
- Warmth: ${profile.metrics.warmth ?? 70}/100
- Directness: ${profile.metrics.directness ?? 90}/100
- Active Voice Ratio: ${profile.metrics.activeVoiceRatio ?? 90}/100
- Metaphor Density: ${profile.metrics.metaphorDensity ?? 75}/100` : '';

    let exemplarsBlock = '';
    if (exemplars && Array.isArray(exemplars) && exemplars.length > 0) {
      exemplarsBlock = `\n### AUTHENTIC AUTHOR WRITING EXEMPLARS (Anchor your cadence, rhythm, vocabulary, and sentence variety to these real excerpts):\n` +
        exemplars.map((ex: any, i: number) => `--- Exemplar ${i + 1}: "${ex.title || 'Untitled'}" ---\n${(ex.excerpt || '').trim()}`).join('\n\n') + '\n';
    }

    const systemPrompt = `You are an elite prose stylist, personal ghostwriter, and domain editor. Your mission is to rewrite the user's draft so that it sounds authentically and naturally like the author whose Writing Style Profile and Exemplars are provided.

CRITICAL EDITORIAL MANDATE (ANTI-CORPORATE DEMOLISHER):
1. ZERO TOLERANCE FOR CORPORATE JARGON & ABSTRACTIONS:
   - NEVER use consulting/MBA filler: "lever" (as a metaphor), "scale" (as a verb for business growth), "friction points", "decision points", "high-leverage", "technical debt" (unless literally discussing broken software code), "content design rigor", "synergies", "alignment", "stakeholders", "deliverables", "streamline", "utilize", "optimize", "bandwidth", "paradigm", "holistic", "ecosystem".
   - NEVER use resume-padding preambles: "Collaborating closely with X, I led the strategy to...", "In order to ensure optimal outcomes...", "It was determined that...", "Set out to scale...".
2. THE PHYSICAL TRANSLATION RULE:
   - Translate all abstract business claims into physical human reality and tactile craft:
     * BAD: "These friction points create prime opportunities where extra capacity delivers immediate high-leverage value."
     * GOOD: "When a translator hits a paywall at 2 AM, they don't want a sales pitch. They want to finish their work."
     * BAD: "I led the content design strategy to transform these dead ends into transparent, high-converting decision points."
     * GOOD: "We tore down the dead ends and built clear doors."
3. RADICAL CONDENSATION (PERMISSION TO CUT FLUFF):
   - You have explicit permission to cut 20% to 40% of bloated corporate word count.
   - Strip corporate throat-clearing, administrative justification, and hollow adverbs.
   - Preserve all real facts, numbers, test metrics, and core reasoning—but compress the delivery into lean, muscular sentences.
   - Never inflate a simple idea into two paragraphs of MBA jargon.

FEW-SHOT VOICE TRANSFORMATION BENCHMARK:
---
[BEFORE - Corporate Draft]:
"In late 2024, our monetization team set out to scale self-serve conversions. Our primary lever was the in-product upgrade prompt catalog. These friction points—hitting a hard usage ceiling—create prime opportunities where extra capacity delivers immediate, high-leverage value. I led the content design strategy to transform dead ends into transparent, high-converting decision points."

[AFTER - Author's Authentic Voice]:
"Every software company loves the illusion of friction-free software. It isn't. When a translator hits a paywall in the middle of an urgent document, they are courting resistance. If the interface lectures them with sales copy, they close the tab and walk away. We didn't need clever marketing; we needed honesty. A paywall shouldn't be an ambush. It should be a doorway with a clear price tag."
---

ABSOLUTE DIRECTIVES:
${structureDirective}
2. CONTENT FIDELITY & RADICAL CLARITY:
   - Preserve all original ideas, arguments, data, statistics, figures, and examples.
   - Cut throat-clearing preambles, bureaucratic padding, and hollow filler phrases.
   - Do NOT invent unrelated facts or alter quantitative data points.
3. ADOPT THE VOICE COMPLETELY:
   - Rephrase, restructure, and recadence the text using the author's exact linguistic patterns:
     * Sentence length and burstiness (variation between long flowing thoughts and punchy short clauses, e.g. "It isn't.")
     * Punctuation signatures (em-dashes for internal realization, semicolons, fragments if favored)
     * Vocabulary register (concrete tactile verbs, elimination of corporate/academic throat-clearing)
     * Voice and authorial posture: quiet conviction, craftsmanship, unhurried precision
4. INTENSITY LEVEL (${intensity.toUpperCase()}):
${intensityInstructions}
5. TONE & VOICE SLIDER CALIBRATIONS:
   - Formality: ${formalityDesc}
   - Enthusiasm: ${enthusiasmDesc}
   - Conciseness: ${concisenessDesc}
6. DOMAIN EXPERTISE & CONTEXT:
${domainInstructions}
7. PRESERVATION LOCKS (Preserve precisely according to policy):
   ${formattedLocks}
8. ADDITIONAL USER GUIDELINES: ${customInstructions || 'Follow the established style profile and eliminate all corporate filler.'}

STYLE PROFILE TO EMULATE:
Name: ${profile.name}
Voice Manifesto: ${profile.voiceManifesto}
${metricsBlock}
Do List: ${(profile.synthesizedGuidelines?.doList || []).join('; ')}
Don't List: ${(profile.synthesizedGuidelines?.dontList || []).join('; ')}
Signature Habits: ${(profile.synthesizedGuidelines?.signatureHabits || []).join('; ')}
Vocabulary Preferences: ${(profile.synthesizedGuidelines?.vocabularyPreferences || []).join('; ')}
Pacing Guide: ${profile.synthesizedGuidelines?.pacingGuide || 'Follow profile metrics and burstiness target'}
Custom Directives: ${profile.customDirectives || 'None'}
${exemplarsBlock}
ORIGINAL DRAFT TO REWRITE:
"""
${draft}
"""`;

    const response = await generateContentWithRetry({
      endpoint: '/api/rewrite-draft',
      contents: systemPrompt,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rewrittenText: {
              type: Type.STRING,
              description: 'The complete rewritten draft in the author authentic voice, strictly maintaining the original paragraph and structural layout and full length without omitting or summarizing content.',
            },
            changesExplanation: {
              type: Type.STRING,
              description: 'A 2-3 paragraph breakdown explaining how the draft was altered to fit the author linguistic profile, tone settings, and domain expectations.',
            },
            stylisticAudit: {
              type: Type.OBJECT,
              properties: {
                cadenceChanges: {
                  type: Type.STRING,
                  description: 'How the sentence length and rhythm were restructured.',
                },
                structuralTweaks: {
                  type: Type.STRING,
                  description: 'How paragraph flow, transitions, and openers were adapted.',
                },
                vocabularySubstitutions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      from: { type: Type.STRING, description: 'Original generic/weak phrase' },
                      to: { type: Type.STRING, description: 'New phrase in author voice' },
                      reason: { type: Type.STRING, description: 'Linguistic rationale' },
                    },
                    required: ['from', 'to', 'reason'],
                  },
                },
                voiceAlignmentScore: {
                  type: Type.NUMBER,
                  description: 'A percentage (80-99) reflecting alignment with profile rules.',
                },
              },
              required: ['cadenceChanges', 'structuralTweaks', 'vocabularySubstitutions', 'voiceAlignmentScore'],
            },
            styleSimilarity: {
              type: Type.OBJECT,
              description: 'Detailed style similarity score and evaluation against user profile and calibrated sliders.',
              properties: {
                overallPercentage: {
                  type: Type.NUMBER,
                  description: 'An objective percentage score (e.g. 88 to 98) measuring how closely the rewritten text matches the user established writing style profile.',
                },
                explanation: {
                  type: Type.STRING,
                  description: 'A concise 2-3 sentence explanation of what this score represents, highlighting cadence, lexical choices, and how requested tone adjustments were balanced with the author baseline.',
                },
                breakdown: {
                  type: Type.OBJECT,
                  properties: {
                    cadenceMatch: { type: Type.NUMBER, description: 'Score 0-100 for sentence rhythm and length distribution match' },
                    vocabularyFidelity: { type: Type.NUMBER, description: 'Score 0-100 for adherence to favored and taboo word choices' },
                    toneConsistency: { type: Type.NUMBER, description: 'Score 0-100 for voice persona, posture, and emotional resonance' },
                    domainConformance: { type: Type.NUMBER, description: 'Score 0-100 for accurate terminology and field conventions' },
                  },
                  required: ['cadenceMatch', 'vocabularyFidelity', 'toneConsistency', 'domainConformance'],
                },
                strengths: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '2 to 3 prominent stylistic strengths where this rewrite matches the author profile',
                },
                deviationsNote: {
                  type: Type.STRING,
                  description: 'A brief note explaining any deliberate stylistic variance (e.g. intentional shift due to conciseness slider or domain conventions).',
                },
              },
              required: ['overallPercentage', 'explanation', 'breakdown', 'strengths'],
            },
          },
          required: ['rewrittenText', 'changesExplanation', 'stylisticAudit', 'styleSimilarity'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const wordCountOriginal = draft.trim().split(/\s+/).filter(Boolean).length;
    const wordCountRewritten = (parsed.rewrittenText || '').trim().split(/\s+/).filter(Boolean).length;

    res.json({
      id: `rewrite-${Date.now()}`,
      profileId: profile.id,
      profileName: profile.name,
      modelUsed: (response as any).modelExecuted || model || 'gemini-3.8-flash',
      durationMs: (response as any).durationMs,
      intensity,
      originalText: draft,
      rewrittenText: parsed.rewrittenText,
      wordCountOriginal,
      wordCountRewritten,
      changesExplanation: parsed.changesExplanation,
      stylisticAudit: parsed.stylisticAudit,
      styleSimilarity: parsed.styleSimilarity,
      toneAdjustments: tone,
      domainExpertise: activeDomain,
      feedbackItems: [],
      createdAt: new Date().toISOString(),
      customInstructions,
      preservationLocks,
    });
  } catch (error: any) {
    console.error('Error in /api/rewrite-draft:', error);
    res.status(500).json({ error: error.message || 'Failed to rewrite draft' });
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

    const ai = getGeminiClient();

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

    const parsed = JSON.parse(response.text || '{}');

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

// 6. Quick iterative refine on a rewritten draft
app.post('/api/quick-refine', async (req: Request, res: Response) => {
  try {
    const { currentText, instruction, profile, model, reasoningLevel } = req.body;
    if (!currentText || !instruction) {
      return res.status(400).json({ error: 'currentText and instruction are required' });
    }

    const ai = getGeminiClient();
    const prompt = `You are a writing assistant fine-tuning a draft that has already been rewritten in the author's style.
Author Style Profile:
Name: ${profile?.name || 'Master Style'}
Voice Manifesto: ${profile?.voiceManifesto || ''}
Rules: ${(profile?.synthesizedGuidelines?.doList || []).join('; ')}

Current Text:
"""
${currentText}
"""

User refinement instruction: "${instruction}"

MANDATORY REQUIREMENTS:
- You MUST maintain the exact layout, paragraph breaks, and overall length of the text.
- Do NOT delete, condense, or summarize paragraphs.
- Apply this refinement while strictly maintaining the author's core voice, cadence, and meaning. Return a JSON object with:
- refinedText: string (the full updated text)
- tweakSummary: string (a one-sentence explanation of what changed)`;

    const response = await generateContentWithRetry({
      contents: prompt,
      preferredModel: model,
      reasoningLevel,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            refinedText: { type: Type.STRING },
            tweakSummary: { type: Type.STRING },
          },
          required: ['refinedText', 'tweakSummary'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/quick-refine:', error);
    res.status(500).json({ error: error.message || 'Failed to refine draft' });
  }
});

// 7. Real-time line copy edit on a specific selection
app.post('/api/edit-selection', async (req: Request, res: Response) => {
  try {
    const {
      selectedText,
      surroundingContext,
      instruction,
      tag,
      profile,
      exemplars,
      model,
      reasoningLevel,
    } = req.body;

    if (!selectedText || !selectedText.trim()) {
      return res.status(400).json({ error: 'selectedText is required' });
    }

    const tagInstructionMap: Record<string, string> = {
      too_formal: 'Make this less stiff and bureaucratic; adopt a conversational, grounded, tactile register.',
      not_my_voice: "Recast this into the author's authentic cadence, muscular verbs, and direct rhythm.",
      good: 'Preserve the core phrasing but polish the line flow slightly if needed.',
      too_casual: 'Give this more weight, crisp precision, and authority without adding corporate jargon.',
      too_verbose: 'Cut the padding, fluff, and filler words ruthlessly; make it punchy and concise.',
      awkward_cadence: 'Fix the sentence rhythm and flow; create natural cadence and burstiness.',
      domain_inaccurate: 'Correct domain terminology or framing to reflect grounded practitioner reality.',
    };

    const stylisticGoals: string[] = [];
    if (tag && tagInstructionMap[tag]) {
      stylisticGoals.push(`Stylistic Goal: ${tagInstructionMap[tag]}`);
    }
    if (instruction && instruction.trim()) {
      stylisticGoals.push(`User Note/Instruction: "${instruction.trim()}"`);
    }
    const editorialGoal = stylisticGoals.length > 0
      ? stylisticGoals.join('\n')
      : 'Recast into the author’s authentic voice, cutting corporate jargon and filler.';

    let exemplarsBlock = '';
    if (exemplars && Array.isArray(exemplars) && exemplars.length > 0) {
      exemplarsBlock = `\nAUTHOR WRITING EXEMPLARS (Anchor your cadence, rhythm, and vocabulary to these real excerpts):\n` +
        exemplars.slice(0, 2).map((ex: any, i: number) => `--- Exemplar ${i + 1}: "${ex.title || 'Untitled'}" ---\n${(ex.excerpt || '').trim()}`).join('\n\n') + '\n';
    }

    const prompt = `You are an elite prose line editor and writing craftsman.
Your mission is to perform an immediate line-level rewrite on a SPECIFIC HIGHLIGHTED PASSAGE within a draft.

AUTHOR STYLE PROFILE:
- Name: ${profile?.name || 'Author Style'}
- Voice Manifesto: ${profile?.voiceManifesto || 'Clear, grounded, muscular prose.'}
- Primary Rules: ${(profile?.synthesizedGuidelines?.doList || []).slice(0, 5).join('; ')}
- What to Avoid: ${(profile?.synthesizedGuidelines?.dontList || []).slice(0, 5).join('; ')}

CRITICAL ANTI-JARGON RULES (ABSOLUTELY BAN ALL CORPORATE BUZZWORDS):
- NEVER use consulting/MBA filler: "lever" (as a metaphor), "scale" (as a verb for business growth), "friction points", "decision points", "high-leverage", "technical debt" (unless literally discussing broken code), "content design rigor", "synergies", "alignment", "stakeholders", "deliverables", "streamline", "utilize", "optimize", "bandwidth".
- Ground all domain concepts in physical human reality, physical verbs, and direct craft actions.

${exemplarsBlock}

SURROUNDING CONTEXT (for continuity and seamless transition):
"""
${surroundingContext || selectedText}
"""

TARGET PASSAGE TO REWRITE:
"""
${selectedText}
"""

USER'S EDIT DIRECTION:
${editorialGoal}

MANDATORY EDITORIAL REQUIREMENTS:
1. Rewrite ONLY the target passage. The replacement must plug seamlessly into the surrounding text without awkward seams, tense shifts, or tone clashes.
2. Maintain all substantive factual points, numbers, and core intent, but completely strip out corporate filler, throat-clearing, and passive voice.
3. Return a JSON object with:
   - "replacementText": string (the rewritten replacement text for the target passage ONLY, no surrounding text)
   - "explanation": string (one concise sentence explaining what changed)`;

    const preferredModel = model || 'gemini-3.8-flash';
    const response = await generateContentWithRetry({
      endpoint: '/api/edit-selection',
      contents: prompt,
      preferredModel,
      reasoningLevel: reasoningLevel || 'auto',
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            replacementText: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['replacementText', 'explanation'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const modelUsed = (response as any).modelExecuted || preferredModel;
    const durationMs = (response as any).durationMs || 0;

    res.json({
      replacementText: parsed.replacementText || selectedText,
      explanation: parsed.explanation || 'Refined selection in author voice.',
      modelUsed,
      durationMs,
    });
  } catch (error: any) {
    console.error('Error in /api/edit-selection:', error);
    res.status(500).json({ error: error.message || 'Failed to edit selection' });
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
