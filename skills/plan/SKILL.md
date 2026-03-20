---
description: "Plan a Hamster Studio brief: read tasks, build dependency graph, detect parallel execution waves, with optional CEO or Eng review modes"
argument-hint: "[brief-slug-or-url]"
allowed-tools: ["Bash", "Glob", "Grep", "Read", "Agent", "AskUserQuestion"]
---

# Plan Brief

Read-only analysis of a Hamster Studio brief. Reads all tasks from `.hamster/`, builds the dependency graph, detects parallel execution waves, maps overlapping tasks, and presents the execution plan — without making any changes. Optionally deep-dives with CEO Review (founder mode) or Eng Review (architecture mode).

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

**Parse the argument** — extract a brief slug from a URL, UUID, or use as-is. URLs use a brief UUID in the path:

```bash
arg="$ARGUMENTS"
arg="${arg%/}"
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
    eid=$(awk '/^---$/{n++; next} n==1 && /^entity_id:/{gsub(/["'"'"']/, "", $2); print $2; exit}' "$bf")
    if [ "$eid" = "$identifier" ]; then
      slug=$(basename "$brief_dir")
      break
    fi
  done
  [ -z "$slug" ] && echo "No brief found with ID $identifier"
else
  slug="$identifier"
fi
ls ".hamster/${account}/briefs/${slug}/brief.md" && echo "Found: $slug"
```

### If no argument provided:

**List actionable briefs** (same picker as `/ship`):
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

Launch the **brief-planner** agent with:
- The resolved brief slug
- The account slug
- Project root directory

---

## Present Results

Display the full execution plan from the planner:

- **Brief summary** (slug, status, task counts)
- **Dependency Graph** (parent/subtask tree)
- **Parallel Waves** — show which parent tasks can execute simultaneously:
  ```
  Wave 1 (parallel): HAM-100, HAM-300
  Wave 2 (parallel): HAM-200 (conflicts with HAM-100: both mention auth)
  ```
- **Execution Order** (organized by wave)
- **Risk Assessment** (high/medium/low risk tasks)
- **PR Strategy** (single PR vs. multiple)
- **Conventions** (key CLAUDE.md rules that apply)

---

## Mode Picker

After presenting the execution plan, use AskUserQuestion with 3 options:

1. **CEO Review (Founder Mode)** — Rethink the problem from first principles. Deep 10-section review covering architecture, security, performance, observability, and long-term trajectory.
2. **Eng Review (Architecture Mode)** — Lock in technical architecture. 4-section review with ASCII diagrams and test plan artifact.
3. **Quick Analysis** — Just show the plan (done — skip to Offer Transition below).

---

## CEO Review Mode

**Prime Directives:**
- Zero silent failures — every error path must be explicit
- Data flows mapped through 4 shadow paths (happy/nil/empty/error)
- Observability is first-class scope, not an afterthought
- Everything deferred must be written to a tracking system

### Step 0: Scope Challenge

Use AskUserQuestion to ask the user to pick a lens:
- **SCOPE EXPANSION**: Dream big. What would the 10-star version look like? What adjacent problems could this solve?
- **HOLD SCOPE**: The brief is right. Focus on bulletproof execution — surface every risk and gap.
- **SCOPE REDUCTION**: Strip to essentials. What's the absolute minimum that delivers value? What can be deferred?

### 10 Review Sections

Work through each section. Use AskUserQuestion for any critical finding that needs user input:

**1. Architecture Review**
- Dependency graph between components
- Data flow with 4 paths: happy path, nil/missing, empty collection, error state
- State machines for any stateful transitions
- Integration points with existing systems

**2. Error & Rescue Map**
- Table: method → exception → handler → what user sees
- Flag CRITICAL GAPS: unhandled + untested + user-visible error paths
- Identify cascading failure risks

**3. Security & Threat Model**
- Auth boundaries and privilege escalation paths
- Input validation coverage
- Secret handling and injection surfaces
- Trust boundaries between components

**4. Data Flow & Interaction Edge Cases**
- Race conditions and concurrent access patterns
- Stale data risks
- Cascading failures between services
- TOCTOU (time-of-check-time-of-use) vulnerabilities

**5. Code Quality**
- DRY assessment across task implementations
- Naming consistency with existing codebase
- Pattern adherence
- Complexity hotspots

**6. Test Review**
- Complete test diagram for all new UX/data/codepaths
- Flag untested critical paths
- Missing negative-path tests
- Integration test boundaries

**7. Performance**
- N+1 query risks
- Memory pressure points
- Caching strategy assessment
- Latency budget for new paths

**8. Observability & Debuggability**
- What logs, metrics, and traces are needed?
- What alerts should fire on failure?
- What runbooks are needed for oncall?

**9. Deployment & Rollout**
- Migration requirements
- Feature flag needs
- Rollback plan
- Smoke test checklist

**10. Long-Term Trajectory**
- Tech debt introduced by this brief
- Path dependency created
- Reversibility of architectural decisions
- Fit with broader system architecture

### CEO Review Output

Produce a completion summary:
- **Summary table**: Section → Status (Clear / Issues Found / Needs Decision)
- **Unresolved decisions**: List with options and tradeoffs
- **Deferred items**: With reasoning for deferral
- If EXPANSION mode was chosen: include **Delight Opportunities** section with ideas beyond the brief

---

## Eng Review Mode

### Step 0: Scope Challenge

Use AskUserQuestion:
- **BIG CHANGE**: Interactive, one section at a time, max 8 issues per section. Full depth.
- **SMALL CHANGE**: Compressed single pass, one top issue per section. Fast.

### 4 Review Sections

**1. Architecture Lock-in**
- Data flow diagram (ASCII art)
- State management approach
- API contracts (request/response shapes)
- Integration points with existing code
- "What already exists" section — identify reusable patterns, services, and types

**2. Code Quality**
- DRY assessment across planned changes
- Naming consistency with codebase
- Complexity hotspots
- Type safety gaps

**3. Test Strategy**
- Which tests are mandatory vs. nice-to-have
- Integration test boundaries (what to mock, what to hit for real)
- Generate **Test Plan Artifact** written to `.hamster/plans/{brief-slug}-test-plan.md`

**4. Performance**
- N+1 query detection
- Efficient data fetching patterns
- Caching needs
- Latency analysis for new paths

### Interactive Issue Resolution

For each issue found, use AskUserQuestion one at a time:
- Lead with recommendation: "Do B. Here's why:"
- Include 2-3 lettered options (A/B/C)
- Map each option to an engineering preference (simplicity vs correctness vs performance)

### Eng Review Output

- ASCII diagrams for each major flow
- Test plan artifact (saved to `.hamster/plans/`)
- Completion summary table
- **NOT-in-scope** section: explicitly list what was considered and excluded

---

## Offer Transition

After presenting the analysis (or completing a review mode), offer to transition to execution:

Use AskUserQuestion:
- "Would you like to ship this brief?"
- Options: "Yes, ship now" → run `/ship {slug}`, "No, just planning" → end

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| `.hamster/` missing | Stop — tell user to run `hamster sync` |
| Brief not found | Search for partial matches, suggest closest |
| brief-planner fails | Report error, suggest running `hamster sync` to refresh data |
| Malformed argument | Show usage examples, ask user to re-enter |

---

## Notes

- This command makes NO code changes, NO git operations, NO status updates
- Safe to run repeatedly to understand brief scope
- Useful for reviewing a brief before committing to execution
- CEO Review is best for high-stakes briefs; Eng Review is best for locking in architecture
- The brief-planner output can be used to plan manual implementation if preferred
