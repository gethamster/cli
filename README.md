# Hamster agent plugin

This repository contains the MIT-licensed Hamster agent plugin package for Claude Code, Cursor, and Codex. It adds Ask and Ship workflows that use the hosted Hamster MCP service.

## Workflows

- **Ask** connects relevant local context with Hamster workspace knowledge through `ask_hamster` and `get_hamster_reply`.
- **Ship** executes an existing Hamster Studio brief through `get_brief`, `get_plan`, `get_task`, `get_document`, and `update_task_status`.

Ship accepts a brief UUID or a Hamster Studio URL that contains one. It does not guess from a slug or a local projection. Planning, resume, validation, and review are phases inside Ship; other review, QA, and retrospective commands remain host-native.

Ship can create local branches and commits, but every remote push or pull request requires the user's explicit consent.

## Install

### Claude Code

```text
/plugin marketplace add gethamster/cli
/plugin install hamster@hamster-plugins
```

Invoke the namespaced skills:

```text
/hamster:ask Which workspace decisions apply to this branch?
/hamster:ship 2de8d546-50ab-4dbd-a678-579ec8119f60
/hamster:ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

### Cursor

Open **Customize**, choose **Plugins**, import `https://github.com/gethamster/cli`, and install **Hamster** at user or project scope.

Invoke the shared skills:

```text
/ask Which workspace decisions apply to this branch?
/ship 2de8d546-50ab-4dbd-a678-579ec8119f60
/ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

### Codex

Add the repository as a Codex marketplace:

```bash
codex plugin marketplace add gethamster/cli
```

Then open Codex, run `/plugins`, and install `hamster@hamster-plugins`.

Invoke the installed skills with Codex's skill syntax:

```text
$ask Which workspace decisions apply to this branch?
$ship 2de8d546-50ab-4dbd-a678-579ec8119f60
$ship https://tryhamster.com/home/hamster/briefs/2de8d546-50ab-4dbd-a678-579ec8119f60
```

## OAuth and service boundary

The credential-free `.mcp.json` points each host to `https://tryhamster.com/mcp`. The host discovers OAuth and asks the user to authorize access to a Hamster workspace. The plugin package does not contain an API key, access token, or refresh token. Reinstalling the plugin repairs package discovery, but it does not grant workspace access.

Hamster Studio and the hosted MCP service are separate services. Their implementations are not included in this repository.

## Optional CLI

The separately distributed Hamster CLI is optional. Install it if you want local context sync or the terminal interface; the agent plugin does not install it.

```bash
curl -fsSL https://tryhamster.com/cli/install | bash
```

You can also download a binary from the [latest release](https://github.com/gethamster/cli/releases/latest).

## Legal, security, and support

- [Privacy Policy](https://tryhamster.com/privacy-policy)
- [Terms of Service](https://tryhamster.com/terms-of-service)
- [Trust Center](https://trust.tryhamster.com)
- [Changelog](https://tryhamster.com/changelog)
- [Support](mailto:support@tryhamster.com)

Send security reports to the support address using the process in [SECURITY.md](SECURITY.md).

## License

The files in this repository are available under the [MIT License](LICENSE). That license covers this agent plugin package. It does not license Hamster Studio, the hosted MCP service implementation, or other separately distributed Hamster software.
