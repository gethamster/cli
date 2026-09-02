#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { syncAdapters } from "./sync-adapters.mjs";

const repoRoot = process.cwd();
const errors = [];

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const rootPluginFields = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

function addError(message) {
  errors.push(message);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, context) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    addError(`${context} is missing: ${filePath}`);
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
}

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return null;
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const fields = {};

  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    fields[key] = value;
  }

  return fields;
}

async function walkFiles(dirPath) {
  const files = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return !normalized.startsWith("../") && normalized !== "..";
}

async function validateReferencedPath(pluginDir, fieldName, pathValue, pluginName) {
  if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) {
    return;
  }

  if (!isSafeRelativePath(pathValue)) {
    addError(
      `${pluginName}: field "${fieldName}" has invalid path "${pathValue}". Use a relative path without ".." or absolute prefixes.`
    );
    return;
  }

  const resolved = path.resolve(pluginDir, pathValue);
  const exists = await pathExists(resolved);
  if (!exists) {
    addError(`${pluginName}: field "${fieldName}" references missing path "${pathValue}".`);
  }
}

async function validateFrontmatterFile(filePath, componentName, requiredKeys, pluginName) {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter(content);
  const relativeFile = path.relative(repoRoot, filePath);

  if (!parsed) {
    addError(`${pluginName}: ${componentName} file missing YAML frontmatter: ${relativeFile}`);
    return null;
  }

  for (const key of requiredKeys) {
    if (!parsed[key] || parsed[key].length === 0) {
      addError(`${pluginName}: ${componentName} file missing "${key}" in frontmatter: ${relativeFile}`);
    }
  }

  return parsed;
}

function requireVersionParity(context, actual, rootVersion) {
  if (typeof actual !== "string" || actual.length === 0) {
    addError(`${context} "version" is required.`);
    return;
  }
  if (rootVersion && actual !== rootVersion) {
    addError(`${context} version "${actual}" does not match root "${rootVersion}".`);
  }
}

function requireHamsterName(context, actual) {
  if (actual !== "hamster") {
    addError(
      `${context} name must be "hamster"${actual === undefined ? "." : `, got ${JSON.stringify(actual)}.`}`
    );
  }
}

async function validateSkills(pluginDir, pluginName) {
  const skillsDir = path.join(pluginDir, "skills");
  if (!(await pathExists(skillsDir))) {
    addError(`${pluginName}: skills/ directory is missing.`);
    return;
  }

  const files = await walkFiles(skillsDir);
  const skillFiles = files.filter((file) => path.basename(file) === "SKILL.md");
  if (skillFiles.length === 0) {
    addError(`${pluginName}: no SKILL.md files found under skills/.`);
    return;
  }

  // Clients build the slash command from frontmatter `name`, while $SKILL_DIR reads
  // and DUPLICATE_GROUPS key off the directory. A rename that lands on only one
  // of the two ships a command that no longer matches the files it loads.
  for (const file of skillFiles) {
    const parsed = await validateFrontmatterFile(file, "skill", ["name", "description"], pluginName);
    const directory = path.basename(path.dirname(file));
    if (parsed?.name && parsed.name !== directory) {
      addError(
        `${pluginName}: skill frontmatter name "${parsed.name}" does not match its directory "${directory}" (${path.relative(repoRoot, file)}).`
      );
    }
  }
}

async function validateRootPlugin() {
  const manifestPath = path.join(repoRoot, "plugin.json");
  const manifest = await readJsonFile(manifestPath, "Root plugin.json");
  if (!manifest) {
    return null;
  }

  for (const key of Object.keys(manifest)) {
    if (!rootPluginFields.has(key)) {
      addError(`Root plugin.json has non-Agent-Plugins field "${key}".`);
    }
  }

  if (typeof manifest.name !== "string" || !pluginNamePattern.test(manifest.name)) {
    addError('Root plugin.json "name" must be lowercase kebab-case.');
  } else if (manifest.name !== "hamster") {
    addError(`Root plugin.json name must be "hamster", got "${manifest.name}".`);
  }

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    addError('Root plugin.json "version" is required.');
  }

  if (manifest.license !== "MIT") {
    addError('Root plugin.json "license" must be "MIT".');
  }

  return manifest;
}

function isRepoRootSource(value) {
  return value === "." || value === "./";
}

function validateMarketplaceEntry(context, entry, version) {
  if (!entry || entry.name !== "hamster") {
    addError(`${context} plugins[0].name must be "hamster".`);
    return;
  }
  if (!isRepoRootSource(entry.source)) {
    addError(`${context} plugins[0].source must resolve to "./", got ${JSON.stringify(entry.source)}.`);
  }
  if (entry.license !== "MIT") {
    addError(`${context} plugin license must be "MIT".`);
  }
  requireVersionParity(`${context} plugins[0]`, entry.version, version);
}

async function validateCursor(version) {
  const marketplacePath = path.join(repoRoot, ".cursor-plugin", "marketplace.json");
  const marketplace = await readJsonFile(marketplacePath, "Cursor marketplace manifest");
  if (marketplace) {
    const entry = Array.isArray(marketplace.plugins) ? marketplace.plugins[0] : null;
    validateMarketplaceEntry("Cursor marketplace.json", entry, version);
    // Cursor's catalog carries version in metadata and on the plugin entry.
    // plugins[0] is checked above; metadata must not drift independently.
    requireVersionParity("Cursor marketplace.json metadata", marketplace.metadata?.version, version);
  }

  const manifestPath = path.join(repoRoot, ".cursor-plugin", "plugin.json");
  const manifest = await readJsonFile(manifestPath, "Cursor plugin manifest");
  if (!manifest) {
    return;
  }

  requireHamsterName("Cursor plugin.json", manifest.name);

  if (typeof manifest.displayName !== "string" || manifest.displayName.length === 0) {
    addError('Cursor plugin.json must include a non-empty "displayName".');
  }

  if (typeof manifest.logo !== "string" || manifest.logo.length === 0) {
    addError('Cursor plugin.json must include "logo".');
  } else {
    await validateReferencedPath(repoRoot, "logo", manifest.logo, "cursor");
  }

  if (manifest.license !== "MIT") {
    addError('Cursor plugin.json "license" must be "MIT".');
  }

  // Cursor loads MCP from the root dialect files, so an inline pointer here is
  // a second source of truth for the same endpoint. Claude and Codex are
  // asserted to carry the pointer; Cursor is asserted not to.
  if (manifest.mcpServers !== undefined) {
    addError("Cursor plugin.json must not include mcpServers.");
  }

  requireVersionParity("Cursor plugin.json", manifest.version, version);
}

async function validateClaude(version) {
  const manifestPath = path.join(repoRoot, ".claude-plugin", "plugin.json");
  const manifest = await readJsonFile(manifestPath, "Claude plugin manifest");
  if (manifest) {
    requireHamsterName("Claude plugin.json", manifest.name);
    if (typeof manifest.displayName !== "string" || manifest.displayName.length === 0) {
      addError('Claude plugin.json must include a non-empty "displayName".');
    }
    if (manifest.mcpServers !== "./.mcp.json") {
      addError('Claude plugin.json must set mcpServers to "./.mcp.json".');
    }
    if (manifest.logo !== undefined) {
      addError("Claude plugin.json must not include logo.");
    }
    if (manifest.license !== "MIT") {
      addError('Claude plugin.json "license" must be "MIT".');
    }
    requireVersionParity("Claude plugin.json", manifest.version, version);
  }

  const marketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const marketplace = await readJsonFile(marketplacePath, "Claude marketplace manifest");
  if (!marketplace) {
    return;
  }

  const entry = Array.isArray(marketplace.plugins) ? marketplace.plugins[0] : null;
  validateMarketplaceEntry("Claude marketplace.json", entry, version);
}

async function validateCodexCatalog() {
  const catalogPath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");
  const catalog = await readJsonFile(catalogPath, "Codex marketplace catalog");
  if (!catalog) {
    return;
  }

  const entry = Array.isArray(catalog.plugins) ? catalog.plugins[0] : null;
  if (!entry || entry.name !== "hamster") {
    addError('.agents/plugins/marketplace.json plugins[0].name must be "hamster".');
    return;
  }

  const source = entry.source;
  if (!source || source.source !== "local" || !isRepoRootSource(source.path)) {
    addError('.agents/plugins/marketplace.json plugins[0].source must be { source: "local", path: "./" }.');
  }

  if (typeof catalog.interface?.displayName !== "string" || catalog.interface.displayName.length === 0) {
    addError(".agents/plugins/marketplace.json must include interface.displayName.");
  }
}

async function validateCodex(version) {
  const manifestPath = path.join(repoRoot, ".codex-plugin", "plugin.json");
  const manifest = await readJsonFile(manifestPath, "Codex plugin manifest");
  if (!manifest) {
    return;
  }

  requireHamsterName("Codex plugin.json", manifest.name);

  if (manifest.mcpServers !== "./.mcp.json") {
    addError('Codex plugin.json must set mcpServers to "./.mcp.json".');
  }

  if (!manifest.interface || typeof manifest.interface !== "object") {
    addError("Codex plugin.json must include an interface object.");
    return;
  }

  if (typeof manifest.interface.displayName !== "string" || manifest.interface.displayName.length === 0) {
    addError('Codex plugin.json must include interface.displayName.');
  }

  if (typeof manifest.interface.logo !== "string" || manifest.interface.logo.length === 0) {
    addError("Codex plugin.json must include interface.logo.");
  } else {
    await validateReferencedPath(repoRoot, "interface.logo", manifest.interface.logo, "codex");
  }

  if (manifest.license !== "MIT") {
    addError('Codex plugin.json "license" must be "MIT".');
  }

  requireVersionParity("Codex plugin.json", manifest.version, version);
}

async function validateMcpFiles() {
  const urls = new Map();

  const config = await readJsonFile(path.join(repoRoot, "mcp_config.json"), "Root mcp_config.json");
  if (config) {
    const serverUrl = config.mcpServers?.hamster?.serverUrl;
    if (typeof serverUrl !== "string" || serverUrl.length === 0) {
      addError("Root mcp_config.json must set mcpServers.hamster.serverUrl.");
    } else {
      urls.set("mcp_config.json", serverUrl);
    }
  }

  const agentPlugins = await readJsonFile(path.join(repoRoot, "mcp.json"), "Root mcp.json");
  if (agentPlugins) {
    const server = agentPlugins.mcpServers?.hamster;
    if (server?.type !== "streamable-http" || typeof server?.url !== "string" || server.url.length === 0) {
      addError('Root mcp.json must set mcpServers.hamster to { type: "streamable-http", url }.');
    } else {
      urls.set("mcp.json", server.url);
    }
  }

  const claudeCodex = await readJsonFile(path.join(repoRoot, ".mcp.json"), "Root .mcp.json");
  if (claudeCodex) {
    const server = claudeCodex.mcpServers?.hamster;
    if (server?.type !== "http" || typeof server?.url !== "string" || server.url.length === 0) {
      addError('Root .mcp.json must set mcpServers.hamster to { type: "http", url }.');
    } else {
      urls.set(".mcp.json", server.url);
    }
  }

  const distinct = new Set(urls.values());
  if (distinct.size > 1) {
    const listing = [...urls.entries()].map(([file, url]) => `${file}=${url}`).join(", ");
    addError(`MCP endpoint URLs have drifted across dialect files: ${listing}.`);
  }
}

async function validateNoAntigravityNest() {
  // Antigravity discovers workspace plugins under both .agents/plugins/ and
  // _agents/plugins/. Either nest would reintroduce the deleted Antigravity-only
  // package that root installs replaced.
  for (const nestRoot of [".agents", "_agents"]) {
    if (await pathExists(path.join(repoRoot, nestRoot, "plugins", "hamster"))) {
      addError(`Delete ${nestRoot}/plugins/hamster; agy installs the repo root.`);
    }
  }
}

// Clients are free to install, copy, or load one skill directory on its own, so a
// skill that reaches into a sibling breaks on arrival. Shared material is
// duplicated instead, and these groups keep the copies byte-identical.
const DUPLICATE_GROUPS = [
  [
    "skills/setup/scripts/ensure-ready.sh",
    "skills/ship/scripts/ensure-ready.sh",
    "skills/plan-hamster/scripts/ensure-ready.sh",
    "skills/resume-hamster/scripts/ensure-ready.sh",
  ],
  [
    "skills/setup/scripts/ensure-ready.ps1",
    "skills/ship/scripts/ensure-ready.ps1",
    "skills/plan-hamster/scripts/ensure-ready.ps1",
    "skills/resume-hamster/scripts/ensure-ready.ps1",
  ],
  [
    "skills/ship/references/brief-selection.md",
    "skills/plan-hamster/references/brief-selection.md",
    "skills/resume-hamster/references/brief-selection.md",
  ],
  ["skills/ship/references/execution-loop.md", "skills/resume-hamster/references/execution-loop.md"],
  ["skills/ship/references/agents/task-executor.md", "skills/resume-hamster/references/agents/task-executor.md"],
  ["skills/ship/references/agents/wave-reviewer.md", "skills/resume-hamster/references/agents/wave-reviewer.md"],
];

const skillDirReferencePattern = /\$SKILL_DIR\/([A-Za-z0-9._/-]+)/g;
const skillDirReferencePatternPowerShell = /\$SkillDir\\([A-Za-z0-9._\\-]+)/g;
const localMarkdownLinkPattern = /\]\(((?:references|scripts)\/[^)\s]+)\)/g;

async function listSkillMdFiles() {
  const skillsDir = path.join(repoRoot, "skills");
  if (!(await pathExists(skillsDir))) {
    return [];
  }
  const files = await walkFiles(skillsDir);
  return files.filter((file) => path.basename(file) === "SKILL.md");
}

async function validateSkillsAreSelfContained() {
  for (const file of await listSkillMdFiles()) {
    const raw = await fs.readFile(file, "utf8");
    if (raw.includes("../")) {
      addError(
        `${path.relative(repoRoot, file)} contains "../"; skills must be self-contained. Duplicate the file into this skill and add it to DUPLICATE_GROUPS.`
      );
    }
  }
}

async function validateSkillLocalReferences() {
  for (const file of await listSkillMdFiles()) {
    const raw = await fs.readFile(file, "utf8");
    const skillDir = path.dirname(file);
    const targets = new Set();

    for (const match of raw.matchAll(skillDirReferencePattern)) {
      targets.add(match[1]);
    }
    for (const match of raw.matchAll(skillDirReferencePatternPowerShell)) {
      targets.add(match[1].replace(/\\/g, "/"));
    }
    for (const match of raw.matchAll(localMarkdownLinkPattern)) {
      targets.add(match[1]);
    }

    for (const target of targets) {
      if (!(await pathExists(path.join(skillDir, target)))) {
        addError(
          `${path.relative(repoRoot, file)} references "${target}", which does not exist in ${path.relative(repoRoot, skillDir)}/.`
        );
      }
    }
  }
}

// The first path in each group is the source of truth; the rest are its copies.
// Editing shared material is therefore a multi-file edit, and this is where a
// half-done one is caught, so the failure names the source and the exact copy
// commands rather than only reporting that the hashes differ.
async function validateDuplicateParity() {
  for (const [source, ...copies] of DUPLICATE_GROUPS) {
    const digests = new Map();

    for (const relativePath of [source, ...copies]) {
      let raw;
      try {
        raw = await fs.readFile(path.join(repoRoot, relativePath));
      } catch {
        addError(
          `Duplicated file is missing: ${relativePath}. Every skill needs its own copy — run \`cp ${source} ${relativePath}\`.`
        );
        continue;
      }
      digests.set(relativePath, createHash("sha256").update(raw).digest("hex"));
    }

    if (new Set(digests.values()).size > 1) {
      const sourceDigest = digests.get(source);
      const drifted = [...digests.entries()].filter(([file, digest]) => file !== source && digest !== sourceDigest);
      const listing = [...digests.entries()].map(([file, digest]) => `${file}=${digest.slice(0, 12)}`).join(", ");
      const fix = drifted.map(([file]) => `cp ${source} ${file}`).join(" && ");
      addError(
        `Duplicated copies have diverged and must stay byte-identical: ${listing}. ` +
          `If ${source} holds the intended content, run \`${fix}\`; if a copy does, apply that edit to ${source} first.`
      );
    }
  }
}

// Codex injects at most 8000 bytes of a SKILL.md and silently drops the rest,
// so measure with CRLF normalized to LF — a CRLF checkout must not shift the count.
async function validateSkillSizeBudget() {
  for (const file of await listSkillMdFiles()) {
    const raw = await fs.readFile(file, "utf8");
    const size = Buffer.byteLength(raw.replace(/\r\n/g, "\n"), "utf8");
    if (size > 8000) {
      addError(
        `${path.relative(repoRoot, file)} is ${size} bytes (> 8000); Codex would truncate it. Move material into references/.`
      );
    }
  }
}

async function validateLayout() {
  await validateMcpFiles();

  if (await pathExists(path.join(repoRoot, "hooks"))) {
    addError("hooks/ must not exist.");
  }

  if (await pathExists(path.join(repoRoot, "bin"))) {
    addError("top-level bin/ must not exist.");
  }

  const licensePath = path.join(repoRoot, "LICENSE");
  if (!(await pathExists(licensePath))) {
    addError("LICENSE is missing.");
  } else {
    const license = await fs.readFile(licensePath, "utf8");
    if (!license.includes("MIT License")) {
      addError("LICENSE must be MIT.");
    }
  }

  await validateSkills(repoRoot, "hamster");
}

function summarizeAndExit() {
  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Validation passed.");
}

async function main() {
  const rootManifest = await validateRootPlugin();
  const version = rootManifest?.version ?? null;
  await validateCursor(version);
  await validateClaude(version);
  await validateCodex(version);
  await validateCodexCatalog();
  await validateNoAntigravityNest();
  await validateSkillsAreSelfContained();
  await validateSkillLocalReferences();
  await validateDuplicateParity();
  await validateSkillSizeBudget();
  await validateLayout();
  {
    const { errors: adapterErrors } = await syncAdapters({ check: true });
    for (const error of adapterErrors) {
      addError(error);
    }
  }
  summarizeAndExit();
}

await main();
