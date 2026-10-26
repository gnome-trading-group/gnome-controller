# CLAUDE.md

gnome-controller is the operator web UI (React 19 + Vite + Mantine, in `src/`) for the trading platform, plus the CDK app (`cdk/`) that hosts it and owns its own backend: the `gnome-controller-api` API Gateway with Python Lambdas, and the Cognito user pool that every gnome API (registry, launcher, controller) authenticates people and bots against. Most of what the UI shows comes from the registry, market-data and launcher APIs in other repos; the controller API covers backtests, research, service config, system health and latency probes.

## Commands
UI (repo root):
- `npm ci` needs `NPM_TOKEN` in `~/.npmrc` for GitHub Packages (`@gnome-trading-group/*`); the pipeline writes `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`.
- `npm run dev` - Vite dev server on http://localhost:5173 (a registered Cognito callback). Reads `.env` (gitignored); copy `.env.dev` to point at dev.
- `npm run build` - `tsc -b && vite build`. `npx tsc -b` alone is the type-check the pipeline runs.
- `npm run lint` - ESLint.
- `npm test` - Vitest (`*.test.ts` under `src/utils`, `src/types`, `src/query`, `src/components`).

CDK (`cd cdk`):
- `npx tsc --noEmit` - type-check. Avoid `npm run build` here: it emits `.js` next to every `.ts`.
- `npx cdk synth` - synthesizes the pipeline and both stages into `cdk/cdk.out`. Needs Docker (the shared Python layer always bundles in Docker) and root `node_modules` (otherwise the UI also bundles in Docker, much slower).
- `npm run diff-substacks` - `cdk diff` across every stage stack.
- CDK tests: `cd cdk && npx jest` (only `test/monitoring-stack.test.ts` so far); check other stack
  changes with `npx cdk synth`.

Python Lambda tests (`cd cdk`; `pip install -r requirements-dev.txt` first). Run one function directory at a time, because every handler is a top-level `index.py` that each `conftest.py` puts on `sys.path`, so collecting several directories in one run collides:
- `python3 -m pytest lambda/tests/system-health`
- the same for `lambda/tests/system-approvals`, `lambda/tests/backtests`, `lambda/tests/batch-logs`, `lambda/tests/research-jobs`
- `lambda/tests/pipeline-status` holds only stale `__pycache__`; there is no such function any more.
- Tests use fakes in `lambda/tests/fakes.py`, not AWS. Conftests set `sys.dont_write_bytecode` because the function folder is uploaded as is.

## Layout
- `src/pages/*` - one folder per nav area: Dashboard, Trading, Strategies, Sessions, Launcher, Risk, Treasury, Predictions, SecurityMaster, MarketData, CollectorDetail, Data (pipelines/datasets/artifacts), Research (Backtests, Jobs, Sessions), System (health, alerts), Tools (ServiceConfig, LatencyProbe). Routes are in `src/App.tsx`.
- `src/utils/api.ts` - every HTTP call. `sendApiRequest` plus `registryApi`, `marketDataApi`, `controllerApi`, `launcherApi`, one per `VITE_*_API_URL`. Other files in `src/utils` are pure logic with colocated tests.
- `src/components`, `src/hooks`, `src/query` (TanStack Query client and hooks), `src/types`, `src/context`. `src/amplify-config.ts` configures Cognito from `VITE_COGNITO_*`.
- `.env.dev` / `.env.prod` - per-stage build config (Cognito ids, API URLs, `VITE_STAGE`); the deploy builds with `vite build --mode <stage>`.
- `cdk/bin/cdk.ts` -> `ControllerPipelineStack` in the pipelines account. `cdk/lib/controller-pipeline-stack.ts` defines the stage (`AppStage`) and the pipeline; `cdk/lib/config.ts` holds per-stage domain, SSO metadata, certificate, `approvesPipelines`, `researchJobMaxVcpus`.
- `cdk/lib/stacks/`:
  - `frontend-stack.ts` (ControllerFrontendStack) - S3 + CloudFront for the UI at `controller[-dev].gnometrading.group`, the Cognito user pool, its clients and the bot secret; publishes the pool ARN to SSM `/gnome/cognito/user-pool-arn` for the registry and launcher APIs.
  - `backend-stack.ts` (ControllerBackendStack) - the RestApi (stage `api`), the shared authorizer, the service-config API key (secret via `ApiKeySecret`), and `POST latency-probe/run`.
  - `backtest-stack.ts` - `gnome-research-<stage>` bucket, `gnomepy-backtest` ECR, `gnome-backtests` table, Batch spot queue `gnome-backtest-queue`, `backtests/*` routes, and the GitHub OIDC role gnomepy CI uses to push images.
  - `research-jobs-stack.ts` - generic gnomepy-research Batch array jobs: `gnomepy-research-job` ECR, `gnome-research-jobs` table, `gnome-research-queue` (vCPU cap from config), `research-jobs/*` routes.
  - `research-stack.ts` - research sessions (`gnome-research-sessions` table), `research/sessions/*` routes.
  - `pipeline-stack.ts` - only forwards `research/{pipelines,datasets,artifacts}` to Lambdas that gnome-pipelines owns (`gnome-pipelines-api`, `gnome-pipelines-data-api`); they must exist before this deploys.
  - `service-config-stack.ts` - `gnome-service-config` table and `config/{service}` routes.
  - `system-health-stack.ts` - `GET system/health`; prod only also gets `POST system/approvals`.
  - `monitoring-stack.ts` - the `Controller-*` alarms via cdk-monitoring-constructs (API 5xx, Batch status handlers);
    tested in `cdk/test/`.
  - `latency-probe-stack.ts` - the `latency-probe` Lambda, one stack per region in `PROBE_REGIONS`.
- `cdk/lib/constructs/python-lambda.ts` - `PythonLambdaFunction`: Python 3.13, handler `index.handler`, shared `lambda/layers/common` layer (`utils.py` with `create_response`; deps in its `requirements.txt`).
- `cdk/lambda/functions/`: `backtests/{submit,get,list,cancel,status-handler}`, `research-jobs/{submit,inputs,get,list,cancel,status-handler}`, `research/*` (sessions, iterations, notes), `batch-logs` (shared by backtests and research jobs via `TASK_SK_PREFIX`), `service-config/{get,put,history}`, `system-health`, `system-approvals`, `latency-probe/{orchestrator,probe}`.

## Conventions and invariants
- Every route goes through the one `GnomeApiAuthorizer` from `@gnome-trading-group/gnome-shared-cdk`, exposed as `BackendStack.auth`. Add routes with `auth.addRoute(resource, path, integration, { METHOD: [CallerKind...] })` or `auth.authorizerFor([...])`; never attach a separate authorizer or leave a method open.
- Each route declares which caller kinds may call it: `PERSON` (Cognito ID token), `SERVICE` (API key), `BOT` (client_credentials access token with a `gnome-api` scope). Default to `PERSON` only; widen deliberately.
- The UI sends the signed-in user's Cognito ID token as `Authorization` to every API and never holds an API key. A 401 or an unrefreshable session signs the user out.
- Python Lambdas read the caller from `event["requestContext"]["authorizer"]["actor"]` (or `["email"]`, as system-approvals does), never from the request body.
- Cognito (FrontendStack): pool `gnome-controller-users`, sign-in only through the IdentityCenter SAML provider, no self sign-up. Clients: `ControllerAppClient` (the UI), `ControllerCliClient` (gnomepy CLI, callback `localhost:9876`), and `ControllerBotClient` (client_credentials, read scope only) for gnome-bot, whose id/secret/token URL are in Secrets Manager `gnome-bot/cognito-client`. Granting a client a scope on the `gnome-api` resource server is what makes it a bot to the authorizer, so that grant is the allowlist.
- Service config: `GET config/{service}` (SERVICE, PERSON, BOT) returns the stored config. A base64 JSON `x-config-defaults` header writes the defaults when none is stored, and merges in any keys missing from the stored config (stored values win). `PUT` and `history` are PERSON only, so only people change config, from Tools -> Service Config.
- The service-config API key and the bot client are shared by other repos (classifier workers, gnome-bot); changing their construct ids replaces them and breaks those callers.
- The UI is bundled inside FrontendStack from the repo root. The asset hash excludes `node_modules`, `dist`, `cdk`, `.git`, `.env`, so CDK-only changes do not redeploy the bucket. The pipeline runs `npm ci && npx tsc -b` at the root before `cd cdk && npm ci && npx cdk synth`, so a UI type error fails the whole deploy. Synth output is `cdk/cdk.out`.
- Removing a resource another stack imports needs the export kept for one release, or explicit stack ordering (see the `pipelineStack.addDependency` note in `controller-pipeline-stack.ts`).

## Operations
- Deploys: `ControllerPipeline` (CodePipeline in the pipelines account) builds from `main` of `gnome-trading-group/gnome-controller`, deploys stage `Dev`, then waits at manual `ApproveProd`, then `Prod`. Each stage has ControllerFrontendStack, ControllerBackendStack, ControllerBacktestStack, ControllerResearchJobsStack, ControllerResearchStack, ControllerPipelineStack, ControllerServiceConfigStack, ControllerSystemHealthStack, ControllerMonitoringStack, and `LatencyProbeStack-<region>` for each of 13 regions. Pushing to `main` deploys dev with no PR checks (there is no `.github/` CI).
- What runs (all Lambdas behind the API unless noted):
  - Backtests: `gnome-backtest-{submit,get,list,cancel,logs}`; Batch jobs on `gnome-backtest-queue` run the `gnomepy-backtest:latest` image; an EventBridge rule on Batch state changes drives the status-handler Lambda, which updates `gnome-backtests`.
  - Research jobs: `gnome-research-job-{submit,inputs,get,list,cancel,logs}`; array jobs on `gnome-research-queue` with the `gnomepy-research-job:latest` image; inputs/outputs under `research-jobs/` in the research bucket; status-handler via EventBridge updates `gnome-research-jobs`. Spot retries only for reclaimed instances and image pulls.
  - Research sessions: `gnome-research-{create,list,get,update}-session`, `-record-iteration`, `-add-note`.
  - Service config: `gnome-service-config-{get,put,history}`.
  - System page: `gnome-system-health` (read-only, discovers alarms, EC2, queues, rules, RDS across all regions; assumes `gnome-system-health-pipelines-read` in the pipelines account). Prod only: `gnome-system-approvals`, which assumes `gnome-system-health-pipelines-approve` to approve or reject pipeline approvals; both roles are created by gnome-shared-infra.
  - Latency probes: an orchestrator in BackendStack invokes the `latency-probe` Lambda in each region.
- Logs / alarms:
  - Lambda logs are in `/aws/lambda/<functionName>`; Batch container logs are in `/aws/batch/job` (the UI reads them through the `*-logs` routes).
  - Alarms (ControllerMonitoringStack, no actions; the registry's alerting stack reads the severity from the suffix
    and links its `Controller` runbook). None page: they break the UI or a research run, not trading.
    - `Controller--ControllerApi-Fault-Count-Error`: 5+ API 5xx in 5 min. Any API Lambda that throws or times out shows up here; find
      which route in the API's execution logs or the Lambda's own logs.
    - `Controller--BacktestStatusHandler-Fault-Count-Error`, `Controller--ResearchJobStatusHandler-Fault-Count-Error`:
      the Lambda
      that records Batch state changes failed, so a backtest or research job may show as running forever. Read its
      logs, fix, then correct the stuck rows (the Batch job's real state is in the Batch console).
    - Add alarms through the `MonitoringFacade` in `monitoring-stack.ts` (cdk-monitoring-constructs, the same setup as
      the registry, classifier and market data): prefix `Controller-`, no-op actions, keyed by tier so names end in
      `-Critical|-Error|-Warning`. Event-driven Lambdas need their own fault alarm; API-backed ones are covered by
      the 5xx alarm.
  - A failing UI route usually means the backing API in another repo (registry, launcher, market data) or the gnome-pipelines Lambdas behind `research/{pipelines,datasets,artifacts}`. Check which `*Api` in `src/utils/api.ts` the page calls before looking here.
  - A stuck backtest or research job: check the Batch queue and spot capacity first, then the logs of the status-handler Lambda, which records every Batch state change in the table.
- Runbooks: none in this repo (no `docs/`). Alerts in the UI link to runbooks through `runbookUrl`, which comes from the registry's alerting.
