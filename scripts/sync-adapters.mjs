#!/usr/bin/env node

/**
 * Generate root agents/*.md as native Claude/Cursor projections over the
 * canonical skill-local prompt bodies under skills/ship/references/agents/.
 *
 * Usage:
 *   node scripts/sync-adapters.mjs          # write generated files
 *   node scripts/sync-adapters.mjs --check  # fail if generated files drift
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();

const AGENTS = [
  {
    id: "task-executor",
    model: "opus",
    color: "blue",
    description: `Implements all subtasks of a single parent Hamster Studio task (HAM-XXX). Reads the parent and all its subtask files from .hamster/, loads project context (project skills, blueprints, methods), discovers relevant codebase context just-in-time, implements all subtasks sequentially in one session, updates task statuses, and reports all changes. Execution-only with leeway: tasks are pre-generated upstream and trusted by default, but stale references are adapted (and documented), and genuine plan defects are escalated as PLAN_ISSUE rather than blindly implemented. Does NOT run project validation — that is handled by the orchestrator after all parallel executors complete.

Examples:
<example>
Context: The orchestrator needs a parent task and its subtasks implemented.
assistant: "I'll launch the task-executor to implement HAM-100 and its subtasks HAM-101, HAM-102, HAM-103."
<commentary>
Use task-executor for each parent task in the execution loop. One agent session handles all subtasks.
</commentary>
</example>`,
  },
  {
    id: "wave-reviewer",
    model: "sonnet",
    color: "green",
    description: `Reviews and simplifies the cumulative code changes of one execution wave (one or more parent tasks). Phase 1 reviews the full wave diff for convention compliance, quality, security, and completeness — producing a per-parent PASS or NEEDS_FIXES verdict. Because it sees the whole wave, it also catches cross-parent integration issues that per-task review would miss. For parents that pass, Phase 2 applies surgical simplification while preserving all functionality. Runs once per wave, after all parallel task-executors complete and validation/tests pass.

Examples:
<example>
Context: Wave 2 (HAM-100 and HAM-300) finished executing and validation passed.
assistant: "Launching wave-reviewer to review the cumulative wave diff and simplify what passes."
<commentary>
One wave-reviewer per wave reviews all parents together, replacing N per-parent review agents.
</commentary>
</example>`,
  },
];

function indentBlock(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+$/g, "")
    .split("\n")
    .map((line) => (line.length === 0 ? pad.trimEnd() : `${pad}${line}`))
    .join("\n");
}

function renderAgent({ id, model, color, description }, body) {
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\s+$/g, "") + "\n";
  return [
    "---",
    `name: ${id}`,
    "description: |",
    indentBlock(description, 2),
    `model: ${model}`,
    `color: ${color}`,
    "---",
    "",
    normalizedBody,
  ].join("\n");
}

function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function syncAdapters({ check = false } = {}) {
  const errors = [];
  const written = [];

  for (const agent of AGENTS) {
    const sourcePath = path.join(
      repoRoot,
      "skills",
      "ship",
      "references",
      "agents",
      `${agent.id}.md`
    );
    const targetPath = path.join(repoRoot, "agents", `${agent.id}.md`);

    let body;
    try {
      body = await fs.readFile(sourcePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        errors.push(`Missing canonical agent body: ${path.relative(repoRoot, sourcePath)}`);
      } else {
        errors.push(
          `Could not read canonical agent body ${path.relative(repoRoot, sourcePath)}: ${error.message}`
        );
      }
      continue;
    }

    const rendered = renderAgent(agent, body);

    if (check) {
      let existing;
      try {
        existing = await fs.readFile(targetPath, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          errors.push(
            `Generated agent missing: ${path.relative(repoRoot, targetPath)}. Run \`node scripts/sync-adapters.mjs\`.`
          );
        } else {
          errors.push(
            `Could not read generated agent ${path.relative(repoRoot, targetPath)}: ${error.message}`
          );
        }
        continue;
      }

      if (digest(existing.replace(/\r\n/g, "\n")) !== digest(rendered)) {
        errors.push(
          `${path.relative(repoRoot, targetPath)} is out of sync with ${path.relative(repoRoot, sourcePath)}. Run \`node scripts/sync-adapters.mjs\`.`
        );
      }
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, rendered, "utf8");
    written.push(path.relative(repoRoot, targetPath));
  }

  return { errors, written };
}

async function main() {
  const check = process.argv.includes("--check");
  const { errors, written } = await syncAdapters({ check });

  if (errors.length > 0) {
    console.error(check ? "Adapter check failed:" : "Adapter sync failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  if (check) {
    console.log("Adapter check passed.");
    return;
  }

  for (const file of written) {
    console.log(`Wrote ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
