# Hamster Skills (Codex Plugin Marketplace)

Skill-only Hamster workflows for OpenAI Codex. No apps, MCP servers, or hooks.

## Install

```bash
npx codex-marketplace add gethamster/cli/plugins/hamster-skills --plugin --project
```

This is the [Codex Plugin Marketplace](https://www.codex-marketplace.com) listing. It is not the MCP-backed Hamster plugin (`codex plugin marketplace add gethamster/cli`).

## Skills

| Skill | Needs Hamster CLI | Description |
|-------|-------------------|-------------|
| `review` | no | Two-pass code review on the current feature branch |
| `qa` | no | Diff-aware, full, quick, or regression testing |
| `retro` | no | Engineering retrospective from git history |
| `ask` | yes | Connect current code with Hamster workspace context |
| `ship` | yes | Ship a Hamster Studio brief |
| `plan` | yes | Analyze a brief without making changes |
| `resume` | yes | Resume interrupted brief execution |

`ask`, `ship`, `plan`, and `resume` instruct Codex to install the [Hamster CLI](https://tryhamster.com) if it is missing.

## Publishing

Canonical files live at the repo root (`skills/`, `agents/`, `assets/logo.svg`). This directory is a real copy, not a symlink: the marketplace installer clones only `plugins/hamster-skills/`, and Codex drops symlinks on install. After editing the canonical files:

```bash
scripts/sync-codex-marketplace.sh
scripts/sync-codex-marketplace.sh --check
```
