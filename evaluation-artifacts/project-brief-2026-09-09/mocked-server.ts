// Task-owned deterministic QA process; SDK calls never reach a provider.
import fs from 'node:fs';
import path from 'node:path';
import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
const directory = path.resolve('evaluation-artifacts/project-brief-2026-09-09');
const client = new GoogleGenAI({ apiKey: 'unused-mocked-qa' });
let sequence = 0;
Object.getPrototypeOf(client.models).generateContentInternal = async function(params: any) {
  const id = `mock-${Date.now()}-${++sequence}`;
  fs.writeFileSync(path.join(directory, `${id}-request.json`), JSON.stringify(params, null, 2));
  const prompt = JSON.stringify(params);
  const review = params.config?.responseMimeType === 'application/json';
  if (prompt.includes('[QA_BRIEF_DELAY]')) await new Promise(resolve => setTimeout(resolve, 1800));
  if (prompt.includes('[QA_WRITING_ERROR]') && !review) throw new Error('Deterministic writing failure.');
  if (prompt.includes('[QA_REVIEW_ERROR]') && review) throw new Error('Deterministic review failure.');
  const text = review ? JSON.stringify({summary:'Deterministic review fixture; not an editorial-quality assessment.', findings:[], voiceObservations:[]})
    : prompt.includes('Rewrite only the selected passage') ? 'The revised prompt explained the available options.'
    : 'The Northstar team set out to increase paid conversion in 2024. I rewrote the prompts with a product manager and designer. The program increased paid conversion by 9%.';
  const response = new GenerateContentResponse();
  Object.assign(response,{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text}]}}],modelVersion:'deterministic-project-brief-qa',usageMetadata:{promptTokenCount:0,candidatesTokenCount:0}});
  fs.writeFileSync(path.join(directory, `${id}-response.json`),JSON.stringify(response,null,2));
  return response;
};
await import('../../server.ts');
