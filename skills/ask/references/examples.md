# Examples

## Connect current work to priorities

```json
ask_hamster({
  "prompt": "I'm working on webhook retry logic in apps/sync/src/modules/linear/ on branch fix/linear-retries. What priorities or initiatives cover this area?"
})
```

## Pull blueprint context during implementation

```json
ask_hamster({
  "prompt": "I'm modifying auth middleware in apps/web/app/api/. What does our workspace say about third-party integration authentication?"
})
```

## Capture prototyped work

```json
ask_hamster({
  "prompt": "I prototyped rate-limit middleware in apps/api/middleware/rate-limit.ts on branch feat/rate-limiting. Create a brief and link it to the Q3 platform reliability initiative."
})
```

## Continue a conversation

```json
ask_hamster({
  "prompt": "What's blocking the Linear sync initiative?"
})
```

If that call returns `pending`, poll its exact turn:

```json
get_hamster_reply({
  "thread_id": "<returned-thread-id>",
  "turn_id": "<returned-turn-id>"
})
```

After the first turn completes, send a dependent follow-up with its thread:

```json
ask_hamster({
  "prompt": "Which blocker can this branch address?",
  "thread_id": "<returned-thread-id>"
})
```
