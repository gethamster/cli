---
name: ship
description: >-
  Ship a Hamster Studio brief from its UUID or Studio URL. Read the live brief,
  plan, tasks, and documents through authenticated MCP tools; resume unfinished
  work; execute dependency-safe waves; validate, review, commit, and optionally
  push or open a PR.
---

# Ship Brief

**Brief**: "$ARGUMENTS"

This is execution-only. Hamster Studio owns the brief and task plan. Do not
invent, split, or silently drop tasks.

## Resolve the brief

Require a brief UUID or a Studio brief URL that contains one. Extract the
canonical UUID with the pattern
`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`.
If no UUID is present, ask for the UUID or URL again. Never guess from a slug,
branch name, or local files.

Read the authoritative brief:

```json
get_brief({
  "brief_id": "<BRIEF-UUID>",
  "include_content": true
})
```

If `content_error` is non-empty or the `content` field is absent, stop and
report the incomplete brief read. Do not execute from partial metadata.

Then load its ordered parent queue and live statuses:

```json
get_plan({ "brief_id": "<BRIEF-UUID>" })
```

Treat live MCP statuses as authoritative.

## Reconcile resume state

Resume is part of this workflow:

1. Skip every task whose live status is `done`.
2. For each `in_progress` task, compare its specification with the current
   branch, commits, and working-tree diff. If its durable implementation already
   landed, mark it `done`; otherwise keep it in the earliest dependency-safe
   wave.
3. Start from the first unfinished wave. Never reset or overwrite valid work.
4. A later invocation still requires the brief UUID or URL; do not infer it.

## Load complete task specifications

For every unfinished parent selected from `get_plan`, call:

```json
get_task({ "task_id": "<PARENT-UUID>" })
```

Use the returned parent, subtasks, dependencies, live statuses, and UUIDs. The
dependencies from these responses are authoritative. If a parent or subtask has
a document, read it before execution:

```json
get_document({
  "document_id": "<DOCUMENT-UUID>",
  "include_content": true
})
```

For every document read, stop and report a non-empty `content_error` or absent
`content` field. Do not execute an incomplete specification.

Pass complete parent and subtask specifications, UUIDs, document content, and
brief context to each `task-executor`. Never pass display IDs to MCP status
calls. Keep all MCP reads and status writes in this skill; executors receive the
resolved inputs and do not repeat those calls.

## Schedule dependency-safe waves

Build waves from the parent dependencies returned by each `get_task` response:

- A parent can enter a wave only after all unfinished dependencies complete.
- Parents that mention the same files, components, or modules run serially.
- Other dependency-ready parents can run in parallel. Launch one task executor
  per parent in a single parallel dispatch.
- Preserve plan order when no dependency or overlap forces another order.

Show the compact schedule once and ask the user to execute it.

## Prepare the branch

Inspect repository instructions, the current branch, and working-tree state.
Stop on unrelated uncommitted changes and ask whether to proceed or stash. Do
not discard them.

If resume reconciliation found durable work for this brief on the current
branch, keep that branch. If another existing local branch contains the durable
brief work, use that branch instead. Create one feature branch only for a first
execution when no existing branch contains durable work for the brief.

Fetch the repository's default branch and merge it into the selected branch
before execution. Stop and report merge conflicts; never auto-resolve an
ambiguous conflict.

## Execute each wave

For each parent in the wave:

1. Immediately before dispatching its executor, mark the parent `in_progress`:

   ```json
   update_task_status({
     "task_id": "<PARENT-UUID>",
     "status": "in_progress"
   })
   ```

2. Mark each unfinished subtask `in_progress` with its UUID and the same tool,
   then dispatch the executor.
3. Implement the smallest change that satisfies the full specification. Follow
   repository rules and adapt only mechanical drift. If the requested outcome
   is obsolete or materially wrong, report `PLAN_ISSUE` with evidence instead
   of silently changing scope.
4. Require each executor report to include the dispatched `PARENT_UUID`.
   Collect reports in `PARENTS_BY_UUID`, keyed by that UUID, and reject a
   missing, duplicate, or mismatched key. Two executors touching the same file
   is an integration conflict; stop and resolve ownership before continuing.

Only status transitions are best-effort. Report a failed status call, but do not
discard valid code work.

## Validate and review each wave

After all executors finish:

1. Run the repository formatter in write mode.
2. Run the available typecheck, lint, and tests relevant to the wave. Fix
   failures introduced by the change. Stop on an unresolved test failure.
3. For a small non-sensitive diff, review inline against repository
   conventions. For larger or sensitive work, run the `wave-reviewer` agent
   once with the full wave diff and `PARENTS_BY_UUID`. Each value must contain
   that parent's specification, executor report, files, and deviations.
4. Apply valid fixes and simplifications. Allow at most two review rounds before
   reporting a blocker.

Sensitive areas include authentication, payments, migrations, security, CI,
secrets or environment configuration, public API types, and new dependencies.

## Commit durable parent boundaries

Commit each parent sequentially after its wave passes validation and review:

- Stage only that parent's files; never use `git add .` or `git add -A`.
- Follow the repository's signing and conventional-message rules.
- Split commits only when the parent spans distinct durable concerns.
- Never bypass hooks with `--no-verify`.

Immediately after the parent commit succeeds, mark completed subtasks `done`,
then mark the parent `done`, using their UUIDs:

```json
update_task_status({
  "task_id": "<TASK-UUID>",
  "status": "done"
})
```

Never pre-mark future work or batch completion across parent boundaries.

## Finish

Run final applicable validation and commit any formatter-only correction as a
separate conventional commit. Report the brief UUID, branch, completed parents,
commits, validation, deviations, and unresolved status-call failures.

Ask for explicit user consent before every push and before creating a PR.
Consent to execute or commit local work does not authorize either remote
action, and consent to push does not authorize a PR. After the user approves a
push, use upstream tracking. After the user separately approves a PR, create
one against the default branch with the brief title, task checklist, grouped
changes, validation, and plan feedback.
