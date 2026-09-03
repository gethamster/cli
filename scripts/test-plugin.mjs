#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(repoRoot, "scripts", "validate-plugin.mjs");
const readyScript = path.join(repoRoot, "skills", "setup", "scripts", "ensure-ready.sh");

const PACKAGE_ENTRIES = [
  "plugin.json",
  "LICENSE",
  "mcp.json",
  ".mcp.json",
  "mcp_config.json",
  ".cursor-plugin",
  ".claude-plugin",
  ".codex-plugin",
  ".agents",
  "skills",
  "agents",
  "assets",
];

const fixtures = [];

after(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTemp(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  fixtures.push(dir);
  return dir;
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

async function copyPackage(dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of PACKAGE_ENTRIES) {
    await cp(path.join(repoRoot, entry), path.join(dest, entry), { recursive: true });
  }
}

async function runValidator(cwd) {
  return run(process.execPath, [validatorPath], { cwd });
}

test("ENOENT on plugin.json is reported as missing", async () => {
  const cwd = await makeTemp("hamster-plugin-missing-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json is missing:/);
  assert.doesNotMatch(result.stderr, /Root plugin\.json could not be read/);
});

test("non-ENOENT on plugin.json is reported as could not be read", async () => {
  const cwd = await makeTemp("hamster-plugin-unread-");
  await copyPackage(cwd);
  await unlink(path.join(cwd, "plugin.json"));
  await mkdir(path.join(cwd, "plugin.json"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json could not be read \(/);
  assert.doesNotMatch(result.stderr, /Root plugin\.json is missing:/);
});

test("a missing referenced path fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-ref-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.logo = "assets/does-not-exist.svg";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /field "logo" references missing path "assets\/does-not-exist\.svg"/);
});

test("a drifted duplicate fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-drift-");
  await copyPackage(cwd);
  const copyPath = path.join(cwd, "skills", "ship", "scripts", "ensure-ready.sh");
  await writeFile(copyPath, `${await readFile(copyPath, "utf8")}\n# drift\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Duplicated copies have diverged and must stay byte-identical/);
});

test("failed hamster status prints to stderr and stdout stays SETUP_NEEDED", async () => {
  const home = await makeTemp("hamster-ready-home-");
  const bin = path.join(home, ".hamster", "bin");
  await mkdir(bin, { recursive: true });
  const hamster = path.join(bin, "hamster");
  await writeFile(
    hamster,
    `#!/usr/bin/env bash
if [[ "$1" == "--no-tui" && "$2" == "status" ]]; then
  echo "status failed: not logged in"
  exit 1
fi
echo "unexpected hamster invocation: $*"
exit 0
`
  );
  await chmod(hamster, 0o755);

  const result = await run("bash", [readyScript], {
    env: {
      ...process.env,
      HOME: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout.trim(), "SETUP_NEEDED");
  assert.match(result.stderr, /status failed: not logged in/);
});
