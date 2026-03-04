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

| Command | Description |
|---------|-------------|
| `/hamster:execute [slug-or-url]` | Full brief execution: plan waves, implement in parallel, review, commit per parent, PR |
| `/hamster:analyze [slug-or-url]` | Read-only analysis: dependency graph, parallel wave visualization, risk assessment |
| `/hamster:resume [slug]` | Resume interrupted execution from where you left off |

#### `/hamster:execute`

The main orchestrator. Accepts a brief slug, UUID, or Hamster Studio URL:

```
/hamster:execute user-authentication
/hamster:execute https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

If no argument is given, presents an interactive picker of actionable briefs.

**Flow**: Prerequisites check -> Brief selection -> Analysis (with user confirmation) -> Branch creation -> Parallel wave execution (implement -> validate -> review -> commit per parent) -> Final validation -> PR creation

#### `/hamster:analyze`

Read-only analysis. Produces the execution plan without making changes. Useful for reviewing scope before committing to execution.

```
/hamster:analyze api-rate-limiting
```

#### `/hamster:resume`

Resumes an interrupted execution. Auto-detects the brief from the git branch name (`feature/ham-{id}-{slug}`), in-progress tasks, or a provided argument.

```
/hamster:resume
/hamster:resume user-authentication
```

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| **brief-planner** | Sonnet | Reads brief + tasks, builds dependency graph, groups parents into parallel execution waves |
| **task-executor** | Opus | Implements all subtasks of a parent task in one session using JIT context discovery |
| **quality-gate** | Sonnet | Reviews code quality and applies simplifications (merged review + simplify) |
| **commit-manager** | Sonnet | Branch creation and PR creation only |

### Execution loop

For each wave of independent parent tasks (executed in parallel):

```
Wave N (parallel):
  [task-executor A] || [task-executor B] || [task-executor C]

Post-wave:
  Validation (typecheck/lint)
  [quality-gate A] || [quality-gate B] || [quality-gate C]
  Orchestrator commits per parent (direct bash)
```

### Git conventions

- **Branch**: `feature/ham-{lowest-id}-{brief-slug}`
- **Parent task commits**: `feat(ham-123): concise description`
- **Simplification commits**: `refactor(ham-123): simplify description`
- **Review fix commits**: `fix(ham-123): address review findings`
- **PR**: Includes task checklist, changes summary, and test plan

---

## License

Proprietary. Copyright Hamster Studio.
