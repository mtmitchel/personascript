import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve('evaluation-artifacts/source-aware-flow-2026-09-09');
const stamp=`http-${Date.now()}`;
const results=[];
const base=JSON.parse(fs.readFileSync('evaluation-artifacts/voice-transfer-2026-09-08/revised-input.json','utf8'));
const draft='  In 2024, I rewrote the Northstar upgrade prompts with a product manager and designer. I moved the usage-limit explanation before the plan comparison. SOURCE_DRAFT_SENTINEL\n';
const projectBrief='  The source documents information ordering and clearer actions. The team did not conduct usability testing or controlled experiments. SOURCE_BRIEF_SENTINEL\n';
async function scenario(name,route,input,status=200,inspect=()=>{},calls=1){
 const before=new Set(fs.readdirSync(directory));
 const response=await fetch(`http://localhost:3110${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const data=await response.json();
 const requests=fs.readdirSync(directory).filter(f=>!before.has(f)&&f.startsWith('mock-')&&f.endsWith('-request.json')).map(file=>({file,body:JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'))}));
 let error;
 try{assert.equal(response.status,status,JSON.stringify(data));assert.equal(requests.length,calls);inspect(data,requests);}catch(e){error=e.message;}
 results.push({name,status:response.status,passed:!error,error,providerRequests:requests.map(r=>r.file)});
 fs.writeFileSync(path.join(directory,`${stamp}-${name}.json`),JSON.stringify({input,response:data,...results.at(-1)},null,2));
 console.log(`${error?'FAIL':'PASS'} ${name}${error?': '+error:''}`);
 return data;
}
const gen={field:'Content Design',disciplines:['UX Copywriting'],draft,projectBrief,model:'gemini-3.1-pro-preview',reasoningLevel:'auto'};
function sourceCheck(data,requests){
 const prompt=requests[0].body.contents;
 assert.ok(prompt.includes(draft));assert.ok(prompt.includes(projectBrief));
 for(const topic of data.topics){assert.equal(topic.conceptAnnotations['Information hierarchy'].status,'supported');assert.equal(topic.conceptAnnotations.Accessibility.status,'adjacent');}
}
const generated=await scenario('source-generation','/api/generate-domain-knowledge',gen,200,sourceCheck);
await scenario('source-single-card','/api/generate-domain-knowledge',{...gen,targetTopic:{name:'Content Design',category:'discipline'}},200,(data,requests)=>{sourceCheck(data,requests);assert.equal(data.topics.length,1);assert.equal(data.topics[0].name,'Content Design');});
await scenario('generic-off','/api/generate-domain-knowledge',{field:'Content Design'},200,(data,requests)=>{assert.ok(!requests[0].body.contents.includes('SOURCE_DRAFT_SENTINEL'));assert.ok(!requests[0].body.contents.includes('SOURCE_BRIEF_SENTINEL'));assert.ok(data.topics.every(t=>!t.conceptAnnotations));});
await scenario('brief-only','/api/generate-domain-knowledge',{projectBrief},200,(data,requests)=>{assert.ok(requests[0].body.contents.includes(projectBrief));assert.ok(data.topics[0].conceptAnnotations);});
for(const key of ['draft','projectBrief'])for(const [label,bad]of [['object',{}],['array',[]],['boolean',false],['oversized','x'.repeat(100001)]])await scenario(`${key}-${label}`,'/api/generate-domain-knowledge',{field:'UX',[key]:bad},400,()=>{},0);
for(const extra of ['samples','productKnowledge','customNotes'])await scenario(`reject-${extra}`,'/api/generate-domain-knowledge',{...gen,[extra]:'private fixture'},400,()=>{},0);
const max='START_'+ 'x'.repeat(99989) +'_END!';
assert.equal(max.length,100000);
await scenario('source-limit','/api/generate-domain-knowledge',{...gen,draft:max,projectBrief:max},200,(_data,requests)=>{assert.equal(requests[0].body.contents.split(max).length-1,2);});
await scenario('incomplete-annotations','/api/generate-domain-knowledge',{...gen,draft:draft+' [QA_BAD_ANNOTATIONS]'},500);
await scenario('wrong-card','/api/generate-domain-knowledge',{...gen,draft:draft+' [QA_WRONG_TARGET]',targetTopic:{name:'Content Design',category:'discipline'}},500);
await scenario('false-provenance','/api/generate-domain-knowledge',{field:'[QA_FALSE_PROVENANCE]'},500);
const domain={enabled:true,field:'Content Design',disciplines:['Content Design'],topics:generated.topics,keyTerminology:[],conventions:[],audienceContext:'Hiring managers',customNotes:'Explain documented decisions accurately.',productKnowledge:[]};
const writing={...base,draft,projectBrief,domainExpertise:domain,customInstructions:''};
function writingCheck(data,requests){
 assert.equal(data.review.status,'complete');
 for(const request of requests){
  const prompt=request.body.contents;
  assert.ok(prompt.includes(draft));assert.ok(prompt.includes(projectBrief));
  assert.match(prompt,/Adjacent exploratory concepts \(not factual evidence\): Accessibility/);
  assert.match(prompt,/not independent factual evidence/);
  for(const sample of writing.samples)assert.ok(prompt.includes(sample.content));
 }
}
const rewritten=await scenario('rewrite-with-annotations','/api/rewrite-draft',writing,200,writingCheck,2);
const refine={...writing,currentText:rewritten.rewrittenText,originalText:draft,instruction:'Clarify the explanation.'};
await scenario('refine-with-annotations','/api/quick-refine',refine,200,writingCheck,2);
const selectedText='I put the usage-limit explanation before the plan comparison and gave each button a specific next step.';
const start=rewritten.rewrittenText.indexOf(selectedText);
assert.ok(start>=0);
await scenario('selection-with-annotations','/api/edit-selection',{...refine,selectedText,selectionRange:{start,end:start+selectedText.length}},200,writingCheck,2);
await scenario('review-failure-preserves-draft','/api/rewrite-draft',{...writing,customInstructions:'[QA_REVIEW_ERROR]'},200,data=>{assert.ok(data.rewrittenText);assert.equal(data.review.status,'unavailable');},2);
await scenario('invalid-saved-annotation','/api/rewrite-draft',{...writing,domainExpertise:{...domain,topics:[{...domain.topics[0],conceptAnnotations:{'Information hierarchy':{status:'supported',explanation:12}}}]}},400,()=>{},0);
fs.writeFileSync(path.join(directory,`${stamp}-summary.json`),JSON.stringify(results,null,2));
console.log(`${results.filter(r=>r.passed).length}/${results.length} API cases passed.`);
process.exitCode=results.some(r=>!r.passed)?1:0;
