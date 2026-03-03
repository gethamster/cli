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

## License

Proprietary. Copyright Hamster Studio.
