# CI/CD pipeline

## Pull requests

The `plugin-validation.yml` workflow runs three package gates on every pull request:

1. `npx --yes --package ajv-cli@5.0.0 --package ajv-formats@3.0.1 ajv validate --spec=draft7 -c ajv-formats -s scripts/schemas/cursor-plugin.schema.json -d .cursor-plugin/plugin.json` checks the Cursor manifest and its email and URI formats against the pinned official Draft 7 schema.
2. `python3 scripts/validate_plugin.py` checks the invariants outside that schema: the exact credential-free hosted MCP configuration, no Cursor marketplace catalog, exactly the Ask and Ship skills plus the task executor and wave reviewer agents, no commands, hooks, or rules, and no `deliver_brief` or `coding_agent` hosted-delivery identifiers in shipped components.
3. `python3 -m unittest discover -s tests -p 'test_validate_plugin.py'` proves a valid package passes and the validator rejects MCP drift, unexpected components, and hosted-delivery terms.

The schema is vendored with its exact upstream commit in `scripts/schemas/README.md`; CI does not fetch a moving schema. The workflow publishes no artifacts and does not deploy, release, or submit the plugin.
