# Hamster CLI

Sync project context from [Hamster Studio](https://tryhamster.com) to your local repositories. Briefs, tasks, blueprints, and methods land in a `.hamster/` directory, ready for your editor and AI tools.

## Install

```bash
curl -fsSL https://tryhamster.com/cli/install | bash
```

Or download a binary directly from the [latest release](https://github.com/gethamster/cli/releases/latest).

### Supported platforms

| OS | Architecture |
|----|-------------|
| macOS | Intel (`amd64`), Apple Silicon (`arm64`) |
| Linux | `amd64`, `arm64` |
| Windows | `amd64` |

## Quick start

```bash
# Authenticate with Hamster Studio
hamster auth login

# Initialize a repository
hamster init

# Sync project context
hamster sync

# Or watch for real-time updates
hamster sync --watch
```

## Commands

| Command | Description |
|---------|-------------|
| `hamster auth login` | Authenticate via browser (OAuth 2.1 + PKCE) |
| `hamster auth logout` | Log out and clear stored credentials |
| `hamster init` | Initialize `.hamster/` directory and run first sync |
| `hamster sync` | One-time sync from Hamster Studio |
| `hamster sync --watch` | Continuous real-time sync via WebSocket |
| `hamster status` | Show sync status and statistics |
| `hamster task status <id> <status>` | Update task status (`todo`, `in_progress`, `done`) |
| `hamster brief status <slug> <status>` | Update brief status |
| `hamster tui` | Launch Mission Control terminal dashboard |

## What gets synced

```
.hamster/
  briefs/        # Project briefs
  tasks/         # Task summaries and notes
  blueprints/    # Architecture documents
  methods/       # Team conventions
```

A [Claude skill](https://docs.anthropic.com/en/docs/claude-code/skills) is also generated at `.claude/skills/hamster-project-context/` for automatic project context awareness.

---

## hamster — Claude Code Plugin

This repo also ships a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) that orchestrates end-to-end execution of Hamster Studio briefs. It reads briefs and tasks from `.hamster/`, plans parallel execution waves, dispatches independent parent tasks simultaneously, reviews and simplifies code, and manages git operations with commits after each parent task.

### Plugin install

In Claude Code:

```
/plugin marketplace add gethamster/cli
/plugin install hamster@gethamster-cli
```

### Plugin commands

| Command | Persona | Description |
|---------|---------|-------------|
| `/ship [slug-or-url]` | Release Engineer | Ship a brief: merge base, implement in parallel, test, review, bisectable commits, PR |
| `/plan [slug-or-url]` | Tech Lead + CEO/Eng modes | Analyze brief with optional founder or architecture review |
| `/resume [slug]` | — | Resume interrupted execution from where you left off |
| `/review` | Staff Engineer | Paranoid two-pass code review (CRITICAL then INFORMATIONAL) |
| `/qa [mode]` | QA Lead | Systematic testing: diff-aware, full, quick, regression |
| `/retro [days]` | Eng Manager | Engineering retrospective with metrics, trends, team analysis |

#### `/ship`

The main orchestrator. Accepts a brief slug, UUID, or Hamster Studio URL:

```
/ship user-authentication
/ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

If no argument is given, presents an interactive picker of actionable briefs.

**Flow**: Prerequisites check → Brief selection → Analysis (with user confirmation) → Branch creation → Merge base branch → Parallel wave execution (implement → validate → test gate → review → bisectable commits) → Final validation → Ask about PR creation

#### `/plan`

Read-only analysis with optional deep review. Produces the execution plan without making changes.

```
/plan api-rate-limiting
```

After analysis, choose a review mode:
- **CEO Review (Founder Mode)** — 10-section deep dive from first principles
- **Eng Review (Architecture Mode)** — 4-section technical review with ASCII diagrams and test plan
- **Quick Analysis** — Just the plan

#### `/resume`

Resumes an interrupted execution. Auto-detects the brief from the git branch name (`feature/ham-{id}-{slug}`), in-progress tasks, or a provided argument.

```
/resume
/resume user-authentication
```

#### `/review`

Paranoid two-pass code review for the current feature branch:
- **Pass 1 (CRITICAL)**: SQL safety, race conditions, auth boundaries, enum completeness, secrets
- **Pass 2 (INFORMATIONAL)**: Side effects, magic numbers, dead code, test gaps, type coercion, time safety
- Interactive resolution for critical findings with fix/acknowledge/false-positive options

```
/review
```

#### `/qa`

Systematic testing with 4 modes:

```
/qa diff        # Test only what changed (default on feature branches)
/qa full        # Full test suite with coverage
/qa quick       # 30-second lint + typecheck + smoke tests
/qa regression  # Changed files + dependents, flag new failures
```

Includes issue taxonomy (functional/type-safety/integration/performance/coverage-gap) and optional fix loop.

#### `/retro`

Engineering retrospective from git history:

```
/retro          # Last 7 days (default)
/retro 14       # Last 14 days
/retro 30       # Last 30 days
/retro 24h      # Last 24 hours
```

Produces: metrics table, hourly distribution, session analysis, hotspots, PR sizes, per-contributor deep dive with praise and growth suggestions, trends vs last retro, and a narrative summary.

### Agents

| Agent | Persona | Model | Purpose |
|-------|---------|-------|---------|
| **brief-planner** | Tech Lead | Sonnet | Strategic dependency analysis and wave planning |
| **task-executor** | Senior Engineer | Opus | Clean, production-quality implementation with 4-path data flow thinking |
| **quality-gate** | Staff Engineer | Sonnet | Paranoid review and surgical simplification |
| **commit-manager** | Release Engineer | Sonnet | Git hygiene, branch creation, and PR creation |

### Execution loop

For each wave of independent parent tasks (executed in parallel):

```
Wave N (parallel):
  [task-executor A] || [task-executor B] || [task-executor C]

Post-wave:
  Validation (typecheck/lint)
  Test gate (stop on failure)
  [quality-gate A] || [quality-gate B] || [quality-gate C]
  Bisectable commits per parent (direct bash)
```

### Git conventions

- **Branch**: `feature/ham-{lowest-id}-{brief-slug}`
- **Parent task commits**: `feat(ham-123): concise description` (split by concern for bisectability)
- **Simplification commits**: `refactor(ham-123): simplify description`
- **Review fix commits**: `fix(ham-123): address review findings`
- **QA fix commits**: `fix(qa): test-file — description`
- **PR**: Created on request (not auto-created), targets detected default branch

---

## License

Proprietary. Copyright Hamster Studio.
