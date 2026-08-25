#!/usr/bin/env bash
set -euo pipefail

# Installs this repository's Codex plugin manifest into local Codex config.
# Default mode is symlink for easy local iteration.

MODE="${1:-link}" # link | copy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_PLUGIN_DIR="${REPO_ROOT}/.codex-plugin"
SOURCE_PLUGIN_JSON="${SOURCE_PLUGIN_DIR}/plugin.json"

if [[ ! -f "${SOURCE_PLUGIN_JSON}" ]]; then
  echo "Error: missing plugin manifest at ${SOURCE_PLUGIN_JSON}" >&2
  exit 1
fi

CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
TARGET_ROOT="${CODEX_HOME}/plugins"
TARGET_PLUGIN_DIR="${TARGET_ROOT}/hamster"

mkdir -p "${TARGET_ROOT}"

if [[ -L "${TARGET_PLUGIN_DIR}" || -d "${TARGET_PLUGIN_DIR}" || -f "${TARGET_PLUGIN_DIR}" ]]; then
  rm -rf "${TARGET_PLUGIN_DIR}"
fi

case "${MODE}" in
  link)
    ln -s "${SOURCE_PLUGIN_DIR}" "${TARGET_PLUGIN_DIR}"
    echo "Linked Codex plugin:"
    ;;
  copy)
    cp -R "${SOURCE_PLUGIN_DIR}" "${TARGET_PLUGIN_DIR}"
    echo "Copied Codex plugin:"
    ;;
  *)
    echo "Usage: $0 [link|copy]" >&2
    exit 1
    ;;
esac

echo "  source: ${SOURCE_PLUGIN_DIR}"
echo "  target: ${TARGET_PLUGIN_DIR}"
echo
echo "Next steps:"
echo "  1) Verify plugin files:"
echo "     ls -la \"${TARGET_PLUGIN_DIR}\""
echo "  2) If your Codex host requires explicit plugin registration,"
echo "     point it at: ${TARGET_PLUGIN_DIR}/plugin.json"
