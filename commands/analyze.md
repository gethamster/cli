---
description: "Analyze a Hamster Studio brief: read tasks, build dependency graph, map to codebase (read-only, no changes)"
argument-hint: "[brief-slug-or-url]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Agent", "AskUserQuestion"]
---

# Analyze Hamster Brief

Read-only analysis of a Hamster Studio brief. Reads all tasks from `.hamster/`, builds the dependency graph, maps tasks to codebase files, and presents the execution plan — without making any changes.

**Argument**: "$ARGUMENTS"

---

## Prerequisites Check

```bash
[ -d ".hamster" ] || { echo ".hamster/ not found. Run 'hamster sync' first."; exit 1; }
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
echo "Account: $account"
```

---

## Brief Selection

### If argument is provided ("$ARGUMENTS" is not empty):

**Parse the argument** — extract a brief slug from a URL or use as-is:
```bash
arg="$ARGUMENTS"
arg="${arg%/}"
if echo "$arg" | grep -qE '^https?://'; then
  slug=$(echo "$arg" | sed -E 's|^https?://[^/]+/home/[^/]+/briefs/([^/]+)(/tasks)?$|\1|')
else
  slug="$arg"
fi
ls ".hamster/${account}/briefs/${slug}/brief.md" && echo "Found: $slug"
```

### If no argument provided:

**List actionable briefs** (same script as `/goham:execute`):
```bash
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
briefs_dir=".hamster/${account}/briefs"
last_status=""
index=0
for brief_dir in "${briefs_dir}"/*/; do
  [ ! -d "$brief_dir" ] && continue
  slug=$(basename "$brief_dir")
  brief_file="${brief_dir}brief.md"
  [ ! -f "$brief_file" ] && continue
  tasks_dir="${brief_dir}tasks"
  [ ! -d "$tasks_dir" ] && continue
  brief_status=$(awk '/^---$/{n++; next} n==1 && /^status:/{gsub(/["'"'"']/, "", $2); print $2; exit}' "$brief_file")
  case "$brief_status" in aligned|delivering|refining) ;; *) continue ;; esac
  total=$(ls "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$total" -eq 0 ] && continue
  done_count=$(grep -l '^status: "done"' "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' ')
  title=$(awk '/^---$/{n++; next} n==1 && /^title:/{sub(/^title: *"?/, ""); sub(/"$/, ""); print; exit}' "$brief_file")
  echo "${brief_status}|${slug}|${title}|${done_count}|${total}"
done | sort -t'|' -k1,1 | while IFS='|' read -r bstatus bslug btitle bdone btotal; do
  if [ "$bstatus" != "$last_status" ]; then
    [ -n "$last_status" ] && echo ""
    printf "  %s:\n" "$(echo "$bstatus" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
    last_status="$bstatus"
  fi
  index=$((index + 1))
  printf "    %2d. %-55s (%s/%s tasks done)  [%s]\n" "$index" "$btitle" "$bdone" "$btotal" "$bslug"
done
```

Use AskUserQuestion to let the user pick.

---

## Analysis

Launch the **brief-analyzer** agent with:
- The resolved brief slug
- The account slug
- Project root directory

---

## Present Results

Display the full execution plan from the analyzer:
- Brief summary
- Dependency graph
- Execution order
- Codebase mapping
- Risk assessment
- PR strategy
- Conventions that apply

---

## Offer Transition

After presenting the analysis, offer to transition to execution:

Use AskUserQuestion:
- "Would you like to execute this brief?"
- Options: "Yes, execute now" → run `/goham:execute {slug}`, "No, just analyzing" → end

---

## Notes

- This command makes NO code changes, NO git operations, NO status updates
- Safe to run repeatedly to understand brief scope
- Useful for reviewing a brief before committing to execution
- The analysis output can be used to plan manual implementation if preferred
