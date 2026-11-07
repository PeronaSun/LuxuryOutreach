import { readFile, writeFile, mkdir, open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const id=option('--baseline','baseline-2026-11-06-e5856af7');
const mode=option('--mode','validate');
if(!/^[\w-]+$/.test(id)||!['validate','demo','live'].includes(mode))throw new Error('Use --baseline <id> --mode validate|demo|live');
const sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=resolve(root,'evaluation/baselines',id);
const versionBytes=await readFile(resolve(baseline,'baseline-version.json'));
const version=JSON.parse(versionBytes);
const casesBytes=await readFile(resolve(baseline,'cases.json'));
const set=JSON.parse(casesBytes);
const setVersion=JSON.parse(await readFile(resolve(baseline,'case-set-version.json'),'utf8'));
if(sha(casesBytes)!==setVersion.casesSha256||sha(versionBytes)!==setVersion.baselineVersionSha256)throw new Error('Frozen baseline/case version mismatch; no generation performed.');
for(const file of version.files) {
  if(sha(await readFile(resolve(baseline,'snapshot',file.path)))!==file.sha256)throw new Error('Snapshot drift: '+file.path);
}
const load=path=>import(pathToFileURL(resolve(baseline,'snapshot',path)).href);
const {evaluateRequest,validateCandidates,PROMPT_VERSION,styles}=await load('server/rules.mjs');
const {buildPrompt,generate}=await load('server/generation.mjs');
const {messagePlan,assembleCandidates}=await load('server/message-contract.mjs');
const {BRAND_VERSION}=await load('data/catalog.mjs');
const runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+mode+'-'+randomUUID().slice(0,8);
const dir=resolve(baseline,'runs',runId);
await mkdir(dir,{recursive:true});
await mkdir(resolve(dir,'provider-traces'));
const save=(path,value)=>writeFile(resolve(dir,path),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const key=process.env.OPENAI_API_KEY;
const model=version.config.configuredModel;
const configError=mode==='live'&&!key?'NO_API_KEY':mode==='live'&&process.env.OPENAI_MODEL&&process.env.OPENAI_MODEL!==model?'MODEL_DIFFERS_FROM_FROZEN_BASELINE':null;
const clean=value=>key?JSON.parse(JSON.stringify(value).replaceAll(key,'[REDACTED]')):value;
const startedAt=new Date().toISOString();
await save('run-start.json',{
  runId,baselineId:id,mode,startedAt,commit:version.git.commit,sourceFingerprint:version.sourceFingerprint,
  baselineVersionSha256:sha(versionBytes),casesSha256:sha(casesBytes),runnerSha256:sha(await readFile(fileURLToPath(import.meta.url))),
  configuredModel:model,keyConfigured:Boolean(key),configError,
  productionEntryPoint:'Frozen snapshot generate(); this is a core-pipeline evaluation, not an HTTP/UI end-to-end run.',
  modeOverride:mode==='live'?'Explicit demo:false; UI DEMO_MODE is not used by this evaluation.':mode==='demo'?'Explicit demo:true; no model requests.':'No generation.',
  scoring:'Human review pending; no subjective scores assigned.'
});
const journal=await open(resolve(dir,'records.jsonl'),'wx');
const records=[];
let totalCalls=0;
try {
  for(const definition of set.cases) {
    const input=structuredClone(definition.input);
    const ctx=evaluateRequest(input);
    const prompt=ctx.status==='READY'?buildPrompt(input,ctx):null;
    const plan=ctx.client?.assignedAdvisor&&ctx.resolved?messagePlan(input,ctx):null;
    const record={
      caseId:definition.id,name:definition.name,fictional:true,input,context:ctx,messagePlan:plan,
      comparisonGroups:definition.comparisonGroups,reviewExpectations:definition.reviewExpectations,
      versions:{gitCommit:version.git.commit,sourceFingerprint:version.sourceFingerprint,prompt:PROMPT_VERSION,brandBible:BRAND_VERSION,modelConfigured:model},
      prompt:prompt?{...prompt,instructionsSha256:sha(prompt.instructions),inputSha256:sha(prompt.input)}:null,
      inputValidation:{performed:true,status:ctx.status,issues:ctx.issues,baselineExpected:definition.baselineExpected,
        baselineExpectationMatches:ctx.status===definition.baselineExpected.status&&(ctx.resolved?.product?.sku||null)===definition.baselineExpected.resolvedSku,
        desiredBusinessStatus:definition.desiredBusinessStatus,desiredBusinessStatusMatches:ctx.status===definition.desiredBusinessStatus},
      execution:{mode,status:'NOT_EXECUTED',attempted:false,templateGenerationPerformed:false,liveGenerationPerformed:false,providerCalls:0,startedAt:null,finishedAt:null,error:null},
      messages:styles.map(style=>({style,text:null,stage:'NOT_GENERATED',humanScores:null,reviewer:null})),
      withheldDraftMessages:[],outputValidation:{performed:false,errors:null},providerTraceFiles:[],externalReviewFlags:[],humanReviewStatus:'PENDING',
    };
    const traces=[];
    if(ctx.status!=='READY')record.execution.status='NOT_EXECUTED_INPUT_REJECTED';
    else if(configError){record.execution.status='NOT_EXECUTED_CONFIGURATION_BLOCKED';record.execution.error=configError;}
    else if(mode!=='validate') {
      record.execution.attempted=true;record.execution.startedAt=new Date().toISOString();
      const fetchImpl=async(url,options)=>{
        const trace={caseId:definition.id,index:traces.length+1,url,startedAt:new Date().toISOString(),request:JSON.parse(options.body),response:null,error:null};
        traces.push(trace);totalCalls++;
        const start=performance.now();
        try {
          const response=await fetch(url,options);trace.httpStatus=response.status;
          trace.providerRequestId=response.headers.get('x-request-id');
          try{trace.response=await response.clone().json();}catch{trace.error='NON_JSON_PROVIDER_RESPONSE';}
          return response;
        }catch(e){trace.error=e.name||'NETWORK_ERROR';throw e;}
        finally {
          trace.latencyMs=Math.round(performance.now()-start);trace.finishedAt=new Date().toISOString();
          const file=`provider-traces/${definition.id}-${String(trace.index).padStart(2,'0')}.json`;
          record.providerTraceFiles.push(file);await save(file,clean(trace));
        }
      };
      try {
        const result=await generate(input,ctx,{demo:mode==='demo',key,model,fetchImpl});
        record.messages=result.candidates.map(c=>({...c,stage:mode==='demo'?'DEMO_TEMPLATE':'RELEASED_BY_APPLICATION',humanScores:null,reviewer:null}));
        record.versions.modelReportedByApplication=result.model;
        record.outputValidation={performed:true,errors:validateCandidates(result.candidates,{...ctx,input})};
        record.execution.status=mode==='demo'?'DEMO_GENERATED':'LIVE_GENERATED_RELEASED';
        record.execution.templateGenerationPerformed=mode==='demo';record.execution.liveGenerationPerformed=mode==='live';
      }catch(e) {
        record.execution.status='ATTEMPTED_NO_COMPLETE_OUTPUT';record.execution.error=clean({message:e.message}).message;
        const response=traces[0]?.response;
        if(response?.status==='completed') {
          try {
            const raw=response.output.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
            const parts=JSON.parse(raw).candidates;
            if(Array.isArray(parts)&&parts.length===3&&parts.every(p=>typeof p.main==='string'&&p.main.trim())) {
              record.execution.liveGenerationPerformed=true;
              record.execution.status='LIVE_GENERATED_WITHHELD';
              // Retain actual raw parts even if they cannot be assembled under the production contract.
              record.rawGeneratedParts=parts;
              try{record.withheldDraftMessages=assembleCandidates(parts,input,ctx);}catch{}
              if(record.withheldDraftMessages.length)record.outputValidation={performed:true,errors:validateCandidates(record.withheldDraftMessages,{...ctx,input})};
            }
          }catch{}
        }
      }finally {
        record.execution.providerCalls=traces.length;record.execution.finishedAt=new Date().toISOString();
        record.versions.providerReturnedModels=traces.map(t=>t.response?.model||null);
        record.providerUsage=traces.map(t=>t.response?.usage||null);
      }
    }
    if(!record.inputValidation.desiredBusinessStatusMatches)record.externalReviewFlags.push('INPUT_GATE_DIFFERS_FROM_DESIRED_BEHAVIOR');
    if(definition.id==='B16'&&record.messages.some(m=>m.text?.includes('价格高于您的预期')))record.externalReviewFlags.push('B16_STATED_WITHIN_BUDGET_BUT_OUTPUT_SAYS_ABOVE_EXPECTATION');
    const safe=clean(record);records.push(safe);await journal.write(JSON.stringify(safe)+'\n');
  }
}finally{await journal.close();}
const summary={
  runId,baselineId:id,mode,startedAt,finishedAt:new Date().toISOString(),runStatus:configError?'CONFIGURATION_BLOCKED':mode==='validate'?'VALIDATION_ONLY':'COMPLETED',
  cases:records.length,inputStatusCounts:records.reduce((a,r)=>(a[r.inputValidation.status]=(a[r.inputValidation.status]||0)+1,a),{}),
  baselineExpectationMatches:records.filter(r=>r.inputValidation.baselineExpectationMatches).length,
  desiredBusinessMismatches:records.filter(r=>!r.inputValidation.desiredBusinessStatusMatches).map(r=>r.caseId),
  templateGenerationCompleted:records.filter(r=>r.execution.templateGenerationPerformed).length,
  liveGenerationCompleted:records.filter(r=>r.execution.liveGenerationPerformed).length,
  providerCalls:totalCalls,candidateTextsRecorded:records.reduce((n,r)=>n+r.messages.filter(m=>m.text!==null).length,0),
  generationFailures:records.filter(r=>r.execution.attempted&&!['DEMO_GENERATED','LIVE_GENERATED_RELEASED'].includes(r.execution.status)).map(r=>r.caseId),
  externalReviewFlags:records.filter(r=>r.externalReviewFlags.length).map(r=>({caseId:r.caseId,flags:r.externalReviewFlags})),
  qualityScoresAssigned:false,configError,
};
await save('records.json',records);await save('summary.json',summary);
const columns=['case_id','scenario','style','generation_status','output_stage','complete_input_json','client_context_json','selected_purchase_json','resolved_sku','message','withheld_drafts_json','input_status','automated_output_errors','external_review_flags','model_configured','model_reported','prompt_version','prompt_instructions_sha256','input_sha256','brand_version','factual_accuracy','brand_consistency','personalization','scenario_relevance','chinese_naturalness','cta_appropriateness','style_differentiation','product_story_grounding','hard_failure_codes','reviewer','review_notes'];
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const rows=records.flatMap(r=>r.messages.map(m=>[r.caseId,r.input.scenario,m.style,r.execution.status,m.stage,JSON.stringify(r.input),JSON.stringify(r.context.client),JSON.stringify(r.context.purchase),r.context.resolved?.product?.sku,m.text,JSON.stringify(r.withheldDraftMessages),r.inputValidation.status,JSON.stringify(r.outputValidation.errors),JSON.stringify(r.externalReviewFlags),model,r.versions.modelReportedByApplication,PROMPT_VERSION,r.prompt?.instructionsSha256,r.prompt?.inputSha256,BRAND_VERSION,...Array(11).fill('')]));
await save('human-review.csv','\uFEFF'+[columns,...rows].map(row=>row.map(quote).join(',')).join('\n'));
await save('run-report.md',`# ${runId}\n\nMode: **${mode}**. Run status: **${summary.runStatus}**.\n\n${records.length} cases; ${summary.templateGenerationCompleted} template generations; ${summary.liveGenerationCompleted} live generations; ${totalCalls} provider calls.\n\nNo subjective scores assigned. A match to baseline input behavior is not a quality pass. Inspect B18's desired-behavior mismatch and any B16 semantic flag. Null message slots mean no message was generated/released; they are not sample outputs.\n\nSee records.json, records.jsonl, human-review.csv and summary.json. Provider traces exist only when requests were attempted.\n`);
console.log(JSON.stringify({directory:relative(root,dir),...summary},null,2));
if(configError)process.exitCode=2;
else if(summary.baselineExpectationMatches!==records.length||summary.generationFailures.length)process.exitCode=1;
