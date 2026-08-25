---
name: ask
description: >-
  Ask Hamster to connect the current code or editor context with workspace
  priorities, blockers, blueprints, related work, or intent. Also supports
  workspace actions when the user explicitly requests one.
---

# Ask Hamster

**Request**: "$ARGUMENTS"

Use `hamster chat` as the gateway to Hamster's connected workspace context:

```bash
hamster chat "<request>"
```

Pass `$ARGUMENTS` as the request. If it is empty, ask the user what they want to ask Hamster.

The calling agent can see local working context that Hamster Chat cannot automatically see: file paths, the current branch and diff, error messages, and the code under discussion. Include the parts of that context that help Hamster connect the request to its workspace knowledge. Let the response finish streaming; some requests take time.

When a follow-up depends on the previous response, continue the same conversation:

```bash
hamster chat --continue "<follow-up>"
```

Use `--continue` only for a genuine follow-up. Start a new chat for an unrelated request.

When the user explicitly requests an action, report whether Hamster applied the change or only proposed it. If the command fails, report the failure instead of guessing.

See [examples](references/examples.md) for representative questions, actions, and follow-ups.
