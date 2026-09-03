---
name: ask-hamster
description: Ask Hamster to connect the current code or editor context with workspace priorities, blockers, blueprints, related work, or intent. Also supports workspace actions when the user explicitly requests one.
---

# Ask Hamster

**Request**: "$ARGUMENTS"

Use the hosted Hamster MCP server this plugin already exposes (`https://tryhamster.com/mcp`). The client owns OAuth — if Hamster MCP tools are unavailable, tell the user to finish the client's Hamster sign-in prompt. In Antigravity CLI, `/mcp` only shows status; tell the user to authenticate Hamster in Antigravity IDE under Agent Settings → Customizations, then retry. Do not fall back to `hamster chat` and do not assume a local CLI.

Call the Hamster `ask_hamster` tool (or the client's equivalent Hamster MCP ask tool) with the request. Include local working context the MCP cannot see on its own: file paths, the current branch and diff, error messages, and the code under discussion.

If `$ARGUMENTS` is empty, ask the user what they want to ask Hamster.

Let the response finish. Some requests take time. If the tool returns a pending thread, wait and fetch the reply with the returned thread id. Do not start a second ask to poll status.

When a follow-up depends on the previous response, continue the same conversation by passing the thread id. Start a new thread for an unrelated request.

When the user explicitly requests an action, report whether Hamster applied the change or only proposed it. If the tool fails, report the failure instead of guessing.

See [examples](references/examples.md) for representative questions, actions, and follow-ups.
