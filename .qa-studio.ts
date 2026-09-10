import fs from 'node:fs';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const client = new GoogleGenAI({ apiKey: 'unused-local-qa' });
const log = '/tmp/personascript-studio-qa-requests.jsonl';
Object.getPrototypeOf(client.models).generateContentInternal = async function(params: any) {
  const prompt = params.contents as string;
  const review = params.config?.responseMimeType === 'application/json';
  fs.appendFileSync(log, JSON.stringify({ model: params.model, config: params.config, prompt }) + '\n');
  if (prompt.includes('QA_DELAY')) await new Promise(resolve => setTimeout(resolve, 1500));
  if (review && prompt.includes('QA_REVIEW_ERROR')) throw new Error('Synthetic reviewer unavailable.');
  if (!review && prompt.includes('QA_WRITING_ERROR')) throw new Error('Synthetic writer unavailable.');
  const source = prompt.match(/<draft>\n([\s\S]*?)\n<\/draft>/)?.[1] || '';
  const current = prompt.match(/<(?:current-text|complete-current-text)>\n([\s\S]*?)\n<\/(?:current-text|complete-current-text)>/)?.[1] || '';
  const text = review
    ? JSON.stringify({ summary: 'Synthetic review for interface testing.', findings: [{ category: 'editorial', severity: 'warning', detail: 'The requested opening change needs attention.', evidence: 'The team began the work.' }], voiceObservations: ['Synthetic cadence observation.'] })
    : prompt.includes('Rewrite only the selected passage') ? 'I clarified the next step.'
      : current ? current + '\n\nI made the next action explicit.'
        : source + '\n\nI rewrote the messages with a product manager and designer.';
  const response = new GenerateContentResponse();
  Object.assign(response, { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }], modelVersion: 'local-deterministic-fixture' });
  return response;
};
await import('./server.ts');
