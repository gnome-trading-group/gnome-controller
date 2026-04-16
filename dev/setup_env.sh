#!/usr/bin/env bash
# Fetch shared dev secrets into dev/.env. Idempotent. Requires `aws sso login --profile dev` first.
set -euo pipefail
cd "$(dirname "$0")"
PROFILE="${AWS_PROFILE:-dev}"

aws sts get-caller-identity --profile "$PROFILE" >/dev/null # fail loudly if not logged in

fetch() { aws secretsmanager get-secret-value --profile "$PROFILE" --secret-id "$1" --query SecretString --output text; }

cat >.env <<EOF
AWS_PROFILE=$PROFILE
STAGE=dev
GNOME_REGISTRY_API_KEY=$(fetch gnome-registry-api-key-dev)
GH_TOKEN=$(fetch gnome-github-token-dev)
ANTHROPIC_API_KEY=$(fetch gnome-anthropic-api-key-dev)
OPENAI_API_KEY=
CONTROLLER_API_URL=http://localhost:5050/api
EOF

chmod 600 .env
echo "dev/.env regenerated."
