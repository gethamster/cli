#!/usr/bin/env node

/**
 * Remote-connector gate for the hosted Hamster MCP server.
 *
 * Registry and directory listings send clients straight at the endpoint with
 * nothing but an OAuth discovery hop, so the contract they depend on — the 401
 * discovery chain, the advertised server version, and the annotated tool
 * surface — has to be checked from outside the deployment, against the URL
 * published in server.json.
 *
 * Usage: HAMSTER_MCP_TOKEN=<bearer> node scripts/verify-connector.mjs
 *        HAMSTER_MCP_URL overrides the endpoint (defaults to server.json).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The deployed tool names with their read-only bit, maintained by hand. Studio's
// apps/mcp/internal/tools/annotations_test.go pins every hint against the
// source; this baseline pins names and the read-only classification against
// the deployment, so a tool added, removed, or flipped between read and write
// without updating this list fails here. Version parity is a separate check.
const EXPECTED_TOOLS = new Map([
  ["search", true],
  ["list_accounts", true],
  ["switch_account", false],
  ["list_members", true],
  ["list_briefs", true],
  ["get_brief", true],
  ["create_brief", false],
  ["update_brief", false],
  ["list_notes", true],
  ["get_note", true],
  ["create_note", false],
  ["list_initiatives", true],
  ["get_initiative", true],
  ["create_initiative", false],
  ["update_initiative", false],
  ["archive_initiative", false],
  ["unlink_brief_from_initiative", false],
  ["list_tasks", true],
  ["get_task", true],
  ["create_task", false],
  ["update_task", false],
  ["update_task_status", false],
  ["get_next_task", true],
  ["list_subtasks", true],
  ["create_subtask", false],
  ["update_subtask", false],
  ["delete_subtask", false],
  ["list_documents", true],
  ["get_document", true],
  ["list_goals", true],
  ["get_goal", true],
  ["get_plan", true],
  ["generate_plan", false],
  ["trigger_delivery", false],
  ["ask_hamster", false],
  ["get_hamster_reply", true],
  ["search_knowledge_graph", true],
  ["explore_entity", true],
  ["get_neighborhood", true],
]);

const token = process.env.HAMSTER_MCP_TOKEN ?? "";
const authenticated = token !== "";
const server = JSON.parse(await readFile(path.join(repoRoot, "server.json"), "utf8"));
const endpoint = process.env.HAMSTER_MCP_URL ?? server.remotes[0].url;
const origin = new URL(endpoint).origin;

const results = [];
let rpcId = 0;

const protocolVersion = "2025-06-18";

function post(body, bearer) {
  const headers = {
    "content-type": "application/json",
    // The Streamable HTTP handler rejects a POST that does not accept both.
    accept: "application/json, text/event-stream",
  };
  if (body.method !== "initialize") {
    // Required on every request after the handshake. A client that omits it is
    // not exercising the transport a real connector speaks.
    headers["mcp-protocol-version"] = protocolVersion;
  }
  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
  }
  return fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
}

function parseRpcBody(contentType, text) {
  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(text);
  }
  const frames = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  if (frames.length === 0) {
    throw new Error("event stream carried no data frame");
  }
  return frames[frames.length - 1];
}

async function rpc(method, params) {
  const res = await post({ jsonrpc: "2.0", id: ++rpcId, method, params }, token);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const payload = parseRpcBody(res.headers.get("content-type") ?? "", text);
  if (payload.error) {
    throw new Error(`${method} returned JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.result;
}

async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args ?? {} });
  const text = result.content?.find((entry) => entry.type === "text")?.text;
  let data = result.structuredContent;
  if (data === undefined && text !== undefined) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  return { isError: result.isError === true, text, data };
}

async function assertTaskStatus(taskId, status) {
  const task = await callTool("get_task", { task_id: taskId });
  assert(!task.isError, `get_task failed: ${task.text}`);
  assert(task.data?.task?.status === status, `task ${taskId} is ${JSON.stringify(task.data?.task?.status)}, expected ${status}`);
}

async function listSubtaskIds(taskId) {
  const result = await callTool("list_subtasks", { parent_task_id: taskId });
  assert(!result.isError, `list_subtasks failed: ${result.text}`);
  assert(Array.isArray(result.data?.subtasks), `list_subtasks returned no subtasks array: ${result.text}`);
  return result.data.subtasks.map((entry) => entry.id);
}

async function fetchJson(url, context) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`${context} returned HTTP ${res.status} (${url})`);
  }
  return res.json();
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? "" });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

// Running without a token is a supported half-run: the OAuth discovery checks
// need no credential. Skipping the rest as a group reports the missing token
// once instead of as several unrelated-looking failures.
async function checkAuthenticated(name, fn) {
  if (!authenticated) {
    results.push({ name, ok: false, skipped: true, detail: "HAMSTER_MCP_TOKEN is not set" });
    return;
  }
  await check(name, fn);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let authorizationServer = "";
let tools = [];

await check("unauthenticated POST returns 401 with resource metadata", async () => {
  const res = await post({ jsonrpc: "2.0", id: 0, method: "tools/list", params: {} });
  assert(res.status === 401, `expected 401, got ${res.status}`);
  const header = res.headers.get("www-authenticate") ?? "";
  const expected = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
  assert(header === expected, `WWW-Authenticate is ${JSON.stringify(header)}, want ${JSON.stringify(expected)}`);
  return header;
});

await check("protected-resource metadata names an authorization server", async () => {
  const prm = await fetchJson(`${origin}/.well-known/oauth-protected-resource`, "protected-resource metadata");
  const servers = prm.authorization_servers ?? [];
  assert(servers.length > 0, "authorization_servers is empty");
  authorizationServer = servers[0];
  return authorizationServer;
});

await check("authorization server supports PKCE and dynamic registration", async () => {
  assert(authorizationServer !== "", "no authorization server discovered");
  const issuer = new URL(authorizationServer);
  // RFC 8414: the well-known segment is inserted before the issuer path.
  const metadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname.replace(/\/$/, "")}`;
  const metadata = await fetchJson(metadataUrl, "authorization server metadata");
  assert(
    (metadata.code_challenge_methods_supported ?? []).includes("S256"),
    `code_challenge_methods_supported is ${JSON.stringify(metadata.code_challenge_methods_supported)}`
  );
  assert(typeof metadata.registration_endpoint === "string", "registration_endpoint is missing");
  assert(
    (metadata.grant_types_supported ?? []).includes("authorization_code") &&
      (metadata.grant_types_supported ?? []).includes("refresh_token"),
    `grant_types_supported is ${JSON.stringify(metadata.grant_types_supported)}`
  );
  return metadataUrl;
});

await check("an invalid token is rejected with 401", async () => {
  const res = await post({ jsonrpc: "2.0", id: 0, method: "tools/list", params: {} }, "not-a-real-token");
  assert(res.status === 401, `expected 401, got ${res.status}`);
  return `HTTP ${res.status}`;
});

await checkAuthenticated("initialize reports the published server identity", async () => {
  const result = await rpc("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "hamster-conformance", version: server.version },
  });
  const info = result.serverInfo ?? {};
  assert(info.name === "hamster", `serverInfo.name is ${JSON.stringify(info.name)}`);
  assert(
    info.version === server.version,
    `deployed server version ${JSON.stringify(info.version)} does not match server.json ${JSON.stringify(server.version)}`
  );
  return `${info.name} ${info.version}`;
});

await checkAuthenticated("tools/list matches the published tool surface", async () => {
  const collected = [];
  let cursor;
  do {
    const page = await rpc("tools/list", cursor ? { cursor } : {});
    collected.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);
  tools = collected;

  const names = new Set(tools.map((tool) => tool.name));
  const missing = [...EXPECTED_TOOLS.keys()].filter((name) => !names.has(name));
  const unexpected = [...names].filter((name) => !EXPECTED_TOOLS.has(name));
  assert(missing.length === 0, `missing tools: ${missing.join(", ")}`);
  assert(unexpected.length === 0, `undeclared tools: ${unexpected.join(", ")}`);
  return `${tools.length} tools`;
});

await checkAuthenticated("every tool carries a title and safety hints", async () => {
  assert(tools.length > 0, "no tools were listed");
  const problems = [];
  for (const tool of tools) {
    const annotations = tool.annotations;
    if (typeof tool.title !== "string" || tool.title.length === 0) {
      problems.push(`${tool.name}: no title`);
    }
    if (!annotations) {
      problems.push(`${tool.name}: no annotations`);
      continue;
    }
    if (typeof annotations.destructiveHint !== "boolean") {
      problems.push(`${tool.name}: no destructiveHint`);
    }
    if (typeof annotations.openWorldHint !== "boolean") {
      problems.push(`${tool.name}: no openWorldHint`);
    }
  }
  assert(problems.length === 0, problems.join("; "));
  return `${tools.length} annotated`;
});

await checkAuthenticated("read-only hints match the published classification", async () => {
  assert(tools.length > 0, "no tools were listed");
  const wrong = tools
    .filter((tool) => (tool.annotations?.readOnlyHint === true) !== EXPECTED_TOOLS.get(tool.name))
    .map((tool) => `${tool.name} is ${tool.annotations?.readOnlyHint === true ? "read-only" : "writable"}`);
  assert(wrong.length === 0, wrong.join("; "));
  return `${[...EXPECTED_TOOLS.values()].filter(Boolean).length} read-only`;
});

await checkAuthenticated("representative reads succeed", async () => {
  const accounts = await callTool("list_accounts");
  assert(!accounts.isError, `list_accounts failed: ${accounts.text}`);
  assert((accounts.data?.accounts ?? []).length > 0, "list_accounts returned no accounts");

  const briefs = await callTool("list_briefs", { limit: 1 });
  assert(!briefs.isError, `list_briefs failed: ${briefs.text}`);
  assert(Array.isArray(briefs.data?.briefs), "list_briefs returned no briefs array");
  assert(briefs.data.briefs.length > 0, "the conformance account has no briefs to read");

  const briefId = briefs.data.briefs[0].brief_id;
  const brief = await callTool("get_brief", { brief_id: briefId });
  assert(!brief.isError, `get_brief failed: ${brief.text}`);
  assert(brief.data?.brief?.id === briefId, `get_brief returned no brief matching ${briefId}: ${brief.text}`);
  return `${accounts.data.accounts.length} accounts, ${briefs.data.briefs.length} brief read`;
});

await checkAuthenticated("a bad identifier is a tool error, not a transport failure", async () => {
  const result = await callTool("get_brief", { brief_id: "00000000-0000-0000-0000-000000000000" });
  assert(result.isError, "get_brief on a nonexistent id reported success");
  return (result.text ?? "").slice(0, 80);
});

await checkAuthenticated("write round trip creates, updates, and cleans up", async () => {
  const stamp = new Date().toISOString();
  const created = await callTool("create_task", { title: `MCP conformance ${stamp}` });
  assert(!created.isError, `create_task failed: ${created.text}`);
  const taskId = created.data?.task?.id;
  assert(typeof taskId === "string" && taskId.length > 0, `create_task returned no task id: ${created.text}`);

  const progressed = await callTool("update_task_status", { task_id: taskId, status: "in_progress" });
  assert(!progressed.isError, `update_task_status failed: ${progressed.text}`);
  await assertTaskStatus(taskId, "in_progress");
  const reverted = await callTool("update_task_status", { task_id: taskId, status: "todo" });
  assert(!reverted.isError, `update_task_status revert failed: ${reverted.text}`);
  await assertTaskStatus(taskId, "todo");

  const subtask = await callTool("create_subtask", { parent_task_id: taskId, title: "conformance subtask" });
  assert(!subtask.isError, `create_subtask failed: ${subtask.text}`);
  const subtaskId = subtask.data?.subtask?.id;
  assert(typeof subtaskId === "string" && subtaskId.length > 0, `create_subtask returned no id: ${subtask.text}`);
  assert((await listSubtaskIds(taskId)).includes(subtaskId), `list_subtasks does not show the created subtask ${subtaskId}`);

  const deleted = await callTool("delete_subtask", { subtask_id: subtaskId });
  assert(!deleted.isError, `delete_subtask failed: ${deleted.text}`);
  assert(!(await listSubtaskIds(taskId)).includes(subtaskId), `list_subtasks still shows the deleted subtask ${subtaskId}`);

  // The MCP surface has no delete_task, so the task itself stays behind. Run
  // this against a dedicated conformance workspace, not a live team account.
  return `task ${taskId} left in place`;
});

const nameWidth = Math.max(...results.map((result) => result.name.length));
console.log(`Endpoint: ${endpoint}`);
for (const result of results) {
  const verdict = result.ok ? "PASS" : result.skipped ? "SKIP" : "FAIL";
  console.log(`${verdict}  ${result.name.padEnd(nameWidth)}  ${result.detail}`);
}

const passed = results.filter((result) => result.ok).length;
const skipped = results.filter((result) => result.skipped).length;
console.log(`${passed}/${results.length} checks passed${skipped > 0 ? `, ${skipped} skipped` : ""}.`);
// A skipped check leaves the gate unproven, so it is not a pass.
process.exit(passed === results.length ? 0 : 1);
