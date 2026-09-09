import fs from 'node:fs';
import path from 'node:path';
import { GenerateContentResponse, GoogleGenAI } from '@google/genai';
const directory = path.resolve('evaluation-artifacts/source-aware-flow-2026-09-09');
const client = new GoogleGenAI({ apiKey: 'unused-mocked-qa' });
let sequence = 0;
Object.getPrototypeOf(client.models).generateContentInternal = async function(params: any) {
  const id = `mock-${Date.now()}-${++sequence}`;
  fs.writeFileSync(path.join(directory, `${id}-request.json`), JSON.stringify(params, null, 2));
  const prompt = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
  const domain = prompt.includes('TAXONOMY & CONCEPT GENERATION INSTRUCTIONS');
  const withSource = prompt.includes('<source-draft>') || prompt.includes('<project-brief>');
  const target = prompt.match(/<target-topic category="(.*?)">(.*?)<\/target-topic>/);
  if (prompt.includes('[QA_DELAY]')) await new Promise(resolve => setTimeout(resolve, 1800));
  let text: string;
  if (domain) {
    const make = (name: string, category = 'intersecting') => ({
      name, category, description: `General principles of ${name}.`,
      keyTerminology: ['Information hierarchy', 'Accessibility'],
      ...(withSource ? {conceptAnnotations: [
        {term:'Information hierarchy',status:'supported',explanation:'The source describes moving the usage-limit explanation before the plan comparison.'},
        {term:'Accessibility',status:'adjacent',explanation:'Accessibility may reveal related clarity gaps; the source does not claim accessibility testing.'},
      ]} : {}),
      conventions:['Explain the reasoning behind documented decisions without inventing research.'],
    });
    const topics = target ? [make(target[2],target[1])] : [make('Content Design','discipline'),make('Decision Making')];
    if (prompt.includes('[QA_BAD_ANNOTATIONS]')) (topics[0] as any).conceptAnnotations = [{term:'Information hierarchy',status:'supported'}];
    if (prompt.includes('[QA_WRONG_TARGET]')) topics[0].name='Unrequested card';
    if (prompt.includes('[QA_FALSE_PROVENANCE]')) (topics[0] as any).conceptAnnotations=[{term:'Information hierarchy',status:'supported',explanation:'Unfounded support without a source.'}];
    text=JSON.stringify({topics});
  } else if (params.config?.responseMimeType === 'application/json') {
    if (prompt.includes('[QA_REVIEW_ERROR]')) throw new Error('Deterministic review failure.');
    text=JSON.stringify({summary:'Synthetic QA review; no editorial quality assertion.',findings:[],voiceObservations:[]});
  } else {
    text=prompt.includes('Rewrite only the selected passage') ? 'I put the usage-limit explanation first.'
      : 'In 2024, I rewrote the Northstar upgrade prompts with a product manager and designer. I put the usage-limit explanation before the plan comparison and gave each button a specific next step.';
  }
  const response = new GenerateContentResponse();
  Object.assign(response,{candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text}]}}],modelVersion:'deterministic-source-aware-qa',usageMetadata:{promptTokenCount:0,candidatesTokenCount:0}});
  fs.writeFileSync(path.join(directory,`${id}-response.json`),JSON.stringify(response,null,2));
  return response;
};
await import('../../server.ts');
