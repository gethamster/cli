---
name: plan-hamster
description: Plan a Hamster Studio brief. Read tasks, build dependency graph, detect parallel execution waves, with optional CEO or Eng review modes. Use when the user wants to analyze a brief before executing.
---

# Plan Brief

Read-only analysis of a Hamster Studio brief. Builds the dependency tree and wave schedule from the pre-generated plan in `.hamster/` — no code changes, no git operations, no status updates, and no task creation or elaboration. Optionally deep-dives with CEO Review (founder mode) or Eng Review (architecture mode).

**Argument**: "$ARGUMENTS"

---

## Select and Schedule

```bash
[ -d ".hamster" ] || { echo ".hamster/ not found. Run 'hamster sync' first."; exit 0; }
account=$(ls -d .hamster/*/ 2>/dev/null | head -1 | xargs basename)
echo "Account: $account"
```

Then run the **Brief Selection** and **Scheduling** sections from `/hamster:ship` exactly as written (argument parsing, brief picker, inline frontmatter parse, wave grouping) — but stop after producing the schedule; do not confirm execution.

Additionally read the brief body (`brief.md`) and skim the parent task bodies to inform the analysis below.

## Present the Analysis

- **Brief summary**: slug, status, task counts (done/remaining)
- **Dependency tree**: parents with their subtasks, statuses marked
- **Parallel waves**: with conflict reasons inline
  ```
  Wave 1 (parallel): HAM-100, HAM-300
  Wave 2:            HAM-200 (conflicts with HAM-100: both mention auth)
  ```
- **Risk flags**: high = auth/permissions/migrations/payments; medium = new endpoints/shared libraries; low = UI/docs/tests
- **PR strategy**: single PR (< 8 tasks, cohesive) vs. multiple (large/spanning domains)

---

## Mode Picker

AskUserQuestion with 3 options:

1. **CEO Review (Founder Mode)** — rethink from first principles; deep 10-section review
2. **Eng Review (Architecture Mode)** — lock in architecture; 4 sections with diagrams and test plan
3. **Quick Analysis** — done; skip to Offer Transition

---

## CEO Review Mode

**Prime Directives**: zero silent failures; data flows mapped through 4 shadow paths (happy/nil/empty/error); observability is first-class scope; everything deferred gets written down.

**Step 0 — Scope Challenge** (AskUserQuestion): **SCOPE EXPANSION** (what's the 10-star version?), **HOLD SCOPE** (bulletproof execution; surface every risk), or **SCOPE REDUCTION** (strip to minimum value; defer the rest).

Work through 10 sections, using AskUserQuestion for any critical finding that needs a user decision:

1. **Architecture** — component dependency graph; data flow through the 4 paths; state machines for stateful transitions; integration points
2. **Error & Rescue Map** — table: method → exception → handler → what user sees; flag unhandled+untested+user-visible gaps; cascading failure risks
3. **Security & Threat Model** — auth boundaries, privilege escalation, input validation coverage, secret handling, trust boundaries
4. **Data Flow Edge Cases** — race conditions, stale data, cascading failures, TOCTOU
5. **Code Quality** — DRY across tasks, naming consistency, complexity hotspots
6. **Test Review** — test diagram for new UX/data/codepaths; untested critical paths; missing negative-path tests
7. **Performance** — N+1 risks, memory pressure, caching, latency budget
8. **Observability** — logs/metrics/traces needed; alerts; runbooks
9. **Deployment & Rollout** — migrations, feature flags, rollback plan, smoke tests
10. **Long-Term Trajectory** — tech debt introduced, path dependency, reversibility

**Output**: summary table (section → Clear / Issues Found / Needs Decision), unresolved decisions with tradeoffs, deferred items with reasoning. If EXPANSION was chosen: a **Delight Opportunities** section.

---

## Eng Review Mode

**Step 0 — Scope Challenge** (AskUserQuestion): **BIG CHANGE** (interactive, one section at a time, max 8 issues per section) or **SMALL CHANGE** (compressed single pass, one top issue per section).

4 sections:

1. **Architecture Lock-in** — ASCII data flow diagram, state management approach, API contracts, integration points, and a "what already exists" inventory of reusable patterns/services/types
2. **Code Quality** — DRY across planned changes, naming consistency, complexity hotspots, type safety gaps
3. **Test Strategy** — mandatory vs. nice-to-have tests, integration boundaries (mock vs. real); write a **Test Plan Artifact** to `.hamster/plans/{brief-slug}-test-plan.md`
4. **Performance** — N+1 detection, data fetching patterns, caching needs, latency analysis

**Issue resolution**: one AskUserQuestion at a time; lead with the recommendation ("Do B. Here's why:"), 2-3 lettered options mapped to simplicity/correctness/performance tradeoffs.

**Output**: ASCII diagrams per major flow, test plan artifact, completion summary table, and an explicit **NOT-in-scope** section.

---

## Offer Transition

AskUserQuestion: "Ship this brief?" — "Yes, ship now" → run `/hamster:ship {slug}`; "No, just planning" → end.

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| `.hamster/` missing | Stop — tell user to run `hamster sync` |
| Brief not found | Show partial matches, suggest closest |
| Malformed argument | Show usage examples, ask user to re-enter |
