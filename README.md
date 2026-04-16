# gnome-controller

The operator UI + backend APIs for running backtests and the Gnomie AI assistant. The frontend is a React/Vite app; the backend runs in two modes:

- **Local dev**: FastAPI server at `dev/server.py` that runs backtests as subprocesses and proxies to DynamoDB/Secrets Manager.
- **Prod**: AWS Lambda + API Gateway + Batch, deployed via CDK Pipelines.

This README covers local dev setup. For deploy/CDK architecture, see `cdk/README.md`.

## Local dev setup

### 1. Prerequisites

- Python 3.13 (via `pyenv` or system install)
- Node 20+ and npm
- [Poetry](https://python-poetry.org/docs/#installation) for the Python server
- AWS CLI v2 with SSO configured
- A JDK 21 on `PATH` (for the JPype bridge — the backtest runs Java under the hood)

### 2. AWS SSO

Configure `~/.aws/config` with dev/prod profiles. Get the account IDs and SSO
start URL from the team's internal secrets store (1Password / Notion).

```ini
[sso-session gnome]
sso_start_url = <YOUR_SSO_START_URL>
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile dev]
sso_session = gnome
sso_account_id = <DEV_ACCOUNT_ID>
sso_role_name = AWSAdministratorAccess
region = us-east-1

[profile prod]
sso_session = gnome
sso_account_id = <PROD_ACCOUNT_ID>
sso_role_name = AWSAdministratorAccess
region = us-east-1
```

Then log in:

```bash
aws sso login --profile dev
aws sts get-caller-identity --profile dev   # confirm the returned account matches DEV_ACCOUNT_ID
```

Tip: leave `[default]` empty. It forces every AWS call to pass `--profile` explicitly so you don't accidentally hit prod.

### 3. Create your dev `.env`

Copy the template and fill in values:

```bash
cp dev/.env.example dev/.env
```

`dev/.env` (gitignored) should contain:

```bash
# --- AWS ---
AWS_PROFILE=dev

# --- Registry (picks host from STAGE, key from GNOME_REGISTRY_API_KEY) ---
STAGE=dev
GNOME_REGISTRY_API_KEY=<dev-registry-key>

# --- GitHub ---
GH_TOKEN=<fine-grained-PAT-with-gnomepy_research-rw>

# --- LLM ---
ANTHROPIC_API_KEY=<sk-ant-...>
OPENAI_API_KEY=

# --- Controller URLs ---
CONTROLLER_API_URL=http://localhost:5050/api
```

Shared dev secrets live in Secrets Manager. Pull them with:

```bash
bash dev/bootstrap-env.sh   # regenerates dev/.env from SM using AWS_PROFILE=dev
```

### 4. Run the backend

```bash
cd dev
poetry install
poetry run python server.py
```

Startup banner shows the resolved env; warnings fire loudly if anything critical is missing. Server listens on `http://localhost:5050`.

Control verbosity:

```bash
LOG_LEVEL=DEBUG poetry run python server.py      # show subprocess cmds, etc.
LOG_LEVEL=WARNING poetry run python server.py    # drop access logs
NO_COLOR=1 poetry run python server.py           # plain output for piping
```

### 5. Run the frontend

Separate terminal:

```bash
npm install
cp .env.example .env.local   # fill in VITE_* values
npm run dev                   # http://localhost:5173
```

`.env.local` (gitignored) needs:

```bash
VITE_CONTROLLER_API_URL=http://localhost:5050/api
VITE_REGISTRY_API_URL=<DEV_REGISTRY_API_URL>   # from team secrets store
VITE_REGISTRY_API_KEY=<dev-registry-key>
```

Note: `VITE_REGISTRY_API_KEY` and the backend `GNOME_REGISTRY_API_KEY` are separate variables. They're often the same value, but Vite requires the `VITE_` prefix to expose it to the browser bundle.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
