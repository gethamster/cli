---
description: Resume an interrupted brief execution. Auto-detect progress, reconstruct state from git history and task statuses, and continue from the correct wave. Use when the user wants to continue a previously interrupted ship session.
---

# Resume Brief Execution

Resumes an interrupted `/hamster:ship` session. Reconstructs state from task statuses, git log, and git status — no state file needed. Like `/hamster:ship`, this is execution-only: it continues the pre-generated plan in `.hamster/` and never replans.

**Argument**: "$ARGUMENTS"

---

## Detect the Brief

One bash call — account, live sync, and all three detection signals:

```bash
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
hamster sync --watch > /dev/null 2>&1 &
echo "account=${account} sync_pid=$!"
# Signal A: current branch
git branch --show-current
# Signal B: briefs with in_progress tasks
for tasks_dir in .hamster/${account}/briefs/*/tasks; do
  [ -d "$tasks_dir" ] || continue
  matches=$(grep -l '^status: "in_progress"' "$tasks_dir"/*.md 2>/dev/null)
  [ -n "$matches" ] && echo "in_progress: $(basename "$(dirname "$tasks_dir")")"
done
```

Resolution order:
1. **Argument provided** → use it as the slug (verify `brief.md` exists)
2. **Branch matches** `feature/ham-{n}-{slug}` → extract the slug
3. **One brief** has in_progress tasks → use it; **multiple** → AskUserQuestion
4. **None** → tell the user nothing to resume; suggest `/hamster:ship`

---

## Find the Resume Point

Run the **Scheduling** step from `/hamster:ship` (the inline frontmatter parse + wave grouping). Then overlay git state in one call:

```bash
# Committed parents
git log --oneline | grep -oE 'feat\(ham-[0-9]+\)' | grep -oE '[0-9]+' | sort -un | sed 's/^/HAM-/'
# Uncommitted in-flight work
git status --porcelain
```

Walk the waves in order:
- All parents in a wave committed → wave complete, skip
- Some committed → partial wave: resume only the uncommitted parents
- None committed → resume from the start of this wave
- A task `in_progress` with uncommitted changes → it was interrupted mid-execution; pass a note to its executor to check `git diff` and continue from the partial work rather than restarting

Report compactly and confirm with AskUserQuestion ("Resume from Wave {n}?" / "Start from a different task" / "Cancel"):

```
Resuming: {title}
  Done:  Wave 1 — HAM-100, HAM-300 (committed)
  Next:  Wave 2 — HAM-200 (todo), HAM-400 (in_progress, has uncommitted changes)
  Remaining: {n} parents across {m} waves
```

---

## Continue

Verify the branch first: if not on `feature/ham-{n}-{slug}`, ask whether to switch or create it.

Dirty working tree not attributable to an in_progress task → show the changes, ask: commit as part of current task / stash / discard.

Then run the **Execution Loop** and **Completion** sections from `/hamster:ship` exactly as written, starting at the resume wave (partial waves: launch executors only for uncommitted parents). One difference at completion: if a PR already exists for this branch, just push — the PR updates automatically; report its URL instead of creating a new one.
