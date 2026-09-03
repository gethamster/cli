# Brief Selection and Scheduling

Duplicated byte-for-byte into the plan skill (which runs both sections) and the resume skill (Scheduling only), because every skill directory is self-contained; `scripts/validate-plugin.mjs` fails the build when the copies diverge. Edit all three together and keep the section names and behavior stable.

Both sections assume `$account` from the calling skill's account discovery step.

---

## Brief Selection

### If argument provided

Extract a slug from URL/UUID/slug and verify in one call:

```bash
arg="$ARGUMENTS"; arg="${arg%/}"
if echo "$arg" | grep -qE '^https?://'; then
  identifier=$(echo "$arg" | sed -E 's|^https?://[^/]+/home/[^/]+/briefs/([^/]+)(/tasks)?$|\1|')
else identifier="$arg"; fi
if echo "$identifier" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  slug=""
  for brief_dir in .hamster/${account}/briefs/*/; do
    bf="${brief_dir}brief.md"; [ -f "$bf" ] || continue
    eid=$(awk '
      /^---$/ { n++; if (n == 2) exit; next }
      n == 1 && match($0, /^entity_id:/) {
        v = substr($0, RLENGTH + 1); sub(/^[ \t]+/, "", v)
        sub(/^"/, "", v); sub(/"$/, "", v); gsub(/\\"/, "\"", v)
        print v; exit
      }' "$bf")
    [ "$eid" = "$identifier" ] && { slug=$(basename "$brief_dir"); break; }
  done
else slug="$identifier"; fi
if [ -f ".hamster/${account}/briefs/${slug}/brief.md" ]; then echo "FOUND: $slug"
else echo "NOT_FOUND: $identifier"; ls -d .hamster/${account}/briefs/*${slug}*/ 2>/dev/null | head -5; fi
```

If `NOT_FOUND`, suggest the partial matches shown.

### If no argument

List actionable briefs and ask the user to pick:

```bash
briefs_dir=".hamster/${account}/briefs"
for brief_dir in "${briefs_dir}"/*/; do
  [ -d "$brief_dir" ] || continue
  slug=$(basename "$brief_dir"); brief_file="${brief_dir}brief.md"; tasks_dir="${brief_dir}tasks"
  [ -f "$brief_file" ] && [ -d "$tasks_dir" ] || continue
  meta=$(awk '
    /^---$/ { n++; if (n == 2) { print s "|" t; exit } next }
    n == 1 && match($0, /^[a-z_]+:/) {
      k = substr($0, 1, RLENGTH - 1); v = substr($0, RLENGTH + 1); sub(/^[ \t]+/, "", v)
      sub(/^"/, "", v); sub(/"$/, "", v); gsub(/\\"/, "\"", v)
      if (k == "status") s = v; else if (k == "title") t = v
    }' "$brief_file")
  brief_status="${meta%%|*}"; title="${meta#*|}"
  case "$brief_status" in aligned|delivering|refining) ;; *) continue ;; esac
  total=$(ls "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' '); [ "$total" -eq 0 ] && continue
  done_count=$(grep -l '^status: "done"' "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' ')
  echo "${brief_status}|${slug}|${done_count}/${total}|${title}"
done | sort -t'|' -k1,1
```

Output is `status|slug|done/total|title`. Title is last so a `|` inside it cannot shift the machine-read fields.

---

## Scheduling (inline — no planner agent)

The plan already exists; this step only organizes it into waves. Parse all task frontmatter in one call:

```bash
tasks_dir=".hamster/${account}/briefs/${slug}/tasks"
for f in "$tasks_dir"/*.md; do
  [ -f "$f" ] || continue
  awk -v file="$f" '
    /^---$/ { n++; if (n == 2) { print v["display_id"] "|" v["entity_id"] "|" v["parent_task_id"] "|" v["status"] "|" file "|" v["title"]; exit } next }
    n == 1 && match($0, /^[a-z_]+:/) {
      k = substr($0, 1, RLENGTH - 1); s = substr($0, RLENGTH + 1); sub(/^[ \t]+/, "", s)
      sub(/^"/, "", s); sub(/"$/, "", s); gsub(/\\"/, "\"", s)
      v[k] = s
    }' "$f"
done | sort -t'|' -k1,1
```

Each row is `HAM-123|entity-uuid|parent-uuid|status|path|Title` — the awk strips only the outer quotes of a frontmatter value, so a title containing a quote survives, and title sits last so a `|` inside it cannot shift the earlier fields.

1. **Build the tree**: rows with empty `parent_task_id` are parents; rows whose `parent_task_id` matches a parent's `entity_id` are its subtasks. A parent with no subtasks is standalone.
2. **Filter**: skip parents whose entire subtree is `done`. Parents with `in_progress` tasks go in the earliest wave.
3. **Detect overlap** between remaining parents. Extract concrete mentions (file paths, PascalCase components, module names) from parent task bodies in one call:
   ```bash
   for f in {parent-task-files}; do
     echo "== $(basename "$f")"
     grep -ohE '[A-Za-z0-9_./-]+\.[a-z]{2,4}|[A-Z][a-z]+[A-Z][A-Za-z]+' "$f" | sort -u | head -20
   done
   ```
   Two parents sharing 2+ concrete mentions → conflict → serialize into different waves. Judgment call: titles clearly touching the same feature area also conflict. Do NOT search the codebase for this — task text only.
4. **Group greedily into waves**: Wave 1 = all mutually non-conflicting parents; conflicting parents fall to later waves.

Show the user a compact schedule and ask the user once to confirm ("Execute this schedule?" / "Modify" / "Cancel"):

```
{brief title} — {n} parents, {m} subtasks remaining ({d} done)

Wave 1 (parallel): HAM-100 {title}, HAM-300 {title}
Wave 2:            HAM-200 {title}  (conflicts with HAM-100: both touch auth/UserService)
```
