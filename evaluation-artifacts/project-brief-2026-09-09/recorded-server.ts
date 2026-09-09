// Task-owned QA instrumentation. This does not change the production server.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const directory = path.resolve('evaluation-artifacts/project-brief-2026-09-09');
const runLabel = 'brief-editorial-live';
const client = new GoogleGenAI({ apiKey: 'unused-instrumentation-instance' });
const prototype = Object.getPrototypeOf(client.models);
const original = prototype.generateContentInternal;
let sequence = 0;

prototype.generateContentInternal = async function (params: any) {
  if (!['gemini-3.8-flash', 'gemini-3.1-pro-preview'].includes(params.model)) {
    throw new Error(`QA refuses an unapproved model: ${params.model}`);
  }
  const id = `${runLabel}-${Date.now()}-${++sequence}`;
  fs.writeFileSync(path.join(directory, `${id}-request.json`), JSON.stringify(params, null, 2));
  const started = Date.now();
  try {
    const response = await original.call(this, params);
    fs.writeFileSync(path.join(directory, `${id}-response.json`), JSON.stringify(response, null, 2));
    fs.writeFileSync(path.join(directory, `${id}-status.json`), JSON.stringify({ success: true, durationMs: Date.now() - started }, null, 2));
    return response;
  } catch (error: any) {
    const key = process.env.GEMINI_API_KEY;
    const message = String(error?.message || error);
    fs.writeFileSync(path.join(directory, `${id}-error.json`), JSON.stringify({
      success: false, name: error?.name, status: error?.status,
      message: key ? message.split(key).join('[REDACTED]') : message,
      durationMs: Date.now() - started,
    }, null, 2));
    throw error;
  }
};

const invocationTime = Date.now();
const sourceFiles = ['server.ts', 'src/writingPipeline.ts'];
const sources = sourceFiles.map(file => {
  const contents = fs.readFileSync(file);
  const artifact = `${runLabel}-${invocationTime}-${file.replaceAll('/', '-')}.source.txt`;
  fs.writeFileSync(path.join(directory, artifact), contents);
  return { file, artifact, sha256: crypto.createHash('sha256').update(contents).digest('hex') };
});
fs.writeFileSync(path.join(directory, `${runLabel}-invocation-${invocationTime}.json`), JSON.stringify({
  sources,
  cwd: process.cwd(),
  command: `DISABLE_HMR=true QA_RUN_LABEL=${runLabel} PORT=${process.env.PORT || '3102'} ./node_modules/.bin/tsx evaluation-artifacts/project-brief-2026-09-09/recorded-server.ts`,
  provider: 'Gemini API through production application handlers',
  writingModel: 'gemini-3.8-flash', reviewModel: 'gemini-3.1-pro-preview', reasoning: 'auto',
  data: 'fictional QA project and repository demo writing samples only',
  instrumentation: 'Capture SDK generation input, raw response, timing, and errors. Reject unapproved models. No production files modified.',
}, null, 2));

await import('../../server.ts');
