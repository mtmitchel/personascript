// Task-owned, network-free integration/browser QA fixture. Never used by production.
import fs from 'node:fs';
import path from 'node:path';
import { GenerateContentResponse, GoogleGenAI } from '@google/genai';

const directory = path.resolve('evaluation-artifacts/domain-product-knowledge-2026-09-09');
const client = new GoogleGenAI({ apiKey: 'unused-mocked-qa' });
const prototype = Object.getPrototypeOf(client.models);
let sequence = 0;
const fixtureText = `Subject: Clearer records, better work

People across our teams have noticed how awkward it is to pass knowledge between departments. Our documentation could work better.

We should consider one shared place for it. Scattered notes and work done without coordination can lose the insights other people need. That can leave everyone with poorer results.

Team members should try to set aside some time each week to update their project trackers. Shared tools may help us work faster. We hope everyone will take part so we can meet our quarterly commitments.`;

prototype.generateContentInternal = async function (params: any) {
  const id = `mock-${Date.now()}-${++sequence}`;
  fs.writeFileSync(path.join(directory, `${id}-request.json`), JSON.stringify(params, null, 2));
  const prompt = JSON.stringify(params);
  if (prompt.includes('[QA_DOMAIN_DELAY]')) await new Promise(resolve => setTimeout(resolve, 4000));
  if (prompt.includes('[QA_DELAY]')) await new Promise(resolve => setTimeout(resolve, 2000));
  const domainGeneration = Boolean(params.config?.responseSchema?.properties?.topics);
  if (domainGeneration && prompt.includes('[QA_DOMAIN_ERROR]')) throw new Error('Mock domain generation failure.');
  const synthesis = Boolean(params.config?.responseSchema?.properties?.voiceManifesto);
  const review = params.config?.responseMimeType === 'application/json';
  if (prompt.includes('[QA_GENERATION_ERROR]') && !review) throw new Error('Mock generation failure for QA.');
  if (prompt.includes('[QA_REVIEW_ERROR]') && review) throw new Error('Mock review failure for QA.');
  const text = domainGeneration ? JSON.stringify({ topics: prompt.includes('[QA_DOMAIN_EMPTY]') ? [] : prompt.includes('[QA_DOMAIN_MALFORMED]') ? [{ name: 42, description: 'Bad fixture', category: 'other', keyTerminology: 'bad' }] : [{ name: 'QA broad content design', description: 'General principles for clear information and useful decisions.', category: 'discipline', keyTerminology: ['information hierarchy', 'user comprehension', 'informed choice'], conventions: ['Explain a concept when the draft demonstrates it.'] }, { name: 'QA product value', description: 'How people understand the value and cost of a product.', category: 'intersecting', keyTerminology: ['product value', 'pricing clarity', 'conversion'], conventions: [] }] }) : synthesis ? JSON.stringify({ name: 'Mock synthesized voice', description: 'QA profile', metrics: {}, voiceManifesto: 'Mock guidance', synthesizedGuidelines: {}, customDirectives: 'MODEL TRIED TO OVERWRITE USER DIRECTIVE', domainExpertise: { enabled: false, field: 'MODEL OVERWRITE' } }) : review
    ? prompt.includes('[QA_MALFORMED_REVIEW]')
      ? JSON.stringify({ summary: 'Malformed fixture', findings: [{ category: 'voice', severity: 'warning', detail: { invalid: true } }], voiceObservations: [{ invalid: true }] })
      : JSON.stringify({
      summary: 'Mocked QA review: check the findings and the draft before use.',
      findings: [{ category: 'voice', severity: 'info', detail: 'This is a deterministic UI fixture, not a real voice-quality assessment.', evidence: 'Our documentation could work better.' }],
      voiceObservations: ['Mocked observation: shorter paragraphs and restrained phrasing.'],
    })
    : prompt.includes('[QA_EMPTY_OUTPUT]') ? ''
    : prompt.includes('Rewrite only the selected passage') ? 'Our records could serve the teams better.'
    : fixtureText;
  const response = new GenerateContentResponse();
  Object.assign(response, {
    candidates: [{ finishReason: prompt.includes('[QA_DOMAIN_TRUNCATED]') || prompt.includes('[QA_TRUNCATED_OUTPUT]') || (review && prompt.includes('[QA_TRUNCATED_REVIEW]')) ? 'MAX_TOKENS' : prompt.includes('[QA_BLOCKED_OUTPUT]') ? 'SAFETY' : 'STOP', content: { role: 'model', parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0 },
    modelVersion: 'mocked-qa-no-provider-call',
  });
  fs.writeFileSync(path.join(directory, `${id}-response.json`), JSON.stringify(response, null, 2));
  return response;
};

fs.writeFileSync(path.join(directory, `mock-invocation-${Date.now()}.json`), JSON.stringify({
  cwd: process.cwd(),
  command: 'DISABLE_HMR=true PORT=3104 ./node_modules/.bin/tsx evaluation-artifacts/domain-product-knowledge-2026-09-09/mocked-server.ts',
  provider: 'none; generation SDK replaced by deterministic fixture in this process only',
  data: 'repository demo data',
}, null, 2));

await import('../../server.ts');
