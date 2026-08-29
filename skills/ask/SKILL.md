---
name: ask
description: >-
  Ask Hamster to connect local code, branch, diff, or error context with
  workspace priorities, blockers, related work, and intent. Use when the user
  asks Hamster a workspace question or requests a workspace action.
---

# Ask Hamster

**Request**: "$ARGUMENTS"

If the request is empty, ask the user what they want to ask Hamster.

Include useful local context in the prompt because Hamster cannot infer the
current file, branch, diff, code under discussion, or local error. Include only
context that helps answer the request.

Call:

```json
ask_hamster({ "prompt": "<request plus useful local context>" })
```

For a genuine follow-up, preserve the returned `thread_id`:

```json
ask_hamster({ "prompt": "<follow-up>", "thread_id": "<thread-id>" })
```

Handle the returned `outcome`:

- `completed`: return Hamster's response.
- `declined`: stop and report that Hamster declined the turn. Surface the
  returned response or message and its `response_complete` state.
- `failed`: stop and surface the returned response or message and its
  `response_complete` state without guessing.
- `interrupted`: stop and surface the returned response or message and its
  `response_complete` state. Do not treat a partial response as complete.
- `pending`: keep the returned `thread_id` and `turn_id`, wait for
  `retry_after_ms`, then call:

  ```json
  get_hamster_reply({
    "thread_id": "<thread-id>",
    "turn_id": "<turn-id>"
  })
  ```

  Repeat after each returned `retry_after_ms` only while the outcome remains
  `pending`. Handle every terminal outcome by the rules above. Never call
  `ask_hamster` again to poll an existing turn.

When the user requests an action, report whether Hamster applied it or only
proposed it. On tool failure, report the failure without guessing.

See [examples](references/examples.md) for representative prompts and polling.
