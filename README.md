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

This repo also ships a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) that orchestrates end-to-end execution of Hamster Studio briefs. It reads briefs and tasks from `.hamster/`, implements them sequentially with dependency awareness, reviews and simplifies code, and manages git operations with commits after each subtask.

### Plugin install

In Claude Code:

```
/plugin marketplace add gethamster/cli
/plugin install hamster@gethamster-cli
```

### Plugin commands

| Command | Description |
|---------|-------------|
| `/hamster:execute [slug-or-url]` | Full brief execution: analyze, implement, review, simplify, commit, PR |
| `/hamster:analyze [slug-or-url]` | Read-only analysis: dependency graph, codebase mapping, risk assessment |
| `/hamster:resume [slug]` | Resume interrupted execution from where you left off |

#### `/hamster:execute`

The main orchestrator. Accepts a brief slug or Hamster Studio URL:

```
/hamster:execute user-authentication
/hamster:execute https://tryhamster.com/home/my-team/briefs/user-authentication
```

If no argument is given, presents an interactive picker of actionable briefs.

**Flow**: Prerequisites check -> Brief selection -> Analysis (with user confirmation) -> Branch creation -> Task execution loop (implement -> commit -> review -> simplify) -> Final validation -> PR creation

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
| **brief-analyzer** | Opus | Reads brief + tasks, builds dependency graph, maps to codebase |
| **task-executor** | Opus | Implements a single task following the execution plan |
| **task-reviewer** | Sonnet | Reviews cumulative work after parent task completion |
| **code-simplifier** | Opus | Post-review polish of recently modified files |
| **commit-manager** | Sonnet | Branch creation, per-subtask commits, PR creation |

### Execution loop

For each parent task in the brief:

```
For each subtask:
  task-executor -> implement
  commit-manager -> commit

Mark parent done
task-reviewer -> review (fix if needed)
code-simplifier -> simplify (commit if changes)
```

### Git conventions

- **Branch**: `feature/ham-{lowest-id}-{brief-slug}`
- **Subtask commits**: `feat(ham-123): concise description`
- **Simplification commits**: `refactor(ham-123): simplify description`
- **Review fix commits**: `fix(ham-123): address review findings`
- **PR**: Includes task checklist, changes summary, and test plan

---

## License

Proprietary. Copyright Hamster Studio.
