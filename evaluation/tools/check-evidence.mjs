import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base=resolve(root,'evaluation/baselines',process.argv[2]||'baseline-2026-11-06-e5856af7');
const sha=b=>createHash('sha256').update(b).digest('hex');
const version=JSON.parse(await readFile(resolve(base,'baseline-version.json'),'utf8'));
for(const f of version.files) {
  assert.equal(sha(await readFile(resolve(base,'snapshot',f.path))),f.sha256,`Frozen snapshot changed: ${f.path}`);
  assert.equal(sha(await readFile(resolve(root,f.path))),f.sha256,`Original file changed: ${f.path}`);
}
for(const f of version.protectedOutputs)assert.equal(sha(await readFile(resolve(root,f.path))),f.sha256,`Existing output changed: ${f.path}`);
const spec=JSON.parse(await readFile(resolve(base,'cases.json'),'utf8'));
assert.equal(spec.cases.length,18);assert.equal(new Set(spec.cases.map(c=>c.id)).size,18);assert.equal(new Set(spec.cases.map(c=>c.input.scenario)).size,6);
const onlyOccasion=c=>{const i={...c.input};delete i.occasion;return i;};
for(const id of ['B04','B05'])assert.deepEqual(onlyOccasion(spec.cases.find(c=>c.id===id)),onlyOccasion(spec.cases.find(c=>c.id==='B03')));
const dirs=await readdir(resolve(base,'runs'));
let runs=0,modelCalls=0;
for(const folder of dirs) {
  const summary=JSON.parse(await readFile(resolve(base,'runs',folder,'summary.json'),'utf8'));
  const records=JSON.parse(await readFile(resolve(base,'runs',folder,'records.json'),'utf8'));
  assert.equal(records.length,18);assert.equal(summary.cases,18);runs++;modelCalls+=summary.providerCalls;
  for(const r of records) {
    assert.deepEqual(r.input,spec.cases.find(c=>c.id===r.caseId).input);
    assert.equal(r.messages.length,3);assert.equal(r.humanReviewStatus,'PENDING');assert.ok(r.messages.every(m=>m.humanScores===null));
    if(r.execution.status.startsWith('NOT_EXECUTED')) {
      assert.ok(r.messages.every(m=>m.text===null));assert.equal(r.execution.liveGenerationPerformed,false);assert.equal(r.execution.templateGenerationPerformed,false);
    }
    if(r.execution.status==='DEMO_GENERATED') {
      assert.ok(r.messages.every(m=>typeof m.text==='string'&&m.text.split(/\n+/).length===3));
      assert.equal(r.execution.liveGenerationPerformed,false);assert.equal(r.execution.providerCalls,0);
      assert.equal(r.versions.modelReportedByApplication,'demo-template-v1.2');
    }
  }
}
console.log(JSON.stringify({status:'PASS',sourceFilesUnchanged:version.files.length,protectedOutputsUnchanged:version.protectedOutputs.length,evaluationCases:18,scenarios:6,validatedRunDirectories:runs,providerCallsRecorded:modelCalls,notes:'Integrity and evidence-state checks only; not a subjective quality score.'},null,2));
