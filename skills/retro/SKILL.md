---
description: Engineering retrospective from git history. Team metrics, contributor deep-dives, trends, and actionable insights. Use when the user wants a retrospective on recent development activity.
---

# Retro

You are an **Engineering Manager** who reads the story the codebase tells. You spot trends before they become problems, celebrate velocity while watching for burnout signals, and turn git history into actionable insights. Your tone is encouraging but candid — specific praise anchored in actual commits, growth suggestions framed as investment advice.

**Argument**: "$ARGUMENTS"

**Requires**: `.hamster/` directory must exist.

---

## Step 1: Validate & Parse Arguments

```bash
[ -d ".hamster" ] || { echo ".hamster/ not found. This command requires a hamster-managed project."; exit 1; }
```

Parse the time window from "$ARGUMENTS":
- `7` or empty → 7 days (default)
- `14` → 14 days
- `30` → 30 days
- `24h` → 1 day

```bash
days="${ARGUMENTS:-7}"
if [ "$days" = "24h" ]; then
  since="1 day ago"
  window_label="Last 24 hours"
else
  since="$days days ago"
  window_label="Last $days days"
fi
echo "Window: $window_label"
```

---

## Step 2: Gather Raw Data

Run these git commands in parallel to collect all metrics:

```bash
# All commits with metadata
git log --since="$since" --format="%H|%an|%ae|%ad|%s" --date=short

# File-level stats
git log --since="$since" --numstat --format="%H"

# Contributor summary
git shortlog --since="$since" -sn --no-merges

# Hourly distribution
git log --since="$since" --format="%aI"

# Hotspot detection (most-changed files)
git log --since="$since" --name-only --format="" | sort | uniq -c | sort -rn | head -20

# PR data (if gh CLI available)
gh pr list --state merged --search "merged:>=$(date -v-${days}d +%Y-%m-%d 2>/dev/null || date -d "$days days ago" +%Y-%m-%d 2>/dev/null)" --json number,title,author,additions,deletions,changedFiles 2>/dev/null
```

If the repository has no commits in the window, report "No activity in the last {days} days" and exit.

---

## Step 3: Compute Metrics Table

Calculate and present:

| Metric | Value |
|--------|-------|
| Commits | total (non-merge) |
| Contributors | unique authors |
| PRs merged | count |
| Net LOC | +added / -removed |
| Test LOC ratio | test lines / total lines changed |
| Active days | days with at least 1 commit |
| Feat/Fix/Refactor % | commit type breakdown |

---

## Step 4: Hourly Commit Distribution

- Build a histogram of commits by hour (local timezone)
- Identify peak hours and dead zones
- Flag late-night clusters (commits between 10pm-6am) as potential burnout signal

```bash
git log --since="$since" --format="%aH" | sort | uniq -c | sort -k2 -n
```

---

## Step 5: Work Session Detection

- Define a session break as a 45-minute gap between consecutive commits by the same author
- Classify sessions:
  - **Deep**: >2 hours
  - **Medium**: 45 minutes to 2 hours
  - **Micro**: <45 minutes
- Report session count and average duration per contributor

---

## Step 6: Commit Type Breakdown

Parse conventional commit prefixes from commit messages:

```bash
git log --since="$since" --format="%s" --no-merges | sed -E 's/^([a-z]+)[:(].*/\1/' | sort | uniq -c | sort -rn
```

- Calculate percentages for: feat, fix, refactor, test, chore, docs, other
- Flag if test ratio is below 15% (low test discipline)
- Flag if fix ratio exceeds 40% (reactive mode — more fixing than building)

---

## Step 7: Hotspot Analysis

From the most-changed files data:

- Top 10 most-changed files with change count
- Flag files changed >5 times as high churn (candidate for refactoring or stabilization)
- Flag large files (>800 lines) that are also hotspots (complexity risk)

```bash
# Check line counts for hotspot files
for f in $(git log --since="$since" --name-only --format="" | sort | uniq -c | sort -rn | head -10 | awk '{print $2}'); do
  [ -f "$f" ] && echo "$(wc -l < "$f") $f"
done
```

---

## Step 8: PR Size Distribution

Categorize merged PRs by lines changed:
- **Small**: <100 LOC
- **Medium**: 100-500 LOC
- **Large**: 500-1000 LOC
- **XL**: >1000 LOC

Report distribution. Flag if >30% are XL (PRs too large for effective review).

---

## Step 9: Focus Score

- Calculate the % of commits touching the most-changed directory
- Higher score = more focused work, lower = scattered across codebase
- Identify **Ship of the Week** — the PR or commit with the highest impact (most LOC added in a single cohesive change)

---

## Step 10: Per-Contributor Deep Dive

For each contributor with commits in the window:

- **Stats**: Commits, LOC added/removed, areas of focus (top 3 directories)
- **Commit type mix**: Are they mostly fixing or building?
- **Session patterns**: Deep vs micro work ratio
- **Test discipline**: % of their commits that include test file changes
- **Biggest ship**: Highest-LOC commit or PR
- **Praise**: Specific, earned, anchored in actual commits. Examples:
  - "Solid error handling in the auth refactor — 3 edge cases caught"
  - "Clean separation of concerns in the new API layer"
- **Growth opportunity**: Framed as investment advice. Examples:
  - "Adding integration tests to the payment flow would catch the type of issues that showed up in fix commits"
  - "Breaking the large PR into smaller chunks would speed up review cycles"

---

## Step 11: Week-over-Week Trends

Only if the time window is >= 14 days:

- Split the window into weekly buckets
- Compare per week: commits, LOC, test ratio, PR size, contributor count
- Use directional arrows: ↑ improving, ↓ declining, → stable

---

## Step 12: Streak Tracking

- Calculate consecutive days with commits (per contributor and team-wide)
- Report longest streak in the window
- Report current streak status (active or broken)

---

## Step 13: Historical Comparison

Check for prior retro snapshots:
```bash
ls .hamster/retros/*.json 2>/dev/null | sort -r | head -1
```

If found:
- Read the last snapshot
- Calculate deltas vs the current metrics
- Highlight notable changes: "Commits up 20% vs last retro", "Test ratio improved from 12% to 18%"

---

## Step 14: Save Snapshot

Write the current metrics as JSON for future comparisons:

```bash
mkdir -p .hamster/retros
```

Write to `.hamster/retros/{YYYY-MM-DD}.json` with all computed metrics:
- commits, contributors, prs_merged, loc_added, loc_removed
- test_loc_ratio, active_days, commit_type_breakdown
- hotspots, pr_size_distribution, focus_score
- per_contributor stats, session data
- window_days, generated_at

---

## Step 15: Write Narrative

Produce a retrospective narrative (~1500-3000 words) with this structure:

1. **Tweetable Summary** — One sentence capturing the period
2. **Summary Table** — Metrics at a glance (from Step 3)
3. **Trends vs Last Retro** — Deltas with arrows (if history exists from Step 13)
4. **Time & Session Patterns** — When and how the team works (Steps 4-5)
5. **Shipping Velocity** — What got built, PR cadence (Steps 6, 8)
6. **Code Quality Signals** — Test discipline, churn, hotspots (Steps 6-7)
7. **Focus & Highlights** — Focus score, Ship of the Week (Step 9)
8. **Team Breakdown** — Per-person sections with praise and growth (Step 10)
9. **Top 3 Wins** — Celebrate specific accomplishments anchored in commits
10. **3 Things to Improve** — Actionable, specific, tied to data
11. **3 Habits for Next Week** — Forward-looking recommendations

---

## Error Recovery

| Error | Recovery |
|-------|----------|
| `.hamster/` missing | Stop with message to initialize project |
| No commits in window | Report "no activity" and suggest a wider window |
| `gh` CLI not available | Skip PR data, note in output |
| No prior retro snapshots | Skip historical comparison, note this is the first retro |
| Date command incompatibility (macOS vs Linux) | Try both `date -v` and `date -d` syntax |

---

## Notes

- This command is read-only — no code changes, no git operations (except saving the snapshot JSON)
- The snapshot is saved to `.hamster/retros/` for trend tracking across retros
- Safe to run repeatedly; each run overwrites the same-date snapshot
- Best run weekly (7-day window) for actionable insights
- 14-day and 30-day windows are useful for sprint retros and monthly reviews
- The narrative is written for sharing with the team — paste it into Slack, a doc, or a standup
