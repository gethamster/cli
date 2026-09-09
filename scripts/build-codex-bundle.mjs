#!/usr/bin/env node

/**
 * Stage and zip the skills-only package uploaded to Codex's Plugins Directory.
 *
 * The portal rejects MCP configuration in a skills-only submission, so the
 * bundle carries the Codex manifest without its mcpServers pointer, the skills
 * tree, the listing assets, and the license. The repository itself keeps its
 * full CLI + MCP + skills shape for every GitHub and marketplace install.
 *
 * Usage:
 *   node scripts/build-codex-bundle.mjs                       # dist/
 *   node scripts/build-codex-bundle.mjs --out build           # custom output
 *   node scripts/build-codex-bundle.mjs --exclude setup       # drop a skill
 */

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Files the portal reads as MCP or app configuration; a skills-only upload that
// carries any of them fails with mcp_configuration_excluded.
const FORBIDDEN_FILENAMES = new Set([".mcp.json", "mcp.json", ".app.json"]);

function parseArgs(argv) {
  const options = { out: "dist", exclude: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--out requires a directory path.");
      }
      options.out = value;
      index += 1;
    } else if (arg === "--exclude") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--exclude requires a skill name.");
      }
      options.exclude.add(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath} contains invalid JSON: ${error.message}`);
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function listSkillNames(excluded) {
  const skillsDir = path.join(repoRoot, "skills");
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory() && !excluded.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const name of excluded) {
    if (!entries.some((entry) => entry.isDirectory() && entry.name === name)) {
      throw new Error(`--exclude ${name} does not name a directory under skills/.`);
    }
  }

  if (names.length === 0) {
    throw new Error("No skills remain after exclusions; the directory rejects a bundle with an empty skills/.");
  }

  return names;
}

async function stageBundle(stagingDir, skillNames) {
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(path.join(stagingDir, ".codex-plugin"), { recursive: true });

  const manifest = await readJsonFile(path.join(repoRoot, ".codex-plugin", "plugin.json"));
  delete manifest.mcpServers;
  await fs.writeFile(
    path.join(stagingDir, ".codex-plugin", "plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  for (const name of skillNames) {
    await fs.cp(path.join(repoRoot, "skills", name), path.join(stagingDir, "skills", name), {
      recursive: true,
      dereference: true,
      verbatimSymlinks: false,
    });
  }

  await fs.cp(path.join(repoRoot, "assets"), path.join(stagingDir, "assets"), {
    recursive: true,
    dereference: true,
  });
  await fs.cp(path.join(repoRoot, "LICENSE"), path.join(stagingDir, "LICENSE"));

  return manifest;
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function verifyStaging(stagingDir, manifest, skillNames) {
  for (const name of skillNames) {
    const skillFile = path.join(stagingDir, "skills", name, "SKILL.md");
    if (!(await pathExists(skillFile))) {
      throw new Error(`Staged skill has no SKILL.md: ${skillFile}`);
    }
  }

  for (const field of ["logo", "logoDark", "composerIcon"]) {
    const value = manifest.interface?.[field];
    if (value === undefined) {
      continue;
    }
    const resolved = path.resolve(stagingDir, value);
    const relative = path.relative(stagingDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`interface.${field} resolves outside the bundle: ${value}`);
    }
    if (!(await pathExists(resolved))) {
      throw new Error(`interface.${field} is missing from the bundle: ${resolved}`);
    }
  }

  for (const file of await walkFiles(stagingDir)) {
    if (FORBIDDEN_FILENAMES.has(path.basename(file))) {
      throw new Error(`A skills-only bundle must not carry MCP or app configuration: ${file}`);
    }
  }

  if (manifest.author?.name !== manifest.interface?.developerName) {
    throw new Error(
      `author.name (${JSON.stringify(manifest.author?.name)}) must equal interface.developerName (${JSON.stringify(manifest.interface?.developerName)}).`
    );
  }
}

function writeZip(stagingDir, zipPath) {
  try {
    // -X drops extra attributes so the same tree always zips to the same bytes;
    // the archive root is the plugin root, which the portal requires.
    execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: stagingDir });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("The zip binary is required; install it (macOS ships it, Debian: apt-get install zip).");
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { version } = await readJsonFile(path.join(repoRoot, "plugin.json"));
  if (!version) {
    throw new Error("Root plugin.json has no version.");
  }

  const outDir = path.resolve(repoRoot, options.out);
  const stagingDir = path.join(outDir, "codex-skills-only");
  const skillNames = await listSkillNames(options.exclude);

  const manifest = await stageBundle(stagingDir, skillNames);
  await verifyStaging(stagingDir, manifest, skillNames);

  const zipPath = path.join(outDir, `hamster-codex-skills-only-${version}.zip`);
  await fs.rm(zipPath, { force: true });
  writeZip(stagingDir, zipPath);

  console.log(`Wrote ${path.relative(repoRoot, zipPath)}`);
  console.log(`Skills: ${skillNames.join(", ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
