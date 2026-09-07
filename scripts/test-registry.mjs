#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(repoRoot, "scripts", "validate-registry.mjs");

const FIXTURE_ENTRIES = ["server.json", "mcp.json"];

const fixtures = [];

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hamster-registry-"));
  fixtures.push(dir);
  for (const entry of FIXTURE_ENTRIES) {
    await cp(path.join(repoRoot, entry), path.join(dir, entry));
  }
  return dir;
}

function runValidator(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [validatorPath], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function patchServer(cwd, patch) {
  const serverPath = path.join(cwd, "server.json");
  const server = JSON.parse(await readFile(serverPath, "utf8"));
  patch(server);
  await writeFile(serverPath, `${JSON.stringify(server, null, 2)}\n`);
}

test("the committed server.json passes", async () => {
  const result = await runValidator(await makeFixture());
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Registry metadata validation passed\./);
});

for (const version of ["^1.0.0", "1.01.0", "1.0.0-foo.", "1.0.0-"]) {
  test(`version ${JSON.stringify(version)} is rejected as non-semantic`, async () => {
    const cwd = await makeFixture();
    await patchServer(cwd, (server) => {
      server.version = version;
    });

    const result = await runValidator(cwd);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /"version" must be a semantic version/);
  });
}

test("a pre-release version is accepted", async () => {
  const cwd = await makeFixture();
  await patchServer(cwd, (server) => {
    server.version = "1.0.1-rc.1";
  });

  const result = await runValidator(cwd);
  assert.equal(result.code, 0, result.stderr);
});

test("a description over the registry cap is rejected", async () => {
  const cwd = await makeFixture();
  await patchServer(cwd, (server) => {
    server.description = "x".repeat(101);
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /"description" is 101 chars; the registry caps it at 100/);
});

test("a remote url that drifts from the plugin manifest is rejected", async () => {
  const cwd = await makeFixture();
  await patchServer(cwd, (server) => {
    server.remotes[0].url = "https://staging.tryhamster.com/mcp";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /does not match mcp\.json/);
});

test("a plugin manifest with no hamster url cannot anchor the remote", async () => {
  const cwd = await makeFixture();
  await writeFile(path.join(cwd, "mcp.json"), `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /no "mcpServers\.hamster\.url" to anchor/);
});

test("declaring packages on a remote-only listing is rejected", async () => {
  const cwd = await makeFixture();
  await patchServer(cwd, (server) => {
    server.packages = [{ registryType: "npm", identifier: "hamster", version: "1.0.0", transport: { type: "stdio" } }];
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /must not declare "packages"/);
  assert.doesNotMatch(result.stderr, /unknown field "packages"/);
});

test("a non-https website url is rejected", async () => {
  const cwd = await makeFixture();
  await patchServer(cwd, (server) => {
    server.websiteUrl = "http://tryhamster.com/docs/hamster-studio/mcp";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /"websiteUrl" must be https/);
});

test("ENOENT on server.json is reported as missing", async () => {
  const cwd = await makeFixture();
  await unlink(path.join(cwd, "server.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /server\.json is missing:/);
});

test("a server.json whose root is not an object is rejected", async () => {
  const cwd = await makeFixture();
  await writeFile(path.join(cwd, "server.json"), "null\n");

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /server\.json must be a JSON object/);
});

test("an mcp.json whose root is not an object cannot anchor the remote", async () => {
  const cwd = await makeFixture();
  await writeFile(path.join(cwd, "mcp.json"), "[]\n");

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root mcp\.json must be a JSON object/);
});
