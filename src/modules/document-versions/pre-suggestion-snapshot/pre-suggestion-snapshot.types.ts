/**
 * Payload dispatched to the pre-suggestion snapshot BullMQ queue
 * at toolcall instantiation time.
 */
export interface PreSuggestionSnapshotPayload {
  readonly documentId: string;
  readonly suggestingAgentName: string;
  readonly capturedAt: string; // ISO 8601
}

/**
 * Version source value for pre-suggestion snapshots.
 * Extends the existing version source enum used by the versioning system.
 */
export const VERSION_SOURCE_PRE_SUGGESTION = 'pre_suggestion' as const;

/**
 * BullMQ queue name for pre-suggestion snapshot jobs.
 */
export const PRE_SUGGESTION_SNAPSHOT_QUEUE = 'pre-suggestion-snapshot' as const;

/**
 * Builds the version label from a suggesting agent name.
 * Format: "Before: {agentName} suggestion"
 */
export function buildSnapshotLabel(suggestingAgentName: string): string {
  return `Before: ${suggestingAgentName} suggestion`;
}
