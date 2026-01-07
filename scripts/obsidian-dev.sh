#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT_PATH="${VAULT_PATH:-${1:-}}"

if [[ -z "${VAULT_PATH}" ]]; then
  echo "Usage: VAULT_PATH=/path/to/vault ./scripts/obsidian-dev.sh"
  echo "Or:    ./scripts/obsidian-dev.sh /path/to/vault"
  exit 1
fi

PLUGIN_DIR="${VAULT_PATH}/.obsidian/plugins/mise-en-place"

mkdir -p "${VAULT_PATH}/.obsidian/plugins"

if [[ -e "${PLUGIN_DIR}" && ! -L "${PLUGIN_DIR}" ]]; then
  echo "Error: ${PLUGIN_DIR} exists and is not a symlink."
  echo "Move it aside (or delete it) before running dev workflow."
  exit 1
fi

if [[ ! -L "${PLUGIN_DIR}" ]]; then
  ln -s "${ROOT_DIR}" "${PLUGIN_DIR}"
  echo "Symlinked ${PLUGIN_DIR} -> ${ROOT_DIR}"
fi

cd "${ROOT_DIR}"
echo "Starting esbuild watch..."
npm run dev
