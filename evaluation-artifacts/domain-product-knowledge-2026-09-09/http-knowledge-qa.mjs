import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('evaluation-artifacts/domain-product-knowledge-2026-09-09');
const base=JSON.parse(fs.readFileSync('evaluation-artifacts/voice-transfer-2026-09-08/revised-input.json','utf8'));
const stamp=`http-knowledge-${Date.now()}`;
const domain={enabled:true,field:'QA knowledge',disciplines:['QA discipline'],keyTerminology:['GLOBAL_KEEP','INACTIVE_TERM','ACTIVE_TERM'],conventions:['GLOBAL_GUIDANCE','INACTIVE_CONVENTION','ACTIVE_CONVENTION'],audienceContext:'QA audience',customNotes:'USER_DOMAIN_GUIDANCE',topics:[{id:'active',name:'ACTIVE_TOPIC',description:'ACTIVE_DESCRIPTION',keyTerminology:['ACTIVE_TERM'],conventions:['ACTIVE_CONVENTION'],enabled:true},{id:'inactive',name:'INACTIVE_TOPIC',description:'INACTIVE_DESCRIPTION',keyTerminology:['INACTIVE_TERM'],conventions:['INACTIVE_CONVENTION'],enabled:false}],productKnowledge:[{id:'a',name:'ACTIVE_PRODUCT',notes:'ACTIVE_PRODUCT_NOTE. Historical reference for 2024; source: supplied documentation.',enabled:true},{id:'b',name:'INACTIVE_PRODUCT',notes:'INACTIVE_PRODUCT_NOTE',enabled:false}]};
const results=[];
async function check(name,route,body,status=200,inspect=()=>{},count=2){
 const before=new Set(fs.readdirSync(dir));
 const response=await fetch(`http://localhost:3104${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 const requests=fs.readdirSync(dir).filter(f=>!before.has(f)&&f.startsWith('mock-')&&f.endsWith('-request.json')).map(f=>({file:f,body:JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}));
 let error;try{assert.equal(response.status,status);assert.equal(requests.length,count);inspect(data,requests);}catch(e){error=e.message;}
 const result={name,passed:!error,error,status:response.status,request:body,response:data,providerRequests:requests.map(r=>r.file)};
 fs.writeFileSync(path.join(dir,`${stamp}-${name}.json`),JSON.stringify(result,null,2));results.push(result);console.log(`${error?'FAIL':'PASS'} ${name}${error?`: ${error}`:''}`);return data;
}
function knowledgePresent(data,requests){
 for(const {body} of requests){const text=JSON.stringify(body.contents);for(const s of ['GLOBAL_KEEP','GLOBAL_GUIDANCE','USER_DOMAIN_GUIDANCE','ACTIVE_TOPIC','ACTIVE_DESCRIPTION','ACTIVE_TERM','ACTIVE_CONVENTION','ACTIVE_PRODUCT','ACTIVE_PRODUCT_NOTE'])assert.ok(text.includes(s),`missing ${s}`);for(const s of ['INACTIVE_TOPIC','INACTIVE_DESCRIPTION','INACTIVE_TERM','INACTIVE_CONVENTION','INACTIVE_PRODUCT','INACTIVE_PRODUCT_NOTE'])assert.ok(!text.includes(s),`leaked ${s}`);}
}
const input={...base,domainExpertise:domain};
const rewritten=await check('enabled-rewrite','/api/rewrite-draft',input,200,knowledgePresent);
const text=rewritten.rewrittenText||'Our documentation could work better.';
await check('enabled-refine','/api/quick-refine',{...input,currentText:text,originalText:base.draft,instruction:'Make the opening clearer.'},200,knowledgePresent);
const selected='Our documentation could work better.';const start=text.indexOf(selected);
await check('enabled-selection','/api/edit-selection',{...input,currentText:text,originalText:base.draft,selectedText:selected,selectionRange:{start,end:start+selected.length},instruction:'Make this clearer.'},200,knowledgePresent);
await check('master-off','/api/rewrite-draft',{...input,domainExpertise:{...domain,enabled:false}},200,(_d,reqs)=>{for(const {body}of reqs)for(const token of ['GLOBAL_KEEP','ACTIVE_PRODUCT_NOTE','USER_DOMAIN_GUIDANCE','ACTIVE_TOPIC'])assert.ok(!JSON.stringify(body.contents).includes(token),`master-off leaked ${token}`);});
await check('profile-fallback','/api/rewrite-draft',{...base,domainExpertise:undefined,profile:{...base.profile,domainExpertise:domain}},200,knowledgePresent);
for(const [label,bad] of [['not-array',{}],['null-entry',[null]],['bad-name',[{id:'a',name:7,notes:'x',enabled:true}]],['bad-notes',[{id:'a',name:'x',notes:{bad:true},enabled:true}]],['bad-enabled',[{id:'a',name:'x',notes:'x',enabled:'false'}]]]){
 for(const fallback of [false,true])await check(`invalid-products-${label}${fallback?'-profile':''}`,'/api/rewrite-draft',fallback?{...base,domainExpertise:undefined,profile:{...base.profile,domainExpertise:{...domain,productKnowledge:bad}}}:{...input,domainExpertise:{...domain,productKnowledge:bad}},400,()=>{},0);
}
for(const route of ['/api/quick-refine','/api/edit-selection'])await check(`invalid-products-${route.split('/').pop()}`,route,{...input,domainExpertise:{...domain,productKnowledge:'invalid'},currentText:text,originalText:base.draft,instruction:'Clarify.',selectedText:selected,selectionRange:{start,end:start+selected.length}},400,()=>{},0);
await check('synthesis-preserves-products','/api/synthesize-profile',{samples:base.samples,currentProfile:{...base.profile,domainExpertise:domain},model:base.analysisModel,reasoningLevel:'auto'},200,(data)=>assert.deepEqual(data.domainExpertise,domain),1);
fs.writeFileSync(path.join(dir,`${stamp}-summary.json`),JSON.stringify(results.map(({request,response,...r})=>r),null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
