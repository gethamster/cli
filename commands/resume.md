---
description: "Resume an interrupted brief execution: auto-detect progress and continue from where you left off"
argument-hint: "[brief-slug]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Write", "Edit", "Agent", "LSP", "AskUserQuestion"]
---

# Resume Brief Execution

Resumes an interrupted `/hamster:execute` session. Auto-detects the brief from git branch name or in-progress tasks, finds the resume point, and continues the execution loop.

**Argument**: "$ARGUMENTS"

---

## Detection

### Step 1: Discover Account Slug

```bash
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
echo "Account: $account"
```

### Step 2: Identify the Brief

Try these methods in order:

**Method A — Argument provided** ("$ARGUMENTS" is not empty):
```bash
slug="$ARGUMENTS"
ls ".hamster/${account}/briefs/${slug}/brief.md" 2>/dev/null && echo "Found: $slug"
```

**Method B — Git branch name**:
```bash
branch=$(git branch --show-current 2>/dev/null)
if echo "$branch" | grep -qE '^feature/ham-[0-9]+-'; then
  slug=$(echo "$branch" | sed -E 's/^feature\/ham-[0-9]+-//')
  echo "Detected from branch: $slug"
fi
```

**Method C — In-progress tasks** (scan all briefs for tasks with `in_progress` status):
```bash
for tasks_dir in .hamster/${account}/briefs/*/tasks; do
  [ ! -d "$tasks_dir" ] && continue
  matches=$(grep -l '^status: "in_progress"' "$tasks_dir"/*.md 2>/dev/null)
  if [ -n "$matches" ]; then
    brief_slug=$(basename "$(dirname "$tasks_dir")")
    in_progress_tasks=$(echo "$matches" | xargs -I{} basename {} .md | grep -oE 'ham-[0-9]+' | tr '[:lower:]' '[:upper:]' | tr '\n' ', ' | sed 's/,$//')
    echo "${brief_slug}: ${in_progress_tasks}"
  fi
done
```

If multiple briefs have in-progress tasks, use AskUserQuestion to let the user choose.

**Method D — None found**:
- Tell the user no interrupted execution was detected
- Suggest running `/hamster:analyze` to pick a brief, or `/hamster:execute` to start fresh

---

## Analysis

Launch the **brief-analyzer** agent to produce a fresh execution plan:
- Brief slug (from detection)
- Account slug
- Project root

---

## Find Resume Point

From the analyzer's execution plan, determine where to resume:

1. Walk through the execution order
2. Skip tasks with status `done`
3. If a task is `in_progress`, it's the resume point (may need re-implementation)
4. If all tasks under a parent are `done` but the parent isn't, resume at the review step
5. First `todo` task after all `done` tasks is the resume point

Report the resume point to the user:

```
Resuming brief: {title}

  Completed:
    HAM-100: Parent Task 1 (done)
      HAM-101: Subtask 1 (done)
      HAM-102: Subtask 2 (done)

  Resuming from:
    HAM-200: Parent Task 2 (todo)
      HAM-201: Subtask 3 (todo)  <-- starting here
      HAM-202: Subtask 4 (todo)

  Remaining: {n} tasks
```

---

## Confirmation

Use AskUserQuestion:
- "Resume execution from HAM-{id}?"
- Options: "Yes, resume", "Start from a different task", "Cancel"

If "Start from a different task": ask which task display ID to start from.

---

## Continue Execution

Once confirmed, continue the execution loop from `/hamster:execute`:

### Check Branch

Verify we're on the correct feature branch:
- If on the expected `feature/ham-{id}-{slug}` branch: continue
- If on a different branch: ask user whether to switch or create a new branch

### Resume Loop

Continue the execution loop exactly as in `/hamster:execute`, starting from the resume point:

For each remaining parent task:
1. Execute subtasks → commit each
2. Mark parent done
3. Review → fix if needed → commit
4. Simplify → commit if changes
5. Progress report

### Completion

Same as `/hamster:execute`:
1. Final validation (project checks)
2. Push and create PR (or update existing PR)
3. Update brief status
4. Final report

---

## Special Cases

### In-Progress Task

If a task was `in_progress` when execution was interrupted:
- Read its task file to understand requirements
- Check `git diff` to see if partial work exists
- If partial work exists, continue from where it left off
- If no changes exist, re-implement from scratch

### Existing PR

If a PR already exists for this branch:
- Push new commits to the same branch
- The PR updates automatically
- Skip PR creation at the end, just report the existing PR URL

### Dirty Working Directory

If there are uncommitted changes when resuming:
- Show the changes to the user
- Ask whether to: commit them as part of the current task, stash them, or discard them

---

## Notes

- Resume is designed to be safe — it re-analyzes before continuing
- The fresh analysis ensures the execution plan reflects current task statuses
- Partial implementations from interrupted tasks are preserved when possible
- If the brief has changed since the last execution, the new analysis will reflect that
