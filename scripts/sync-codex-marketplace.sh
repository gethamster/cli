#!/usr/bin/env bash
# Copy canonical skills/agents/logo into the skill-only Codex marketplace plugin.
# Copies (not symlinks): the marketplace installer fetches only this directory,
# and Codex drops symlinks on install.
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

# Curated listing. Root skills/ is canonical; only these names ship in the plugin.
skills="ask ship plan resume review qa retro"
# Whole trees copied into the plugin (relative to repo root).
trees="agents"
for name in $skills; do
  trees="$trees skills/$name"
done
files="assets/logo.svg"
forbidden_files=".mcp.json .app.json hooks.json hooks/hooks.json"
forbidden_fields="mcpServers apps hooks capabilities"

same_file() {
  cmp -s "$1" "$2"
}

fail() {
  echo "sync-codex-marketplace: $*" >&2
  exit 1
}

rel_files() {
  local dir="$1"
  [ -d "$dir" ] || fail "missing $dir"
  (cd "$dir" && find . -type f | sed 's|^\./||' | sort)
}

if [ ! -f "$dest/.codex-plugin/plugin.json" ]; then
  fail "missing $dest/.codex-plugin/plugin.json"
fi

if [ "$check" -eq 1 ]; then
  for rel in $trees; do
    src="$root/$rel"
    dst="$dest/$rel"
    [ -d "$src" ] || fail "missing $src"
    [ -d "$dst" ] || fail "missing $dst (run scripts/sync-codex-marketplace.sh)"
    while IFS= read -r f; do
      [ -f "$dst/$f" ] || fail "missing $dst/$f (run scripts/sync-codex-marketplace.sh)"
      same_file "$src/$f" "$dst/$f" || fail "stale $dst/$f"
    done < <(rel_files "$src")
    while IFS= read -r f; do
      [ -f "$src/$f" ] || fail "extra $dst/$f (not in canonical tree)"
    done < <(rel_files "$dst")
  done
  for rel in $files; do
    src="$root/$rel"
    dst="$dest/$rel"
    [ -f "$src" ] || fail "missing $src"
    [ -f "$dst" ] || fail "missing $dst (run scripts/sync-codex-marketplace.sh)"
    same_file "$src" "$dst" || fail "stale $dst"
  done

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

for rel in $trees; do
  src="$root/$rel"
  dst="$dest/$rel"
  [ -d "$src" ] || fail "missing $src"
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
done
for rel in $files; do
  src="$root/$rel"
  dst="$dest/$rel"
  [ -f "$src" ] || fail "missing $src"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
done
echo "sync-codex-marketplace: copied into $dest"
