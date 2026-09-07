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

async function patchCodexInterface(cwd, patch) {
  const manifestPath = path.join(cwd, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  patch(manifest.interface);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

// A real 64x32 PNG rather than the shipped logo with its header rewritten: a
// fixture that no decoder would open cannot prove a dimension rule.
const WIDE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAABmJLR0QA/wD/AP+gvaeTAAAAQUlEQVRYhe3PQQ0AIBDAMEDD+deKCB4Nyapg2zOzfnZ0wKsGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQLw6AAfD+rUTkAAAAASUVORK5CYII=";

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

test("a non-semver root version fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-version-");
  await copyPackage(cwd);
  const manifestPath = path.join(cwd, "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "3.4";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Root plugin\.json "version" must be semver-like, got "3\.4"/);
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

test("an over-cap Codex shortDescription fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-short-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.shortDescription = "x".repeat(31);
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.shortDescription is 31 chars; directory submission caps it at 30/);
});

test("an unsupported Codex category fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-category-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.category = "Coding";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.category must be one of .*Developer Tools.*got "Coding"/);
});

test("a fourth Codex starter prompt fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-prompts-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.defaultPrompt = [...iface.defaultPrompt, "Retro the last two weeks"];
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.defaultPrompt has 4 entries; the directory allows at most 3/);
});

test("a non-square Codex logo fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-square-");
  await copyPackage(cwd);
  await writeFile(path.join(cwd, "assets", "logo.png"), Buffer.from(WIDE_PNG_BASE64, "base64"));

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logo is 64x32; the directory requires a square image/);
});

test("a Codex icon whose bytes are not an image fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-bytes-");
  await copyPackage(cwd);
  await writeFile(path.join(cwd, "assets", "icon.png"), "not really a png\n");

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.composerIcon is named "\.png" but its bytes are a different format/);
});

test("a non-https Codex privacyPolicyURL fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-privacy-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.privacyPolicyURL = "http://tryhamster.com/privacy-policy";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.privacyPolicyURL must be https/);
});

test("a dropped Codex support link fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-support-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    delete iface.supportURL;
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.supportURL must be a non-empty string/);
});

test("a low-contrast Codex dark brand color fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-contrast-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.brandColorDark = iface.brandColor;
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.brandColorDark #[0-9A-Fa-f]{6} has [\d.]+:1 contrast against #212121/);
});

test("a Codex image path without a ./ prefix fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-prefix-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.logo = "assets/logo.png";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logo must start with "\.\/", got "assets\/logo\.png"/);
});

test("a missing Codex image file fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-missing-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.composerIcon = "./assets/does-not-exist.png";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.composerIcon references missing path "\.\/assets\/does-not-exist\.png"/);
});

test("a Codex catalog category that drifts from the manifest fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-catalog-");
  await copyPackage(cwd);
  const catalogPath = path.join(cwd, ".agents", "plugins", "marketplace.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.plugins[0].category = "Productivity";
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /category "Productivity" does not match \.codex-plugin\/plugin\.json interface\.category "Developer Tools"/);
});

test("a non-square Codex SVG logo fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-svg-");
  await copyPackage(cwd);
  await writeFile(
    path.join(cwd, "assets", "wide.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 128"></svg>\n'
  );
  await patchCodexInterface(cwd, (iface) => {
    iface.logo = "./assets/wide.svg";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logo viewBox is 256x128; the directory requires a square image/);
});

test("an empty Codex logoDark fails validation", async () => {
  const cwd = await makeTemp("hamster-plugin-codex-logodark-");
  await copyPackage(cwd);
  await patchCodexInterface(cwd, (iface) => {
    iface.logoDark = "";
  });

  const result = await runValidator(cwd);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /interface\.logoDark must be a non-empty path/);
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
