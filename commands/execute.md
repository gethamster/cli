---
description: "Execute a Hamster Studio brief end-to-end: analyze, implement tasks, review, simplify, commit, and create PR"
argument-hint: "[brief-slug-or-url]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Write", "Edit", "Agent", "LSP", "AskUserQuestion"]
---

# Execute Hamster Brief

Orchestrates the full execution of a Hamster Studio brief using specialized agents. Reads briefs/tasks from `.hamster/`, implements them sequentially with dependency awareness, reviews and simplifies code, and manages git operations with commits after each subtask.

**Argument**: "$ARGUMENTS"

---

## Prerequisites Check

Run the following to verify all requirements at once:

```bash
errors=""
which hamster >/dev/null 2>&1 || errors="${errors}hamster CLI not found. Install from https://tryhamster.com\n"
[ -d ".hamster" ] || errors="${errors}.hamster/ directory not found. Run 'hamster sync' first.\n"
which gh >/dev/null 2>&1 || errors="${errors}gh CLI not found. Install from https://cli.github.com\n"
dirty=$(git status --porcelain 2>/dev/null | head -5)
[ -n "$dirty" ] && errors="${errors}Uncommitted changes:\n${dirty}\n"
if [ -n "$errors" ]; then printf "PREREQ_FAIL:\n$errors"; else echo "PREREQ_OK"; fi
```

- If `PREREQ_FAIL`: show the errors to the user and stop (except for uncommitted changes — ask whether to proceed or stash)
- If `PREREQ_OK`: continue

**Discover account slug**:
```bash
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
echo "$account"
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
echo "$slug"
```

**Verify it exists**:
```bash
ls ".hamster/${account}/briefs/${slug}/brief.md"
```

If not found, search for partial matches:
```bash
ls -d .hamster/${account}/briefs/*${slug}*/ 2>/dev/null | head -5
```

### If no argument provided:

**List actionable briefs** with task counts grouped by status:
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

Present this output to the user and use AskUserQuestion to let them pick a brief. The `[slug]` at the end of each line is the value to use.

---

## Analysis Phase

Launch the **brief-analyzer** agent with:
- The resolved brief slug
- The account slug
- Project root directory

The analyzer will return an execution plan with:
- Dependency graph (parent/subtask tree)
- Codebase mapping (files per task)
- Execution order
- Risk assessment
- PR strategy

**Display the execution plan to the user and ask for confirmation before proceeding.**

Use AskUserQuestion:
- "Execute this plan?" with options: "Yes, execute", "Modify plan", "Cancel"
- If "Modify plan": ask what to change, adjust, re-confirm
- If "Cancel": stop execution

---

## Branch Creation

**Get the lowest display ID for branch naming**:
```bash
tasks_dir=".hamster/${account}/briefs/${slug}/tasks"
lowest_id=$(ls "$tasks_dir"/*.md 2>/dev/null | xargs -I{} basename {} | grep -oE 'ham-[0-9]+' | sed 's/ham-//' | sort -n | head -1)
echo "feature/ham-${lowest_id}-${slug}"
```

Launch the **commit-manager** agent with operation: **Create Feature Branch**
- Brief slug and the lowest ID number computed above

---

## Execution Loop

Process tasks in the order determined by the analyzer's execution plan.

### For each parent task:

#### 1. Execute Subtasks

For each subtask under this parent (in order):

**a. Implement**: Launch **task-executor** agent with:
- The subtask's display ID
- Brief slug and account slug
- Codebase mapping for this task
- Brief context summary
- Project conventions

**b. Commit**: Launch **commit-manager** agent with operation: **Commit Subtask**
- The subtask's display ID
- List of files changed (from task-executor's report)
- Description of changes

If the pre-commit hook fails, read the error, fix the issues, and create a new commit (never amend).

#### 2. Mark Parent Done

After all subtasks complete:
```bash
hamster task status {PARENT-DISPLAY-ID} done
```

If the parent task has no subtasks (standalone task), execute it directly as if it were a subtask, then mark it done.

#### 3. Review

Launch **task-reviewer** agent with:
- Parent task display ID
- All subtask display IDs
- All files changed during this parent task
- Brief context

**If verdict is NEEDS_FIXES**:
1. Read the specific issues from the review
2. Fix each issue (using Edit tool directly — no need to re-launch task-executor for small fixes)
3. Launch **commit-manager** with operation: **Commit Review Fixes**
4. Re-run **task-reviewer** to verify fixes
5. Maximum 2 review rounds — if still failing, report issues to user

**If verdict is PASS**: continue to simplification

#### 4. Simplify

Launch **code-simplifier** agent with:
- Files changed during this parent task
- Brief context
- Parent task display ID

If the simplifier makes changes:
- Launch **commit-manager** with operation: **Commit Simplification**

If no changes needed: continue

#### 5. Progress Report

After each parent task completes, report progress:
```
Completed: HAM-{id}: {title}
  Subtasks: {n}/{n} done
  Review: PASS
  Simplification: {changes made / no changes}
  Commits: {n} commits

Remaining: {n} parent tasks
```

---

## Completion

### Final Validation

Run the full validation suite:
```bash
pnpm typecheck && pnpm lint
```

If tests are configured for the affected areas:
```bash
pnpm test
```

### Create PR

Launch **commit-manager** agent with operation: **Push and Create PR**
- Brief title (from the brief.md frontmatter)
- Brief slug
- Complete task list with display IDs and titles
- Summary of all changes made

### Update Brief Status

```bash
hamster brief status {slug} delivering
```

### Final Report

```
Brief execution complete!

  Brief: {title}
  Branch: feature/ham-{id}-{slug}
  PR: {PR URL}
  Tasks completed: {n}/{total}
  Commits: {total commits}
  Review rounds: {n}

  All tasks implemented, reviewed, and simplified.
```

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| Hamster CLI not found | Stop with installation instructions |
| `.hamster/` missing | Stop — tell user to run `hamster sync` |
| Brief not found | Search for partial matches in `.hamster/{account}/briefs/`, suggest closest |
| Auth expired | Run `hamster auth login`, continue without status updates if still fails |
| Typecheck/lint fails after task | Fix errors, re-run; if stuck after 3 attempts, ask user |
| Git conflict | Report to user, pause execution |
| Pre-commit hook fails | Fix the issues, create a new commit (never `--no-verify`) |
| Task already done | Skip it, move to next |
| Agent fails | Report error, ask user whether to retry or skip |

---

## Notes

- Each subtask gets its own commit for clean git history
- Review happens at the parent-task level (not per-subtask)
- Simplification is optional — if code is already clean, skip
- The user can interrupt at any time — use `/hamster:resume` to continue later
- Prefer a single PR for the entire brief unless it grows too large
- If the brief is very large (>15 tasks), confirm with the user whether to split into multiple PRs
