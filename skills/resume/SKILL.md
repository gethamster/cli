---
name: resume
description: "Resume an interrupted brief execution: auto-detect progress, reconstruct state from git history and task statuses, and continue from the correct wave. Use when the user wants to continue a previously interrupted /ship session."
argument-hint: "[brief-slug]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Write", "Edit", "Agent", "LSP", "AskUserQuestion"]
---

# Resume Brief Execution

Resumes an interrupted `/ship` session. Auto-detects the brief from git branch name or in-progress tasks, reconstructs execution state from task statuses, git log, and git status (no state file needed), then continues from the correct wave.

**Argument**: "$ARGUMENTS"

---

## Detection

### Step 1: Discover Account Slug

```bash
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
echo "Account: $account"
```

**Start live sync** so task status updates are reflected in local `.hamster/` files:
```bash
hamster sync --watch > /dev/null 2>&1 &
HAMSTER_SYNC_PID=$!
echo "Live sync started (PID: $HAMSTER_SYNC_PID)"
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
- Suggest running `/plan` to pick a brief, or `/ship` to start fresh

---

## Analysis

Launch the **brief-planner** agent to produce a fresh execution plan:
- Brief slug (from detection)
- Account slug
- Project root

The planner returns:
- Dependency graph (parent/subtask tree)
- **Parallel Waves** (which parents execute simultaneously)
- Task statuses (done/in_progress/todo)
- Conflict groups and execution order

---

## Find Resume Point

Reconstruct execution state from three sources — no state file needed:

### Source 1: Task Statuses (from brief-planner output)

The planner's execution plan includes current status for every task (done/in_progress/todo).

### Source 2: Git Log (committed parents)

```bash
git log --oneline | grep 'feat(ham-' | sed -E 's/.*feat\(ham-([0-9]+)\).*/HAM-\1/' | sort -u
```

This extracts HAM-IDs from commit messages to identify which parent tasks have been committed.

### Source 3: Git Status (uncommitted work)

```bash
git status --porcelain
```

Shows any in-flight changes from an interrupted executor.

### Walk Waves to Find Resume Point

Using the parallel waves from the brief-planner output, walk waves in order:

1. **For each wave**, check every parent task in that wave against the git log:
   - If ALL parents in the wave have `feat(ham-{id})` commits in git log → **wave is complete**, skip it
   - If SOME parents have commits but others don't → **partial wave**, resume from the uncommitted parents only
   - If NO parents have commits → **this is the resume wave**, start from the beginning of this wave

2. **For a partial wave**: filter out already-committed parents. The remaining parents in that wave become the resume targets.

3. **For in_progress tasks**: if `git status --porcelain` shows uncommitted changes and a task is `in_progress`, that task was interrupted mid-execution.

Report the resume point to the user:

```
Resuming brief: {title}

  Completed waves:
    Wave 1: HAM-100, HAM-300 (all committed)

  Resuming from Wave 2, Parent HAM-200:
    HAM-200: Parent Task B (todo)
      HAM-201: Subtask 3 (todo)  <-- starting here
      HAM-202: Subtask 4 (todo)
    HAM-400: Parent Task D (todo)
      HAM-401: Subtask 5 (todo)

  Remaining: {n} parent tasks across {m} waves
```

---

## Confirmation

Use AskUserQuestion:
- "Resume execution from HAM-{id}?"
- Options: "Yes, resume", "Start from a different task", "Cancel"

If "Start from a different task": ask which task display ID to start from.

---

## Continue Execution

Once confirmed, continue the execution loop from `/ship`, starting from the determined resume wave and position.

### Check Branch

Verify we're on the correct feature branch:
- If on the expected `feature/ham-{id}-{slug}` branch: continue
- If on a different branch: ask user whether to switch or create a new branch

### Resume Loop

Continue the wave-based execution loop exactly as in `/ship` Steps 1-7, starting from the resume wave:

**For each remaining wave (starting from the resume wave):**

#### Step 1: Parallel Execution

Launch ALL task-executor agents for this wave simultaneously (parallel Agent calls). For partial waves, launch only the uncommitted parents.

Each executor receives:
- Parent task display ID
- All subtask display IDs under this parent
- Brief slug and account slug
- Brief context summary
- Project conventions (from brief-planner output)

Wait for ALL executors to complete. Collect file lists from each.

#### Step 2: Post-Wave Validation

Run project validation once after all executors complete:

```bash
[ -f "package.json" ] && command -v pnpm >/dev/null && { pnpm typecheck 2>/dev/null; pnpm lint 2>/dev/null; }
[ -f "package.json" ] && command -v npm >/dev/null && ! command -v pnpm >/dev/null && { npm run typecheck 2>/dev/null; npm run lint 2>/dev/null; }
[ -f "package.json" ] && command -v yarn >/dev/null && ! command -v pnpm >/dev/null && { yarn typecheck 2>/dev/null; yarn lint 2>/dev/null; }
[ -f "Makefile" ] && make check 2>/dev/null
[ -f "Cargo.toml" ] && cargo check && cargo clippy 2>/dev/null
[ -f "go.mod" ] && go build ./... && go vet ./... 2>/dev/null
```

If validation fails: fix errors before proceeding.

#### Step 3: Parallel Quality Gates

Launch ALL quality-gate agents for this wave simultaneously (parallel Agent calls).

Each quality-gate receives:
- Parent task display ID
- Subtask display IDs
- List of files changed (from that executor's report)
- Brief context

Wait for ALL quality-gates to complete.

#### Step 4: Handle Quality Gate Results

For each quality-gate result:
- **NEEDS_FIXES**: Fix issues (small: Edit directly; large: re-launch task-executor). Re-run quality-gate. Max 2 rounds.
- **PASS**: Quality-gate may have made simplification changes — already in working tree.

#### Step 5: Commit Wave

For each parent in this wave (sequentially — commits are serial for git safety):

```bash
git add {file1} {file2} {file3}
git diff --cached --name-only
git commit -m "feat(ham-{id}): {concise description of parent task}

- {bullet: key change 1}
- {bullet: key change 2}

Task: HAM-{id}
Brief: {brief-slug}"
```

**NEVER use `git add .` or `git add -A`** — always stage specific files.

#### Step 6: Wave Progress Report

```
Wave {n} complete:
  HAM-{id}: {title} — {n} subtasks, PASS, {n} commits
  HAM-{id}: {title} — {n} subtasks, PASS, {n} commits

Remaining: {n} waves, {n} parent tasks
```

### Completion

Stop live sync, then same as `/ship`:
```bash
[ -n "$HAMSTER_SYNC_PID" ] && kill "$HAMSTER_SYNC_PID" 2>/dev/null && echo "Live sync stopped"
```
1. Final validation (project checks)
2. Check if PR already exists for this branch:
   - If PR exists: push new commits, report existing PR URL
   - If no PR: Use AskUserQuestion: "Create a PR?" with options: "Yes, create PR", "No, I'll do it later"
   - If yes: detect default branch, push, launch commit-manager with target branch
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

### Partial Wave

If a wave was partially completed (some parents committed, others not):
- Identify committed parents from `git log --oneline | grep 'feat(ham-'`
- Skip those parents — their work is already committed
- Resume only the uncommitted parents in that wave
- Launch executors only for the remaining parents (do NOT re-execute committed ones)
- Quality gates run only for the newly executed parents

---

## Notes

- Resume reconstructs state from task statuses, git log, and git status — no state file needed
- The fresh brief-planner analysis ensures the execution plan reflects current task statuses
- Wave-aware resume: walks waves in order, skips fully committed waves, handles partial waves
- Partial implementations from interrupted tasks are preserved when possible
- If the brief has changed since the last execution, the new analysis will reflect that
