---
description: Ship a Hamster Studio brief. Merge base, implement in parallel waves, test, review, create bisectable commits, and optionally PR. Use when the user wants to execute or ship a brief.
---

# Ship Brief

Orchestrates the full execution of a Hamster Studio brief using specialized agents. Reads briefs/tasks from `.hamster/`, plans parallel execution waves, merges base branch, dispatches independent parent tasks simultaneously, gates on tests, reviews and simplifies code, creates bisectable commits, and optionally creates a PR.

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

**Start live sync** so task status updates are reflected in local `.hamster/` files:
```bash
hamster sync --watch > /dev/null 2>&1 &
HAMSTER_SYNC_PID=$!
echo "Live sync started (PID: $HAMSTER_SYNC_PID)"
```

---

## Brief Selection

### If argument is provided ("$ARGUMENTS" is not empty):

**Parse the argument** — extract a brief slug from a URL, UUID, or use as-is. URLs use a brief UUID (not slug) in the path, e.g. `https://tryhamster.com/home/hamster/briefs/2de8d546-...`:

```bash
arg="$ARGUMENTS"
arg="${arg%/}"

# Extract identifier from URL or use as-is
if echo "$arg" | grep -qE '^https?://'; then
  identifier=$(echo "$arg" | sed -E 's|^https?://[^/]+/home/[^/]+/briefs/([^/]+)(/tasks)?$|\1|')
else
  identifier="$arg"
fi

# If identifier is a UUID, resolve to slug via brief frontmatter
if echo "$identifier" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  slug=""
  for brief_dir in .hamster/${account}/briefs/*/; do
    bf="${brief_dir}brief.md"
    [ -f "$bf" ] || continue
    eid=$(awk -F'"' '/^---$/{n++; next} n==1 && /^entity_id:/ { print $2; exit }' "$bf")
    if [ "$eid" = "$identifier" ]; then
      slug=$(basename "$brief_dir")
      break
    fi
  done
  [ -z "$slug" ] && echo "No brief found with ID $identifier"
else
  slug="$identifier"
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
  brief_status=$(awk -F'"' '/^---$/{n++; next} n==1 && /^status:/ { print $2; exit }' "$brief_file")
  case "$brief_status" in aligned|delivering|refining) ;; *) continue ;; esac
  total=$(ls "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$total" -eq 0 ] && continue
  done_count=$(grep -l '^status: "done"' "$tasks_dir"/*.md 2>/dev/null | wc -l | tr -d ' ')
  title=$(awk -F'"' '/^---$/{n++; next} n==1 && /^title:/ { print $2; exit }' "$brief_file")
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

Launch the **brief-planner** agent with:
- The resolved brief slug
- The account slug
- Project root directory

The planner returns an execution plan with:
- Dependency graph (parent/subtask tree)
- **Parallel Waves** (which parents execute simultaneously)
- Execution order
- Conflict groups (parents serialized due to overlapping mentions)
- Risk assessment
- PR strategy

**Display the execution plan to the user** including the Parallel Waves visualization.

Use AskUserQuestion:
- "Execute this plan?" with options: "Yes, execute", "Modify plan", "Cancel"
- If "Modify plan": ask what to change, adjust, re-confirm
- If "Cancel": stop execution

---

## Branch Creation

Create the feature branch directly (no agent needed):

**Get the lowest display ID for branch naming**:
```bash
tasks_dir=".hamster/${account}/briefs/${slug}/tasks"
lowest_id=$(ls "$tasks_dir"/*.md 2>/dev/null | xargs -I{} basename {} | grep -oE 'ham-[0-9]+' | sed 's/ham-//' | sort -n | head -1)
branch="feature/ham-${lowest_id}-${slug}"
```

Create and switch to the branch:
```bash
git checkout -b "$branch"
echo "Created branch: $branch"
```

---

## Merge Base Branch

Before starting execution, merge the latest base branch to catch conflicts early:

```bash
# Detect the default branch
default_branch=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo "main")

# Fetch and merge
git fetch origin "$default_branch"
git merge "origin/$default_branch" --no-edit
```

- If merge conflict → **STOP**, report the conflicts to the user, do NOT auto-resolve
- If clean merge → continue to execution

---

## Execution Loop

Process tasks in the parallel waves determined by the brief-planner.

### For each wave (in order):

#### Step 1: Parallel Execution

**Launch ALL task-executor agents for this wave simultaneously in a single turn (parallel Agent calls).**

For each parent task in this wave, launch a **task-executor** agent with:
- Parent task display ID
- All subtask display IDs under this parent (in order)
- Brief slug and account slug
- Brief context summary
- Project conventions (from brief-planner output)

> IMPORTANT: Launch ALL executors for this wave as parallel Agent calls in a single message.
> Do not wait for one to complete before starting the next.
> If the runtime serializes them, they will still execute correctly — just sequentially.

Wait for ALL task-executors in this wave to complete.

Each executor reports:
- Files modified (list)
- Files created (list)
- Subtasks completed

Collect ALL file lists from ALL executors in this wave.

#### Step 2: Post-Wave Validation

After ALL executors complete, run project validation ONCE:

```bash
[ -f "package.json" ] && command -v pnpm >/dev/null && { pnpm typecheck 2>/dev/null; pnpm lint 2>/dev/null; }
[ -f "package.json" ] && command -v npm >/dev/null && ! command -v pnpm >/dev/null && { npm run typecheck 2>/dev/null; npm run lint 2>/dev/null; }
[ -f "package.json" ] && command -v yarn >/dev/null && ! command -v pnpm >/dev/null && { yarn typecheck 2>/dev/null; yarn lint 2>/dev/null; }
[ -f "Makefile" ] && make check 2>/dev/null
[ -f "Cargo.toml" ] && cargo check && cargo clippy 2>/dev/null
[ -f "go.mod" ] && go build ./... && go vet ./... 2>/dev/null
```

If validation fails: fix the errors before proceeding. This may require using Edit directly for type errors, or re-launching a task-executor with the specific fix.

#### Step 3: Test Gate

After validation passes, run the project's test suite for affected areas:

```bash
# Detect tooling and run tests
if [ -f "package.json" ]; then
  if command -v pnpm >/dev/null; then pnpm test 2>/dev/null
  elif command -v yarn >/dev/null; then yarn test 2>/dev/null
  elif command -v npm >/dev/null; then npm test 2>/dev/null
  fi
elif [ -f "Cargo.toml" ]; then cargo test 2>/dev/null
elif [ -f "go.mod" ]; then go test ./... 2>/dev/null
elif [ -f "Makefile" ]; then make test 2>/dev/null
fi
```

- If tests **FAIL** → STOP, report the failures to the user, ask whether to fix or skip
- If tests **PASS** → proceed to quality gates

#### Step 4: Parallel Quality Gates

**Launch ALL quality-gate agents for this wave simultaneously in a single turn (parallel Agent calls).**

For each parent in this wave, launch a **quality-gate** agent with:
- Parent task display ID
- Subtask display IDs
- List of files changed (from that executor's report)
- Brief context

> IMPORTANT: Launch ALL quality-gates for this wave as parallel Agent calls in a single message.

Wait for ALL quality-gate agents to complete.

#### Step 5: Handle Quality Gate Results

For each quality-gate result:

**If NEEDS_FIXES**:
1. Read the specific issues from the review
2. Fix each issue:
   - For small issues (1-3 file changes): fix directly using Edit tool
   - For larger issues: re-launch task-executor for that parent with the issues listed
3. Re-run **quality-gate** for that parent to verify fixes
4. Maximum 2 review rounds — if still failing after 2 rounds, report issues to user and ask whether to skip or fix manually

**If PASS**: the quality-gate may have made simplification changes. Those are already in the working tree.

#### Step 6: Commit Wave (Bisectable Commits)

For each parent in this wave (sequentially — commits are serial for git safety):

When a parent task has changes across multiple concerns, split into logical commits ordered for bisectability:
1. **Infrastructure/config** changes (migrations, env vars, dependencies)
2. **Models/types** (schemas, interfaces, type definitions)
3. **Services/logic** (business logic, API handlers, utilities)
4. **Controllers/views** (routes, UI components, templates)
5. **Tests** (unit tests, integration tests)

Each commit should be independently buildable. Never mix concerns (e.g., migration + UI change in one commit).

If a parent task's changes are small or cohesive (single concern), a single commit is fine:

```bash
# Stage specific files only (all files changed by executor + any simplification changes)
git add {file1} {file2} {file3}

# Verify nothing unwanted is staged
git diff --cached --name-only

# Commit
git commit -m "$(cat <<'EOF'
feat(ham-{id}): {concise description of parent task}

- {bullet: key change 1}
- {bullet: key change 2}

Task: HAM-{id}
Brief: {brief-slug}
EOF
)"
```

For quality-gate simplification changes (if any were made):
```bash
git add {simplified-files}
git commit -m "refactor(ham-{id}): simplify post-review

- {what was simplified}

Task: HAM-{id}
Brief: {brief-slug}"
```

**NEVER use `git add .` or `git add -A`** — always stage specific files.
If any pre-commit hook fails: read the error, fix the issue, create a new commit (never `--no-verify`).

**Non-interactive by default**: Auto-include all unstaged changes for the parent task, auto-split commits for bisectability. Only stop for: merge conflicts, test failures, CRITICAL review findings, agent failures.

#### Step 7: Wave Progress Report

After each wave completes, report progress:
```
Wave {n} complete:
  HAM-{id}: {title} — {n} subtasks, PASS, {n} commits
  HAM-{id}: {title} — {n} subtasks, PASS, {n} commits

Remaining: {n} waves, {n} parent tasks
```

### Mark Parent Tasks Done

After all subtasks complete for a parent, the task-executor marks it done via `hamster task status`. Verify this happened by checking task statuses in the progress report.

---

## Completion

### Stop Live Sync

```bash
[ -n "$HAMSTER_SYNC_PID" ] && kill "$HAMSTER_SYNC_PID" 2>/dev/null && echo "Live sync stopped"
```

### Final Validation

Run whatever validation the project uses. Detect the project's tooling and run appropriate checks:

```bash
# Detect and run project validation
[ -f "package.json" ] && command -v pnpm >/dev/null && { pnpm typecheck 2>/dev/null; pnpm lint 2>/dev/null; }
[ -f "package.json" ] && command -v npm >/dev/null && ! command -v pnpm >/dev/null && { npm run typecheck 2>/dev/null; npm run lint 2>/dev/null; }
[ -f "package.json" ] && command -v yarn >/dev/null && ! command -v pnpm >/dev/null && { yarn typecheck 2>/dev/null; yarn lint 2>/dev/null; }
[ -f "Makefile" ] && make check 2>/dev/null
[ -f "Cargo.toml" ] && cargo check && cargo clippy 2>/dev/null
[ -f "go.mod" ] && go build ./... && go vet ./... 2>/dev/null
```

If tests are configured for the affected areas, run the project's test command.

### Create PR

Use AskUserQuestion to ask the user:
- "Create a PR?" with options: "Yes, create PR", "No, I'll do it later"

If yes:
1. Detect default branch:
   ```bash
   default_branch=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo "main")
   ```
2. Push: `git push -u origin HEAD`
3. Launch **commit-manager** agent with operation: **Push and Create PR**
   - Brief title (from brief.md frontmatter)
   - Brief slug
   - Complete task list with display IDs and titles
   - Summary of all changes made across all waves
   - Target branch: `$default_branch`

### Update Brief Status

```bash
hamster brief status {slug} delivering
```

### Final Report

```
Brief execution complete!

  Brief: {title}
  Branch: feature/ham-{id}-{slug}
  PR: {PR URL or "skipped"}
  Tasks completed: {n}/{total}
  Waves executed: {n}
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
| Brief not found | Search for partial matches, suggest closest |
| Auth expired | Run `hamster auth login`, continue without status updates |
| Base branch merge conflict | Stop, report conflicts to user, do NOT auto-resolve |
| Wave validation fails | Fix errors before proceeding to quality gates |
| Test gate fails | Stop, report failures, ask user to fix or skip |
| Parallel executor conflict: two executors modified the same file | Stop, report conflict to user, ask for guidance |
| Quality gate NEEDS_FIXES after 2 rounds | Report issues to user, ask whether to skip or fix manually |
| Git conflict | Report to user, pause execution |
| Pre-commit hook fails | Fix the issues, create a new commit (never `--no-verify`) |
| Task already done | Skip it, move to next |
| Agent fails | Report error, ask user whether to retry or skip |

---

## Notes

- Each parent task gets its own commit(s) for clean git history (subtasks are NOT committed individually)
- Commits are split by concern for bisectability when changes span multiple areas
- Review and simplification handled by quality-gate agent (merged into one session)
- Parent tasks in the same wave execute in parallel for performance
- The user can interrupt at any time — use `/resume` to continue
- Prefer a single PR for the entire brief unless it grows too large
- If the brief is very large (>15 tasks), confirm with user whether to split into multiple PRs
