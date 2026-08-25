#!/usr/bin/env bash
set -euo pipefail

# Installs this repository's Codex-compatible plugin root under CODEX_HOME.
# Default mode is symlink for easy local iteration.

MODE="${1:-link}" # link | copy

case "${MODE}" in
  link | copy) ;;
  *)
    echo "Usage: $0 [link|copy]" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_ENTRIES=(.codex-plugin .mcp.json skills agents assets)

for plugin_entry in "${PLUGIN_ENTRIES[@]}"; do
  if [[ ! -e "${REPO_ROOT}/${plugin_entry}" ]]; then
    echo "Error: missing plugin entry at ${REPO_ROOT}/${plugin_entry}" >&2
    exit 1
  fi
done

CODEX_HOME="${CODEX_HOME:-${HOME}/.codex}"
TARGET_PLUGIN_DIR="${CODEX_HOME}/plugins/hamster"

if [[ -L "${TARGET_PLUGIN_DIR}" || -d "${TARGET_PLUGIN_DIR}" || -f "${TARGET_PLUGIN_DIR}" ]]; then
  rm -rf "${TARGET_PLUGIN_DIR}"
fi

mkdir -p "${TARGET_PLUGIN_DIR}"

for plugin_entry in "${PLUGIN_ENTRIES[@]}"; do
  case "${MODE}" in
    link)
      ln -s "${REPO_ROOT}/${plugin_entry}" "${TARGET_PLUGIN_DIR}/${plugin_entry}"
      ;;
    copy)
      cp -R "${REPO_ROOT}/${plugin_entry}" "${TARGET_PLUGIN_DIR}/${plugin_entry}"
      ;;
  esac
done

case "${MODE}" in
  link) echo "Linked Codex plugin:" ;;
  copy) echo "Copied Codex plugin:" ;;
esac

echo "  source: ${REPO_ROOT}"
echo "  target: ${TARGET_PLUGIN_DIR}"
echo
echo "If your Codex host requires explicit plugin registration,"
echo "point it at: ${TARGET_PLUGIN_DIR}/.codex-plugin/plugin.json"
