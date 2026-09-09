import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='evaluation-artifacts/source-aware-flow-2026-09-09';
const draft='In 2024, I rewrote the Northstar upgrade prompts with a product manager and designer. I moved the usage-limit explanation before the plan comparison and replaced vague button labels with specific next steps.';
const projectBrief='Fictional QA project: Northstar upgrade prompt catalog review. The documented work concerns information order and clearer actions for users who encounter a usage limit. The team did not conduct usability tests or controlled experiments for this rewrite. No conversion result is attributed to this work.';
const input={field:'Content Design',disciplines:['Content Design','UX Copywriting'],draft,projectBrief,model:'gemini-3.1-pro-preview',reasoningLevel:'auto'};
async function call(name,route,input){
 const inputPath=`${dir}/${name}-input.json`;
 const inputBytes=JSON.stringify(input,null,2);
 if(fs.existsSync(inputPath))assert.equal(fs.readFileSync(inputPath,'utf8'),inputBytes);
 else fs.writeFileSync(inputPath,inputBytes);
 const start=Date.now();
 const res=await fetch('http://localhost:3111'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const data=await res.json();
 fs.writeFileSync(`${dir}/${name}-result.json`,JSON.stringify({status:res.status,durationMs:Date.now()-start,data},null,2));
 assert.equal(res.status,200,JSON.stringify(data));
 return data;
}
const generated=await call('live-generation','/api/generate-domain-knowledge',input);
let supported=0,adjacent=0;
for(const topic of generated.topics)for(const annotation of Object.values(topic.conceptAnnotations||{})){if(annotation.status==='supported')supported++;else adjacent++;}
console.log(JSON.stringify({topics:generated.topics.length,supported,adjacent}));
const base=JSON.parse(fs.readFileSync('evaluation-artifacts/voice-transfer-2026-09-08/revised-input.json','utf8'));
const writing={...base,draft,projectBrief,customInstructions:'',domainExpertise:{enabled:true,field:'Content Design',disciplines:input.disciplines,topics:generated.topics,keyTerminology:[],conventions:[],audienceContext:'Hiring managers reviewing a content design portfolio.',customNotes:'Explain documented decisions accurately.',productKnowledge:[]}};
const result=await call('live-rewrite','/api/rewrite-draft',writing);
console.log(JSON.stringify({rewrittenText:result.rewrittenText,review:result.review},null,2));
