#!/usr/bin/env bash
# Copy canonical skills/agents/logo into the skill-only Codex marketplace plugin.
# Usage:
#   scripts/sync-codex-marketplace.sh         # copy
#   scripts/sync-codex-marketplace.sh --check  # fail if stale or not skill-only
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/plugins/hamster-skills"
check=0
if [ "${1:-}" = "--check" ]; then
  check=1
fi

skills="ask ship plan resume review qa retro"
forbidden_files=".mcp.json .app.json hooks.json hooks/hooks.json"
forbidden_fields="mcpServers apps hooks capabilities"

copy_file() {
  local src="$1"
  local dst="$2"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

same_file() {
  cmp -s "$1" "$2"
}

fail() {
  echo "sync-codex-marketplace: $*" >&2
  exit 1
}

if [ ! -f "$dest/.codex-plugin/plugin.json" ]; then
  fail "missing $dest/.codex-plugin/plugin.json"
fi

if [ "$check" -eq 1 ]; then
  for name in $skills; do
    src="$root/skills/$name/SKILL.md"
    dst="$dest/skills/$name/SKILL.md"
    [ -f "$src" ] || fail "missing $src"
    [ -f "$dst" ] || fail "missing $dst (run scripts/sync-codex-marketplace.sh)"
    same_file "$src" "$dst" || fail "stale $dst"
  done
  for agent in task-executor.md wave-reviewer.md; do
    src="$root/agents/$agent"
    dst="$dest/agents/$agent"
    [ -f "$src" ] || fail "missing $src"
    [ -f "$dst" ] || fail "missing $dst (run scripts/sync-codex-marketplace.sh)"
    same_file "$src" "$dst" || fail "stale $dst"
  done
  src="$root/assets/logo.svg"
  dst="$dest/assets/logo.svg"
  [ -f "$src" ] || fail "missing $src"
  [ -f "$dst" ] || fail "missing $dst (run scripts/sync-codex-marketplace.sh)"
  same_file "$src" "$dst" || fail "stale $dst"

  for f in $forbidden_files; do
    [ ! -e "$dest/$f" ] || fail "forbidden file $dest/$f"
  done

  manifest="$dest/.codex-plugin/plugin.json"
  python3 -m json.tool "$manifest" >/dev/null || fail "invalid JSON: $manifest"
  for field in $forbidden_fields; do
    python3 -c "
import json, sys
with open(sys.argv[1]) as f:
    data = json.load(f)
if '$field' in data or '$field' in data.get('interface', {}):
    sys.exit(1)
" "$manifest" || fail "forbidden field '$field' in $manifest"
  done
  echo "sync-codex-marketplace: ok"
  exit 0
fi

for name in $skills; do
  copy_file "$root/skills/$name/SKILL.md" "$dest/skills/$name/SKILL.md"
done
for agent in task-executor.md wave-reviewer.md; do
  copy_file "$root/agents/$agent" "$dest/agents/$agent"
done
copy_file "$root/assets/logo.svg" "$dest/assets/logo.svg"
echo "sync-codex-marketplace: copied into $dest"
