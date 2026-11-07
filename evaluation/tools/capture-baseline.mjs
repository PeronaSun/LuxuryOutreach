import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const arg = process.argv.indexOf('--id');
const id = arg >= 0 ? process.argv[arg + 1] : null;
if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Provide a unique --id, e.g. baseline-2026-11-06-e5856af7');
const dest = resolve(root, 'evaluation/baselines', id);
await mkdir(dirname(dest), {recursive:true});
await mkdir(dest); // No recursive flag: an existing baseline must never be overwritten.
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean).sort();
const baselineFiles = [];
for (const path of files) {
  if (path.startsWith('evaluation/')) continue;
  if ((/^\.env(?:$|\.)/.test(path) && path !== '.env.example') || /(?:^|\/)\.aws\//.test(path)) throw new Error('Unexpected sensitive tracked path; baseline capture stopped.');
  const bytes = await readFile(resolve(root, path));
  const target = resolve(dest, 'snapshot', path);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, bytes, {flag: 'wx'});
  baselineFiles.push({path, sha256: sha(bytes), bytes: bytes.length});
}
const protectedOutputs = [];
async function inventory(folder) {
  try {
    for (const item of await readdir(resolve(root, folder), {withFileTypes: true})) {
      const path = `${folder}/${item.name}`;
      if (item.isDirectory()) await inventory(path);
      else if (item.isFile()) protectedOutputs.push({path, sha256: sha(await readFile(resolve(root, path)))});
    }
  } catch (e) {if (e.code !== 'ENOENT') throw e;}
}
for (const folder of ['runtime', 'dist', 'docs/evaluation']) await inventory(folder);
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const dependencies = {};
for (const [name, declared] of Object.entries({...pkg.dependencies, ...pkg.devDependencies})) {
  let installed = null;
  try {installed = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;} catch {}
  dependencies[name] = {declared, locked: lock.packages[`node_modules/${name}`]?.version ?? null, installed};
}
const {buildPrompt} = await import(new URL('../../server/generation.mjs', import.meta.url));
const {evaluateRequest, PROMPT_VERSION} = await import(new URL('../../server/rules.mjs', import.meta.url));
const {BRAND_VERSION} = await import(new URL('../../data/catalog.mjs', import.meta.url));
const {MESSAGE_FORMAT_VERSION, DEMO_MODEL} = await import(new URL('../../server/message-contract.mjs', import.meta.url));
const promptFingerprints = {};
await mkdir(resolve(dest, 'prompt-instructions'));
for (const scenario of ['greeting','recommend','care','reactivate','event','price']) {
  const input = {clientId: 'CL-001', scenario, ...(scenario === 'care' ? {purchaseId:'PUR-001-01'} : {}), ...(scenario === 'event' ? {eventId:'EV-DEMO-01'} : {}), ...(scenario === 'price' ? {motif:'jasmin',line:'jasmin',sku:'JAS-R01',concern:'想了解材质与价格。'} : {})};
  const prompt = buildPrompt(input, evaluateRequest(input));
  await writeFile(resolve(dest, 'prompt-instructions', `${scenario}.txt`), prompt.instructions, {flag:'wx'});
  promptFingerprints[scenario] = {instructionsSha256:sha(prompt.instructions), characters:prompt.instructions.length};
}
const keyConfigured = Boolean(process.env.OPENAI_API_KEY);
const configuredModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const manifest = {
  schemaVersion: 'baseline-record-v1', id, capturedAt: new Date().toISOString(), clientDate:'2026-11-06', clientTimezone:'America/New_York',
  git: {commit:git('rev-parse','HEAD'), branch:git('branch','--show-current'), subject:git('log','-1','--format=%s'), statusBeforeCapture:git('status','--porcelain','--untracked-files=no'), scope:'tracked working-tree bytes; original production files were clean before evaluation artifacts were added'},
  applicationVersion:pkg.version, node:process.version, npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(), platform:process.platform, arch:process.arch,
  versions:{prompt:PROMPT_VERSION,brandBible:BRAND_VERSION,messageFormat:MESSAGE_FORMAT_VERSION,demoModel:DEMO_MODEL},
  config:{apiKeyConfigured:keyConfigured,envFilePresent:await stat(resolve(root,'.env')).then(()=>true).catch(()=>false),demoModeEnv:process.env.DEMO_MODE??null,
    effectiveApplicationMode:process.env.DEMO_MODE==='true'||(!keyConfigured&&process.env.DEMO_MODE!=='false')?'demo':'live',
    configuredModel, modelIsAliasOrSnapshot:'Recorded configured identifier; actual provider-returned model is unknown until a live request',
    endpoint:'https://api.openai.com/v1/responses',store:false,strictJsonSchema:true,maxOutputTokensPerCall:1800,timeoutMsPerCall:45000,
    generationAndAuditUseSameModel:true,maxProviderCallsPerReadyCase:2,retryCount:0,temperature:'not sent',seed:'not sent',
    observation:'Configuration only; no API key or other secret is copied into artifacts.'},
  dependencies, promptFingerprints,
  sourceFingerprint:sha(JSON.stringify(baselineFiles)), files:baselineFiles, protectedOutputs,
  auditPromptFingerprintNote:'Audit prompt is inline in server/generation.mjs; the frozen source hash covers it. Actual audit requests/reasons will be retained by the isolated runner if live execution occurs.',
};
await writeFile(resolve(dest,'baseline-version.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({baseline:relative(root,dest),commit:manifest.git.commit,sourceFingerprint:manifest.sourceFingerprint,config:manifest.config,dependencies},null,2));
