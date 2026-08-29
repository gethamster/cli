# Security Policy

## Report a vulnerability

Send security reports to [support@tryhamster.com](mailto:support@tryhamster.com). This address also handles general support requests. Include the affected version, component or file, reproduction steps, expected impact, and any proof of concept that helps confirm the issue.

Do not include access tokens, refresh tokens, customer content, or other secrets in the report. Allow Hamster time to investigate before public disclosure.

## Security boundary

This repository contains the MIT-licensed Hamster agent plugin package. Its manifests and `.mcp.json` are credential-free. Cursor, Claude Code, and Codex connect to `https://tryhamster.com/mcp`, discover OAuth, and store authorization through their supported credential flows.

The Hamster Studio and hosted MCP service implementations are separate and are not included or licensed here. Reports about OAuth, token handling, MCP authorization, workspace isolation, or hosted tool behavior should use the same support address.

Never commit credentials to this repository or add them to a plugin manifest. Revoke an exposed credential through its provider, then report the exposure with the secret removed from all evidence.
