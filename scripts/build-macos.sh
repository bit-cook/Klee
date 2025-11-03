#!/usr/bin/env bash

# Automated macOS build + notarize + verification helper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "⚠️  $ENV_FILE not found. Make sure required env vars are exported."
fi

REQUIRED_VARS=(APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID)
missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "❌ Missing required environment variables: ${missing[*]}"
  echo "   Please set them in $ENV_FILE or export them before running this script."
  exit 1
fi

VERSION="$(node -p "require('./client/package.json').version")"
echo "==> Building server workspace (types & API schema)…"
npm run build --workspace=server
echo "==> Building Klee v$VERSION for macOS (arm64)…"

npm run build --workspace=client

RELEASE_DIR="$ROOT_DIR/client/release/$VERSION"
APP_PATH="$RELEASE_DIR/mac-arm64/klee.app"
DMG_PATH="$RELEASE_DIR/klee_${VERSION}_arm64.dmg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "❌ Expected app bundle not found at: $APP_PATH"
  exit 1
fi

echo "==> Verifying codesign (deep & strict)…"
codesign --verify --deep --strict "$APP_PATH"

echo "==> Assessing Gatekeeper policy…"
spctl --assess --type execute "$APP_PATH"

echo "✅ Build, notarize, and verification complete."
echo
echo "Artifacts located at:"
echo "  - $APP_PATH"
if [[ -f "$DMG_PATH" ]]; then
  echo "  - $DMG_PATH"
fi
echo
echo "Release folder contents:"
ls -1 "$RELEASE_DIR"
