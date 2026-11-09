# Vercel deployment

The previous deployment uploaded Vite's static frontend without an API. A read-only check on November 8, 2026 confirmed the homepage returned HTTP 200 while `/api/bootstrap` returned Vercel's HTTP 404 `NOT_FOUND`. There was no Vercel configuration or root `api/` function entry point in this checkout.

## Architecture and fix

The existing backend is a Node HTTP application in `server/index.mjs`, not Express. The browser already calls relative `/api/...` URLs in `src/main.jsx`. `vite.config.js` proxies those paths to `127.0.0.1:3001` **only during local development**. Vercel does not run that proxy or `npm start` when it builds the Vite frontend.

| Method | Endpoint         | Purpose                                                                                               |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/bootstrap` | Canonical catalog, all nine clients/predictions, events, calendar and nonsecret mode/model metadata   |
| POST   | `/api/validate`  | Existing normalization and CA-selection/prediction resolution                                         |
| POST   | `/api/generate`  | Existing DeepSeek structured generation, factual audit, bounded recovery and three message candidates |
| POST   | `/api/review`    | Existing deterministic edited-message review                                                          |
| GET    | `/api/records`   | Journal records and frontend JSON export                                                              |

`api/index.mjs` exports the shared request handler to Vercel. `vercel.json` rewrites `/api/:path*` to this Function; it does not rewrite API failures to HTML. Static frontend/assets remain in `dist/`. The adapter accepts both original request URLs and rewritten destination URLs. It supports Vercel's parsed body helper and raw local Node request streams, retaining the 16 KB application limit and existing schema checks.

The public handler accepts matching HTTPS origins, including preview and custom domains. The ordinary Node listener still permits only loopback hosts and local development origins. No permissive CORS headers are added. The only visible UI change is replacing the misleading local-server connection error with a deployment-neutral connection error.

## Required Vercel settings

Deploy the **repository root**, not just a prebuilt `dist` folder. The root must include `api/`, `server/`, `data/`, `docs/brand-bible-v1.txt`, `package.json`, `package-lock.json` and `vercel.json`.

- Framework preset: **Vite**.
- Build command: **`npm run build`** (in `vercel.json`).
- Output directory: **`dist`** (in `vercel.json`).
- Node.js: **24.x**, pinned in `package.json` and the lockfile.
- Fluid Compute enabled. The Function's `maxDuration` is **300 seconds**. The existing default recovery envelope is at most four provider calls with 45-second individual timeouts, plus bounded backoff and processing; those limits are unchanged. Custom recovery settings can exceed this envelope and require a compatible duration/plan.
- Remove dashboard/custom routing rules that send `/api/*` to `index.html` or a localhost backend. Use the repository's routing configuration.
- Set these **server-side environment variables** for Production (and Preview if you want working previews):

```dotenv
DEMO_MODE=false
DEEPSEEK_API_KEY=<your existing secret>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

Use the same base URL/model configuration as your working local DeepSeek integration; the example shows its existing defaults. The current provider appends `/responses` to the base URL. Do not append `/responses` yourself. No `VITE_` API variables or browser API keys are needed. Never paste secrets into source, frontend environment variables or screenshots. Local `.env` is ignored and is not copied to Vercel. **Redeploy after changing environment variables**; an existing deployment does not pick up new values automatically.

For a deliberate non-AI cloud demo, set `DEMO_MODE=true`; it stays labeled as demo. With `DEMO_MODE=false`, a missing key fails explicitly and never falls back to demo templates.

The Brand Bible text is explicitly included in the Function bundle. Runtime/evaluation evidence and workbooks are excluded from uploads and Function bundles. Frozen local evidence is not migrated, edited or exposed by this deployment.

## Journal persistence

Local Node mode still reads/appends `runtime/records.jsonl`. Vercel cannot reliably use that project-local file as persistent shared storage. Without a database, the deployed app uses its writable temporary directory: generation and Journal/export work on that warm instance, but records **can disappear or differ between instances, computers and deployments**. `/api/bootstrap` reports `journalStorage: {kind: "temporary", durable: false}`. This is a temporary fallback, not durable feature parity.

To preserve the shared Journal reliably, connect an **Upstash Redis REST** database in Vercel and configure its server-side variables:

```dotenv
UPSTASH_REDIS_REST_URL=<database HTTPS REST URL>
UPSTASH_REDIS_REST_TOKEN=<read/write token>
```

The equivalent Vercel integration names `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also supported. Do not use a read-only token. The REST adapter uses native `fetch`, so no SDK or dependency installation is required. Each record is appended atomically with `RPUSH`; the Journal reads the list with `LRANGE`. Records are not overwritten, expired or trimmed. A configured database failure returns a safe error rather than silently switching to temporary storage. Bootstrap reports `{kind: "redis", durable: true}` when this adapter is configured; confirm actual connectivity by generating in an approved test and opening Journal.

By default, Production and Preview use separate keys (`maison-liore:production:records` and `maison-liore:preview:records`). Optional `JOURNAL_REDIS_KEY` can provide an explicit database namespace, especially if a database is shared across projects. Use a distinct key per project/environment. The deployment does not import or overwrite the existing local Journal or frozen evaluation files. Configure the database's durability/eviction policy for records you need to retain.

The existing in-flight request guard is per Node/Function instance, not a distributed global lock. This remains a shared fictional advisor workspace, not a new per-user CRM/authentication system.

## Verification without paid calls

```sh
npm test
npm run build
node scripts/smoke.mjs
```

The added adapter tests cover public-host HTTPS origins, routing, initialization, all five APIs, raw and Vercel-parsed request bodies, input limits, missing-key handling, secret exclusion, and unchanged three-paragraph/three-style output. The full generator/provider protocol is tested with mocked DeepSeek responses: this is integration evidence, **not a real model run**. Redis tests simulate separate instances sharing an append-only Journal and verify sanitized failures. The smoke script forces demo mode and uses an isolated temporary record directory.

After deploying, these are free/read-only application checks:

```sh
curl --fail https://luxury-outreach.vercel.app/api/bootstrap
curl --fail -H 'Content-Type: application/json' \
  --data '{"clientId":"CL-001","scenario":"recommend","motif":"jasmin"}' \
  https://luxury-outreach.vercel.app/api/validate
curl --fail https://luxury-outreach.vercel.app/api/records
```

Expect JSON, HTTP 200, nine clients, 15 products and the requested current prediction for 林女士 (`JAS-B01`). Inspect `mode`, `provider`, `model` and `journalStorage`. Do not POST `/api/generate` with live credentials without approval; that performs paid DeepSeek generation and auditing. An approved live smoke test should return exactly three Chinese candidates and then be visible in the configured durable Journal.

## Files changed and local verification

| Files                                                       | Deployment purpose                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `api/index.mjs`, `server/vercel-adapter.mjs`, `vercel.json` | Function entry point and same-domain API routing                                                                      |
| `server/index.mjs`                                          | Export the existing request handler, support parsed request bodies and inject record storage; keep the local listener |
| `server/request-policy.mjs`                                 | Retain local restrictions and accept matching deployed HTTPS origins                                                  |
| `server/record-store.mjs`                                   | Local JSONL, temporary cloud fallback, and optional shared Redis Journal                                              |
| `src/main.jsx`                                              | Deployment-neutral connection error; existing same-origin API URLs stay unchanged                                     |
| `package.json`, `package-lock.json`                         | Pin the supported Node 24.x deployment runtime; dependencies unchanged                                                |
| `.env.example`, `.gitignore`, `.vercelignore`               | Server-only configuration guidance and upload/credential/evidence exclusions                                          |
| `tests/vercel.test.mjs`, `tests/record-store.test.mjs`      | Deployment and storage integration regression coverage                                                                |
| `README.md`, `docs/vercel-deployment.md`                    | Setup, deployment checklist and verification limits                                                                   |

Completed local checks on November 8, 2026:

- All **642 automated tests passed**, including the 10 new deployment/storage checks. Provider and database HTTP calls in tests used mocks.
- `npm run build` passed, as did the existing isolated forced-demo `node scripts/smoke.mjs`.
- An ESM bundle of `api/index.mjs`, targeted to Node 24 and staged with its Brand Bible file, cold-imported and returned bootstrap HTTP 200 with 9 clients and 15 products. This checks packaging mechanics; it is not a Vercel remote build/deployment.
- Configured server-side secrets were absent from the frontend build's HTML, JavaScript and CSS; no values were printed.
- SHA-256 comparison confirmed **1,748 protected existing files unchanged**, including client/catalog/image data, prompts, factual/selection/recovery rules, provider configuration, local `.env`, UI styling, frozen evaluation/workbooks and existing local runtime evidence.
- No paid DeepSeek calls, external database provisioning, Git commits, Git pushes or remote deployments were performed.

## Deployment status and references

This checkout was not linked to a Vercel project and no Vercel CLI/account integration was configured. The changes prepare the deployment; they do not update the remote project, upload credentials, push Git or prove an already-deployed live model call. Deploy this version from your normal Vercel workflow after configuring the above settings. There is no need to run a local server for visitors after the Function is deployed.

Official references: [Node.js Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js), [Function configuration and included files](https://vercel.com/docs/project-configuration/vercel-json#functions), [Function duration limits](https://vercel.com/docs/functions/configuring-functions/duration), [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi).
