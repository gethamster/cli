# Pre-Suggestion Snapshot: Design Note

## Capture Moment

The snapshot is captured at **toolcall instantiation** -- the instant the `apply_diff` or `replace_document` toolcall is created (suggestion generation time). This is NOT at execution completion or acceptance time.

## Payload

The dispatch payload enqueued to the async worker:

```typescript
interface PreSuggestionSnapshotPayload {
  documentId: string;
  suggestingAgentName: string;
  capturedAt: string; // ISO 8601 timestamp
}
```

- `documentId`: The target document being edited.
- `suggestingAgentName`: Display name of the suggesting agent (specialist skill name, or coordinator AI fallback).
- `capturedAt`: Timestamp at toolcall instantiation, used for ordering and audit.

## Async Transport

**BullMQ** job queue, consistent with the existing async work patterns in the NestJS backend.

- Queue name: `pre-suggestion-snapshot`
- Job dispatch is **fire-and-forget**: the toolcall does NOT await the job result.
- Dispatch failures are caught with a try/catch, logged, and silently discarded -- they must never propagate to the toolcall caller.
- The worker processes jobs independently; worker failure does not affect the toolcall or accept/reject flow.

## Content-Hash Algorithm

Reuse the **existing content-hash algorithm** already used by the versioning system for content-aware deduplication. The hash is computed from the document's current content at worker execution time.

- Algorithm: SHA-256 of the document's serialized content (matching the existing `computeContentHash` utility).
- No additional normalization beyond what the existing algorithm performs.

## Dedup Rule

1. Worker reads the current document content.
2. Worker computes the content hash using the existing algorithm.
3. Worker queries the **most recent existing version** for the document.
4. If the most recent version's content hash matches the computed hash, **skip insert** (dedup hit).
5. If no match, insert a new version row.

This is a O(1) comparison -- check only the latest version, not all versions. This is sufficient because:
- Snapshots capture the current state; if the latest version already has that state, a new one adds no value.
- It avoids scanning the full version history on every suggestion.

## Version Type / Source

Add a new version source value: `"pre_suggestion"`.

This integrates with the existing version type/source enum so:
- The timeline can render these distinctly from `auto`, `manual`, and `restore` types.
- Existing audit logging, real-time updates, and diff viewing work automatically.
- The existing rollback flow works without modification.

No new database columns are required. The existing versions table already has:
- `content_hash` field (used for dedup)
- `source` / `type` field (extended with the new value)
- `label` / `title` field (used for the display name)

## Label Format

```
Before: {suggestingAgentName} suggestion
```

Examples:
- `Before: Grammar Expert suggestion` (named specialist skill)
- `Before: AI Assistant suggestion` (coordinator AI fallback)

### Agent Name Resolution

1. If a named specialist skill is active at toolcall instantiation, use its display name.
2. If no specialist skill is active (coordinator AI / document chat), use the fallback: `"AI Assistant"`.
3. If agent identity cannot be resolved at all, use the fallback: `"AI Assistant"`.

The resolver is a pure synchronous function -- it reads from the agent context already available at the toolcall instantiation site.

## Worker Steps

1. Receive `{ documentId, suggestingAgentName, capturedAt }` from queue.
2. Read the current document content from the document store.
3. Compute content hash using the existing `computeContentHash` utility.
4. Query the latest version for the document and compare content hashes.
5. If hashes match: log dedup hit, return early.
6. If no match: insert a new version row with:
   - `documentId`: from payload
   - `content`: current document content
   - `contentHash`: computed hash
   - `source`: `"pre_suggestion"`
   - `label`: `"Before: {suggestingAgentName} suggestion"`
   - `createdAt`: `capturedAt` from payload
7. Log insert success.

## Error Handling

- **Document not found**: Log warning, discard job. Do not retry.
- **Database error on insert**: Log error, discard job. Do not retry (next suggestion will capture state again).
- **Queue unavailable at dispatch time**: Catch in toolcall, log warning, continue normal execution.
- **Worker crash**: BullMQ handles restarts. Failed jobs are logged but never retried (stale content risk).

## Latency Guarantee

- Dispatch is a single `queue.add()` call -- sub-millisecond, non-blocking.
- The toolcall returns immediately after dispatch.
- The user's accept action is completely decoupled from snapshot creation.
- No network round-trips, no awaited promises on the critical path.

## Schema Changes

1. **Version source enum**: Add `"pre_suggestion"` value to the existing source/type field.
2. **No new tables**: Reuse the existing document versions table.
3. **No new columns**: The existing `content_hash`, `source`, `label`, and `content` fields are sufficient.
