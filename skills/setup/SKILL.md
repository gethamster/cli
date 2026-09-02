---
name: setup
description: Install the Hamster CLI, sign in, and sync the plan into this repo. Use when the user says Install Hamster, first-run setup, or when ship/plan-hamster/resume-hamster report SETUP_NEEDED.
---

# Setup

Make this workspace ready: Hamster CLI on PATH, user signed in, plan on disk in this repo's `.hamster/`.

Talking to Hamster uses the hosted MCP server this plugin already exposes. This skill is only for the CLI and the local plan.

## Readiness check

Run the bundled gate. Set `SKILL_DIR` to the absolute path of the directory holding the SKILL.md you just read — the shell's working directory is the user's project, not this skill — and keep the whole command on one line with its statements `;`-separated, because some clients flatten a fenced block into a single line before running it. The `else` branch is the same gate inline, for clients that expose no readable path to the installed package. Neither branch installs, opens a browser, or calls curl.

Unix:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>"; if [ -f "$SKILL_DIR/scripts/ensure-ready.sh" ]; then bash "$SKILL_DIR/scripts/ensure-ready.sh"; else export PATH="$HOME/.hamster/bin:$PATH"; if command -v hamster >/dev/null 2>&1 && printf '%s' "$(hamster --no-tui status 2>/dev/null || true)" | grep -q "Logged in" && sync_err="$(hamster sync 2>&1)"; then echo READY; else [ -n "${sync_err:-}" ] && printf '%s\n' "$sync_err" >&2; echo SETUP_NEEDED; exit 1; fi; fi
```

Windows:

```powershell
$SkillDir = "<absolute path of the directory containing this SKILL.md>"; if (Test-Path "$SkillDir\scripts\ensure-ready.ps1") { pwsh "$SkillDir\scripts\ensure-ready.ps1" } else { $env:PATH = "$env:USERPROFILE\.hamster\bin;" + $env:PATH; if ((Get-Command hamster -ErrorAction SilentlyContinue) -and ((hamster --no-tui status 2>$null | Out-String) -cmatch "Logged in")) { $syncOut = & hamster sync 2>&1; if ($LASTEXITCODE -eq 0) { "READY" } else { [Console]::Error.WriteLine(($syncOut | Out-String).TrimEnd()); "SETUP_NEEDED"; exit 1 } } else { "SETUP_NEEDED"; exit 1 } }
```

- Prints `READY` — the CLI is installed, you are signed in, and `hamster sync` succeeded. Stop.
- Prints `SETUP_NEEDED` — continue below. Do not invent another install path.

## Install the CLI

If `hamster` is not on PATH (also look in `~/.hamster/bin`):

```bash
curl -fsSL https://tryhamster.com/cli/install | bash
```

Then put `~/.hamster/bin` on PATH for this session.

## Sign in

```bash
hamster auth login
```

This opens a browser. Wait until it finishes. Do not paste tokens into chat.

## Init and sync

```bash
hamster init
```

`init` may ask the user to pick an account and runs the first sync.

Re-run the readiness check — it runs the sync that pulls the plan. If it still prints `SETUP_NEEDED`, report what failed and stop.
