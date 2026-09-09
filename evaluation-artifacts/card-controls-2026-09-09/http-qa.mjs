import assert from 'node:assert/strict';
import fs from 'node:fs';
const results=[];
for (const [name,input,status] of [
 ['single-card',{targetTopic:{name:'Content Design',category:'discipline'}},200],
 ['wrong-name',{targetTopic:{name:'Wrong name',category:'discipline'}},500],
 ['multiple-results',{targetTopic:{name:'Multiple results',category:'discipline'}},500],
 ['wrong-category',{targetTopic:{name:'Wrong category',category:'discipline'}},500],
 ['invalid-target',{targetTopic:{name:'Content Design',category:'topic'}},400],
 ['private-target',{targetTopic:{name:'Content Design',category:'discipline',notes:'private fixture'}},400],
 ['all-topics',{field:'UX'},200],
]) {
 const response=await fetch('http://localhost:3108/api/generate-domain-knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const body=await response.json();
 assert.equal(response.status,status,name+JSON.stringify(body));
 if(name==='single-card'){assert.equal(body.topics.length,1);assert.equal(body.topics[0].name,'Content Design');assert.equal(body.topics[0].category,'discipline');}
 if(name==='all-topics')assert.equal(body.topics.length,3);
 results.push({name,input,status:response.status,body,passed:true});
}
fs.writeFileSync('evaluation-artifacts/card-controls-2026-09-09/http-results.json',JSON.stringify(results,null,2));
console.log(`${results.length} API cases passed.`);
