#!/usr/bin/env node

/**
 * Validates server.json, the canonical metadata Hamster publishes to the
 * official MCP Registry. The registry stores each published version
 * immutably, so a wrong field cannot be corrected in place — it can only be
 * superseded by a new version. That is why this runs on every push.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const errors = [];

const schemaUrl = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const serverName = "com.tryhamster/hamster";
// The registry rejects version ranges outright and ranks anything its semver
// parser cannot read below the current release, so a malformed version would
// publish and never become "latest". Numeric parts take no leading zeros and
// pre-release identifiers are dot-separated and non-empty, per semver.org.
const versionPattern =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
const maxDescriptionLength = 100;
const maxTitleLength = 100;
const serverFields = new Set([
  "$schema",
  "name",
  "title",
  "description",
  "version",
  "websiteUrl",
  "repository",
  "icons",
  "remotes",
]);

function addError(message) {
  errors.push(message);
}

async function readJsonObject(filePath, context) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      addError(`${context} is missing: ${filePath}`);
    } else {
      addError(`${context} could not be read (${filePath}): ${error.message}`);
    }
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    addError(`${context} must be a JSON object (${filePath}), got ${JSON.stringify(parsed)}.`);
    return null;
  }
  return parsed;
}

function requireHttpsUrl(context, value) {
  if (typeof value !== "string" || value.length === 0) {
    addError(`${context} is required.`);
    return;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    addError(`${context} is not a valid URL: ${JSON.stringify(value)}.`);
    return;
  }
  if (parsed.protocol !== "https:") {
    addError(`${context} must be https, got ${JSON.stringify(value)}.`);
  }
}

function validateIdentity(server) {
  if (server.$schema !== schemaUrl) {
    addError(`server.json "$schema" must be "${schemaUrl}".`);
  }

  if (server.name !== serverName) {
    addError(`server.json "name" must be "${serverName}", got ${JSON.stringify(server.name)}.`);
  }

  if (typeof server.title !== "string" || server.title.length === 0) {
    addError('server.json "title" is required.');
  } else if (server.title.length > maxTitleLength) {
    addError(`server.json "title" is ${server.title.length} chars; the registry caps it at ${maxTitleLength}.`);
  }

  if (typeof server.description !== "string" || server.description.length === 0) {
    addError('server.json "description" is required.');
  } else if (server.description.length > maxDescriptionLength) {
    addError(
      `server.json "description" is ${server.description.length} chars; the registry caps it at ${maxDescriptionLength}.`
    );
  }

  if (typeof server.version !== "string" || !versionPattern.test(server.version)) {
    addError(
      `server.json "version" must be a semantic version with an optional pre-release suffix, got ${JSON.stringify(server.version)}. The registry rejects ranges and ranks versions it cannot parse below the current release.`
    );
  }

  requireHttpsUrl('server.json "websiteUrl"', server.websiteUrl);
}

function validateRepository(repository) {
  if (repository === undefined) {
    return;
  }
  if (typeof repository !== "object" || repository === null) {
    addError('server.json "repository" must be an object.');
    return;
  }
  requireHttpsUrl('server.json "repository.url"', repository.url);
  if (repository.source !== "github") {
    addError(`server.json "repository.source" must be "github", got ${JSON.stringify(repository.source)}.`);
  }
}

function validateIcons(icons) {
  if (icons === undefined) {
    return;
  }
  if (!Array.isArray(icons) || icons.length === 0) {
    addError('server.json "icons" must be a non-empty array when present.');
    return;
  }
  icons.forEach((icon, index) => {
    requireHttpsUrl(`server.json "icons[${index}].src"`, icon?.src);
  });
}

async function validateRemote(remotes) {
  if (!Array.isArray(remotes) || remotes.length !== 1) {
    addError('server.json "remotes" must hold exactly one entry: the hosted Hamster MCP endpoint.');
    return;
  }

  const [remote] = remotes;
  if (remote?.type !== "streamable-http") {
    addError(`server.json remote "type" must be "streamable-http", got ${JSON.stringify(remote?.type)}.`);
  }
  requireHttpsUrl("server.json remote \"url\"", remote?.url);

  // The plugin manifests configure the same endpoint for every host, and
  // validate-plugin.mjs already keeps those three files in agreement. Anchoring
  // here means a moved endpoint cannot be published to the registry while the
  // installed plugin still points at the old one.
  const pluginMcp = await readJsonObject(path.join(repoRoot, "mcp.json"), "Root mcp.json");
  if (!pluginMcp) {
    return;
  }
  const pluginUrl = pluginMcp.mcpServers?.hamster?.url;
  if (typeof pluginUrl !== "string" || pluginUrl.length === 0) {
    addError('Root mcp.json has no "mcpServers.hamster.url" to anchor the registry remote against.');
  } else if (remote?.url !== pluginUrl) {
    addError(`server.json remote url "${remote?.url}" does not match mcp.json "${pluginUrl}".`);
  }
}

async function main() {
  try {
    const server = await readJsonObject(path.join(repoRoot, "server.json"), "server.json");
    if (server) {
      for (const key of Object.keys(server)) {
        if (key === "packages") {
          addError(
            'server.json must not declare "packages": Hamster publishes a remote connector, not an installable package.'
          );
        } else if (!serverFields.has(key)) {
          addError(`server.json has unknown field "${key}".`);
        }
      }

      validateIdentity(server);
      validateRepository(server.repository);
      validateIcons(server.icons);
      await validateRemote(server.remotes);
    }
  } catch (error) {
    addError(error.message);
  }

  if (errors.length > 0) {
    console.error("Registry metadata validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("Registry metadata validation passed.");
}

await main();
