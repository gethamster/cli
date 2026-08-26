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

This repo also ships a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) that orchestrates end-to-end execution of Hamster Studio briefs. The plugin is **execution-only**: plans (parent tasks, subtasks, context) are generated upstream in Hamster Studio and synced into `.hamster/` via `hamster sync`. The plugin schedules those existing tasks into parallel waves inline (no planner agent), dispatches independent parent tasks simultaneously, reviews each wave, and creates bisectable commits per parent task. Executors load project context as they go — the `hamster-project-context` skill, project skills, blueprints, and methods — but never generate or elaborate tasks. Trust comes with leeway, not blindness: executors adapt to mechanical drift (a file moved, a helper renamed) and document it, and escalate genuine plan defects as PLAN_ISSUE — verified by the orchestrator, decided by the user when scope is affected, and fed back to Hamster Studio via the PR's Plan Feedback section.

### Plugin install

In Claude Code:

```
/plugin marketplace add gethamster/cli
/plugin install hamster@hamster-plugins
```

### Cursor and Codex plugin packaging

This repository also includes first-class plugin manifests for:

- Cursor: `.cursor-plugin/plugin.json` and `.cursor-plugin/marketplace.json`
- Codex-compatible hosts: `.codex-plugin/plugin.json` and `.codex-plugin/marketplace.json`

These manifests include listing metadata (`version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`) plus component paths (`agents`, `commands`, `skills`) and a shared logo (`assets/logo.svg`).

Cursor publish URL:

```bash
# Submit for review/public listing
# https://cursor.com/marketplace/publish
```

Codex note:

- OpenAI Codex CLI currently does not document a public plugin marketplace submission endpoint.
- Use direct repository distribution and consume `.codex-plugin/plugin.json` in your Codex host/runtime integration.

Codex local install helper:

```bash
./scripts/install-codex-plugin.sh        # symlink mode (default)
./scripts/install-codex-plugin.sh copy   # copy mode
```

### Antigravity

This repository also includes a native Antigravity plugin at `.agents/plugins/hamster`. That folder holds `plugin.json` and `mcp_config.json`. `skills` and `agents` are symlinks to the shared repo-root trees (same pattern as Compound Engineering's `.agy/skills` link). Do not put `plugin.json` at the repo root: Cursor would treat it as a Cursor Agent Plugin.

CLI install (preferred; stages real files so the install does not depend on the repo):

```bash
git clone https://github.com/gethamster/cli
agy plugin install ./cli/.agents/plugins/hamster
```

Then in `agy`, run `/mcp` and confirm the `hamster` server. `agy plugin install` stages the plugin at `~/.gemini/config/plugins/hamster`. If the server shows Unauthorized, sign in from Antigravity IDE Customizations (Authenticate next to the server). The CLI `/mcp` panel shows status, Restart, and Disable; it does not expose Authenticate.

IDE without the CLI: open this repo (workspace plugin at `.agents/plugins/hamster`) or run the CLI install above. Do not `cp` the plugin folder: the relative skill/agent links would break outside this repo.

### Plugin skills

| Skill | Persona | Description |
|-------|---------|-------------|
| `/hamster:ask [request]` | Workspace Copilot | Connect current code with workspace priorities, blockers, blueprints, or related work; explicit requests can also perform supported actions |
| `/hamster:ship [slug-or-url]` | Release Engineer | Ship a brief: merge base, implement in parallel, test, review, bisectable commits, PR |
| `/hamster:plan [slug-or-url]` | Tech Lead + CEO/Eng modes | Analyze brief with optional founder or architecture review |
| `/hamster:resume [slug]` | — | Resume interrupted execution from where you left off |
| `/hamster:review` | Staff Engineer | Paranoid two-pass code review (CRITICAL then INFORMATIONAL) |
| `/hamster:qa [mode]` | QA Lead | Systematic testing: diff-aware, full, quick, regression |
| `/hamster:retro [days]` | Eng Manager | Engineering retrospective with metrics, trends, team analysis |

#### `/hamster:ask`

The direct gateway to Hamster's connected workspace context: the product direction, briefs, blueprints, decisions, code, and related work that shape what the team should build. Explicit requests can also perform supported workspace actions:

```
/hamster:ask I'm modifying auth middleware in apps/web/app/api/. What does our blueprint say about third-party integrations?
/hamster:ask I prototyped rate limiting in apps/api/middleware/rate-limit.ts. Create a brief for this work.
```

Follow-up questions continue the same Hamster conversation when they depend on the previous response.

#### `/hamster:ship`

The main orchestrator. Accepts a brief slug, UUID, or Hamster Studio URL:

```
/hamster:ship user-authentication
/hamster:ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

If no argument is given, presents an interactive picker of actionable briefs.

**Flow**: Setup (prereqs + live sync, one call) → Brief selection → Inline wave scheduling (one confirmation) → Branch + merge base → Parallel wave execution (implement → validate + test → wave review → bisectable commits) → Final validation → Ask about PR creation

No plan generation or task elaboration occurs at any step — scheduling only organizes the pre-generated tasks into parallel waves.

#### `/hamster:plan`

Read-only analysis with optional deep review. Produces the execution plan without making changes.

```
/hamster:plan api-rate-limiting
```

After analysis, choose a review mode:
- **CEO Review (Founder Mode)** — 10-section deep dive from first principles
- **Eng Review (Architecture Mode)** — 4-section technical review with ASCII diagrams and test plan
- **Quick Analysis** — Just the plan

#### `/hamster:resume`

Resumes an interrupted execution. Auto-detects the brief from the git branch name (`feature/ham-{id}-{slug}`), in-progress tasks, or a provided argument.

```
/hamster:resume
/hamster:resume user-authentication
```

#### `/hamster:review`

Paranoid two-pass code review for the current feature branch:
- **Pass 1 (CRITICAL)**: SQL safety, race conditions, auth boundaries, enum completeness, secrets
- **Pass 2 (INFORMATIONAL)**: Side effects, magic numbers, dead code, test gaps, type coercion, time safety
- Interactive resolution for critical findings with fix/acknowledge/false-positive options

```
/hamster:review
```

#### `/hamster:qa`

Systematic testing with 4 modes:

```
/hamster:qa diff        # Test only what changed (default on feature branches)
/hamster:qa full        # Full test suite with coverage
/hamster:qa quick       # 30-second lint + typecheck + smoke tests
/hamster:qa regression  # Changed files + dependents, flag new failures
```

Includes issue taxonomy (functional/type-safety/integration/performance/coverage-gap) and optional fix loop.

#### `/hamster:retro`

Engineering retrospective from git history:

```
/hamster:retro          # Last 7 days (default)
/hamster:retro 14       # Last 14 days
/hamster:retro 30       # Last 30 days
/hamster:retro 24h      # Last 24 hours
```

Produces: metrics table, hourly distribution, session analysis, hotspots, PR sizes, per-contributor deep dive with praise and growth suggestions, trends vs last retro, and a narrative summary.

### Agents

| Agent | Persona | Model | Purpose |
|-------|---------|-------|---------|
| **task-executor** | Senior Engineer | Opus | Implements one parent task + subtasks; loads project skills, blueprints, and methods; 4-path data flow thinking |
| **wave-reviewer** | Staff Engineer | Sonnet | Reviews a whole wave's diff (per-parent verdicts + cross-parent integration checks), then simplifies |

Wave scheduling, branch creation, commits, and PR creation are handled inline by the orchestrator — no dedicated agents.

### Execution loop

For each wave of independent parent tasks (executed in parallel):

```
Wave N (parallel):
  [task-executor A] || [task-executor B] || [task-executor C]

Post-wave (orchestrator):
  Validation + test gate (one pass, stop on test failure)
  [wave-reviewer] — one agent for the whole wave
    (small low-risk waves: orchestrator reviews inline, no agent)
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
