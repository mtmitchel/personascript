import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve('evaluation-artifacts/project-brief-2026-09-09');
const base=JSON.parse(fs.readFileSync('evaluation-artifacts/voice-transfer-2026-09-08/revised-input.json','utf8'));
const input={...base,draft:'The Northstar team worked on upgrade prompts in 2024. I rewrote the messages with a product manager and designer.', projectBrief:'PROJECT_BRIEF_BEGIN. Fictional QA facts: the Northstar program increased paid conversion by 9%. Team result, not an isolated copy effect. PROJECT_BRIEF_END.',domainExpertise:{enabled:false,field:'',keyTerminology:[],conventions:[],audienceContext:'',customNotes:''},customInstructions:'Exercise editorial judgment while preserving accuracy.'};
const stamp=`http-project-brief-${Date.now()}`;
const results=[];
async function scenario(name,route,body,status=200,inspect=()=>{},calls=2){
  const before=new Set(fs.readdirSync(directory));
  const response=await fetch(`http://localhost:3106${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();
  const requests=fs.readdirSync(directory).filter(f=>!before.has(f)&&f.startsWith('mock-')&&f.endsWith('-request.json')).map(file=>({file,body:JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'))}));
  let error;try{assert.equal(response.status,status);assert.equal(requests.length,calls);inspect(data,requests);}catch(e){error=e.message;}
  results.push({name,status:response.status,passed:!error,error,providerRequests:requests.map(r=>r.file)});
  fs.writeFileSync(path.join(directory,`${stamp}-${name}.json`),JSON.stringify({input:body,response:data,...results.at(-1)},null,2));
  console.log(`${error?'FAIL':'PASS'} ${name}${error?': '+error:''}`);return data;
}
function briefPresent(data,requests){
  for(const {body} of requests){
    const p=typeof body.contents==='string'?body.contents:JSON.stringify(body.contents);
    assert.ok(p.includes(input.projectBrief),'complete brief omitted');
    assert.match(p,/<project-brief>/);
    assert.ok(['gemini-3.8-flash','gemini-3.1-pro-preview'].includes(body.model));
    for(const sample of input.samples)assert.ok(p.includes(sample.content),'full corpus missing');
  }
  assert.equal(data.review.status,'complete');
}
const generated=await scenario('rewrite-with-brief','/api/rewrite-draft',input,200,(data,requests)=>{briefPresent(data,requests);assert.equal(data.projectBrief,input.projectBrief);const numbers=data.review.localChecks.find(c=>c.kind==='numbers');assert.equal(numbers.passed,true,'brief-supported number falsely flagged');});
const currentText=generated.rewrittenText||'The Northstar team worked on prompts in 2024. I rewrote the messages.';
const selectedText='I rewrote the prompts with a product manager and designer.';
const start=currentText.indexOf(selectedText);
const refine={...input,currentText,originalText:input.draft,instruction:'Make the reasoning clearer.'};
const selection={...refine,selectedText,selectionRange:{start,end:start+selectedText.length}};
await scenario('refine-with-brief','/api/quick-refine',refine,200,briefPresent);
await scenario('selection-with-brief','/api/edit-selection',selection,200,briefPresent);
for(const [route,body] of [['/api/rewrite-draft',input],['/api/quick-refine',refine],['/api/edit-selection',selection]]){
  const label=route.split('/').pop();
  for(const [name,bad] of [['object',{}],['array',[]],['number',42],['too-long','x'.repeat(100001)]])await scenario(`${label}-${name}`,route,{...body,projectBrief:bad},400,()=>{},0);
}
for(const [name,brief] of [['absent',undefined],['empty',''],['null',null]])await scenario(`optional-${name}`,'/api/rewrite-draft',{...input,projectBrief:brief},200,(_data,requests)=>{for(const {body}of requests)assert.ok(!JSON.stringify(body.contents).includes('PROJECT_BRIEF_BEGIN'));});
const largePrefix='BRIEF_START-', largeSuffix='-BRIEF_END';
const largeBrief=largePrefix+'x'.repeat(100000-largePrefix.length-largeSuffix.length)+largeSuffix;
await scenario('brief-at-limit','/api/rewrite-draft',{...input,projectBrief:largeBrief},200,(_data,requests)=>{for(const {body}of requests)assert.ok(body.contents.includes(largeBrief),'brief truncated');});
await scenario('review-failure-keeps-draft','/api/rewrite-draft',{...input,customInstructions:'[QA_REVIEW_ERROR]'},200,data=>{assert.ok(data.rewrittenText);assert.equal(data.review.status,'unavailable');assert.equal(data.projectBrief,input.projectBrief);});
await scenario('brief-local-text-extraction','/api/extract-text',{fileData:Buffer.from(input.projectBrief).toString('base64'),fileType:'txt',fileName:'qa.txt',localOnly:true},200,data=>assert.equal(data.text,input.projectBrief),0);
await scenario('brief-unreadable-pdf-no-model','/api/extract-text',{fileData:Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),fileType:'pdf',fileName:'qa-empty.pdf',localOnly:true},400,data=>assert.ok(data.error),0);
fs.writeFileSync(path.join(directory,`${stamp}-summary.json`),JSON.stringify(results,null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
